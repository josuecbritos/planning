import type {
  AppState,
  ColorTarea,
  ISODate,
  MarcaGantt,
  Replanificacion,
  Tarea,
} from '../types'
import { cmp } from './dates'

// Modelo de estados (definiciones cerradas): el usuario solo marca "hecha";
// todo lo demas se deriva de la fecha y del historial. Toda tarea cae en
// EXACTAMENTE UNA de cinco categorias excluyentes que suman el 100%.

/** Las cinco categorias, de menos a mas critica. */
export type Categoria =
  | 'hecha'
  | 'pendiente'
  | 'pendiente_replan'
  | 'atrasada'
  | 'atrasada_replan'

/** Historial de una tarea, ordenado por numero de cambio. */
export function historialDe(state: AppState, tareaId: string): Replanificacion[] {
  return state.historial
    .filter((h) => h.tareaId === tareaId)
    .sort((a, b) => a.numeroCambio - b.numeroCambio)
}

export function tieneHistorial(state: AppState, tareaId: string): boolean {
  return state.historial.some((h) => h.tareaId === tareaId)
}

/**
 * Categoria de una tarea (1.1). Reglas:
 *  - "Hecha" es terminal: sin señales de alerta, sin distincion de tarde,
 *    y no cuenta como replanificada aunque se haya movido.
 *  - La replanificacion solo aplica a tareas abiertas.
 *  - Una tarea sin fecha es "pendiente" (aun no planificada).
 */
export function categoriaDe(state: AppState, t: Tarea, hoy: string): Categoria {
  if (t.hecha) return 'hecha'
  const replan = tieneHistorial(state, t.id)
  const vencida = !!t.fechaObjetivo && cmp(t.fechaObjetivo, hoy) < 0
  if (vencida) return replan ? 'atrasada_replan' : 'atrasada'
  return replan ? 'pendiente_replan' : 'pendiente'
}

/** true si la tarea esta vencida y sin hacer (atrasada o atrasada replanificada). */
export function esAtrasada(cat: Categoria): boolean {
  return cat === 'atrasada' || cat === 'atrasada_replan'
}

/**
 * Color de FILA por categoria (1.1). Gravedad creciente: verde → sin color
 * → ambar → rojo → morado. La atrasada replanificada es categoria propia
 * con fila morada completa: lo mas critico resalta por sobre todo.
 */
export function colorTarea(state: AppState, t: Tarea, hoy: string): ColorTarea {
  switch (categoriaDe(state, t, hoy)) {
    case 'hecha': return 'verde'
    case 'pendiente_replan': return 'ambar'
    case 'atrasada': return 'rojo'
    case 'atrasada_replan': return 'morado'
    default: return 'ninguno'
  }
}

/** Cantidad de replanificaciones (para el indicador ↻ ×N de la tabla). */
export function nReplanificaciones(state: AppState, tareaId: string): number {
  return state.historial.filter((h) => h.tareaId === tareaId).length
}

/**
 * Fecha VIGENTE de una tarea: donde vive hoy en el plan. Es la fecha
 * objetivo actual; para una hecha sin fecha planificada, la fecha real.
 * Las marcas principales de la Gantt y las filas de carga usan ESTA fecha,
 * de modo que lo que se ve y lo que se cuenta siempre coinciden.
 */
export function fechaVigente(t: Tarea): ISODate | undefined {
  return t.fechaObjetivo ?? (t.hecha ? t.fechaReal : undefined)
}

/**
 * Marcas de la grilla Gantt para una tarea (6.4 actualizado):
 *  - Hecha: solo la marca verde en la fecha vigente ("hecha es terminal";
 *    no arrastra rastro ni señal de tarde). Queda en la fecha planificada,
 *    no en el dia en que se marco: la marca no se mueve al marcar hecha.
 *  - Abierta: rastro rojo tenue por cada fecha anterior + marca principal
 *    en la fecha objetivo (✕ en plazo, ■ roja si vencida).
 *  - Sin fecha: sin marcas.
 */
export function marcasDe(state: AppState, t: Tarea, hoy: string): MarcaGantt[] {
  if (t.hecha) {
    const fecha = fechaVigente(t)
    return fecha ? [{ fecha, tipo: 'hecha' }] : []
  }

  const marcas: MarcaGantt[] = []
  const replan = tieneHistorial(state, t.id)
  for (const h of historialDe(state, t.id)) {
    marcas.push({ fecha: h.fechaAnterior, tipo: 'anterior' })
  }
  if (t.fechaObjetivo) {
    const vencida = cmp(t.fechaObjetivo, hoy) < 0
    marcas.push({
      fecha: t.fechaObjetivo,
      tipo: vencida ? (replan ? 'incumplida_replan' : 'incumplida') : 'pendiente',
    })
  }
  return marcas
}

// ---- Contadores del encabezado (1.3) ----
// Cinco categorias excluyentes, de menos a mas critica; suman el total.

export interface Contadores {
  hechas: number
  pendientes: number
  pendientesReplan: number
  atrasadas: number
  atrasadasReplan: number
  total: number
}

export function contar(state: AppState, tareas: Tarea[], hoy: string): Contadores {
  // Las archivadas (canceladas, 6.3) salen del plan: no cuentan.
  const activas = tareas.filter((t) => !t.archivada)
  const c: Contadores = {
    hechas: 0,
    pendientes: 0,
    pendientesReplan: 0,
    atrasadas: 0,
    atrasadasReplan: 0,
    total: activas.length,
  }
  for (const t of activas) {
    switch (categoriaDe(state, t, hoy)) {
      case 'hecha': c.hechas++; break
      case 'pendiente': c.pendientes++; break
      case 'pendiente_replan': c.pendientesReplan++; break
      case 'atrasada': c.atrasadas++; break
      case 'atrasada_replan': c.atrasadasReplan++; break
    }
  }
  return c
}

/** Etiquetas en lenguaje llano por categoria (para chips y filtros). */
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  hecha: 'Hecha',
  pendiente: 'Pendiente',
  pendiente_replan: 'Pendiente replanificada',
  atrasada: 'Atrasada',
  atrasada_replan: 'Atrasada replanificada',
}
