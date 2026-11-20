// #350 — Núcleo del MCP de planificación: funciones PURAS sobre el estado que
// entrega el repo (`loadState`). No hablan con la base ni con la red; por eso
// se prueban contra el repo de memoria y sirven igual con Supabase.
//
// Todo lo que la aplicación ya sabe calcular se importa de `src/lib/` —estado,
// atraso, fecha vigente, replanificaciones, miembros, gravedad—; acá solo vive
// lo propio de una conversación: encontrar cosas por NOMBRE y armar respuestas.
//
// Las importaciones relativas llevan `.js` a propósito: Vercel compila cada
// archivo por separado y Node no adivina extensiones (ver
// `docs/prueba-350-mcp-carga-en-node.mjs`).

import type { AppState, Frente, ISODate, Proyecto, SubFrente, Tarea, Usuario } from '../src/types.js'
import {
  CATEGORIA_LABEL,
  atrasoHabiles,
  categoriaDe,
  contar,
  fechaVigente,
  historialDe,
  nReplanificaciones,
} from '../src/lib/derive.js'
import { miembrosDeProyecto } from '../src/lib/permisos.js'
import { GRAVEDAD } from '../src/lib/orden.js'
import { addDays, cmp } from '../src/lib/dates.js'

// ---------------------------------------------------------------------------
// Hoy y fechas
// ---------------------------------------------------------------------------

/**
 * "Hoy" en Chile. Es el mismo día que usa la base (`hoy_chile()`, migración
 * 27): la regla de replanificación decide con él, así que el MCP no puede
 * usar la hora del servidor de Vercel (UTC), que de noche ya es mañana.
 */
export function hoyChile(ahora: Date = new Date()): ISODate {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/**
 * Valida una fecha escrita por el modelo. Solo se acepta AAAA-MM-DD: un
 * "03/04" puede ser marzo o abril, y adivinar es justo lo que no se puede
 * hacer con un plan real. También rechaza fechas que no existen (31 de abril).
 */
export function validarFecha(texto: string): { ok: true; fecha: ISODate } | { ok: false; error: string } {
  const t = texto.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) {
    return {
      ok: false,
      error: `"${texto}" no es una fecha válida. Usa el formato AAAA-MM-DD (por ejemplo 2026-03-15).`,
    }
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: `La fecha ${t} no existe en el calendario.` }
  }
  return { ok: true, fecha: t }
}

// ---------------------------------------------------------------------------
// Alcance: qué proyectos ve y toca el MCP
// ---------------------------------------------------------------------------

/**
 * Proyectos con los que trabaja el MCP: los de la barra lateral de la
 * aplicación —aquellos de los que el usuario es MIEMBRO (dueño o con acceso)
 * y que no están archivados—, la misma regla que Resumen y Mis Tareas
 * (`proyectosVisibles` en `App.tsx`, #179 y #133).
 *
 * Un administrador puede ver más proyectos en Administración → Proyectos; el
 * MCP no los toma: planificar un proyecto empieza por ser parte de él. Es la
 * ÚNICA función que decide esto: cambiar el alcance es cambiar esta función.
 */
export function proyectosDelAlcance(state: AppState, usuarioId: string): Proyecto[] {
  const conAcceso = new Set(state.accesos.filter((a) => a.usuarioId === usuarioId).map((a) => a.proyectoId))
  return state.proyectos.filter(
    (p) => p.estado !== 'archivado' && (p.duenoId === usuarioId || conAcceso.has(p.id)),
  )
}

// ---------------------------------------------------------------------------
// Rutas: proyecto › frente › sub frente › tarea
// ---------------------------------------------------------------------------

/** Para comparar nombres: sin mayúsculas, sin tildes, espacios colapsados. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const SEP = ' › '

export interface Ubicacion {
  proyecto: Proyecto
  frente: Frente
  subFrente: SubFrente
}

/** Proyecto, frente y sub frente de una tarea (undefined si falta un eslabón). */
export function ubicacionDe(state: AppState, t: Tarea): Ubicacion | undefined {
  const subFrente = state.subFrentes.find((sf) => sf.id === t.subFrenteId)
  const frente = subFrente ? state.frentes.find((f) => f.id === subFrente.frenteId) : undefined
  const proyecto = frente ? state.proyectos.find((p) => p.id === frente.proyectoId) : undefined
  return subFrente && frente && proyecto ? { proyecto, frente, subFrente } : undefined
}

