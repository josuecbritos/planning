import type { AppState, ISODate, Tarea } from '../types'
import { addDays, esFinDeSemana, inicioSemana } from './dates'
import { categoriaDe, type Categoria } from './derive'
import type { OrdenMulti } from './orden'

// Filtros guardables (pedido punto 3). Campos: Fecha Objetivo (siempre esa
// fecha), Responsable y Estado. Dentro de un campo los valores se combinan
// como "o"; entre campos, como "y". Las fechas relativas se recalculan
// siempre contra `hoy`; la semana va de lunes a domingo (como la Gantt).
//
// #250 — El componente de fecha hace DOS cosas, no una: filtra las tareas
// (igual en las dos vistas, con la misma función) y, en la Gantt, define el
// horizonte visible. Antes solo hacía lo segundo, y por eso "Hoy" mostraba
// tareas de cualquier día. Las dos van juntas: si el filtro deja las tareas de
// esta semana, la ventana que corresponde es esa semana. La excepción es
// `horizonte`, que va al revés: deriva su rango del horizonte, no lo define.

// #279: 'proxHabil' = el siguiente día que no es sábado ni domingo (L-J:
// mañana; V/S/D: el lunes). Hábil significa L-V y nada más: la herramienta no
// conoce feriados y esta opción no se los enseña. Un valor NUEVO no rompe las
// vistas guardadas con los cuatro anteriores.
export type FechaRelativa = 'hoy' | 'proxHabil' | 'semana' | 'proxima' | 'mes'

type FiltroFecha =
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
  /**
   * #223: solo las tareas que SI tienen fecha objetivo, cualquiera sea.
   * EXCLUYENTE con el resto del campo fecha (`fecha` y `sinFecha`): sumarla a
   * "Esta semana" anularia esa opcion, y sumarla a "Sin fecha" no filtraria
   * nada. A diferencia de las relativas y del rango, NO define el horizonte de
   * la Gantt (no es una ventana temporal): solo filtra filas en ambas vistas.
   */
  conFecha?: boolean
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

/**
 * #289: la misma vista, tal como vive en la base — con su dueño y su
 * contexto (id de proyecto, o 'mis-tareas'). Antes vivía en localStorage y
 * esos dos datos estaban en la CLAVE; ahora son columnas. El front sigue
 * trabajando con `FiltroGuardado` a secas: `usuarioId`/`contexto` solo
 * sirven para elegir cuáles corresponden a la pantalla que se está viendo.
 */
export interface VistaGuardada extends FiltroGuardado {
  usuarioId: string
  contexto: string
}

export const FECHA_RELATIVA_LABEL: Record<FechaRelativa, string> = {
  hoy: 'Hoy',
  proxHabil: 'Próximo día hábil',
  semana: 'Esta semana',
  proxima: 'Próxima semana',
  mes: 'Este mes',
}

export function filtroVacio(f: Filtro): boolean {
  return (
    !f.fecha &&
    !f.sinFecha &&
    !f.conFecha &&
    !(f.responsables && f.responsables.length) &&
    !(f.estados && f.estados.length) &&
    !(f.proyectos && f.proyectos.length)
  )
}

/**
 * true si el filtro restringe QUÉ TAREAS se ven. La fecha cuenta: desde #250
 * filtra filas también en la Gantt (antes solo movía el horizonte). No incluye
 * `proyectos`, que acota frentes y solo existe en Mis Tareas.
 */
export function filtraTareas(f: Filtro): boolean {
  return Boolean(
    (f.responsables && f.responsables.length) ||
      (f.estados && f.estados.length) ||
      f.fecha ||
      f.sinFecha ||
      f.conFecha,
  )
}

/**
 * #305 — Cuántos VALORES tiene puesto cada campo del filtro.
 *
 * Lo usa el control "Filtrar": el número del botón es el total, y el del panel
 * es el de cada campo (una ficha por campo, no por valor). El campo fecha
 * suma sus tres componentes. Desde #322 sus opciones son EXCLUYENTES entre sí,
 * así que en la práctica vale 0 o 1; la suma se conserva porque una vista
 * guardada de antes de #322 puede traer todavía dos puestas a la vez, y ahí
 * el número tiene que decir la verdad.
 * `proyectos` cuenta como cualquier otro campo: solo existe en Mis Tareas.
 */
export interface CuentaFiltro {
  fecha: number
  responsables: number
  estados: number
  proyectos: number
  total: number
}

export function cuentaFiltro(f: Filtro): CuentaFiltro {
  const fecha = (f.fecha ? 1 : 0) + (f.sinFecha ? 1 : 0) + (f.conFecha ? 1 : 0)
  const responsables = f.responsables?.length ?? 0
  const estados = f.estados?.length ?? 0
  const proyectos = f.proyectos?.length ?? 0
  return { fecha, responsables, estados, proyectos, total: fecha + responsables + estados + proyectos }
}

/**
 * #305 — Texto del campo fecha para su ficha. A diferencia de los demás
 * campos, acá el valor se nombra en vez de contarse: "Fecha: 1" no dice nada,
 * "Fecha: Esta semana" sí. Desde #322 las opciones son excluyentes, así que
 * normalmente hay una sola; el "+" sigue por las vistas guardadas de antes,
 * que pueden traer dos.
 */
export function etiquetaCampoFecha(f: Filtro): string {
  const partes: string[] = []
  if (f.fecha) partes.push(etiquetaFecha(f.fecha))
  if (f.conFecha) partes.push('Con fecha')
  if (f.sinFecha) partes.push('Sin fecha')
  return partes.join(' + ')
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
    case 'proxHabil': {
      // Un solo día, literal como las otras cuatro: mañana, o el lunes si
      // mañana cae en fin de semana. Un viernes, la tarea del sábado NO entra
      // — cada opción muestra su rango y nada más (decisión de #279).
      let d = addDays(hoy, 1)
      while (esFinDeSemana(d)) d = addDays(d, 1)
      return { desde: d, hasta: d }
    }
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

/**
 * Filtro completo: fecha + responsable + estado. Lo usan LAS DOS vistas — la
 * tabla y la Gantt filtran las mismas filas con la misma regla (#250). La
 * Gantt tenía su propia versión en la que la fecha no filtraba —solo movía el
 * horizonte—, y por eso dejaba pasar tareas de otros días y sin fecha con
 * "Hoy" puesto. El horizonte lo sigue moviendo; lo que faltaba era filtrar.
 */
export function pasaFiltroCompleto(state: AppState, t: Tarea, f: Filtro, hoy: ISODate): boolean {
  if (!pasaFiltroTareas(state, t, f, hoy)) return false
  // #223: "Con fecha" es excluyente dentro del campo fecha, así que resuelve
  // sola: pasa todo lo que tenga fecha objetivo, sea cual sea.
  if (f.conFecha) return !!t.fechaObjetivo
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

