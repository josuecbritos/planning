import type { Filtro, VistaGuardada } from '../lib/filtros'
import type { OrdenMulti } from '../lib/orden'
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
  // #293: `subFrenteId` entra al patch — mover una tarea a otro sub frente.
  // La base exige `editarTareas` para ese campo (trigger, migración 28).
  Pick<Tarea, 'titulo' | 'descripcion' | 'responsableId' | 'hecha' | 'fechaReal' | 'comentarios' | 'archivada' | 'orden' | 'subFrenteId'>
>

export interface NuevoUsuario {
  nombre: string
  iniciales?: string
  email: string
  rol: Rol
}
export type PatchUsuario = Partial<
  Pick<Usuario, 'nombre' | 'iniciales' | 'activo' | 'rol' | 'permisosProyecto' | 'inicialesManual'>
>

/**
 * Iniciales derivadas del nombre: las primeras letras de las dos primeras
 * palabras. Espejo de la función `derivar_iniciales` de la base (#207).
 *
 * #239: vivía por duplicado, una copia en cada repo. Vive acá, junto a los
 * tipos que comparten los dos, para que no puedan separarse.
 */
export function derivarIniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

export interface NuevaVista {
  /** id del proyecto, o 'mis-tareas'. */
  contexto: string
  nombre: string
  filtro: Filtro
  orden?: OrdenMulti
}
export type PatchVista = Partial<Pick<VistaGuardada, 'nombre' | 'filtro' | 'orden'>>

export interface Repo {
  /** Nombre corto del backend activo, para mostrar en la UI. */
  readonly modo: 'memoria' | 'supabase'

  /** Fija el actor de la sesión. En Supabase es no-op (sale del JWT); en modo
   *  Local lo usa para atribuir acciones y generar notificaciones (#137). */
  setActor(id: string | null): void

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

  /** Crea el usuario; si el correo ya existe (aunque esté eliminado, #136),
   *  reactiva la fila en vez de fallar por el unique. Sus accesos vuelven. */
  createUsuario(input: NuevoUsuario): Promise<Usuario>
  updateUsuario(id: string, patch: PatchUsuario): Promise<Usuario>
  /** #136: eliminar = desactivar + invisible. No hay hard delete: la fila y su
   *  historial quedan intactos; reactivable dando de alta el mismo correo. */
  eliminarUsuario(id: string): Promise<void>
  /**
   * #300: cambia el perfil de un usuario entre consultor y cliente. Solo un
   * admin, nunca el propio, y nunca desde/hacia administrador; pasar a
   * cliente se bloquea si es dueño de algún proyecto. Las salvaguardas viven
   * en la BASE (`cambiar_rol_usuario`) — esto es el camino, no la barrera.
   * `actorId` es quien lo pide: en Supabase lo deduce la sesión de la base;
   * en modo Local hay que decírselo.
   */
  cambiarRolUsuario(id: string, rol: Rol, actorId?: string): Promise<Usuario>
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
  /** #209: edita el TEXTO del propio comentario. No hay borrado: el hilo sigue
   *  siendo un registro. La base marca la hora de edición y comprueba que
   *  quien edita sea el autor (RLS), no solo la interfaz. */
  editComentario(id: string, texto: string): Promise<Comentario>

  // -- #289: vistas guardadas (viven en la base, atadas al usuario) --

  /** Crea una vista para el usuario en sesión, en ese contexto (id de
   *  proyecto o 'mis-tareas'). El dueño lo pone la capa de datos, nunca la
   *  interfaz: en Supabase sale de la sesión. */
  createVista(input: NuevaVista): Promise<VistaGuardada>
  /** Renombra o actualiza el filtro/orden de una vista propia. */
  updateVista(id: string, patch: PatchVista): Promise<VistaGuardada>
  deleteVista(id: string): Promise<void>

  /** #137: marca como leídas TODAS las notificaciones del usuario actual.
   *  Devuelve los ids afectados (para reflejarlo en el estado local). */
  marcarNotificacionesLeidas(usuarioId: string): Promise<string[]>
}
