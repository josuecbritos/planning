import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Acceso,
  AppState,
  Comentario,
  Frente,
  Proyecto,
  Replanificacion,
  SubFrente,
  Tarea,
  Usuario,
} from '../types'
import { getClient } from './client'
import type {
  NuevaTarea,
  NuevoFrente,
  NuevoProyecto,
  NuevoSubFrente,
  NuevoUsuario,
  PatchProyecto,
  PatchTarea,
  PatchUsuario,
  Repo,
} from './repo'

// Repositorio contra Postgres (Supabase). Mapea filas snake_case <-> tipos
// camelCase. Las tablas y el trigger de historial estan en supabase/migrations.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

// Desempaqueta la respuesta de PostgREST. Opera en el borde de datos, por lo
// que devuelve `any`: el tipado real lo dan los mapeadores toX de abajo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(res: { data: unknown; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const toUsuario = (r: Row): Usuario => ({
  id: r.id, nombre: r.nombre, iniciales: r.iniciales ?? '', email: r.email, rol: r.rol,
  activo: r.activo, authId: r.auth_id ?? undefined, permisos: r.permisos ?? undefined,
})
const toAcceso = (r: Row): Acceso => ({
  usuarioId: r.usuario_id, proyectoId: r.proyecto_id, fechaAsignacion: r.fecha_asignacion,
})
const toComentario = (r: Row): Comentario => ({
  id: r.id, tareaId: r.tarea_id, autorId: r.autor_id ?? undefined, texto: r.texto, timestamp: r.timestamp,
})
const toProyecto = (r: Row): Proyecto => ({
  id: r.id, nombre: r.nombre, descripcion: r.descripcion ?? undefined, color: r.color ?? undefined, estado: r.estado,
})
const toFrente = (r: Row): Frente => ({
  id: r.id, proyectoId: r.proyecto_id, nombre: r.nombre, orden: r.orden,
})
const toSubFrente = (r: Row): SubFrente => ({
  id: r.id, frenteId: r.frente_id, nombre: r.nombre, orden: r.orden,
})
const toTarea = (r: Row): Tarea => ({
  id: r.id,
  subFrenteId: r.sub_frente_id,
  titulo: r.titulo,
  descripcion: r.descripcion ?? undefined,
  responsableId: r.responsable_id ?? undefined,
  fechaObjetivo: r.fecha_objetivo ?? undefined,
  fechaOriginal: r.fecha_original ?? undefined,
  hecha: r.hecha,
  fechaReal: r.fecha_real ?? undefined,
  comentarios: r.comentarios ?? undefined,
  orden: r.orden,
  archivada: r.archivada ?? false,
})
const toReplan = (r: Row): Replanificacion => ({
  id: r.id,
  tareaId: r.tarea_id,
  fechaAnterior: r.fecha_anterior,
  fechaNueva: r.fecha_nueva,
  numeroCambio: r.numero_cambio,
  cambiadoPor: r.cambiado_por ?? '',
  timestamp: r.timestamp,
})

export class SupabaseRepo implements Repo {
  readonly modo = 'supabase' as const
  private db: SupabaseClient

  constructor() {
    this.db = getClient()
  }

  async loadState(): Promise<AppState> {
    const [u, p, f, sf, t, h, a, c] = await Promise.all([
      this.db.from('usuario').select('*').order('nombre'),
      this.db.from('proyecto').select('*').order('fecha_creacion'),
      this.db.from('frente').select('*').order('orden'),
      this.db.from('sub_frente').select('*').order('orden'),
      this.db.from('tarea').select('*').order('orden'),
      this.db.from('replanificacion').select('*').order('numero_cambio'),
      this.db.from('acceso_cliente_proyecto').select('*'),
      this.db.from('comentario').select('*').order('timestamp'),
    ])
    return {
      usuarios: unwrap(u).map(toUsuario),
      proyectos: unwrap(p).map(toProyecto),
      frentes: unwrap(f).map(toFrente),
      subFrentes: unwrap(sf).map(toSubFrente),
      tareas: unwrap(t).map(toTarea),
      historial: unwrap(h).map(toReplan),
      accesos: unwrap(a).map(toAcceso),
      comentarios: unwrap(c).map(toComentario),
    }
  }

