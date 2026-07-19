import type {
  Acceso,
  AppState,
  Comentario,
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
  /** Posicion explicita (insertar "justo debajo" de un hermano). */
  orden?: number
}
export interface NuevoSubFrente {
  frenteId: string
  nombre: string
  orden?: number
}

export interface NuevaTarea {
  subFrenteId: string
  titulo: string
  descripcion?: string
  responsableId?: string
  /** Opcional: la tarea nace sin fecha. La primera fecha fija la original. */
  fechaObjetivo?: ISODate
  comentarios?: string
  /** Posicion explicita (insertar "justo debajo" de un hermano). */
  orden?: number
}
export type PatchTarea = Partial<
  Pick<Tarea, 'titulo' | 'descripcion' | 'responsableId' | 'hecha' | 'fechaReal' | 'comentarios' | 'archivada' | 'orden'>
>

export interface NuevoUsuario {
  nombre: string
  iniciales?: string
  email: string
  rol: Rol
}
export type PatchUsuario = Partial<Pick<Usuario, 'nombre' | 'iniciales' | 'activo' | 'rol' | 'permisosProyecto'>>

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
   * Cambia la fecha objetivo aplicando la regla 1.2/1.3: si la fecha que se
   * mueve es futura, es planificacion (la original acompaña, sin historial);
   * si vence hoy o ya vencio, es replanificacion (historial, original
   * congelada). `nueva = null` BORRA LA MARCA: si la fecha vigente venia de
   * una replanificacion, la deshace (vuelve a la fecha anterior y elimina
   * ese registro del historial); si no, la tarea queda "sin planificar".
   * Solo permitido si la fecha vigente es futura (una tarea que vence hoy o
   * ya vencio no se puede borrar, solo marcarse lista o replanificarse).
   * `hoy` es la fecha de referencia (simulada en modo Local; en Supabase la
   * regla vive en triggers/RPC con current_date).
   */
  cambiarFechaObjetivo(
    id: string,
    nueva: ISODate | null,
    actorId?: string,
    hoy?: ISODate,
  ): Promise<{ tarea: Tarea; historial: Replanificacion[] }>

  // -- Modulo de Usuarios (7.1) --

  createUsuario(input: NuevoUsuario): Promise<Usuario>
  updateUsuario(id: string, patch: PatchUsuario): Promise<Usuario>
  /** Asigna un proyecto a un usuario (cliente o consultor). El acceso nace
   *  con los permisos por DEFECTO del rol del usuario (4). */
  asignarAcceso(usuarioId: string, proyectoId: string): Promise<Acceso>
  quitarAcceso(usuarioId: string, proyectoId: string): Promise<void>
  /** Configura el set de ocho permisos DE ESE ACCESO (usuario × proyecto). */
  updateAccesoPermisos(
    usuarioId: string,
    proyectoId: string,
    permisos: import('../types').PermisosTareas,
  ): Promise<Acceso>

  /** Agrega un comentario al hilo de la tarea (N5, append-only). */
  addComentario(tareaId: string, texto: string, autorId?: string): Promise<Comentario>
}
