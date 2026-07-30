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
function toISO(date: Date): ISODate {
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

// #237/#239: aquí vivían `ajustarDiaHabil` y `addDiasHabiles`, sin ningún uso
// en el proyecto y afirmando en su comentario que "las tareas no admiten
// fechas de fin de semana" — regla derogada en la migración 7, que permite
// cualquier día (la Gantt solo elige QUÉ días muestra). Se eliminan: código
// muerto que declaraba vigente una regla que no existe.

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

/** Todos los dias entre desde y hasta (semana completa de 7 dias). */
export function diasCalendario(desde: ISODate, hasta: ISODate): ISODate[] {
  const out: ISODate[] = []
  let cur = desde
  while (cmp(cur, hasta) <= 0) {
    out.push(cur)
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

/**
 * Formato unico de fecha de toda la interfaz: "dd-mmm-aaaa" (ej. "07-oct-2024").
 * Aplica a columnas de tabla, tooltips y panel de detalle.
 */
export function formatoFecha(iso: ISODate): string {
  const d = parse(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}-${NOMBRE_MES[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}

/** "oct 2024" — cabecera del calendario propio (#262). Mismo nombre corto de
 *  mes que usa el resto de la interfaz. */
export function etiquetaMes(anio: number, mes0: number): string {
  return `${NOMBRE_MES[mes0]} ${anio}`
}

/** "07-oct-2024 14:30" — para timestamps (comentarios), en hora local. */
export function formatoFechaHora(ts: string): string {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${NOMBRE_MES[d.getMonth()]}-${d.getFullYear()} ${hh}:${mm}`
}

/** "7 oct" — compacto, solo para el encabezado de semana del Gantt. */
function etiquetaCorta(iso: ISODate): string {
  const d = parse(iso)
  return `${d.getUTCDate()} ${NOMBRE_MES[d.getUTCMonth()]}`
}

/** "7 oct – 11 oct" (lunes a viernes; con finSemana=6, lunes a domingo). */
export function etiquetaSemana(lunes: ISODate, finOffset = 4): string {
  const fin = addDays(lunes, finOffset)
  return `${etiquetaCorta(lunes)} – ${etiquetaCorta(fin)}`
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
