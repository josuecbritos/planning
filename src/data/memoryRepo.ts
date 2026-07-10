import type { Acceso, AppState, Frente, Proyecto, Replanificacion, SubFrente, Tarea, Usuario } from '../types'
import { initialState } from './seed'
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
      return s
    }
  } catch {
    /* ignora storage no disponible o corrupto */
  }
  return clone(initialState)
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
    this.state.accesos = this.state.accesos.filter((a) => a.proyectoId !== id)
    this.persist()
  }

  // -- Frente --
  async createFrente(input: NuevoFrente): Promise<Frente> {
    const hermanos = this.state.frentes.filter((f) => f.proyectoId === input.proyectoId)
    const f: Frente = { id: uid(), proyectoId: input.proyectoId, nombre: input.nombre, orden: this.siguienteOrden(hermanos) }
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
    this.persist()
  }

  // -- Sub Frente --
  async createSubFrente(input: NuevoSubFrente): Promise<SubFrente> {
    const hermanos = this.state.subFrentes.filter((sf) => sf.frenteId === input.frenteId)
    const sf: SubFrente = { id: uid(), frenteId: input.frenteId, nombre: input.nombre, orden: this.siguienteOrden(hermanos) }
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
    this.persist()
  }

  // -- Tarea --
  async createTarea(input: NuevaTarea): Promise<Tarea> {
    const hermanos = this.state.tareas.filter((t) => t.subFrenteId === input.subFrenteId)
    const t: Tarea = {
      id: uid(),
      subFrenteId: input.subFrenteId,
      titulo: input.titulo,
      descripcion: input.descripcion,
      responsableId: input.responsableId,
      fechaObjetivo: input.fechaObjetivo,
      fechaOriginal: input.fechaOriginal ?? input.fechaObjetivo,
      hecha: false,
      comentarios: input.comentarios,
      orden: this.siguienteOrden(hermanos),
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
    this.persist()
  }

  // -- Modulo de Usuarios (7.1) --

  /** Regla 5.1: exactamente 2 Admins activos (misma regla que el trigger SQL). */
  private validarLimiteAdmins(candidato: Usuario) {
    if (candidato.rol !== 'admin' || !candidato.activo) return
    const otros = this.state.usuarios.filter(
      (u) => u.rol === 'admin' && u.activo && u.id !== candidato.id,
    ).length
    if (otros >= 2) throw new Error('El sistema admite exactamente 2 usuarios Admin activos')
  }

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
    }
    this.validarLimiteAdmins(u)
    this.state.usuarios.push(u)
    this.persist()
    return clone(u)
  }

  async updateUsuario(id: string, patch: PatchUsuario): Promise<Usuario> {
    const u = this.state.usuarios.find((x) => x.id === id)
    if (!u) throw new Error('Usuario no encontrado')
    const candidato = { ...u, ...patch }
    this.validarLimiteAdmins(candidato)
    Object.assign(u, patch)
    this.persist()
    return clone(u)
  }

  async asignarAcceso(usuarioId: string, proyectoId: string): Promise<Acceso> {
    const existente = this.state.accesos.find(
      (a) => a.usuarioId === usuarioId && a.proyectoId === proyectoId,
    )
    if (existente) return clone(existente)
    const a: Acceso = { usuarioId, proyectoId, fechaAsignacion: new Date().toISOString() }
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

  async cambiarFechaObjetivo(
    id: string,
    nueva: string,
    actorId?: string,
  ): Promise<{ tarea: Tarea; historial: Replanificacion[] }> {
    const t = this.state.tareas.find((x) => x.id === id)
    if (!t) throw new Error('Tarea no encontrada')
    if (nueva !== t.fechaObjetivo) {
      const numeroCambio = this.state.historial.filter((h) => h.tareaId === id).length + 1
      this.state.historial.push({
        id: uid(),
        tareaId: id,
        fechaAnterior: t.fechaObjetivo,
        fechaNueva: nueva,
        numeroCambio,
        cambiadoPor: actorId ?? '',
        timestamp: `${t.fechaObjetivo}T00:00:00Z`,
      })
      t.fechaObjetivo = nueva
      this.persist()
    }
    return {
      tarea: clone(t),
      historial: clone(this.state.historial.filter((h) => h.tareaId === id)),
    }
  }
}