export function rutaTarea(u: Ubicacion, t: Tarea): string {
  return [u.proyecto.nombre, u.frente.nombre, u.subFrente.nombre, t.titulo].join(SEP)
}

/** Un nivel de la ruta tal como lo pidió el modelo. */
interface Nivel<T> {
  etiqueta: string
  valor?: string
  nombre: (x: T) => string
}

/**
 * Resultado de buscar algo por nombre. `ambiguo` NO es un error que se
 * resuelva solo: el MCP no toca nada y devuelve los candidatos con su ruta.
 */
export type Resolucion<T> =
  | { tipo: 'ok'; item: T }
  | { tipo: 'no_encontrado'; mensaje: string }
  | { tipo: 'ambiguo'; mensaje: string; candidatos: string[] }

/**
 * Filtra `items` nivel por nivel. En cada nivel, si alguno coincide EXACTO
 * (sin mayúsculas ni tildes) se quedan solo los exactos; si ninguno, los que
 * CONTIENEN el texto. Así "Informe" elige "Informe" aunque exista "Informe
 * final", y "planos" encuentra "Revisión de planos" si es la única.
 */
function filtrarPorNiveles<T>(
  items: T[],
  niveles: Nivel<T>[],
): { quedan: T[]; fallo?: Nivel<T> } {
  let quedan = items
  for (const n of niveles) {
    if (n.valor === undefined || n.valor.trim() === '') continue
    const buscado = normalizar(n.valor)
    const exactos = quedan.filter((x) => normalizar(n.nombre(x)) === buscado)
    const siguientes = exactos.length ? exactos : quedan.filter((x) => normalizar(n.nombre(x)).includes(buscado))
    if (!siguientes.length) return { quedan: [], fallo: n }
    quedan = siguientes
  }
  return { quedan }
}

const MAX_CANDIDATOS = 25

function listaCandidatos(rutas: string[]): string[] {
  const orden = [...rutas].sort((a, b) => a.localeCompare(b))
  if (orden.length <= MAX_CANDIDATOS) return orden
  return [...orden.slice(0, MAX_CANDIDATOS), `… y ${orden.length - MAX_CANDIDATOS} más`]
}

function resolverGenerico<T>(
  items: T[],
  niveles: Nivel<T>[],
  ruta: (x: T) => string,
  que: string,
): Resolucion<T> {
  const { quedan, fallo } = filtrarPorNiveles(items, niveles)
  if (fallo) {
    return {
      tipo: 'no_encontrado',
      mensaje: `No encontré ${fallo.etiqueta} "${fallo.valor}"${contexto(niveles, fallo)}.`,
    }
  }
  if (quedan.length === 1) return { tipo: 'ok', item: quedan[0] }
  if (!quedan.length) return { tipo: 'no_encontrado', mensaje: `No encontré ${que}.` }
  return {
    tipo: 'ambiguo',
    mensaje: `Hay ${quedan.length} coincidencias para ${que}. No hice nada: indica cuál, con su ruta completa.`,
    candidatos: listaCandidatos(quedan.map(ruta)),
  }
}

/** " en el proyecto X › frente Y" con los niveles que ya pasaron el filtro. */
function contexto<T>(niveles: Nivel<T>[], fallo: Nivel<T>): string {
  const antes = niveles.slice(0, niveles.indexOf(fallo)).filter((n) => n.valor && n.valor.trim())
  if (!antes.length) return ''
  return ` dentro de ${antes.map((n) => `${n.etiqueta} "${n.valor}"`).join(SEP)}`
}

export interface RutaPedida {
  proyecto?: string
  frente?: string
  sub_frente?: string
  tarea?: string
}