  // -- Proyecto --
  async createProyecto(input: NuevoProyecto): Promise<Proyecto> {
    const row = unwrap(
      await this.db
        .from('proyecto')
        .insert({
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
          color: input.color ?? null,
          estado: input.estado ?? 'activo',
          creado_por: input.creadoPor ?? null,
        })
        .select()
        .single(),
    )
    return toProyecto(row)
  }
  async updateProyecto(id: string, patch: PatchProyecto): Promise<Proyecto> {
    const row = unwrap(await this.db.from('proyecto').update(patch).eq('id', id).select().single())
    return toProyecto(row)
  }
  async deleteProyecto(id: string): Promise<void> {
    unwrap(await this.db.from('proyecto').delete().eq('id', id).select())
  }

  // -- Frente --
  async createFrente(input: NuevoFrente): Promise<Frente> {
    const orden = input.orden ?? (await this.nextOrden('frente', 'proyecto_id', input.proyectoId))
    const row = unwrap(
      await this.db
        .from('frente')
        .insert({ proyecto_id: input.proyectoId, nombre: input.nombre, orden })
        .select()
        .single(),
    )
    return toFrente(row)
  }
  async updateFrente(id: string, patch: { nombre?: string; orden?: number }): Promise<Frente> {
    const row = unwrap(await this.db.from('frente').update(patch).eq('id', id).select().single())
    return toFrente(row)
  }
  async deleteFrente(id: string): Promise<void> {
    unwrap(await this.db.from('frente').delete().eq('id', id).select())
  }

  // -- Sub Frente --
  async createSubFrente(input: NuevoSubFrente): Promise<SubFrente> {
    const orden = input.orden ?? (await this.nextOrden('sub_frente', 'frente_id', input.frenteId))
    const row = unwrap(
      await this.db
        .from('sub_frente')
        .insert({ frente_id: input.frenteId, nombre: input.nombre, orden })
        .select()
        .single(),
    )
    return toSubFrente(row)
  }
  async updateSubFrente(id: string, patch: { nombre?: string; orden?: number }): Promise<SubFrente> {
    const row = unwrap(await this.db.from('sub_frente').update(patch).eq('id', id).select().single())
    return toSubFrente(row)
  }
  async deleteSubFrente(id: string): Promise<void> {
    unwrap(await this.db.from('sub_frente').delete().eq('id', id).select())
  }

  // -- Tarea --
  async createTarea(input: NuevaTarea): Promise<Tarea> {
    const orden = input.orden ?? (await this.nextOrden('tarea', 'sub_frente_id', input.subFrenteId))
    const row = unwrap(
      await this.db
        .from('tarea')
        .insert({
          sub_frente_id: input.subFrenteId,
          titulo: input.titulo,
          descripcion: input.descripcion ?? null,
          responsable_id: input.responsableId ?? null,
          // El trigger normalizar_fechas_tarea ancla a dia habil y fija
          // fecha_original con la primera fecha.
          fecha_objetivo: input.fechaObjetivo ?? null,
          fecha_original: null,
          hecha: false,
          comentarios: input.comentarios ?? null,
          orden,
        })
        .select()
        .single(),
    )
    return toTarea(row)
  }
  async updateTarea(id: string, patch: PatchTarea): Promise<Tarea> {
    const upd: Row = {}
    if ('titulo' in patch) upd.titulo = patch.titulo
    if ('descripcion' in patch) upd.descripcion = patch.descripcion ?? null
    if ('responsableId' in patch) upd.responsable_id = patch.responsableId ?? null
    if ('comentarios' in patch) upd.comentarios = patch.comentarios ?? null
    if ('hecha' in patch) {
      upd.hecha = patch.hecha
      if (patch.hecha === false) upd.fecha_real = null
    }
    if ('fechaReal' in patch) upd.fecha_real = patch.fechaReal ?? null
    if ('archivada' in patch) upd.archivada = patch.archivada ?? false
    if ('orden' in patch) upd.orden = patch.orden
    const row = unwrap(await this.db.from('tarea').update(upd).eq('id', id).select().single())
    return toTarea(row)
  }
  async deleteTarea(id: string): Promise<void> {
    unwrap(await this.db.from('tarea').delete().eq('id', id).select())
  }

