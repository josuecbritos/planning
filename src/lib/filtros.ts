import type { AppState, ISODate, Tarea } from '../types'
import { addDays, inicioSemana } from './dates'
import { categoriaDe, type Categoria } from './derive'
import type { OrdenMulti } from './orden'

// Filtros guardables (pedido punto 3). Campos: Fecha Objetivo (siempre esa
// fecha), Responsable y Estado. Dentro de un campo los valores se combinan
// como "o"; entre campos, como "y". Las fechas relativas se recalculan
// siempre contra `hoy`; la semana va de lunes a domingo (como la Gantt).

export type FechaRelativa = 'hoy' | 'semana' | 'proxima' | 'mes'

export type FiltroFecha =
  | { tipo: 'relativa'; valor: FechaRelativa }
  | { tipo: 'rango'; desde?: ISODate; hasta?: ISODate }
  // P4: "En horizonte visible (Gantt)" — el rango del horizonte actual de la
  // Gantt (desde/hasta se sincronizan desde la Gantt); incluye además las
  // tareas SIN fecha. Solo se activa desde la Gantt; filtra ambas vistas.
  | { tipo: 'horizonte'; desde?: ISODate; hasta?: ISODate }

/** Valor especial del filtro de responsable: tareas SIN responsable. */
export const RESP_SIN_ASIGNAR = '__sin_asignar__'

export interface Filtro {
  fecha?: FiltroFecha
  /** Incluir tareas SIN fecha objetivo ("o" con el criterio de fecha). */
  sinFecha?: boolean
  /** IDs de responsables ("o" entre si; acepta RESP_SIN_ASIGNAR). */
  responsables?: string[]
  /** Categorias del modelo ("o" entre si). */
  estados?: Categoria[]
  /** IDs de proyectos ("o" entre si). Solo aplica en Mis Tareas, que cruza
   *  tareas de varios proyectos; en las vistas de proyecto no se usa. */
  proyectos?: string[]
}

/**
 * Vista guardada: privada por usuario y por proyecto, con nombre. Reune el
 * filtro Y el orden como una sola unidad (filtros + orden = una vista). El
 * campo `orden` es opcional para leer vistas antiguas (guardadas antes del
 * menu de orden): ausente = sin orden.
 */
export interface FiltroGuardado {
  id: string
  nombre: string
  filtro: Filtro
  orden?: OrdenMulti
}

export const FECHA_RELATIVA_LABEL: Record<FechaRelativa, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  proxima: 'Próxima semana',
  mes: 'Este mes',
}

export function filtroVacio(f: Filtro): boolean {
  return (
    !f.fecha &&
    !f.sinFecha &&
    !(f.responsables && f.responsables.length) &&
    !(f.estados && f.estados.length) &&
    !(f.proyectos && f.proyectos.length)
  )
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
  if (f.tipo === 'rango' || f.tipo === 'horizonte') return { desde: f.desde || undefined, hasta: f.hasta || undefined }
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
  if (f.tipo === 'horizonte') return 'En horizonte visible'
  if (f.desde && f.hasta) return `${f.desde} → ${f.hasta}`
  if (f.desde) return `desde ${f.desde}`
  if (f.hasta) return `hasta ${f.hasta}`
  return 'Rango'
}

/** Parte comun a ambas vistas: responsable y estado ("y" entre campos). */
export function pasaFiltroTareas(state: AppState, t: Tarea, f: Filtro, hoy: ISODate): boolean {
  if (f.responsables && f.responsables.length > 0) {
    const conResponsable = !!t.responsableId && f.responsables.includes(t.responsableId)
    const sinAsignar = !t.responsableId && f.responsables.includes(RESP_SIN_ASIGNAR)
    if (!conResponsable && !sinAsignar) return false
  }
  if (f.estados && f.estados.length > 0) {
    if (!f.estados.includes(categoriaDe(state, t, hoy))) return false
  }
  return true
}

/** Filtro completo (vista tabla): fecha + responsable + estado. */
export function pasaFiltroCompleto(state: AppState, t: Tarea, f: Filtro, hoy: ISODate): boolean {
  if (!pasaFiltroTareas(state, t, f, hoy)) return false
  // P4: "En horizonte visible" incluye SIEMPRE las tareas sin fecha, más las
  // que caen dentro del rango del horizonte de la Gantt.
  if (f.fecha?.tipo === 'horizonte') {
    if (!t.fechaObjetivo) return true
    const { desde, hasta } = rangoDeFecha(f.fecha, hoy)
    if (desde && t.fechaObjetivo < desde) return false
    if (hasta && t.fechaObjetivo > hasta) return false
    return true
  }
  if (f.fecha || f.sinFecha) {
    if (!t.fechaObjetivo) {
      // Sin fecha objetivo: solo pasa si el filtro pide "Sin fecha".
      if (!f.sinFecha) return false
    } else if (f.fecha) {
      const { desde, hasta } = rangoDeFecha(f.fecha, hoy)
      if (desde && t.fechaObjetivo < desde) return false
      if (hasta && t.fechaObjetivo > hasta) return false
    } else {
      // Solo "Sin fecha" activo: las tareas con fecha quedan fuera.
      return false
    }
  }
  return true
}

/**
 * Componente de fecha del filtro EN LA GANTT. La fecha normal (relativa/rango)
 * define el horizonte y NO filtra filas; las únicas que filtran filas son
 * "Sin fecha" y "En horizonte visible" (P4). Devuelve true si la tarea pasa.
 */
export function pasaFechaGantt(f: Filtro, t: Tarea, hoy: ISODate): boolean {
  if (f.fecha?.tipo === 'horizonte') {
    if (!t.fechaObjetivo) return true
    const { desde, hasta } = rangoDeFecha(f.fecha, hoy)
    if (desde && t.fechaObjetivo < desde) return false
    if (hasta && t.fechaObjetivo > hasta) return false
    return true
  }
  if (f.sinFecha) return !t.fechaObjetivo
  return true
}

/** ¿La fecha del filtro FILTRA filas en la Gantt? (Sin fecha / En horizonte). */
export function fechaFiltraGantt(f: Filtro): boolean {
  return !!f.sinFecha || f.fecha?.tipo === 'horizonte'
}