export function resolverProyecto(state: AppState, usuarioId: string, nombre: string): Resolucion<Proyecto> {
  return resolverGenerico(
    proyectosDelAlcance(state, usuarioId),
    [{ etiqueta: 'el proyecto', valor: nombre, nombre: (p) => p.nombre }],
    (p) => p.nombre,
    `el proyecto "${nombre}"`,
  )
}

interface FrenteUbicado {
  proyecto: Proyecto
  frente: Frente
}

export function resolverFrente(
  state: AppState,
  usuarioId: string,
  r: { proyecto?: string; frente: string },
): Resolucion<FrenteUbicado> {
  const proyectos = proyectosDelAlcance(state, usuarioId)
  const items: FrenteUbicado[] = state.frentes.flatMap((frente) => {
    const proyecto = proyectos.find((p) => p.id === frente.proyectoId)
    return proyecto ? [{ proyecto, frente }] : []
  })
  return resolverGenerico(
    items,
    [
      { etiqueta: 'el proyecto', valor: r.proyecto, nombre: (x) => x.proyecto.nombre },
      { etiqueta: 'el frente', valor: r.frente, nombre: (x) => x.frente.nombre },
    ],
    (x) => [x.proyecto.nombre, x.frente.nombre].join(SEP),
    `el frente "${r.frente}"`,
  )
}

export function resolverSubFrente(
  state: AppState,
  usuarioId: string,
  r: { proyecto?: string; frente?: string; sub_frente: string },
): Resolucion<Ubicacion> {
  const proyectos = proyectosDelAlcance(state, usuarioId)
  const items: Ubicacion[] = state.subFrentes.flatMap((subFrente) => {
    const frente = state.frentes.find((f) => f.id === subFrente.frenteId)
    const proyecto = frente ? proyectos.find((p) => p.id === frente.proyectoId) : undefined
    return frente && proyecto ? [{ proyecto, frente, subFrente }] : []
  })
  return resolverGenerico(
    items,
    [
      { etiqueta: 'el proyecto', valor: r.proyecto, nombre: (x) => x.proyecto.nombre },
      { etiqueta: 'el frente', valor: r.frente, nombre: (x) => x.frente.nombre },
      { etiqueta: 'el sub frente', valor: r.sub_frente, nombre: (x) => x.subFrente.nombre },
    ],
    (x) => [x.proyecto.nombre, x.frente.nombre, x.subFrente.nombre].join(SEP),
    `el sub frente "${r.sub_frente}"`,
  )
}

interface TareaUbicada extends Ubicacion {
  tarea: Tarea
}

function tareasUbicadas(state: AppState, usuarioId: string, archivadas: boolean): TareaUbicada[] {
  const ids = new Set(proyectosDelAlcance(state, usuarioId).map((p) => p.id))
  return state.tareas.flatMap((tarea) => {
    if (!!tarea.archivada !== archivadas) return []
    const u = ubicacionDe(state, tarea)
    return u && ids.has(u.proyecto.id) ? [{ ...u, tarea }] : []
  })
}

/**
 * Busca UNA tarea por su ruta. `tarea_id` (los que entregan las lecturas)
 * desempata sin ambigüedad. Las archivadas no se tocan: si lo pedido solo
 * existe archivado, se dice así en vez de "no encontrada".
 */