  async cambiarFechaObjetivo(
    id: string,
    nueva: string | null,
    actorId?: string,
  ): Promise<{ tarea: Tarea; historial: Replanificacion[] }> {
    // El RPC setea el actor y actualiza en la misma transaccion; el trigger
    // (5.6) inserta el registro de historial automaticamente. `nueva = null`
    // desplanifica; el trigger de la migracion 10 rechaza borrar vencidas.
    const row = unwrap(
      await this.db.rpc('replanificar_tarea', {
        p_tarea: id,
        p_nueva: nueva,
        p_actor: actorId ?? null,
      }),
    )
    const tareaRow = Array.isArray(row) ? row[0] : row
    const hist = unwrap(
      await this.db.from('replanificacion').select('*').eq('tarea_id', id).order('numero_cambio'),
    )
    return { tarea: toTarea(tareaRow), historial: hist.map(toReplan) }
  }

  // -- Modulo de Usuarios (7.1) --
  // El limite de 2 admins lo garantiza el trigger `limitar_admins` en la BD.

  async createUsuario(input: NuevoUsuario): Promise<Usuario> {
    const iniciales = (
      input.iniciales ?? input.nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2)
    ).toUpperCase()
    const row = unwrap(
      await this.db
        .from('usuario')
        .insert({ nombre: input.nombre, iniciales, email: input.email.trim().toLowerCase(), rol: input.rol })
        .select()
        .single(),
    )
    return toUsuario(row)
  }

  async updateUsuario(id: string, patch: PatchUsuario): Promise<Usuario> {
    const upd: Row = {}
    if ('nombre' in patch) upd.nombre = patch.nombre
    if ('iniciales' in patch) upd.iniciales = patch.iniciales
    if ('activo' in patch) upd.activo = patch.activo
    if ('rol' in patch) upd.rol = patch.rol
    if ('permisos' in patch) upd.permisos = patch.permisos ?? {}
    const row = unwrap(await this.db.from('usuario').update(upd).eq('id', id).select().single())
    return toUsuario(row)
  }

  async asignarAcceso(usuarioId: string, proyectoId: string): Promise<Acceso> {
    const row = unwrap(
      await this.db
        .from('acceso_cliente_proyecto')
        .upsert({ usuario_id: usuarioId, proyecto_id: proyectoId })
        .select()
        .single(),
    )
    return toAcceso(row)
  }

  async quitarAcceso(usuarioId: string, proyectoId: string): Promise<void> {
    unwrap(
      await this.db
        .from('acceso_cliente_proyecto')
        .delete()
        .eq('usuario_id', usuarioId)
        .eq('proyecto_id', proyectoId)
        .select(),
    )
  }

  async addComentario(tareaId: string, texto: string, autorId?: string): Promise<Comentario> {
    const row = unwrap(
      await this.db
        .from('comentario')
        .insert({ tarea_id: tareaId, autor_id: autorId ?? null, texto: texto.trim() })
        .select()
        .single(),
    )
    return toComentario(row)
  }

  private async nextOrden(tabla: string, fk: string, fkValue: string): Promise<number> {
    const rows = unwrap(await this.db.from(tabla).select('orden').eq(fk, fkValue))
    return rows.reduce((m: number, r: Row) => Math.max(m, r.orden), -1) + 1
  }
}
