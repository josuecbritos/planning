import type { ISODate } from '../types'

// Utilidades de fecha. Trabajamos con fechas "sin hora" en formato ISO corto
// para evitar desfases por zona horaria. Todas las operaciones son en UTC.

const DIA_MS = 24 * 60 * 60 * 1000

const INICIALES_DIA = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa'] // 0=domingo
const NOMBRE_MES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

/** Fecha de hoy (local) en formato ISO corto. */
export function hoyISO(): ISODate {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse 'YYYY-MM-DD' a Date en UTC (medianoche). */
export function parse(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Formatea una Date UTC a 'YYYY-MM-DD'. */
export function toISO(date: Date): ISODate {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Compara dos fechas ISO. <0 si a<b, 0 si iguales, >0 si a>b. */
export function cmp(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISO(new Date(parse(iso).getTime() + n * DIA_MS))
}

/** true si la fecha cae en sabado o domingo. */
export function esFinDeSemana(iso: ISODate): boolean {
  const dow = parse(iso).getUTCDay()
  return dow === 0 || dow === 6
}

/** Suma n dias habiles (omite fines de semana). n puede ser negativo. */
export function addDiasHabiles(iso: ISODate, n: number): ISODate {
  let cur = iso
  const paso = n >= 0 ? 1 : -1
  let restantes = Math.abs(n)
  while (restantes > 0) {
    cur = addDays(cur, paso)
    if (!esFinDeSemana(cur)) restantes--
  }
  return cur
}

/**
 * Lista de dias habiles entre desde y hasta (ambos inclusive), en orden.
 * Omite fines de semana, como el plan de origen (4.3).
 */
export function diasHabiles(desde: ISODate, hasta: ISODate): ISODate[] {
  const out: ISODate[] = []
  let cur = desde
  while (cmp(cur, hasta) <= 0) {
    if (!esFinDeSemana(cur)) out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** Lunes de la semana a la que pertenece la fecha. */
export function inicioSemana(iso: ISODate): ISODate {
  const dow = parse(iso).getUTCDay() // 0=do..6=sa
  const delta = dow === 0 ? -6 : 1 - dow
  return addDays(iso, delta)
}

/** true si es lunes (o el primer dia habil de su semana). */
export function esLunes(iso: ISODate): boolean {
  return parse(iso).getUTCDay() === 1
}

// ---- Formateadores para encabezados y tooltips ----

/** "lu 7" */
export function etiquetaDia(iso: ISODate): { inicial: string; numero: number } {
  const d = parse(iso)
  return { inicial: INICIALES_DIA[d.getUTCDay()], numero: d.getUTCDate() }
}

/** "7 oct" */
export function etiquetaCorta(iso: ISODate): string {
  const d = parse(iso)
  return `${d.getUTCDate()} ${NOMBRE_MES[d.getUTCMonth()]}`
}

/** "7 oct – 11 oct" (lunes a viernes de esa semana). */
export function etiquetaSemana(lunes: ISODate): string {
  const viernes = addDays(lunes, 4)
  return `${etiquetaCorta(lunes)} – ${etiquetaCorta(viernes)}`
}

/** "lu 7 oct 2024" — formato legible para tooltips. */
export function etiquetaLarga(iso: ISODate): string {
  const d = parse(iso)
  return `${INICIALES_DIA[d.getUTCDay()]} ${d.getUTCDate()} ${NOMBRE_MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Diferencia en dias habiles entre dos fechas (b - a). */
export function difDiasHabiles(a: ISODate, b: ISODate): number {
  if (cmp(a, b) === 0) return 0
  const desde = cmp(a, b) < 0 ? a : b
  const hasta = cmp(a, b) < 0 ? b : a
  // Contamos dias habiles estrictamente posteriores a `desde` hasta `hasta`.
  let n = 0
  let cur = desde
  while (cmp(cur, hasta) < 0) {
    cur = addDays(cur, 1)
    if (!esFinDeSemana(cur)) n++
  }
  return cmp(a, b) < 0 ? n : -n
}
