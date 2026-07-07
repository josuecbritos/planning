import type {
  Acceso,
  AppState,
  Frente,
  ISODate,
  Proyecto,
  Replanificacion,
  Rol,
  SubFrente,
  Tarea,
  Usuario,
} from '../types'

// Contrato de la capa de datos. Dos implementaciones: MemoryRepo (en memoria +
// localStorage, para correr sin backend) y SupabaseRepo (Postgres real).

export interface NuevoProyecto {
  nombre: string
  descripcion?: string
  color?: string
  estado?: Proyecto['estado']
  creadoPor?: string
}
export type PatchProyecto = Partial<Pick<Proyecto, 'nombre' | 'descripcion' | 'color' | 'estado'>>

export interface NuevoFrente {
  proyectoId: string
  nombre: string
}
export interface NuevoSubFrente {
  frenteId: string
  nombre: string
}

export interface NuevaTarea {
  subFrenteId: string
  titulo: string
  descripcion?: string
  responsableId?: string
  fechaObjetivo: ISODate
  /** Si se omite, toma el valor de fechaObjetivo (compromiso inicial). */
  fechaOriginal?: ISODate
  comentarios?: string
}
export type PatchTarea = Partial<
  Pick<Tarea, 'titulo' | 'descripcion' | 'responsableId' | 'hecha' | 'fechaReal' | 'comentarios' | 'archivada'>
>

export interface NuevoUsuario {
  nombre: string
  iniciales?: string
  email: string
  rol: Rol
}
export type PatchUsuario = Partial<Pick<Usuario, 'nombre' | 'iniciales' | 'activo' | 'rol'>>

export interface Repo {
  /** Nombre corto del backend activo, para mostrar en la UI. */
  readonly modo: 'memoria' | 'supabase'

  loadState(): Promise<AppState>

  createProyecto(input: NuevoProyecto): Promise<Proyecto>
  updateProyecto(id: string, patch: PatchProyecto): Promise<Proyecto>
  deleteProyecto(id: string): Promise<void>

  createFrente(input: NuevoFrente): Promise<Frente>
  updateFrente(id: string, patch: { nombre?: string; orden?: number }): Promise<Frente>
  deleteFrente(id: string): Promise<void>

  createSubFrente(input: NuevoSubFrente): Promise<SubFrente>
  updateSubFrente(id: string, patch: { nombre?: string; orden?: number }): Promise<SubFrente>
  deleteSubFrente(id: string): Promise<void>

  createTarea(input: NuevaTarea): Promise<Tarea>
  /** Edicion generica. NO cambia fecha_objetivo (usar cambiarFechaObjetivo). */
  updateTarea(id: string, patch: PatchTarea): Promise<Tarea>
  deleteTarea(id: string): Promise<void>

  /**
   * Cambia la fecha objetivo. Genera el registro de historial (5.6) y devuelve
   * la tarea y el historial completo actualizado de esa tarea.
   */
  cambiarFechaObjetivo(
    id: string,
    nueva: ISODate,
    actorId?: string,
  ): Promise<{ tarea: Tarea; historial: Replanificacion[] }>

  // -- Modulo de Usuarios (7.1) --

  createUsuario(input: NuevoUsuario): Promise<Usuario>
  updateUsuario(id: string, patch: PatchUsuario): Promise<Usuario>
  /** Asigna un proyecto a un usuario Cliente (tabla 5.7). */
  asignarAcceso(usuarioId: string, proyectoId: string): Promise<Acceso>
  quitarAcceso(usuarioId: string, proyectoId: string): Promise<void>
}
