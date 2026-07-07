import type {
  AppState,
  ColorTarea,
  EstadoDerivado,
  MarcaGantt,
  Replanificacion,
  Tarea,
} from '../types'
import { cmp } from './dates'

// Logica de la seccion 6: el usuario solo marca "hecha"; todo lo demas se
// deriva. Nada de esto se almacena.

/** Historial de una tarea, ordenado por numero de cambio. */
export function historialDe(state: AppState, tareaId: string): Replanificacion[] {
  return state.historial
    .filter((h) => h.tareaId === tareaId)
    .sort((a, b) => a.numeroCambio - b.numeroCambio)
}

export function tieneHistorial(state: AppState, tareaId: string): boolean {
  return state.historial.some((h) => h.tareaId === tareaId)
}

/** Estado derivado principal (6.2). `hoy` es la fecha simulada del sistema. */
export function estadoDerivado(t: Tarea, hoy: string): EstadoDerivado {
  if (t.hecha) return 'hecha'
  if (cmp(t.fechaObjetivo, hoy) < 0) return 'vencida' // fechaObjetivo < hoy
  return 'pendiente'
}

/** Atributo replanificada (6.2): coexiste con el estado principal. */
export function esReplanificada(state: AppState, t: Tarea): boolean {
  return tieneHistorial(state, t.id)
}

/**
 * Color del campo tarea (6.5) — la señal principal de gestion.
 *   verde  = hecha
 *   rojo   = vencida (haz algo: asignar nueva fecha)
 *   ambar  = pendiente con historial (vigilala)
 *   ninguno= pendiente sin historial (en curso)
 */
export function colorTarea(state: AppState, t: Tarea, hoy: string): ColorTarea {
  const est = estadoDerivado(t, hoy)
  if (est === 'hecha') return 'verde'
  if (est === 'vencida') return 'rojo'
  // pendiente
  return esReplanificada(state, t) ? 'ambar' : 'ninguno'
}

/** true si la tarea se cerro despues de su fecha objetivo vigente. */
export function hechaTarde(t: Tarea): boolean {
  return t.hecha && !!t.fechaReal && cmp(t.fechaReal, t.fechaObjetivo) > 0
}

/**
 * Marcas de la grilla Gantt para una tarea (6.4).
 * Puede devolver varias: la marca "principal" + un rastro de fechas anteriores.
 */
export function marcasDe(state: AppState, t: Tarea, hoy: string): MarcaGantt[] {
  const marcas: MarcaGantt[] = []
  const hist = historialDe(state, t.id)

  // Rastro: una marca tenue por cada fecha anterior donde estuvo la tarea.
  for (const h of hist) {
    marcas.push({ fecha: h.fechaAnterior, tipo: 'anterior' })
  }

  if (t.hecha && t.fechaReal) {
    // Si se hizo tarde, la fecha_objetivo incumplida tambien se marca tenue.
    if (hechaTarde(t)) {
      marcas.push({ fecha: t.fechaObjetivo, tipo: 'anterior' })
    }
    // Marca principal en la columna de fecha_real (no de fecha_objetivo).
    marcas.push({ fecha: t.fechaReal, tipo: 'hecha' })
  } else {
    // No hecha: la marca cae en fecha_objetivo.
    const vencida = cmp(t.fechaObjetivo, hoy) < 0
    marcas.push({ fecha: t.fechaObjetivo, tipo: vencida ? 'incumplida' : 'pendiente' })
  }

  return marcas
}

// ---- Contadores del encabezado (7.2) ----

export interface Contadores {
  hechas: number
  pendientes: number
  porReplanificar: number // rojas (vencidas)
  replanificadasAbiertas: number // ambar
  total: number
}

export function contar(state: AppState, tareas: Tarea[], hoy: string): Contadores {
  // Las archivadas (canceladas, 6.3) salen del plan: no cuentan.
  const activas = tareas.filter((t) => !t.archivada)
  const c: Contadores = {
    hechas: 0,
    pendientes: 0,
    porReplanificar: 0,
    replanificadasAbiertas: 0,
    total: activas.length,
  }
  for (const t of activas) {
    const color = colorTarea(state, t, hoy)
    if (color === 'verde') c.hechas++
    else if (color === 'rojo') c.porReplanificar++
    else if (color === 'ambar') c.replanificadasAbiertas++
    // pendientes = no hechas y no vencidas (sin color o ambar cuentan como abiertas)
    if (!t.hecha && cmp(t.fechaObjetivo, hoy) >= 0) c.pendientes++
  }
  return c
}
