import type { Acceso, AppState, Comentario, Frente, PermisosTareas, Proyecto, Replanificacion, SubFrente, Tarea, Usuario } from '../types'
import { hoyISO } from '../lib/dates'
import { DEFAULT_PERMISOS_PROYECTO, defaultPermisosTareas } from '../lib/permisos'
import { initialState, proyectoConsultor } from './seed'
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

// Repositorio en memoria con persistencia en localStorage. Permite correr y
// demostrar la app sin backend; los datos sobreviven a recargas del navegador.

const STORAGE_KEY = 'planificador.state.v1'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.floor(Math.random() * 1e9).toString(36)
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as AppState
      // Migracion suave desde estados guardados por la Fase 1 (sin accesos,
      // 4 admins y sin usuario cliente): se rebaja el excedente de admins a
      // cliente y se agrega el cliente de demo con su acceso.
      if (!Array.isArray(s.accesos)) {
        s.usuarios
          .filter((u) => u.rol === 'admin' && u.activo)
          .slice(2)
          .forEach((u) => { u.rol = 'cliente' })
        for (const demo of initialState.usuarios) {
          if (!s.usuarios.some((u) => u.email === demo.email)) s.usuarios.push(clone(demo))
        }
        s.accesos = initialState.accesos
          .filter((a) => s.proyectos.some((p) => p.id === a.proyectoId))
          .map((a) => clone(a))
      }
      // Migracion N5: estados previos no tienen hilo de comentarios; se
      // construye desde el campo legado tarea.comentarios (y se limpia).
      if (!Array.isArray(s.comentarios)) {
        s.comentarios = []
        for (const t of s.tareas) {
          if (t.comentarios && t.comentarios.trim()) {
            s.comentarios.push({
              id: `c-mig-${t.id}`,
              tareaId: t.id,
              texto: t.comentarios.trim(),
              timestamp: new Date().toISOString(),
            })
            t.comentarios = undefined
          }
        }
      }
      migrarRoles(s)
      return s
    }
  } catch {
    /* ignora storage no disponible o corrupto */
  }
  return clone(initialState)
}

/**
 * Migracion de roles-y-permisos sobre estados locales previos (espejo del
 * backfill SQL, punto 9): dueño a cada proyecto (el primer admin), permisos
 * del usuario copiados A SU ACCESO (los clientes demo conservan su
 * configuracion), defaults de proyecto a los consultores, y el consultor de
 * demo con su proyecto si no existen.
 */
function migrarRoles(s: AppState) {
  const primerAdmin = s.usuarios.find((u) => u.rol === 'admin' && u.activo)
  for (const p of s.proyectos) {
    if (!p.duenoId) p.duenoId = primerAdmin?.id
  }
  for (const a of s.accesos) {
    if (a.permisos === undefined) {
      // Campo legado usuario.permisos (modelo anterior, global por usuario).
      const legado = (s.usuarios.find((u) => u.id === a.usuarioId) as { permisos?: PermisosTareas } | undefined)
        ?.permisos
      a.permisos = legado ? clone(legado) : {}
    }
  }
  for (const u of s.usuarios) {
    delete (u as { permisos?: PermisosTareas }).permisos
    if (u.rol === 'consultor' && !u.permisosProyecto) {
      u.permisosProyecto = { ...DEFAULT_PERMISOS_PROYECTO }
    }
  }
  // Consultor de demo + su proyecto propio (para ejercitar dueño vs invitado).
  if (!s.usuarios.some((u) => u.rol === 'consultor')) {
    const demo = initialState.usuarios.find((u) => u.id === 'u-consultor')
    if (demo && !s.usuarios.some((u) => u.email === demo.email)) s.usuarios.push(clone(demo))
    if (!s.proyectos.some((p) => p.id === proyectoConsultor.id)) {
      s.proyectos.push(clone(proyectoConsultor))
      for (const f of initialState.frentes.filter((f) => f.proyectoId === proyectoConsultor.id)) {
        s.frentes.push(clone(f))
        for (const sf of initialState.subFrentes.filter((x) => x.frenteId === f.id)) {
          s.subFrentes.push(clone(sf))
          for (const t of initialState.tareas.filter((x) => x.subFrenteId === sf.id)) {
            if (!s.tareas.some((x) => x.id === t.id)) s.tareas.push(clone(t))
          }
        }
      }
    }
  }
}