export function resolverTarea(
  state: AppState,
  usuarioId: string,
  r: RutaPedida & { tarea_id?: string },
): Resolucion<TareaUbicada> {
  const niveles: Nivel<TareaUbicada>[] = [
    { etiqueta: 'el proyecto', valor: r.proyecto, nombre: (x) => x.proyecto.nombre },
    { etiqueta: 'el frente', valor: r.frente, nombre: (x) => x.frente.nombre },
    { etiqueta: 'el sub frente', valor: r.sub_frente, nombre: (x) => x.subFrente.nombre },
    { etiqueta: 'la tarea', valor: r.tarea, nombre: (x) => x.tarea.titulo },
  ]
  const ruta = (x: TareaUbicada) => rutaTarea(x, x.tarea)

  if (r.tarea_id) {
    const activa = tareasUbicadas(state, usuarioId, false).find((x) => x.tarea.id === r.tarea_id)
    if (activa) return { tipo: 'ok', item: activa }
    const archivada = tareasUbicadas(state, usuarioId, true).find((x) => x.tarea.id === r.tarea_id)
    if (archivada) return { tipo: 'no_encontrado', mensaje: mensajeArchivada(ruta(archivada)) }
    return { tipo: 'no_encontrado', mensaje: `No encontré una tarea con id ${r.tarea_id} en tus proyectos.` }
  }
  if (!r.tarea || !r.tarea.trim()) return { tipo: 'no_encontrado', mensaje: 'Falta el nombre de la tarea.' }

  const res = resolverGenerico(tareasUbicadas(state, usuarioId, false), niveles, ruta, `la tarea "${r.tarea}"`)
  if (res.tipo !== 'no_encontrado') return res
  const archivadas = filtrarPorNiveles(tareasUbicadas(state, usuarioId, true), niveles).quedan
  if (archivadas.length === 1) return { tipo: 'no_encontrado', mensaje: mensajeArchivada(ruta(archivadas[0])) }
  return res
}

