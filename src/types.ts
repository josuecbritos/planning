// Modelo de datos — Documento Funcional v3.1, seccion 5.
// El dummy trabaja en memoria; las fechas se manejan como 'YYYY-MM-DD' (Date sin hora).

export type Rol = 'admin' | 'cliente'
export type EstadoProyecto = 'activo' | 'pausado' | 'cerrado'

/** Fecha ISO corta, ej. '2024-10-30'. */
export type ISODate = string

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
  /** Fecha vigente. Al cambiarla se genera una Replanificacion. */
  fechaObjetivo: ISODate
  /** Compromiso inicial. Nunca se modifica. */
  fechaOriginal: ISODate
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

// ---- Estados derivados (seccion 6.2) ----

export type EstadoDerivado = 'hecha' | 'vencida' | 'pendiente'

/** Color del campo tarea — la señal principal de gestion (6.5). */
export type ColorTarea = 'verde' | 'rojo' | 'ambar' | 'ninguno'

/** Tipos de marca en la grilla Gantt (6.4). */
export type TipoMarca =
  | 'pendiente' // ✕
  | 'hecha' // ■ verde con ✓
  | 'incumplida' // ■ rojo
  | 'anterior' // ▪ rojo tenue

export interface MarcaGantt {
  fecha: ISODate
  tipo: TipoMarca
}
