// Modelo de datos — Documento Funcional v3.1, seccion 5.
// El dummy trabaja en memoria; las fechas se manejan como 'YYYY-MM-DD' (Date sin hora).

/**
 * Roles (reestructuración roles-y-permisos):
 *  - admin: ve y gestiona TODO (sin límite de cantidad de admins).
 *  - consultor: sus proyectos (dueño) + los que el admin le asigne.
 *  - cliente: solo los proyectos donde lo invitan.
 */
export type Rol = 'admin' | 'consultor' | 'cliente'
export type EstadoProyecto = 'activo' | 'pausado' | 'cerrado'

/** Fecha ISO corta, ej. '2024-10-30'. */
export type ISODate = string

/** Alcance de un permiso que actua sobre tareas (§7.30). */
export type AlcancePermiso = 'todas' | 'asignadas'

/**
 * Set de ocho permisos sobre tareas. Vive EN EL ACCESO (por usuario y por
 * proyecto): gobierna a los INVITADOS de un proyecto ajeno — clientes y
 * consultores por igual ("un invitado es un invitado"). El admin y el dueño
 * del proyecto lo ignoran (control total). Ausente/false = no puede.
 */
export interface PermisosTareas {
  crearFrentes?: boolean
  crearSubFrentes?: boolean
  crearTareas?: boolean
  editarFechas?: false | AlcancePermiso
  marcarHechas?: false | AlcancePermiso
  editarTareas?: false | AlcancePermiso
  archivarEliminar?: false | AlcancePermiso
  asignarResponsable?: false | AlcancePermiso
}

/**
 * Permisos de NIVEL PROYECTO de un consultor (3.1). Los configura el admin,
 * consultor por consultor. Ausente/false = no puede.
 */
export interface PermisosProyecto {
  crearProyectos?: boolean
  archivarEliminarProyectos?: boolean
  invitarClientes?: boolean
  configurarPermisosClientes?: boolean
}

export interface Usuario {
  id: string
  nombre: string
  /** Iniciales para el badge de responsable (DV/JB/...). */
  iniciales: string
  email: string
  rol: Rol
  activo: boolean
  /** Vinculo con Supabase Auth (null hasta que la persona inicia sesion). */
  authId?: string
  /** Permisos de nivel proyecto (solo rol consultor; 3.1). */
  permisosProyecto?: PermisosProyecto
}

/**
 * Acceso de un usuario (cliente O consultor) a un proyecto ajeno, con sus
 * permisos asociados (set de ocho, por acceso). El dueño y los admins no
 * necesitan fila: su control es total.
 */
export interface Acceso {
  usuarioId: string
  proyectoId: string
  fechaAsignacion: string
  permisos?: PermisosTareas
}

export interface Proyecto {
  id: string
  nombre: string
  descripcion?: string
  color?: string
  estado: EstadoProyecto
  /** Dueño/creador (2): control total dentro del proyecto. */
  duenoId?: string
}

export interface Frente {
  id: string
  proyectoId: string
  nombre: string
  orden: number
}

export interface SubFrente {
  id: string
  frenteId: string
  nombre: string
  orden: number
}

/**
 * Registro de historial (5.6). Se genera automaticamente cada vez que
 * cambia fecha_objetivo de una tarea.
 */
export interface Replanificacion {
  id: string
  tareaId: string
  fechaAnterior: ISODate
  fechaNueva: ISODate
  numeroCambio: number
  cambiadoPor: string // usuarioId
  timestamp: string
}

/**
 * Tarea (5.5). Se elimino el campo `estado`; ahora el unico estado manual
 * es `hecha`. Todo lo demas se deriva (seccion 6).
 */
export interface Tarea {
  id: string
  subFrenteId: string
  titulo: string
  descripcion?: string
  responsableId?: string
  /**
   * Fecha vigente. La tarea NACE SIN FECHA; la primera fecha asignada fija
   * tambien fechaOriginal (sin historial). Los cambios posteriores generan
   * una Replanificacion. Nunca cae en fin de semana.
   */
  fechaObjetivo?: ISODate
  /** Compromiso inicial: la PRIMERA fecha asignada. Inmutable desde entonces. */
  fechaOriginal?: ISODate
  /** Unico estado que se marca a mano. Default false. */
  hecha: boolean
  /** Fecha real de termino; se registra al marcar hecha. Puede diferir de fechaObjetivo. */
  fechaReal?: ISODate
  comentarios?: string
  orden: number
  /**
   * Archivo de canceladas (6.3): la tarea sale del plan (vistas y
   * contadores) pero conserva su historial. Puede restaurarse.
   */
  archivada?: boolean
}

/**
 * Comentario de tarea (N5): hilo acumulable en el tiempo, append-only.
 * No se sobrescribe ni se borra; cada comentario suma al historial.
 */
export interface Comentario {
  id: string
  tareaId: string
  /** Vacio para comentarios migrados del campo legado. */
  autorId?: string
  texto: string
  timestamp: string
}

/** Estado global de la aplicacion. */
export interface AppState {
  usuarios: Usuario[]
  proyectos: Proyecto[]
  frentes: Frente[]
  subFrentes: SubFrente[]
  tareas: Tarea[]
  historial: Replanificacion[]
  accesos: Acceso[]
  comentarios: Comentario[]
}

// ---- Estados derivados ----
// El modelo de 5 categorias excluyentes vive en lib/derive.ts (Categoria).

/**
 * Color de fila — la señal principal de gestion. Gravedad creciente:
 * verde (hecha) → sin color → ambar → rojo → MORADO (atrasada
 * replanificada, lo mas critico).
 */
export type ColorTarea = 'verde' | 'ambar' | 'rojo' | 'morado' | 'ninguno'

/** Tipos de marca en la grilla Gantt (6.4). */
export type TipoMarca =
  | 'pendiente' // ✕
  | 'hecha' // ■ verde con ✓
  | 'incumplida' // ■ rojo (atrasada)
  | 'incumplida_replan' // ■ morado (atrasada replanificada)
  | 'anterior' // ▪ rojo tenue

export interface MarcaGantt {
  fecha: ISODate
  tipo: TipoMarca
}