export class MemoryRepo implements Repo {
  readonly modo = 'memoria' as const
  private state: AppState

  constructor() {
    this.state = load()
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      /* storage lleno o no disponible: se sigue en memoria */
    }
  }

  private siguienteOrden<T extends { orden: number }>(items: T[]): number {
    return items.reduce((m, x) => Math.max(m, x.orden), -1) + 1
  }

  async loadState(): Promise<AppState> {
    return clone(this.state)
  }

  // -- Proyecto --
  async createProyecto(input: NuevoProyecto): Promise<Proyecto> {
    const p: Proyecto = {
      id: uid(),
      nombre: input.nombre,
      descripcion: input.descripcion,
      color: input.color,
      estado: input.estado ?? 'activo',
      // El creador es el dueño (2): control total dentro del proyecto.
      duenoId: input.creadoPor,
    }
    this.state.proyectos.push(p)
    this.persist()
    return clone(p)
  }
  async updateProyecto(id: string, patch: PatchProyecto): Promise<Proyecto> {
    const p = this.state.proyectos.find((x) => x.id === id)
    if (!p) throw new Error('Proyecto no encontrado')
    Object.assign(p, patch)
    this.persist()
    return clone(p)
  }
  async deleteProyecto(id: string): Promise<void> {
    const frenteIds = this.state.frentes.filter((f) => f.proyectoId === id).map((f) => f.id)
    const subIds = this.state.subFrentes.filter((sf) => frenteIds.includes(sf.frenteId)).map((sf) => sf.id)
    const tareaIds = this.state.tareas.filter((t) => subIds.includes(t.subFrenteId)).map((t) => t.id)
    this.state.proyectos = this.state.proyectos.filter((p) => p.id !== id)
    this.state.frentes = this.state.frentes.filter((f) => f.proyectoId !== id)
    this.state.subFrentes = this.state.subFrentes.filter((sf) => !frenteIds.includes(sf.frenteId))
    this.state.tareas = this.state.tareas.filter((t) => !subIds.includes(t.subFrenteId))
    this.state.historial = this.state.historial.filter((h) => !tareaIds.includes(h.tareaId))
    this.state.comentarios = this.state.comentarios.filter((c) => !tareaIds.includes(c.tareaId))
    this.state.accesos = this.state.accesos.filter((a) => a.proyectoId !== id)
    this.persist()
  }

  // -- Frente --
  async createFrente(input: NuevoFrente): Promise<Frente> {
    const hermanos = this.state.frentes.filter((f) => f.proyectoId === input.proyectoId)
    const f: Frente = { id: uid(), proyectoId: input.proyectoId, nombre: input.nombre, orden: input.orden ?? this.siguienteOrden(hermanos) }
    this.state.frentes.push(f)
    this.persist()
    return clone(f)
  }
  async updateFrente(id: string, patch: { nombre?: string; orden?: number }): Promise<Frente> {
    const f = this.state.frentes.find((x) => x.id === id)
    if (!f) throw new Error('Frente no encontrado')
    Object.assign(f, patch)
    this.persist()
    return clone(f)
  }
  async deleteFrente(id: string): Promise<void> {
    const subIds = this.state.subFrentes.filter((sf) => sf.frenteId === id).map((sf) => sf.id)
    const tareaIds = this.state.tareas.filter((t) => subIds.includes(t.subFrenteId)).map((t) => t.id)
    this.state.frentes = this.state.frentes.filter((f) => f.id !== id)
    this.state.subFrentes = this.state.subFrentes.filter((sf) => sf.frenteId !== id)
    this.state.tareas = this.state.tareas.filter((t) => !subIds.includes(t.subFrenteId))
    this.state.historial = this.state.historial.filter((h) => !tareaIds.includes(h.tareaId))
    this.state.comentarios = this.state.comentarios.filter((c) => !tareaIds.includes(c.tareaId))
    this.persist()
  }

  // -- Sub Frente --
  async createSubFrente(input: NuevoSubFrente): Promise<SubFrente> {
    const hermanos = this.state.subFrentes.filter((sf) => sf.frenteId === input.frenteId)
    const sf: SubFrente = { id: uid(), frenteId: input.frenteId, nombre: input.nombre, orden: input.orden ?? this.siguienteOrden(hermanos) }
    this.state.subFrentes.push(sf)
    this.persist()
    return clone(sf)
  }
  async updateSubFrente(id: string, patch: { nombre?: string; orden?: number }): Promise<SubFrente> {
    const sf = this.state.subFrentes.find((x) => x.id === id)
    if (!sf) throw new Error('Sub frente no encontrado')
    Object.assign(sf, patch)
    this.persist()
    return clone(sf)
  }
  async deleteSubFrente(id: string): Promise<void> {
    const tareaIds = this.state.tareas.filter((t) => t.subFrenteId === id).map((t) => t.id)
    this.state.subFrentes = this.state.subFrentes.filter((sf) => sf.id !== id)
    this.state.tareas = this.state.tareas.filter((t) => t.subFrenteId !== id)
    this.state.historial = this.state.historial.filter((h) => !tareaIds.includes(h.tareaId))
    this.state.comentarios = this.state.comentarios.filter((c) => !tareaIds.includes(c.tareaId))
    this.persist()
  }

  // -- Tarea --
  async createTarea(input: NuevaTarea): Promise<Tarea> {
    const hermanos = this.state.tareas.filter((t) => t.subFrenteId === input.subFrenteId)
    // La primera fecha (si viene) fija la original. Cualquier dia es valido.
    const fecha = input.fechaObjetivo
    const t: Tarea = {
      id: uid(),
      subFrenteId: input.subFrenteId,
      titulo: input.titulo,
      descripcion: input.descripcion,
      responsableId: input.responsableId,
      fechaObjetivo: fecha,
      fechaOriginal: fecha,
      hecha: false,
      comentarios: input.comentarios,
      orden: input.orden ?? this.siguienteOrden(hermanos),
    }
    this.state.tareas.push(t)
    this.persist()
    return clone(t)
  }
  async updateTarea(id: string, patch: PatchTarea): Promise<Tarea> {
    const t = this.state.tareas.find((x) => x.id === id)
    if (!t) throw new Error('Tarea no encontrada')
    Object.assign(t, patch)
    // Coherencia: si se desmarca hecha, se limpia fecha_real.
    if (patch.hecha === false) t.fechaReal = undefined
    this.persist()
    return clone(t)
  }
  async deleteTarea(id: string): Promise<void> {
    this.state.tareas = this.state.tareas.filter((t) => t.id !== id)
    this.state.historial = this.state.historial.filter((h) => h.tareaId !== id)
    this.state.comentarios = this.state.comentarios.filter((c) => c.tareaId !== id)
    this.persist()
  }

  // -- Modulo de Usuarios (7.1) --
  // Sin limite de admins (1): el sistema admite cualquier cantidad.

  async createUsuario(input: NuevoUsuario): Promise<Usuario> {
    const email = input.email.trim().toLowerCase()
    if (this.state.usuarios.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Ya existe un usuario con ese email')
    }
    const u: Usuario = {
      id: uid(),
      nombre: input.nombre,
      iniciales: (input.iniciales ?? input.nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2)).toUpperCase(),
      email,
      rol: input.rol,
      activo: true,
      // Defaults por rol (4): el consultor nace con sus permisos de proyecto.
      permisosProyecto: input.rol === 'consultor' ? { ...DEFAULT_PERMISOS_PROYECTO } : undefined,
    }
    this.state.usuarios.push(u)
    this.persist()
    return clone(u)
  }

  async updateUsuario(id: string, patch: PatchUsuario): Promise<Usuario> {
    const u = this.state.usuarios.find((x) => x.id === id)
    if (!u) throw new Error('Usuario no encontrado')
    Object.assign(u, patch)
    this.persist()
    return clone(u)
  }

  async asignarAcceso(usuarioId: string, proyectoId: string): Promise<Acceso> {
    const existente = this.state.accesos.find(
      (a) => a.usuarioId === usuarioId && a.proyectoId === proyectoId,
    )
    if (existente) return clone(existente)
    // El acceso nace con el default del rol del usuario (4); ajustable luego.
    const rol = this.state.usuarios.find((u) => u.id === usuarioId)?.rol ?? 'cliente'
    const a: Acceso = {
      usuarioId,
      proyectoId,
      fechaAsignacion: new Date().toISOString(),
      permisos: defaultPermisosTareas(rol),
    }
    this.state.accesos.push(a)
    this.persist()
    return clone(a)
  }

  async quitarAcceso(usuarioId: string, proyectoId: string): Promise<void> {
    this.state.accesos = this.state.accesos.filter(
      (a) => !(a.usuarioId === usuarioId && a.proyectoId === proyectoId),
    )
    this.persist()
  }

  async updateAccesoPermisos(
    usuarioId: string,
    proyectoId: string,
    permisos: PermisosTareas,
  ): Promise<Acceso> {
    const a = this.state.accesos.find(
      (x) => x.usuarioId === usuarioId && x.proyectoId === proyectoId,
    )
    if (!a) throw new Error('Acceso no encontrado')
    a.permisos = { ...permisos }
    this.persist()
    return clone(a)
  }

  async addComentario(tareaId: string, texto: string, autorId?: string): Promise<Comentario> {
    if (!this.state.tareas.some((t) => t.id === tareaId)) throw new Error('Tarea no encontrada')
    const c: Comentario = {
      id: uid(),
      tareaId,
      autorId,
      texto: texto.trim(),
      timestamp: new Date().toISOString(),
    }
    this.state.comentarios.push(c)
    this.persist()
    return clone(c)
  }

  async cambiarFechaObjetivo(
    id: string,
    nueva: string | null,
    actorId?: string,
    hoy?: string,
  ): Promise<{ tarea: Tarea; historial: Replanificacion[] }> {
    const t = this.state.tareas.find((x) => x.id === id)
    if (!t) throw new Error('Tarea no encontrada')
    const ref = hoy ?? hoyISO()
    if (nueva === null) {
      // Borrar la marca. Regla 2.2: si la fecha vence hoy o ya vencio, no
      // se puede borrar (se marca lista o se replanifica).
      if (t.fechaObjetivo) {
        if (t.fechaObjetivo <= ref && !t.hecha) {
          throw new Error('No puedes eliminar tareas que ya pasaron')
        }
        const regs = this.state.historial
          .filter((h) => h.tareaId === id)
          .sort((a, b) => a.numeroCambio - b.numeroCambio)
        if (regs.length > 0) {
          // La marca venia de una replanificacion: borrarla DESHACE ese
          // movimiento (la fecha vuelve a la anterior y el registro se
          // elimina), en vez de dejar una "replanificada" sin fecha.
          const ultimo = regs[regs.length - 1]
          t.fechaObjetivo = ultimo.fechaAnterior
          this.state.historial = this.state.historial.filter((h) => h.id !== ultimo.id)
        } else {
          // Sin historial: la tarea vuelve a "sin planificar" y la
          // original la acompaña (vuelve a nula).
          t.fechaObjetivo = undefined
          t.fechaOriginal = undefined
        }
        this.persist()
      }
    } else if (nueva && nueva !== t.fechaObjetivo) {
      const tieneHist = this.state.historial.some((h) => h.tareaId === id)
      // 1.2: solo es replanificacion si la fecha que se mueve vence hoy o ya
      // vencio. Mover una fecha futura (o poner la primera) es planificacion.
      const esPlanificacion = !t.fechaObjetivo || t.fechaObjetivo > ref
      if (esPlanificacion) {
        t.fechaObjetivo = nueva
        // 1.3: la original acompaña mientras no haya replanificaciones reales.
        if (!tieneHist) t.fechaOriginal = nueva
      } else {
        // esPlanificacion=false implica que la tarea tiene fecha vigente.
        const anterior = t.fechaObjetivo as string
        const numeroCambio = this.state.historial.filter((h) => h.tareaId === id).length + 1
        this.state.historial.push({
          id: uid(),
          tareaId: id,
          fechaAnterior: anterior,
          fechaNueva: nueva,
          numeroCambio,
          cambiadoPor: actorId ?? '',
          timestamp: `${anterior}T00:00:00Z`,
        })
        t.fechaObjetivo = nueva
        // fecha_original queda congelada desde la primera replanificacion.
      }
      this.persist()
    }
    return {
      tarea: clone(t),
      historial: clone(this.state.historial.filter((h) => h.tareaId === id)),
    }
  }
}
