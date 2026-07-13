// Modelo de datos — Documento Funcional v3.1, seccion 5.
// El dummy trabaja en memoria; las fechas se manejan como 'YYYY-MM-DD' (Date sin hora).

export type Rol = 'admin' | 'cliente'
export type EstadoProyecto = 'activo' | 'pausado' | 'cerrado'

/** Fecha ISO corta, ej. '2024-10-30'. */
export type ISODate = string

/** Alcance de un permiso que actua sobre tareas (§7.30). */
export type AlcancePermiso = 'todas' | 'asignadas'

/**
 * Permisos configurables por usuario cliente (§7.29). Los que actuan sobre
 * tareas llevan alcance: 'todas' las del proyecto o solo las 'asignadas' al
 * cliente. Ausente/false = no puede. Los admins ignoran esta estructura.
 */
export interface PermisosCliente {
  crearFrentes?: boolean
  crearSubFrentes?: boolean
  crearTareas?: boolean
  editarFechas?: false | AlcancePermiso
  marcarHechas?: false | AlcancePermiso
  editarTareas?: false | AlcancePermiso
  archivarEliminar?: false | AlcancePermiso
  asignarResponsable?: false | AlcancePermiso
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
  /** Configuracion de permisos (solo rol cliente; §7.28). */
  permisos?: PermisosCliente
}

/** Acceso de Cliente a Proyecto (5.7). Los Admin no la necesitan (ven todo). */
export interface Acceso {
  usuarioId: string
  proyectoId: string
  fechaAsignacion: string
}

export interface Proyecto {
  id: string
  nombre: string
  descripcion?: string
  color?: string
  estado: EstadoProyecto
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