function mensajeArchivada(ruta: string): string {
  return `La tarea ${ruta} está archivada. El MCP no lee ni modifica tareas archivadas; si hay que recuperarla, se restaura desde la aplicación.`
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

/** Personas que se pueden nombrar: las que la base deja ver, sin eliminadas. */
function personasVisibles(state: AppState): Usuario[] {
  return state.usuarios.filter((u) => !u.eliminado)
}

function buscarPersonas(universo: Usuario[], texto: string): Usuario[] {
  const b = normalizar(texto)
  if (!b) return []
  const exactos = universo.filter((u) => normalizar(u.nombre) === b)
  if (exactos.length) return exactos
  const porIniciales = universo.filter((u) => normalizar(u.iniciales) === b)
  if (porIniciales.length) return porIniciales
  // Por palabras: "Daniela" o "Vera" encuentran a "Daniela Vera".
  const palabras = b.split(' ')
  return universo.filter((u) => {
    const n = normalizar(u.nombre)
    return palabras.every((p) => n.includes(p))
  })
}

export function resolverPersona(state: AppState, texto: string): Resolucion<Usuario> {
  const hallados = buscarPersonas(personasVisibles(state), texto)
  if (hallados.length === 1) return { tipo: 'ok', item: hallados[0] }
  if (!hallados.length) return { tipo: 'no_encontrado', mensaje: `No encontré a nadie llamado "${texto}".` }
  return {
    tipo: 'ambiguo',
    mensaje: `Hay ${hallados.length} personas que coinciden con "${texto}". ¿Cuál de ellas?`,
    candidatos: hallados.map((u) => u.nombre).sort((a, b) => a.localeCompare(b)),
  }
}

/**
 * Responsable para una tarea del proyecto. Regla de la aplicación
 * (`miembrosDeProyecto`): activo, no eliminado, y dueño o con acceso. La base
 * NO la exige; el MCP sí, igual que el selector de responsable de la app.
 */
export function resolverResponsable(state: AppState, proyecto: Proyecto, texto: string): Resolucion<Usuario> {
  const miembros = miembrosDeProyecto(state, proyecto.id)
  const nombres = () => miembros.map((u) => u.nombre).sort((a, b) => a.localeCompare(b)).join(', ')
  const hallados = buscarPersonas(miembros, texto)
  if (hallados.length === 1) return { tipo: 'ok', item: hallados[0] }
  if (hallados.length > 1) {
    return {
      tipo: 'ambiguo',
      mensaje: `Hay ${hallados.length} miembros de ${proyecto.nombre} que coinciden con "${texto}". No hice nada: ¿cuál de ellos?`,
      candidatos: hallados.map((u) => u.nombre).sort((a, b) => a.localeCompare(b)),
    }
  }
  // No es miembro: decir por qué, si la persona existe.
  const fuera = buscarPersonas(personasVisibles(state), texto)
  if (fuera.length === 1) {
    const u = fuera[0]
    const motivo = !u.activo ? 'está desactivada' : 'no es miembro del proyecto'
    return {
      tipo: 'no_encontrado',
      mensaje: `${u.nombre} ${motivo}, así que no puede ser responsable en ${proyecto.nombre}. Miembros: ${nombres() || 'ninguno'}.`,
    }
  }
  return {
    tipo: 'no_encontrado',
    mensaje: `Nadie entre los miembros de ${proyecto.nombre} coincide con "${texto}". Miembros: ${nombres() || 'ninguno'}.`,
  }
}

// ---------------------------------------------------------------------------
// Descripción de tareas y del plan
// ---------------------------------------------------------------------------

export interface TareaDescrita {
  id: string
  ruta: string
  titulo: string
  responsable: string | null
  estado: string
  hecha: boolean
  fecha_objetivo: ISODate | null
  fecha_original: ISODate | null
  /** Hechas: la fecha donde la tarea quedó cerrada (la vigente). */
  fecha_cierre?: ISODate | null
  atraso_dias_habiles: number | null
  replanificaciones: number
  descripcion?: string
}

/**
 * Una tarea con todo lo que la tabla de la aplicación muestra. Lo derivado
 * sale de `src/lib/derive.ts`, no se recalcula acá.
 */
export function describirTarea(state: AppState, t: Tarea, hoy: ISODate): TareaDescrita {
  const u = ubicacionDe(state, t)
  const resp = t.responsableId ? state.usuarios.find((x) => x.id === t.responsableId) : undefined
  const d: TareaDescrita = {
    id: t.id,
    ruta: u ? rutaTarea(u, t) : t.titulo,
    titulo: t.titulo,
    // #229: una tarea con responsable nunca se muestra como si no tuviera.
    responsable: t.responsableId ? (resp?.nombre ?? '(persona que ya no es visible)') : null,
    estado: CATEGORIA_LABEL[categoriaDe(state, t, hoy)],
    hecha: t.hecha,
    fecha_objetivo: t.fechaObjetivo ?? null,
    fecha_original: t.fechaOriginal ?? null,
    atraso_dias_habiles: atrasoHabiles(t) ?? null,
    replanificaciones: nReplanificaciones(state, t.id),
  }
  if (t.hecha) d.fecha_cierre = fechaVigente(t) ?? null
  if (t.descripcion) d.descripcion = t.descripcion
  return d
}

function contadores(state: AppState, tareas: Tarea[], hoy: ISODate) {
  const c = contar(state, tareas, hoy)
  return {
    total: c.total,
    hechas: c.hechas,
    pendientes: c.pendientes,
    pendientes_replanificadas: c.pendientesReplan,
    atrasadas: c.atrasadas,
    atrasadas_replanificadas: c.atrasadasReplan,
  }
}

const porOrden = <T extends { orden: number }>(a: T, b: T) => a.orden - b.orden

/** El plan completo de un proyecto, en el orden en que se ve al entrar. */
export function planDeProyecto(state: AppState, proyecto: Proyecto, hoy: ISODate) {
  const frentes = state.frentes.filter((f) => f.proyectoId === proyecto.id).sort(porOrden)
  const todas: Tarea[] = []
  const salida = frentes.map((f) => ({
    frente: f.nombre,
    sub_frentes: state.subFrentes
      .filter((sf) => sf.frenteId === f.id)
      .sort(porOrden)
      .map((sf) => {
        const tareas = state.tareas.filter((t) => t.subFrenteId === sf.id && !t.archivada).sort(porOrden)
        todas.push(...tareas)
        return {
          sub_frente: sf.nombre,
          tareas: tareas.map((t) => {
            // La ruta ya está dada por el anidamiento; se repite solo el título.
            const { ruta: _ruta, ...resto } = describirTarea(state, t, hoy)
            return resto
          }),
        }
      }),
  }))
  return {
    proyecto: proyecto.nombre,
    hoy,
    contadores: contadores(state, todas, hoy),
    frentes: salida,
  }
}

/**
 * Tareas de una persona como las muestra Mis Tareas: todas las suyas, no
 * archivadas, de los proyectos del alcance; lo más crítico primero, luego por
 * fecha objetivo, las sin fecha al final de su grupo (`MisTareasView`).
 */
export function tareasDePersona(state: AppState, usuarioId: string, persona: Usuario, hoy: ISODate) {
  const ids = new Set(proyectosDelAlcance(state, usuarioId).map((p) => p.id))
  const tareas = state.tareas.filter((t) => {
    if (t.responsableId !== persona.id || t.archivada) return false
    const u = ubicacionDe(state, t)
    return !!u && ids.has(u.proyecto.id)
  })
  tareas.sort((a, b) => {
    const ga = GRAVEDAD[categoriaDe(state, a, hoy)]
    const gb = GRAVEDAD[categoriaDe(state, b, hoy)]
    if (ga !== gb) return gb - ga
    if (!a.fechaObjetivo) return 1
    if (!b.fechaObjetivo) return -1
    return cmp(a.fechaObjetivo, b.fechaObjetivo)
  })
  return {
    persona: persona.nombre,
    hoy,
    contadores: contadores(state, tareas, hoy),
    tareas: tareas.map((t) => describirTarea(state, t, hoy)),
  }
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

/** Rango de días para la carga. Tope para que la respuesta no se desborde. */
export const MAX_DIAS_CARGA = 120
export const DIAS_CARGA_POR_DEFECTO = 28

export function rangoCarga(
  hoy: ISODate,
  desde?: string,
  hasta?: string,
): { ok: true; desde: ISODate; hasta: ISODate } | { ok: false; error: string } {
  let d = hoy
  if (desde) {
    const v = validarFecha(desde)
    if (!v.ok) return v
    d = v.fecha
  }
  let h = addDays(d, DIAS_CARGA_POR_DEFECTO - 1)
  if (hasta) {
    const v = validarFecha(hasta)
    if (!v.ok) return v
    h = v.fecha
  }
  if (cmp(h, d) < 0) return { ok: false, error: `El rango termina (${h}) antes de empezar (${d}).` }
  if (cmp(h, addDays(d, MAX_DIAS_CARGA - 1)) > 0) {
    return { ok: false, error: `El rango es demasiado largo: como máximo ${MAX_DIAS_CARGA} días por consulta.` }
  }
  return { ok: true, desde: d, hasta: h }
}

type PorDia = Record<ISODate, number>

function sumar(m: Map<string, PorDia>, clave: string, fecha: ISODate) {
  let pd = m.get(clave)
  if (!pd) {
    pd = {}
    m.set(clave, pd)
  }
  pd[fecha] = (pd[fecha] ?? 0) + 1
}

function enRango(fecha: ISODate | undefined, desde: ISODate, hasta: ISODate): fecha is ISODate {
  return !!fecha && cmp(fecha, desde) >= 0 && cmp(fecha, hasta) <= 0
}

function ordenarDias(pd: PorDia): PorDia {
  return Object.fromEntries(Object.entries(pd).sort(([a], [b]) => cmp(a, b)))
}

const SIN = '\u0000sin'

/**
 * Carga diaria de un proyecto, con LA MISMA REGLA de la Gantt (§6.5,
 * `GanttView`): cada celda persona × día cuenta las tareas cuya fecha
 * VIGENTE cae ese día; incluye hechas y no hechas; cada tarea cuenta una
 * sola vez (las fechas anteriores de las replanificaciones no suman); más
 * "sin responsable" y el total del día.
 *
 * Copia del cálculo de la Gantt a propósito —el pedido no deja tocar su
 * código—, incluido un detalle: un responsable que ya no está entre los
 * usuarios visibles no tiene fila propia, pero sí suma al total.
 *
 * Solo aparecen los días con algo; un día ausente vale 0.
 */
export function cargaDeProyecto(state: AppState, proyecto: Proyecto, desde: ISODate, hasta: ISODate) {
  const sfs = new Set(
    state.subFrentes
      .filter((sf) => state.frentes.some((f) => f.id === sf.frenteId && f.proyectoId === proyecto.id))
      .map((sf) => sf.id),
  )
  const porClave = new Map<string, PorDia>()
  const total: PorDia = {}
  for (const t of state.tareas) {
    if (t.archivada || !sfs.has(t.subFrenteId)) continue
    const fecha = fechaVigente(t)
    if (!enRango(fecha, desde, hasta)) continue
    sumar(porClave, t.responsableId ?? SIN, fecha)
    total[fecha] = (total[fecha] ?? 0) + 1
  }
  const personas = [...porClave.entries()]
    .filter(([clave]) => clave !== SIN)
    .flatMap(([id, porDia]) => {
      const u = state.usuarios.find((x) => x.id === id)
      return u ? [{ persona: u.nombre, por_dia: ordenarDias(porDia) }] : []
    })
    .sort((a, b) => a.persona.localeCompare(b.persona))
  return {
    proyecto: proyecto.nombre,
    desde,
    hasta,
    regla: 'Cada tarea cuenta una vez, en su fecha vigente; incluye hechas y no hechas. Un día ausente vale 0.',
    personas,
    sin_responsable: ordenarDias(porClave.get(SIN) ?? {}),
    total: ordenarDias(total),
  }
}

/**
 * Carga diaria de una persona en todos los proyectos del alcance: la fila
 * "Total" de la Gantt de Mis Tareas (#190), con el desglose por proyecto.
 */
export function cargaDePersona(
  state: AppState,
  usuarioId: string,
  persona: Usuario,
  desde: ISODate,
  hasta: ISODate,
) {
  const ids = new Set(proyectosDelAlcance(state, usuarioId).map((p) => p.id))
  const porProyecto = new Map<string, PorDia>()
  const total: PorDia = {}
  for (const t of state.tareas) {
    if (t.archivada || t.responsableId !== persona.id) continue
    const u = ubicacionDe(state, t)
    if (!u || !ids.has(u.proyecto.id)) continue
    const fecha = fechaVigente(t)
    if (!enRango(fecha, desde, hasta)) continue
    sumar(porProyecto, u.proyecto.nombre, fecha)
    total[fecha] = (total[fecha] ?? 0) + 1
  }
  return {
    persona: persona.nombre,
    desde,
    hasta,
    regla: 'Cada tarea cuenta una vez, en su fecha vigente; incluye hechas y no hechas. Un día ausente vale 0.',
    total: ordenarDias(total),
    por_proyecto: [...porProyecto.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([proyecto, porDia]) => ({ proyecto, por_dia: ordenarDias(porDia) })),
  }
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

export function historialDeTarea(state: AppState, t: Tarea, hoy: ISODate) {
  return {
    tarea: describirTarea(state, t, hoy),
    replanificaciones: historialDe(state, t.id).map((h) => ({
      numero: h.numeroCambio,
      fecha_anterior: h.fechaAnterior,
      fecha_nueva: h.fechaNueva,
      quien: state.usuarios.find((u) => u.id === h.cambiadoPor)?.nombre ?? '(persona que ya no es visible)',
      cuando: h.timestamp,
    })),
  }
}

// ---------------------------------------------------------------------------
// Proyectos y miembros
// ---------------------------------------------------------------------------

export function miembrosDe(state: AppState, proyecto: Proyecto) {
  return miembrosDeProyecto(state, proyecto.id)
    .map((u) => ({
      nombre: u.nombre,
      iniciales: u.iniciales,
      perfil: u.rol,
      dueno: u.id === proyecto.duenoId,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function listaDeProyectos(state: AppState, usuarioId: string, hoy: ISODate) {
  return proyectosDelAlcance(state, usuarioId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => {
      const tareas = state.tareas.filter((t) => ubicacionDe(state, t)?.proyecto.id === p.id)
      return {
        proyecto: p.nombre,
        descripcion: p.descripcion ?? null,
        contadores: contadores(state, tareas, hoy),
        miembros: miembrosDe(state, p),
      }
    })
}
