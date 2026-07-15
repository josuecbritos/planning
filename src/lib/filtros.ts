import type { AppState, ISODate, Tarea } from '../types'
import { addDays, inicioSemana } from './dates'
import { categoriaDe, type Categoria } from './derive'

// Filtros guardables (pedido punto 3). Campos: Fecha Objetivo (siempre esa
// fecha), Responsable y Estado. Dentro de un campo los valores se combinan
// como "o"; entre campos, como "y". Las fechas relativas se recalculan
// siempre contra `hoy`; la semana va de lunes a domingo (como la Gantt).

export type FechaRelativa = 'hoy' | 'semana' | 'proxima' | 'mes'

export type FiltroFecha =
  | { tipo: 'relativa'; valor: FechaRelativa }
  | { tipo: 'rango'; desde?: ISODate; hasta?: ISODate }

export interface Filtro {
  fecha?: FiltroFecha
  /** IDs de responsables ("o" entre si). */
  responsables?: string[]
  /** Categorias del modelo ("o" entre si). */
  estados?: Categoria[]
}

/** Filtro guardado: privado por usuario y por proyecto, con nombre. */
export interface FiltroGuardado {
  id: string
  nombre: string
  filtro: Filtro
}

export const FECHA_RELATIVA_LABEL: Record<FechaRelativa, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  proxima: 'Proxima semana',
  mes: 'Este mes',
}

export function filtroVacio(f: Filtro): boolean {
  return !f.fecha && !(f.responsables && f.responsables.length) && !(f.estados && f.estados.length)
}

/** true si el filtro restringe TAREAS (responsable/estado; la fecha no en Gantt). */
export function filtraTareas(f: Filtro): boolean {
  return Boolean((f.responsables && f.responsables.length) || (f.estados && f.estados.length))
}

/**
 * Rango [desde, hasta] (inclusive) que representa el componente de fecha.
 * Las relativas se recalculan con `hoy` en cada aplicacion.
 */
export function rangoDeFecha(f: FiltroFecha, hoy: ISODate): { desde?: ISODate; hasta?: ISODate } {
  if (f.tipo === 'rango') return { desde: f.desde || undefined, hasta: f.hasta || undefined }
  switch (f.valor) {
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'semana': {
      const lunes = inicioSemana(hoy)
      return { desde: lunes, hasta: addDays(lunes, 6) }
    }
    case 'proxima': {
      const lunes = addDays(inicioSemana(hoy), 7)
      return { desde: lunes, hasta: addDays(lunes, 6) }
    }
    case 'mes': {
      const y = Number(hoy.slice(0, 4))
      const m = Number(hoy.slice(5, 7))
      const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` }
    }
  }
}

/** Etiqueta corta del componente fecha (para chips y botones). */
export function etiquetaFecha(f: FiltroFecha): string {
  if (f.tipo === 'relativa') return FECHA_RELATIVA_LABEL[f.valor]
  if (f.desde && f.hasta) return `${f.desde} → ${f.hasta}`
  if (f.desde) return `desde ${f.desde}`
  if (f.hasta) return `hasta ${f.hasta}`
  return 'Rango'
}

/** Parte comun a ambas vistas: responsable y estado ("y" entre campos). */
export function pasaFiltroTareas(state: AppState, t: Tarea, f: Filtro, hoy: ISODate): boolean {
  if (f.responsables && f.responsables.length > 0) {
    if (!t.responsableId || !f.responsables.includes(t.responsableId)) return false
  }
  if (f.estados && f.estados.length > 0) {
    if (!f.estados.includes(categoriaDe(state, t, hoy))) return false
  }
  return true
}

/** Filtro completo (vista tabla): fecha + responsable + estado. */
export function pasaFiltroCompleto(state: AppState, t: Tarea, f: Filtro, hoy: ISODate): boolean {
  if (!pasaFiltroTareas(state, t, f, hoy)) return false
  if (f.fecha) {
    // Se filtra por Fecha Objetivo; sin fecha no hay coincidencia posible.
    if (!t.fechaObjetivo) return false
    const { desde, hasta } = rangoDeFecha(f.fecha, hoy)
    if (desde && t.fechaObjetivo < desde) return false
    if (hasta && t.fechaObjetivo > hasta) return false
  }
  return true
}
