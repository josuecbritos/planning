import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppState, Frente, ISODate, Proyecto, SubFrente, Tarea, TipoMarca, Usuario } from '../types'
import type { Actions, FrenteSel } from '../App'
import {
  addDays,
  cmp,
  diasCalendario,
  diasHabiles,
  esFinDeSemana,
  etiquetaDia,
  etiquetaSemana,
  esLunes,
  inicioSemana,
} from '../lib/dates'
import { colorTarea, fechaVigente, marcasDe } from '../lib/derive'
import { filtraTareas, pasaFiltroCompleto, rangoDeFecha, type Filtro } from '../lib/filtros'
import { referenciaEnFoto, useVistaCongelada } from '../lib/vistaCongelada'
import { enMitadSuperior, useArrastreTareas, type DndTareas } from '../lib/arrastre'
import { planMoverTarea } from '../lib/mover'
import { ordenarMulti, valorOrden, type CampoOrden, type OrdenMulti } from '../lib/orden'
import { miembrosDeProyecto, puedeEditarFecha, responsableDeTarea, type Can } from '../lib/permisos'
import { EmptyFrentes } from './EmptyFrentes'
import { Marca } from './Marca'
import { Avatar, RespPicker } from './RespPicker'
import { HoverCard } from './HoverCard'
import { GloboTip } from './GloboTip'
import { TaskDetail } from './TaskDetail'
import { InlineText } from './InlineText'

// Vista Gantt — grilla tipo Excel (4.3). Estandar de planificacion por
// CLICS (pedido punto 2; reemplaza el arrastre):
//  - clic izquierdo en celda vacia         → planifica (pone la marca)
//  - clic izquierdo en marca FUTURA        → borra la marca (queda sin fecha)
//  - clic izquierdo en marca de hoy/vencida→ bloqueado + mini-aviso
//  - clic izquierdo en celda futura de una tarea de hoy/vencida → replanifica
//    (nueva marca a futuro; cuenta como replanificacion, regla 1.2)
//  - clic derecho sobre una marca          → alterna lista / no lista
//    (el menu contextual del navegador queda suprimido sobre la grilla)
//  - "+" al pasar el mouse crea un hermano justo debajo, INLINE en la grilla
//  - contenedores vacios muestran "+ agregar" que se convierte en input
// Al pie, filas de carga por persona (§6.5) + fila "Sin asignar".

/**
 * Modos del horizonte: qué DÍAS se ven. Siempre arranca en 'hoy'; no se
 * persiste. El antiguo "Rango personalizado" se elimino: un rango especifico se
 * pide con el filtro de fechas (rango fijo), que ademas de filtrar las tareas
 * se traduce al horizonte (#250) — mientras hay filtro de fecha, el modo no se
 * elige.
 *
 * #305: el modo y el toggle de días hábiles se ELIGEN en el control "Rango" de
 * la barra de controles, así que su estado vive en la pantalla (arriba) y llega
 * acá por props. La grilla los usa; ya no los guarda.
 */
export type ModoHorizonte = 'hoy' | 'todo'

/**
 * #190 — Modo "Mis Tareas": la misma Gantt, pero sobre las tareas del usuario
 * cruzando TODOS sus proyectos. Cambia solo el origen de las filas (y agrega
 * la columna de proyecto a la izquierda); el formato de la grilla es idéntico.
 * Es de lectura y replanificación: no ofrece crear ni eliminar nada.
 */
export interface GanttMisTareas {
  usuarioId: string
  /** Proyectos visibles: dan color/nombre de la columna y acotan las filas. */
  proyectos: Proyecto[]
  /** Permisos POR PROYECTO (dueño vs invitado): cada tarea usa los suyos. */
  canDe: (proyectoId: string) => Can
}

interface Props {
  state: AppState
  /** Proyecto de la vista. En modo Mis Tareas no aplica (las filas cruzan varios). */
  proyectoId?: string
  frenteSel: FrenteSel
  hoy: string
  can: Can
  /** Filtro activo (punto 3). Se aplica entero —fecha incluida— igual que en
   *  la tabla; la parte de fecha además define el horizonte visible (#250). */
  filtro: Filtro
  /** Orden multinivel (punto 4): reordena las filas dentro de cada bloque de
   *  sub frente, sin mezclarlas entre bloques. */
  orden: OrdenMulti
  /** P4: la Gantt escribe el rango del horizonte al filtro cuando "En horizonte
   *  visible" está activo, para que la tabla use el mismo rango. */
  onCambiarFiltro: (f: Filtro) => void
  /** P1: nonce que fuerza el re-snapshot de la vista congelada. */
  snapshotNonce: number
  /** P1: informa si la foto quedó desactualizada (para "Actualizar vista"). */
  onStale: (stale: boolean) => void
  /** #253: ids recién creados. Se muestran aunque la foto congelada o el filtro
   *  los dejen fuera; el resto de la grilla no se reordena. */
  tareasNuevas?: string[]
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
  /** #190: presente = Gantt de Mis Tareas (multi-proyecto, sin creación). */
  misTareas?: GanttMisTareas
  /** #293: miembro del proyecto y en escritorio → asa de arrastre. En Mis
   *  Tareas no aplica (el pedido lo excluye), venga lo que venga acá. */
  puedeArrastrar?: boolean
  /** #305: horizonte elegido en el control "Rango" de la barra. */
  modoHorizonte: ModoHorizonte
  /** #305: §6.3.19 — lunes a viernes o los siete días, elegido en "Rango". */
  soloHabiles: boolean
  /** #305: §6.3.20 — cuántas tareas esconde el modo "días hábiles". Lo informa
   *  la grilla porque solo ella sabe qué filas quedaron; el control "Rango" lo
   *  muestra como círculo y lo detalla dentro de su menú. */
  onOcultasFinde: (n: number) => void
}

type FilaGantt =
  | {
      tipo: 'tarea'
      tarea: Tarea
      frente: Frente
      sub: SubFrente
      esInicioFrente: boolean
      spanFrente: number
      esInicioSub: boolean
      spanSub: number
      esPrimeraGlobal: boolean
    }
  | {
      tipo: 'vacio-sub'
      frente: Frente
      sub: SubFrente
      esInicioFrente: boolean
      spanFrente: number
      esPrimeraGlobal: boolean
    }
  | {
      tipo: 'vacio-frente'
      frente: Frente
      esPrimeraGlobal: boolean
    }
  // Filas de creacion inline (§6.4.25): el "+" inserta un input EN la grilla.
  | { tipo: 'input-frente'; esPrimeraGlobal: boolean }
  | {
      tipo: 'input-sub'
      frente: Frente
      esInicioFrente: boolean
      spanFrente: number
      esPrimeraGlobal: boolean
    }
  | {
      tipo: 'input-tarea'
      frente: Frente
      sub: SubFrente
      esInicioFrente: boolean
      spanFrente: number
      esInicioSub: boolean
      spanSub: number
      esPrimeraGlobal: boolean
    }

/** Donde esta abierto el input inline de creacion. */
interface CrearEn {
  tipo: 'frente' | 'sub' | 'tarea'
  /** Hermano tras el cual insertar (undefined = al final del contenedor). */
  despuesDe?: { id: string; orden: number }
  /** Contenedor del nuevo elemento (proyecto/frente/sub segun tipo). */
  contenedorId: string
}

/** Mini-aviso flotante (2.2): "No puedes eliminar tareas que ya pasaron". */
interface Aviso {
  x: number
  y: number
  texto: string
}

/** Clave interna de la fila de carga "Sin asignar" (tareas sin responsable). */
const SIN_ASIGNAR = '__sin_asignar__'

/**
 * Ventana fija del modo "Alrededor de hoy": 2 semanas hacia atras + la
 * semana actual + 2 semanas hacia adelante.
 */
function ventanaHoy(hoy: ISODate): { desde: ISODate; hasta: ISODate } {
  return {
    desde: inicioSemana(addDays(hoy, -14)),
    hasta: addDays(inicioSemana(addDays(hoy, 14)), 6),
  }
}

// Referencia estable para el valor por defecto (ver TableView).
const SIN_NUEVAS: string[] = []

export function GanttView({ state, proyectoId, frenteSel, hoy, can, filtro, orden, onCambiarFiltro, snapshotNonce, onStale, actions, onAbrirTarea, misTareas, tareasNuevas = SIN_NUEVAS, puedeArrastrar = false, modoHorizonte: modo, soloHabiles, onOcultasFinde }: Props) {
  // #190: en modo Mis Tareas la grilla es de lectura y replanificación —
  // ninguna afordancia de creación (una tarea creada aquí no sería del
  // usuario hasta asignársela, así que aparecería y desaparecería sola).
  const permiteCrear = !misTareas
  const [crearEn, setCrearEn] = useState<CrearEn | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const avisoTimer = useRef<number | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement>(null)

  function mostrarAviso(e: React.MouseEvent, texto: string) {
    setAviso({ x: Math.min(e.clientX, window.innerWidth - 280), y: e.clientY + 14, texto })
    window.clearTimeout(avisoTimer.current)
    avisoTimer.current = window.setTimeout(() => setAviso(null), 2400)
  }

  // Candidatos a responsable: admins, el dueño y quienes tienen acceso. En
  // Mis Tareas no se reasigna responsable (sacaría la tarea de la propia
  // vista), así que la columna queda de solo lectura y no hay candidatos.
  // #228: los candidatos son los MIEMBROS del proyecto, la misma lista que usa
  // la tabla y el panel de detalle (ver `miembrosDeProyecto`).
  const candidatos = misTareas ? [] : miembrosDeProyecto(state, proyectoId ?? null)

  // #190: origen de los frentes. En un proyecto, los suyos (o el seleccionado);
  // en Mis Tareas, los de TODOS los proyectos visibles, ordenados por proyecto
  // y luego por su orden dentro del proyecto.
  const proyectosMT = useMemo(
    () => new Map((misTareas?.proyectos ?? []).map((p) => [p.id, p])),
    [misTareas],
  )
  const frentesFuente = useMemo(() => {
    if (misTareas) {
      return state.frentes
        .filter((f) => proyectosMT.has(f.proyectoId))
        .sort((a, b) => {
          const na = proyectosMT.get(a.proyectoId)!.nombre
          const nb = proyectosMT.get(b.proyectoId)!.nombre
          return na.localeCompare(nb) || a.orden - b.orden
        })
    }
    return state.frentes
      .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
      .sort((a, b) => a.orden - b.orden)
  }, [state.frentes, misTareas, proyectosMT, proyectoId, frenteSel])

  // En Mis Tareas, la fila base son SOLO las tareas del usuario.
  const esMia = (t: Tarea) => !misTareas || t.responsableId === misTareas.usuarioId
  // Filtro de proyecto (solo existe en Mis Tareas, que cruza varios).
  const filtraProyecto = !!(misTareas && filtro.proyectos && filtro.proyectos.length > 0)
  const pasaProyecto = (f: Frente) => !filtraProyecto || filtro.proyectos!.includes(f.proyectoId)

  // #250: el filtro se aplica ENTERO, igual que en la tabla — fecha incluida.
  // Antes la fecha NO filtraba filas aquí: solo se traducía al horizonte, así
  // que con "Hoy" puesto seguían apareciendo tareas de otros días y tareas sin
  // fecha. Ahora hace las dos cosas: filtra las tareas Y define la ventana de
  // días (más abajo). Con filtro activo, los contenedores vacíos se omiten.
  const hayFiltroTareas = filtraTareas(filtro) || filtraProyecto
  const pasaEnGantt = (t: Tarea) => pasaFiltroCompleto(state, t, filtro, hoy)
  // #190: en Mis Tareas nunca se dibujan contenedores vacíos ni filas de
  // creación — la vista muestra solo frentes/sub frentes CON tareas propias.
  const omitirVacios = hayFiltroTareas || !!misTareas

  // P1: vista congelada. Se congela con filtro y/u orden activo. `frescoIds`
  // recorre frentes→subs→tareas aplicando el filtro/orden actual; la foto se
  // compara contra esto para saber si quedó desactualizada por una edición.
  const activo = hayFiltroTareas || orden.length > 0
  const { frescoIds, existentesIds } = useMemo(() => {
    const fresco: string[] = []
    const existentes: string[] = []
    for (const f of frentesFuente) {
      const subs = state.subFrentes.filter((sf) => sf.frenteId === f.id).sort((a, b) => a.orden - b.orden)
      for (const sf of subs) {
        const todas = state.tareas
          .filter((t) => t.subFrenteId === sf.id && !t.archivada && esMia(t))
          .sort((a, b) => a.orden - b.orden)
        for (const t of todas) existentes.push(t.id)
        const visibles = todas.filter(
          (t) => !hayFiltroTareas || (pasaProyecto(f) && pasaFiltroCompleto(state, t, filtro, hoy)),
        )
        const ord = ordenarMulti(visibles, orden, (t, campo) =>
          valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
        )
        for (const t of ord) fresco.push(t.id)
      }
    }
    return { frescoIds: fresco, existentesIds: existentes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, frentesFuente, hayFiltroTareas, filtro, orden, hoy])

  const firma = JSON.stringify([
    misTareas ? `mt:${misTareas.usuarioId}` : proyectoId,
    frenteSel,
    filtro,
    orden,
    snapshotNonce,
  ])
  const { congelada, visibleIds, indice, stale, moverEnFoto } = useVistaCongelada(frescoIds, existentesIds, activo, firma)

  // #293: arrastrar para reordenar / mover de sub frente — la MISMA pieza que
  // la tabla (`useArrastreTareas`), con el asa en el mismo lugar respecto del
  // nombre. En Mis Tareas no existe el gesto.
  const dnd = useArrastreTareas({
    habilitado: puedeArrastrar && !misTareas,
    puedeRecibir: (t, subFrenteId) => subFrenteId === t.subFrenteId || can.editarTareas(t),
    alSoltar: (t, destino) => {
      if (planMoverTarea(state.tareas, t.id, destino.subFrenteId, destino.antesDeId).length === 0) return
      if (congelada) moverEnFoto(t.id, referenciaEnFoto(state.tareas, visibleIds, indice, t.id, destino))
      void actions.moverTarea(t.id, destino.subFrenteId, destino.antesDeId)
    },
  })

  // #253: aquí se puede crear CON filtro puesto (la tabla esconde su fila de
  // creación mientras se filtra; la grilla no), así que es donde el caso se ve
  // más seguido. Mismo remedio que en la tabla: la recién creada se muestra
  // aunque la foto o el filtro la dejen fuera, con "Actualizar vista" encendido.
  const forzarIds = useMemo(() => {
    const fuera = new Set<string>()
    for (const id of tareasNuevas) {
      const t = state.tareas.find((x) => x.id === id)
      if (!t || t.archivada || !esMia(t)) continue
      const enVista = congelada
        ? visibleIds.has(t.id)
        : !hayFiltroTareas || pasaFiltroCompleto(state, t, filtro, hoy)
      if (!enVista) fuera.add(t.id)
    }
    return fuera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareasNuevas, state, congelada, visibleIds, hayFiltroTareas, filtro, hoy])

  useEffect(() => onStale(stale || forzarIds.size > 0), [stale, forzarIds, onStale])

  // -- Filas (incluye contenedores vacios §6.4.26 e inputs inline §6.4.25) --
  const filas = useMemo<FilaGantt[]>(() => {
    const out: FilaGantt[] = []

    let primera = true
    for (const f of frentesFuente) {
      const subs = state.subFrentes
        .filter((sf) => sf.frenteId === f.id)
        .sort((a, b) => a.orden - b.orden)

      const filasFrente: FilaGantt[] = []
      if (subs.length === 0) {
        if (!omitirVacios) filasFrente.push({ tipo: 'vacio-frente', frente: f, esPrimeraGlobal: false })
      } else {
        for (const sf of subs) {
          const todasSub = state.tareas
            .filter((t) => t.subFrenteId === sf.id && !t.archivada && esMia(t))
            .sort((a, b) => a.orden - b.orden)
          // Punto 4: el orden reordena DENTRO del bloque de sub frente (no mezcla
          // entre bloques). P1: con la vista congelada se muestran EXACTAMENTE las
          // tareas de la foto (membresía + orden), sin sacar ni reordenar por
          // ediciones; sin congelar, se filtra y ordena en vivo.
          // #253: las forzadas entran al final del bloque, sin mover al resto.
          const tareas = congelada
            ? todasSub
                .filter((t) => visibleIds.has(t.id) || forzarIds.has(t.id))
                .sort(
                  (a, b) =>
                    (indice.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                    (indice.get(b.id) ?? Number.MAX_SAFE_INTEGER),
                )
            : ordenarMulti(
                todasSub.filter(
                  (t) => !hayFiltroTareas || (pasaProyecto(f) && pasaEnGantt(t)) || forzarIds.has(t.id),
                ),
                orden,
                (t, campo) => valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
              )
          const filasSub: FilaGantt[] = []
          if (tareas.length === 0) {
            if (omitirVacios) continue
            filasSub.push({
              tipo: 'vacio-sub',
              frente: f,
              sub: sf,
              esInicioFrente: false,
              spanFrente: 0,
              esPrimeraGlobal: false,
            })
          } else {
            for (const t of tareas) {
              filasSub.push({
                tipo: 'tarea',
                tarea: t,
                frente: f,
                sub: sf,
                esInicioFrente: false,
                spanFrente: 0,
                esInicioSub: false,
                spanSub: 0,
                esPrimeraGlobal: false,
              })
            }
            // Input de tarea nueva justo debajo de su hermana.
            if (crearEn?.tipo === 'tarea' && crearEn.contenedorId === sf.id && crearEn.despuesDe) {
              const idx = filasSub.findIndex(
                (x) => x.tipo === 'tarea' && x.tarea.id === crearEn.despuesDe!.id,
              )
              filasSub.splice(idx < 0 ? filasSub.length : idx + 1, 0, {
                tipo: 'input-tarea',
                frente: f,
                sub: sf,
                esInicioFrente: false,
                spanFrente: 0,
                esInicioSub: false,
                spanSub: 0,
                esPrimeraGlobal: false,
              })
            }
            // La celda combinada del sub frente abarca tambien el input.
            filasSub.forEach((x, i) => {
              if (x.tipo === 'tarea' || x.tipo === 'input-tarea') {
                x.esInicioSub = i === 0
                x.spanSub = filasSub.length
              }
            })
          }
          filasFrente.push(...filasSub)
          // Input de sub frente nuevo justo debajo del sub hermano.
          if (crearEn?.tipo === 'sub' && crearEn.contenedorId === f.id && crearEn.despuesDe?.id === sf.id) {
            filasFrente.push({
              tipo: 'input-sub',
              frente: f,
              esInicioFrente: false,
              spanFrente: 0,
              esPrimeraGlobal: false,
            })
          }
        }
      }
      filasFrente.forEach((fila, i) => {
        if (fila.tipo !== 'vacio-frente' && fila.tipo !== 'input-frente') {
          fila.esInicioFrente = i === 0
          fila.spanFrente = filasFrente.length
        }
        fila.esPrimeraGlobal = primera && i === 0
      })
      out.push(...filasFrente)
      // Solo cuenta como "ya hubo un frente" si aportó filas: con filtro (o en
      // Mis Tareas) muchos frentes quedan vacíos y no deben consumir el turno
      // de "primera fila global" (el separador superior).
      if (filasFrente.length > 0) primera = false
      // Input de frente nuevo justo debajo del frente hermano.
      if (crearEn?.tipo === 'frente' && crearEn.despuesDe?.id === f.id) {
        out.push({ tipo: 'input-frente', esPrimeraGlobal: false })
      }
    }
    if (crearEn?.tipo === 'frente' && !crearEn.despuesDe) {
      out.push({ tipo: 'input-frente', esPrimeraGlobal: out.length === 0 })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, frentesFuente, omitirVacios, crearEn, filtro, orden, hoy, hayFiltroTareas, congelada, visibleIds, indice, forzarIds])

  const filasTarea = useMemo(
    () => filas.filter((f): f is Extract<FilaGantt, { tipo: 'tarea' }> => f.tipo === 'tarea'),
    [filas],
  )

  // -- Rango de dias segun el modo de horizonte + toggle habiles/completa --
  // Punto 3.5 + #250: el filtro de fecha hace LAS DOS COSAS — filtra las tareas
  // (arriba, igual que en la tabla) y define el horizonte, la ventana de días.
  // Van juntas a propósito: si "Esta semana" deja solo las tareas de la semana,
  // la ventana que corresponde es esa semana. Las relativas se recalculan
  // contra hoy.
  const dias = useMemo<ISODate[]>(() => {
    let desde: ISODate
    let hasta: ISODate

    // "En horizonte visible" NO fija el horizonte (el horizonte lo define el
    // modo); al revés, el rango se DERIVA del horizonte (efecto más abajo).
    const rangoFiltro =
      filtro.fecha && filtro.fecha.tipo !== 'horizonte' ? rangoDeFecha(filtro.fecha, hoy) : null
    if (rangoFiltro && (rangoFiltro.desde || rangoFiltro.hasta)) {
      const v = ventanaHoy(hoy)
      desde = rangoFiltro.desde ?? v.desde
      hasta = rangoFiltro.hasta ?? v.hasta
      if (cmp(desde, hasta) > 0) [desde, hasta] = [hasta, desde]
      return soloHabiles ? diasHabiles(desde, hasta) : diasCalendario(desde, hasta)
    }

    if (modo === 'todo' && filasTarea.length > 0) {
      const fechas: ISODate[] = [hoy]
      for (const { tarea } of filasTarea) {
        if (tarea.fechaOriginal) fechas.push(tarea.fechaOriginal)
        if (tarea.fechaObjetivo) fechas.push(tarea.fechaObjetivo)
        if (tarea.fechaReal) fechas.push(tarea.fechaReal)
        for (const h of state.historial.filter((x) => x.tareaId === tarea.id)) {
          fechas.push(h.fechaAnterior, h.fechaNueva)
        }
      }
      const min = fechas.reduce((a, b) => (cmp(a, b) <= 0 ? a : b))
      const max = fechas.reduce((a, b) => (cmp(a, b) >= 0 ? a : b))
      desde = inicioSemana(min)
      hasta = addDays(inicioSemana(max), 6)
    } else {
      const v = ventanaHoy(hoy)
      desde = v.desde
      hasta = v.hasta
    }

    return soloHabiles ? diasHabiles(desde, hasta) : diasCalendario(desde, hasta)
  }, [filasTarea, state.historial, hoy, modo, soloHabiles, filtro.fecha])

  // P4: con "En horizonte visible" activo, sincroniza el rango del filtro con
  // el horizonte visible actual (primer y último día). Así la tabla filtra por
  // el mismo rango. Solo escribe si cambió, para no ciclar.
  useEffect(() => {
    if (filtro.fecha?.tipo !== 'horizonte') return
    const desde = dias[0]
    const hasta = dias[dias.length - 1]
    if (!desde || !hasta) return
    if (filtro.fecha.desde === desde && filtro.fecha.hasta === hasta) return
    onCambiarFiltro({ ...filtro, fecha: { tipo: 'horizonte', desde, hasta } })
  }, [dias, filtro, onCambiarFiltro])

  // §6.3.20: en modo dias habiles, tareas con fecha de finde quedan ocultas.
  const ocultasFinde = useMemo(() => {
    if (!soloHabiles) return 0
    return filasTarea.filter(({ tarea }) => {
      const f = fechaVigente(tarea)
      return f && esFinDeSemana(f)
    }).length
  }, [filasTarea, soloHabiles])

  // #305: el aviso dejó de ser una franja propia sobre la grilla —aparecía y
  // desaparecía según el proyecto, moviendo todo lo de abajo— y pasó al control
  // "Rango". La cuenta se sigue calculando acá, que es donde se sabe.
  useEffect(() => {
    onOcultasFinde(ocultasFinde)
  }, [ocultasFinde, onOcultasFinde])
  // Al salir de la Gantt no queda nada escondido: el círculo debe apagarse.
  useEffect(() => () => onOcultasFinde(0), [onOcultasFinde])

  // -- Agrupacion por semana para el encabezado de dos niveles --
  const semanas = useMemo(() => {
    const grupos: { lunes: ISODate; dias: ISODate[] }[] = []
    for (const d of dias) {
      const lunes = inicioSemana(d)
      const g = grupos[grupos.length - 1]
      if (g && g.lunes === lunes) g.dias.push(d)
      else grupos.push({ lunes, dias: [d] })
    }
    return grupos
  }, [dias])

  // §6.5: carga por persona. Reglas: cada celda persona x dia cuenta las
  // tareas cuya fecha VIGENTE cae ese dia (la misma fecha donde la Gantt
  // dibuja la marca principal); incluye hechas y no hechas; cada tarea
  // cuenta UNA sola vez (las fechas anteriores de replanificaciones no
  // suman). Filas extra: "Sin asignar" (tareas sin responsable) y "Total"
  // (suma de todas las personas + sin asignar).
  const carga = useMemo(() => {
    const diasSet = new Set(dias)
    const porClave = new Map<string, Map<ISODate, number>>()
    const total = new Map<ISODate, number>()
    for (const { tarea } of filasTarea) {
      const fecha = fechaVigente(tarea)
      if (!fecha || !diasSet.has(fecha)) continue
      const clave = tarea.responsableId ?? SIN_ASIGNAR
      let m = porClave.get(clave)
      if (!m) {
        m = new Map()
        porClave.set(clave, m)
      }
      m.set(fecha, (m.get(fecha) ?? 0) + 1)
      total.set(fecha, (total.get(fecha) ?? 0) + 1)
    }
    const personas = [...porClave.entries()]
      .filter(([clave]) => clave !== SIN_ASIGNAR)
      .map(([usuarioId, porDia]) => ({
        usuario: state.usuarios.find((u) => u.id === usuarioId),
        porDia,
      }))
      .filter((x): x is { usuario: Usuario; porDia: Map<ISODate, number> } => Boolean(x.usuario))
      .sort((a, b) => a.usuario.nombre.localeCompare(b.usuario.nombre))
    // #190: en Mis Tareas hay una sola persona — al pie va UNA fila con el
    // total diario del usuario (sin desglose por persona ni "Sin asignar").
    if (misTareas) {
      return { personas: [], sinAsignar: null, total: total.size > 0 ? total : null }
    }
    return {
      personas,
      sinAsignar: porClave.get(SIN_ASIGNAR) ?? null,
      total: total.size > 0 ? total : null,
    }
  }, [filasTarea, dias, state.usuarios, misTareas])

  // -- Creacion inline (§6.4.25/26) --

  function abrirCrear(e: React.MouseEvent, crear: CrearEn) {
    e.stopPropagation()
    setCrearEn(crear)
  }

  async function crearElemento(nombre: string) {
    if (!crearEn) return
    const { tipo, despuesDe, contenedorId } = crearEn
    // Insertar justo debajo del hermano: se corren los ordenes siguientes.
    // (Los clientes crean al final: el corrimiento exige editar hermanos.)
    const insertar = can.controlTotal && despuesDe ? despuesDe.orden + 1 : undefined
    if (tipo === 'frente') {
      if (insertar !== undefined) {
        const hermanos = state.frentes.filter((f) => f.proyectoId === contenedorId && f.orden >= insertar)
        await Promise.all(hermanos.map((h) => actions.updateFrente(h.id, { orden: h.orden + 1 })))
      }
      await actions.createFrente({ proyectoId: contenedorId, nombre, orden: insertar })
    } else if (tipo === 'sub') {
      if (insertar !== undefined) {
        const hermanos = state.subFrentes.filter((sf) => sf.frenteId === contenedorId && sf.orden >= insertar)
        await Promise.all(hermanos.map((h) => actions.updateSubFrente(h.id, { orden: h.orden + 1 })))
      }
      await actions.createSubFrente({ frenteId: contenedorId, nombre, orden: insertar })
    } else {
      if (insertar !== undefined) {
        const hermanos = state.tareas.filter((t) => t.subFrenteId === contenedorId && t.orden >= insertar)
        await Promise.all(hermanos.map((h) => actions.updateTarea(h.id, { orden: h.orden + 1 })))
      }
      await actions.createTarea({ subFrenteId: contenedorId, titulo: nombre, orden: insertar })
    }
  }

  // Punto 3: mantiene el nombre de cada frente/sub frente visible mientras
  // su bloque este en pantalla. Reposiciona el envoltorio absoluto para
  // centrarlo en la INTERSECCION del bloque con la banda visible (bajo el
  // encabezado congelado). Si el bloque cabe entero, queda centrado.
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const thead = scroll.querySelector('thead')
    let raf = 0
    const posicionar = () => {
      raf = 0
      const sr = scroll.getBoundingClientRect()
      const headH = thead ? thead.getBoundingClientRect().height : 0
      // P2: publica el alto de la banda de rango (fila superior del thead) para
      // que la banda de días se congele JUSTO debajo (segunda banda sticky).
      const semanaRow = thead?.querySelector<HTMLElement>('tr.semana')
      if (semanaRow) {
        scroll.style.setProperty('--gantt-semana-h', `${Math.round(semanaRow.getBoundingClientRect().height)}px`)
      }
      const bandTop = sr.top + headH
      const bandBottom = sr.bottom
      const bandH = bandBottom - bandTop
      scroll.querySelectorAll<HTMLElement>('td.fija--rotula').forEach((td) => {
        const label = td.firstElementChild as HTMLElement | null
        if (!label) return
        const cr = td.getBoundingClientRect()
        const labelH = label.offsetHeight
        // Corrección #108 — dos casos según la altura del bloque:
        //  - Bloque que CABE en la banda visible: título centrado en el
        //    bloque, fijo (comportamiento normal, sin "sticky").
        //  - Bloque MÁS ALTO que la banda: título "sticky" centrado en la
        //    porción visible del bloque, CLAMPEADO dentro de sus bordes (no
        //    se sale ni se recorta).
        let top: number
        if (cr.height <= bandH) {
          top = (cr.height - labelH) / 2
        } else {
          const visTop = Math.max(cr.top, bandTop)
          const visBottom = Math.min(cr.bottom, bandBottom)
          const visCenter = (visTop + visBottom) / 2
          top = visCenter - cr.top - labelH / 2
          top = Math.max(0, Math.min(top, cr.height - labelH))
        }
        label.style.top = `${top}px`
      })
    }
    const solicitar = () => {
      if (!raf) raf = requestAnimationFrame(posicionar)
    }
    posicionar()
    scroll.addEventListener('scroll', solicitar, { passive: true })
    window.addEventListener('resize', solicitar)
    const ro = new ResizeObserver(solicitar)
    ro.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', solicitar)
      window.removeEventListener('resize', solicitar)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [filas, dias, soloHabiles, modo])

  // #306b — El "+" se pega al borde derecho del NOMBRE, no al de la columna.
  //
  // Anclado al borde de la columna quedaba lejos del nombre y se veía
  // desprendido de él. Pegarlo al nombre no se puede resolver solo con CSS: el
  // ancho de la CAJA del texto no es el ancho del texto RENDERIZADO —una caja
  // de 103 con dos palabras que envuelven tiene líneas mucho más cortas—, y
  // CSS no sabe dónde acaba la línea más larga. Un `Range` sobre el contenido
  // sí: devuelve un rectángulo por línea.
  //
  // Se coloca en la coordenada de la línea más ancha más 4, y se ACOTA al
  // borde derecho de la celda: cuando el nombre no deja sitio, el "+" queda
  // apoyado ahí, que es el otro caso del pedido. No hay condicional — es el
  // mismo `Math.min` para los dos.
  //
  // No corre al DESPLAZAR, a diferencia de la rótula: dónde acaba el texto no
  // depende del scroll, solo del contenido y del ancho de la columna.
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const colocarMas = () => {
      scroll.querySelectorAll<HTMLElement>('td.fija--rotula').forEach((td) => {
        const btn = td.querySelector<HTMLElement>('.mas-btn')
        const txt = td.querySelector<HTMLElement>('.fija-txt')
        if (!btn || !txt) return
        const rango = document.createRange()
        rango.selectNodeContents(txt)
        const lineas = [...rango.getClientRects()]
        const caja = txt.getBoundingClientRect()
        const derecha = lineas.length ? Math.max(...lineas.map((r) => r.right)) : caja.right
        const celda = td.getBoundingClientRect()
        // El tope deja al botón dentro del relleno de la celda (8), que es
        // donde lo dejaría el respaldo del CSS.
        const tope = celda.width - 8 - btn.offsetWidth
        const izquierda = Math.min(Math.max(0, derecha - celda.left + 4), tope)
        btn.style.right = 'auto'
        btn.style.left = `${Math.round(izquierda)}px`
      })
    }
    colocarMas()
    window.addEventListener('resize', colocarMas)
    const ro = new ResizeObserver(colocarMas)
    ro.observe(scroll)
    return () => {
      window.removeEventListener('resize', colocarMas)
      ro.disconnect()
    }
  }, [filas, dias])

  // #162: "sin frentes" se decide por la EXISTENCIA de frentes, no por si hay
  // filas que renderizar. Un frente recién creado sin sub frentes ni tareas no
  // produce filas, pero el proyecto ya no está "sin frentes": debe mostrar su
  // estructura (fila de frente vacío), no el mensaje de bienvenida.
  const sinFrentes = frentesFuente.length === 0
  if (filas.length === 0) {
    return (
      <div className="gantt-wrap">
        {/* #190: en Mis Tareas no se ofrece crear frentes — el vacío es
            "no tienes tareas", no "el proyecto no tiene estructura". */}
        {misTareas ? (
          hayFiltroTareas ? (
            'Ninguna tarea coincide con el filtro activo.'
          ) : (
            'Sin tareas a tu cargo.'
          )
        ) : sinFrentes && proyectoId ? (
          <EmptyFrentes proyectoId={proyectoId} puedeCrear={can.crearFrentes} actions={actions} />
        ) : (
          'Ninguna tarea coincide con el filtro activo.'
        )}
      </div>
    )
  }

  const finOffsetSemana = soloHabiles ? 4 : 6
  const hayCarga = carga.personas.length > 0 || carga.sinAsignar !== null || (!!misTareas && !!carga.total)

  return (
    // #321: la raíz participa del flujo vertical de `.content--gantt` — sin la
    // clase, este envoltorio cortaría la cadena de flex y la grilla no podría
    // ocupar lo que sobra.
    <div className="gantt-raiz">
      {/* #305: sobre la grilla ya no hay franjas propias de la Gantt. La
          leyenda la absorbieron los contadores del encabezado, y el horizonte
          —con su aviso de fin de semana— es el control "Rango" de la barra.
          La altura sobre la grilla no cambia nunca: ni al filtrar, ni al
          ordenar, ni según el proyecto. */}
      <div className="gantt-wrap">
        {/* #293: el dragover que llega hasta acá (thead, filas de carga,
            fondo) no es destino — se apaga el indicador. */}
        <div className="gantt-scroll" ref={scrollRef} onDragOver={dnd ? dnd.fuera : undefined}>
          {/* 2.1: sin menu contextual del navegador sobre la grilla (el clic
              derecho es el gesto de marcar lista). */}
          {/* #190: `gantt--conproy` activa la columna de proyecto y desplaza
              los anclajes de las columnas congeladas (variable CSS). */}
          <table
            className={`gantt${misTareas ? ' gantt--conproy' : ''}${dnd ? ' gantt--dnd' : ''}`}
            onContextMenu={(e) => e.preventDefault()}
          >
            <thead>
              <tr className="semana">
                {misTareas && <th className="fija fija--proy" rowSpan={2} aria-label="Proyecto" />}
                <th className="fija fija--frente" rowSpan={2}>Frente</th>
                <th className="fija fija--sf" rowSpan={2}>Sub Frente</th>
                <th className="fija fija--tarea" rowSpan={2}>Tarea</th>
                <th className="fija fija--resp" rowSpan={2}>Resp.</th>
                {semanas.map((s) => (
                  <th key={s.lunes} className="semana-lbl lunes" colSpan={s.dias.length}>
                    {etiquetaSemana(s.lunes, finOffsetSemana)}
                  </th>
                ))}
              </tr>
              <tr>
                {dias.map((d) => {
                  const { inicial, numero } = etiquetaDia(d)
                  const esHoy = d === hoy
                  return (
                    <th
                      key={d}
                      className={`dia${esLunes(d) ? ' lunes' : ''}${esHoy ? ' hoy-head' : ''}${esFinDeSemana(d) ? ' finde' : ''}`}
                    >
                      {inicial}
                      <small>{numero}</small>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                // #293: contexto de arrastre de ESTA fila. La hermana visible
                // siguiente afina "soltar después"; la última del bloque porta
                // el indicador de "al final".
                const sig =
                  fila.tipo === 'tarea' &&
                  filas[i + 1]?.tipo === 'tarea' &&
                  (filas[i + 1] as Extract<FilaGantt, { tipo: 'tarea' }>).sub.id === fila.sub.id
                    ? (filas[i + 1] as Extract<FilaGantt, { tipo: 'tarea' }>).tarea.id
                    : null
                const destinoAca =
                  fila.tipo === 'tarea' && dnd?.destino?.subFrenteId === fila.sub.id
                    ? dnd.destino
                    : null
                return (
                <FilaGanttRow
                  dnd={dnd}
                  dndSiguienteId={sig}
                  dndDropAntes={fila.tipo === 'tarea' && destinoAca?.antesDeId === fila.tarea.id}
                  dndDropDespues={fila.tipo === 'tarea' && !!destinoAca && destinoAca.antesDeId === null && sig === null}
                  key={
                    fila.tipo === 'tarea'
                      ? fila.tarea.id
                      : fila.tipo === 'vacio-sub'
                        ? `vs-${fila.sub.id}`
                        : fila.tipo === 'vacio-frente'
                          ? `vf-${fila.frente.id}`
                          : `in-${fila.tipo}-${i}`
                  }
                  fila={fila}
                  dias={dias}
                  state={state}
                  hoy={hoy}
                  candidatos={candidatos}
                  // #190: en Mis Tareas los permisos son los del proyecto de
                  // ESA tarea (dueño vs invitado), no los de un proyecto activo.
                  can={
                    misTareas && fila.tipo !== 'input-frente'
                      ? misTareas.canDe(fila.frente.proyectoId)
                      : can
                  }
                  proyecto={
                    misTareas && fila.tipo !== 'input-frente'
                      ? proyectosMT.get(fila.frente.proyectoId)
                      : undefined
                  }
                  conProyecto={!!misTareas}
                  permiteCrear={permiteCrear}
                  actions={actions}
                  onAbrirTarea={onAbrirTarea}
                  abrirCrear={abrirCrear}
                  crearEn={crearEn}
                  onCrear={crearElemento}
                  onCerrarCrear={() => setCrearEn(null)}
                  mostrarAviso={mostrarAviso}
                />
                )
              })}

              {/* §6.5 — Carga por persona + "Sin asignar" (puntos 3 y 4) */}
              {hayCarga && (
                <tr className="carga-sep">
                  {misTareas && <td className="fija fija--proy carga-vacia" />}
                  <td className="fija fija--frente carga-sep__label">
                    {misTareas ? 'Mi carga' : 'Carga por persona'}
                  </td>
                  <td className="fija fija--sf carga-vacia" />
                  <td className="fija fija--tarea carga-vacia" />
                  <td className="fija fija--resp carga-vacia" />
                  {dias.map((d) => (
                    <td key={d} className={`celda${esLunes(d) ? ' lunes' : ''}${d === hoy ? ' col-hoy' : ''}`} />
                  ))}
                </tr>
              )}
              {carga.personas.map(({ usuario, porDia }) => (
                <FilaCarga key={`carga-${usuario.id}`} nombre={usuario.nombre} avatar={<Avatar usuario={usuario} />} porDia={porDia} dias={dias} hoy={hoy} />
              ))}
              {carga.sinAsignar && (
                <FilaCarga
                  nombre="Sin asignar"
                  avatar={<span className="avatar avatar--sin" title="Tareas sin responsable">?</span>}
                  porDia={carga.sinAsignar}
                  dias={dias}
                  hoy={hoy}
                  atenuada
                />
              )}
              {/* Punto 4: total de tareas por dia (personas + sin asignar).
                  #190: en Mis Tareas es la ÚNICA fila de carga. */}
              {carga.total && (
                <FilaCarga
                  nombre="Total"
                  avatar={<span className="avatar avatar--total" title="Total de tareas por día">Σ</span>}
                  porDia={carga.total}
                  dias={dias}
                  hoy={hoy}
                  esTotal
                  conProyecto={!!misTareas}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* #327: un solo globo para los cuatro de la grilla, dibujado en una capa
          aparte por encima de la página. Colgando de su celda quedaban dentro
          del recuadro con scroll, y ese recuadro los recortaba. */}
      <GloboTip raiz={scrollRef} />

      {aviso &&
        createPortal(
          <div className="mini-aviso" role="alert" style={{ left: aviso.x, top: aviso.y }}>
            {aviso.texto}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Fila de carga: nombre congelado + conteo por dia (persona, "Sin asignar" o "Total"). */
function FilaCarga({
  nombre,
  avatar,
  porDia,
  dias,
  hoy,
  atenuada,
  esTotal,
  conProyecto,
}: {
  nombre: string
  avatar: React.ReactNode
  porDia: Map<ISODate, number>
  dias: ISODate[]
  hoy: string
  atenuada?: boolean
  esTotal?: boolean
  /** #190: hay columna de proyecto a la izquierda (Gantt de Mis Tareas). */
  conProyecto?: boolean
}) {
  return (
    <tr className={`carga-fila${atenuada ? ' carga-fila--sin' : ''}${esTotal ? ' carga-fila--total' : ''}`}>
      {conProyecto && <td className="fija fija--proy carga-vacia" />}
      <td className="fija fija--frente carga-vacia" />
      <td className="fija fija--sf carga-vacia" />
      <td className="fija fija--tarea carga-fila__nombre">{nombre}</td>
      <td className="fija fija--resp">{avatar}</td>
      {dias.map((d) => {
        const n = porDia.get(d)
        return (
          <td
            key={d}
            className={`celda carga-celda${esLunes(d) ? ' lunes' : ''}${d === hoy ? ' col-hoy' : ''}${esFinDeSemana(d) ? ' finde' : ''}`}
          >
            {n ?? ''}
          </td>
        )
      })}
    </tr>
  )
}

/** Input inline para crear frente/sub/tarea EN la grilla (patron de la tabla). */
function CrearInput({
  placeholder,
  onCrear,
  onCerrar,
}: {
  placeholder: string
  onCrear: (nombre: string) => void
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState('')

  function confirmar() {
    const limpio = nombre.trim()
    if (limpio) onCrear(limpio)
    onCerrar()
  }

  return (
    <input
      className="inline-input crear-inline"
      autoFocus
      placeholder={placeholder}
      value={nombre}
      onChange={(e) => setNombre(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirmar()
        if (e.key === 'Escape') onCerrar()
      }}
      onBlur={confirmar}
    />
  )
}

function FilaGanttRow({
  dnd,
  dndSiguienteId,
  dndDropAntes,
  dndDropDespues,
  fila,
  dias,
  state,
  hoy,
  candidatos,
  can,
  proyecto,
  conProyecto,
  permiteCrear,
  actions,
  onAbrirTarea,
  abrirCrear,
  crearEn,
  onCrear,
  onCerrarCrear,
  mostrarAviso,
}: {
  /** #293: arrastre activo en la vista (undefined = sin asa ni destinos). */
  dnd?: DndTareas
  /** Hermana visible siguiente dentro del sub frente (soltar "después"). */
  dndSiguienteId?: string | null
  /** La tarea en vuelo caería ANTES / DESPUÉS de esta fila (indicador). */
  dndDropAntes?: boolean
  dndDropDespues?: boolean
  fila: FilaGantt
  dias: ISODate[]
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  /** #190: proyecto de la fila (solo en Mis Tareas). */
  proyecto?: Proyecto
  /** #190: ¿se dibuja la columna de proyecto a la izquierda? */
  conProyecto?: boolean
  /** #190: en Mis Tareas no hay ninguna afordancia de creación. */
  permiteCrear: boolean
  actions: Actions
  onAbrirTarea: (id: string) => void
  abrirCrear: (e: React.MouseEvent, crear: CrearEn) => void
  crearEn: CrearEn | null
  onCrear: (nombre: string) => void
  onCerrarCrear: () => void
  mostrarAviso: (e: React.MouseEvent, texto: string) => void
}) {
  // -- Celdas fijas de frente / sub frente (con "+" para crear hermanos) --

  // El nombre va en un envoltorio absoluto (.fija-nombre): un efecto lo
  // reposiciona para que quede centrado en la porcion VISIBLE del bloque
  // (punto 3), acompañando el scroll cuando el frente/sub es mas alto que
  // la pantalla y quedando centrado cuando cabe entero.
  // #190: columna de proyecto — muy angosta, nombre ROTADO leyéndose hacia
  // arriba y fondo del color del proyecto. Comparte el rowSpan del frente
  // (se repite en cada frente). Si el nombre no cabe en el alto del bloque,
  // se trunca con "…" y el nombre completo queda en el tooltip.
  const celdaProyecto = (span: number) => (
    <td
      // #321: `fija--rotula` lo suma al mecanismo que ya usan frente y sub
      // frente — el efecto centra el rótulo en la porción VISIBLE del bloque y
      // lo acompaña al desplazar. Antes se centraba sobre el bloque COMPLETO,
      // así que en un proyecto más alto que la pantalla el nombre quedaba
      // fuera de vista y la franja se leía como color sin explicación.
      className="fija fija--proy fija--rotula"
      rowSpan={span}
      style={{ background: proyecto?.color ?? '#607d8b' }}
      // #192: `data-tip` (globo propio, inmediato) en vez del `title` nativo,
      // cuyo retardo lo fija el navegador y no se puede ajustar. El nombre
      // completo sigue en el DOM, así que los lectores de pantalla lo leen
      // aunque el rótulo se trunque visualmente.
      // #327: el globo lo dibuja `GloboTip` en una capa aparte, fuera del
      // recuadro con scroll que lo recortaba. `data-tip-lado` declara acá,
      // junto al elemento, hacia dónde se abre: a la derecha, porque la
      // columna es angosta y está pegada al borde izquierdo.
      data-tip={proyecto?.nombre}
      data-tip-lado="derecha"
    >
      <span className="proy-rotulo">
        <span className="proy-rotulo__txt">{proyecto?.nombre ?? '—'}</span>
      </span>
    </td>
  )

  const celdaFrente = (frente: Frente, span: number) => (
    <td className="fija fija--frente fija--rotula" rowSpan={span}>
      <span className="fija-nombre">
        <span className="con-mas">
          {/* #321: el nombre se corta con "…" en vez de partirse a mitad de
              palabra; completo, en el globo.
              #305d: el globo es el `data-tip` del producto —inmediato— y no el
              `title` del navegador, que solo aparecía con el texto recortado y
              con cerca de un segundo de retardo que fija el navegador. */}
          {/* #327: hacia la derecha, como el rótulo del proyecto — estas
              columnas están pegadas al borde izquierdo de la grilla. */}
          <span className="fija-tip" data-tip={frente.nombre} data-tip-lado="derecha">
            <span className="fija-txt">{frente.nombre}</span>
          </span>
          {permiteCrear && can.crearFrentes && (
            <button
              className="mas-btn"
              data-tip="Agregar frente debajo"
              aria-label="Agregar frente debajo"
              onClick={(e) =>
                abrirCrear(e, { tipo: 'frente', despuesDe: { id: frente.id, orden: frente.orden }, contenedorId: frente.proyectoId })
              }
            >
              +
            </button>
          )}
        </span>
      </span>
    </td>
  )

  const celdaSub = (frente: Frente, sub: SubFrente, span: number) => (
    <td className="fija fija--sf fija--rotula" rowSpan={span}>
      <span className="fija-nombre">
        <span className="con-mas">
          <span className="fija-tip" data-tip={sub.nombre} data-tip-lado="derecha">
            <span className="fija-txt">{sub.nombre}</span>
          </span>
          {permiteCrear && can.crearSubFrentes && (
            <button
              className="mas-btn"
              data-tip="Agregar sub frente debajo"
              aria-label="Agregar sub frente debajo"
              onClick={(e) =>
                abrirCrear(e, { tipo: 'sub', despuesDe: { id: sub.id, orden: sub.orden }, contenedorId: frente.id })
              }
            >
              +
            </button>
          )}
        </span>
      </span>
    </td>
  )

  const celdasVacias = () =>
    dias.map((d) => (
      <td
        key={d}
        className={`celda${esLunes(d) ? ' lunes' : ''}${d === hoy ? ' col-hoy' : ''}${esFinDeSemana(d) ? ' finde' : ''}`}
      />
    ))

  // -- Filas de creacion inline (§6.4.25) --

  if (fila.tipo === 'input-frente') {
    return (
      <tr className={fila.esPrimeraGlobal ? '' : 'sep-sf'}>
        <td className="fija fija--frente fija--input">
          <CrearInput placeholder="Nuevo frente… (Enter crea)" onCrear={onCrear} onCerrar={onCerrarCrear} />
        </td>
        <td className="fija fija--sf" />
        <td className="fija fija--tarea" />
        <td className="fija fija--resp" />
        {celdasVacias()}
      </tr>
    )
  }

  if (fila.tipo === 'input-sub') {
    return (
      <tr className="sep-sf">
        {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
        <td className="fija fija--sf fija--input">
          <CrearInput placeholder="Nuevo sub frente… (Enter crea)" onCrear={onCrear} onCerrar={onCerrarCrear} />
        </td>
        <td className="fija fija--tarea" />
        <td className="fija fija--resp" />
        {celdasVacias()}
      </tr>
    )
  }

  if (fila.tipo === 'input-tarea') {
    return (
      <tr>
        {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
        {fila.esInicioSub && celdaSub(fila.frente, fila.sub, fila.spanSub)}
        <td className="fija fija--tarea fija--input">
          <CrearInput placeholder="Nueva tarea… (Enter crea)" onCrear={onCrear} onCerrar={onCerrarCrear} />
        </td>
        <td className="fija fija--resp" />
        {celdasVacias()}
      </tr>
    )
  }

  // -- Contenedores vacios (§6.4.26): "+ agregar" se convierte en input --

  if (fila.tipo === 'vacio-frente') {
    const creandoAca = crearEn?.tipo === 'sub' && crearEn.contenedorId === fila.frente.id && !crearEn.despuesDe
    return (
      <tr className={fila.esPrimeraGlobal ? '' : 'sep-sf'}>
        {celdaFrente(fila.frente, 1)}
        <td className={`fija fija--sf gantt-vacio${creandoAca ? ' fija--input' : ''}`} colSpan={1}>
          {creandoAca ? (
            <CrearInput placeholder="Nuevo sub frente… (Enter crea)" onCrear={onCrear} onCerrar={onCerrarCrear} />
          ) : permiteCrear && can.crearSubFrentes ? (
            <button
              className="btn btn--ghost btn--sm"
              onClick={(e) => abrirCrear(e, { tipo: 'sub', contenedorId: fila.frente.id })}
            >
              + agregar sub frente
            </button>
          ) : (
            <span className="mudo">Sin sub frentes</span>
          )}
        </td>
        <td className="fija fija--tarea" />
        <td className="fija fija--resp" />
        {celdasVacias()}
      </tr>
    )
  }

  if (fila.tipo === 'vacio-sub') {
    const creandoAca = crearEn?.tipo === 'tarea' && crearEn.contenedorId === fila.sub.id && !crearEn.despuesDe
    // #293: un sub frente sin tareas también recibe (criterio 8).
    const subVacio = fila.sub
    return (
      <tr
        className={`${fila.esPrimeraGlobal ? '' : 'sep-sf'}${dnd?.destino?.subFrenteId === subVacio.id ? ' gfila--drop-vacio' : ''}`.trim()}
        onDragOver={dnd ? (e) => dnd.sobre(e, subVacio.id, null) : undefined}
        onDrop={dnd ? dnd.soltar : undefined}
      >
        {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
        {celdaSub(fila.frente, fila.sub, 1)}
        <td className={`fija fija--tarea gantt-vacio${creandoAca ? ' fija--input' : ''}`}>
          {creandoAca ? (
            <CrearInput placeholder="Nueva tarea… (Enter crea)" onCrear={onCrear} onCerrar={onCerrarCrear} />
          ) : permiteCrear && can.crearTareas ? (
            <button
              className="btn btn--ghost btn--sm"
              onClick={(e) => abrirCrear(e, { tipo: 'tarea', contenedorId: fila.sub.id })}
            >
              + agregar tarea
            </button>
          ) : (
            <span className="mudo">Sin tareas</span>
          )}
        </td>
        <td className="fija fija--resp" />
        {celdasVacias()}
      </tr>
    )
  }

  // -- Fila de tarea --

  const { tarea } = fila
  const color = colorTarea(state, tarea, hoy)
  // #229: igual que en la tabla — el responsable que ya no es candidato se
  // muestra apagado, no vacío.
  const resp = responsableDeTarea(state, tarea.responsableId, candidatos)

  const marcas = new Map<ISODate, TipoMarca>()
  for (const mk of marcasDe(state, tarea, hoy)) marcas.set(mk.fecha, mk.tipo)

  const sep = fila.esInicioSub && !fila.esPrimeraGlobal ? ' sep-sf' : ''
  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

  // -- Estandar de planificacion por clics (punto 2) --
  // #245: la misma regla que las otras tres vistas, ahora compartida.
  const puedeEditar = puedeEditarFecha(can, tarea)
  const sinFecha = !tarea.fechaObjetivo
  const vencidaOHoy = !!tarea.fechaObjetivo && tarea.fechaObjetivo <= hoy

  // 2.1/2.3: la celda es clickeable para planificar (tarea sin fecha) o
  // replanificar (tarea de hoy/vencida), en CUALQUIER dia — tambien
  // pasados, para registrar tareas que ya ocurrieron con su fecha real
  // (si la nueva fecha ya vencio y no se marca hecha, queda atrasada).
  const celdaPlanificable = (d: ISODate) =>
    puedeEditar && !marcas.has(d) && (sinFecha || vencidaOHoy)

  // Tooltip contextual de la celda (punto 2): indica solo lo que aplica
  // AHI, segun el estado de la celda y los permisos del usuario.
  const tipCelda = (d: ISODate, tipo: TipoMarca | undefined): string | undefined => {
    if (tipo === 'hecha') {
      return can.marcarHechas(tarea) ? 'Clic derecho: no lista' : undefined
    }
    const esPrincipal = tipo === 'pendiente' || tipo === 'incumplida' || tipo === 'incumplida_replan'
    if (esPrincipal) {
      if (!puedeEditar && !can.marcarHechas(tarea)) return undefined
      return vencidaOHoy
        ? 'Clic derecho: lista · Para replanificar, haz clic en otro día'
        : 'Clic: quitar · Clic derecho: lista'
    }
    if (tipo === 'anterior') return undefined
    return celdaPlanificable(d) ? 'Clic para planificar' : undefined
  }

  function clickCelda(e: React.MouseEvent, d: ISODate) {
    if (celdaPlanificable(d)) {
      actions.cambiarFechaObjetivo(tarea.id, d)
    } else if (puedeEditar && vencidaOHoy && d === tarea.fechaObjetivo) {
      // 2.2: la celda de la marca vencida tampoco se puede "vaciar".
      mostrarAviso(e, 'No puedes eliminar tareas que ya pasaron')
    }
  }

  function clickMarca(e: React.MouseEvent, tipo: TipoMarca) {
    e.stopPropagation()
    const esPrincipal = tipo === 'pendiente' || tipo === 'incumplida' || tipo === 'incumplida_replan'
    if (!esPrincipal || !puedeEditar) {
      // Marcas de hecha, rastros o sin permiso: abre el detalle.
      onAbrirTarea(tarea.id)
      return
    }
    if (vencidaOHoy) {
      // 2.2: de hoy o vencida no se borra; se marca lista o se replanifica.
      mostrarAviso(e, 'No puedes eliminar tareas que ya pasaron')
    } else {
      // 2.1: clic sobre marca futura la borra. Si la marca venia de una
      // replanificacion, el repo la DESHACE (vuelve a la fecha anterior y
      // elimina el registro); si no, la tarea queda "sin planificar".
      actions.cambiarFechaObjetivo(tarea.id, null)
    }
  }

  function clickDerechoMarca(e: React.MouseEvent, tipo: TipoMarca) {
    e.preventDefault()
    e.stopPropagation()
    const alternable = tipo === 'pendiente' || tipo === 'incumplida' || tipo === 'incumplida_replan' || tipo === 'hecha'
    if (alternable && can.marcarHechas(tarea)) {
      actions.toggleHecha(tarea.id, !tarea.hecha)
    }
  }

  // #293: la fila entera (columnas fijas y grilla) es destino del arrastre.
  const clasesDnd = dnd
    ? `${dnd.activo?.id === tarea.id ? ' gfila--en-vuelo' : ''}${dndDropAntes ? ' gfila--drop-antes' : ''}${dndDropDespues ? ' gfila--drop-despues' : ''}`
    : ''

  return (
    <tr
      className={`${sep.trim()}${clasesDnd}`.trim() || undefined}
      onDragOver={
        dnd
          ? (e) => dnd.sobre(e, tarea.subFrenteId, enMitadSuperior(e) ? tarea.id : dndSiguienteId ?? null)
          : undefined
      }
      onDrop={dnd ? dnd.soltar : undefined}
    >
      {/* #190: la columna de proyecto solo existe en Mis Tareas, donde las
          únicas filas posibles son de tarea (no hay vacíos ni inputs). */}
      {conProyecto && fila.esInicioFrente && celdaProyecto(fila.spanFrente)}
      {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
      {fila.esInicioSub && celdaSub(fila.frente, fila.sub, fila.spanSub)}

      <td className={`fija fija--tarea tarea-cell--${color}`}>
        {/* #293: el asa vive DENTRO de la celda del nombre, pegada a su borde
            izquierdo — mismo lugar y mismo aspecto que en la tabla. */}
        {dnd && (
          <button
            type="button"
            className="drag-asa"
            aria-label={`Mover: ${tarea.titulo}`}
            draggable
            onDragStart={(e) => dnd.iniciar(e, tarea)}
            onDragEnd={dnd.terminar}
          >
            ⋮⋮
          </button>
        )}
        <span className="con-mas">
          {/* #321: mismo corte con "…" que en frente y sub frente. Acá el
              nombre completo ya lo muestra la tarjeta al pasar el mouse —que
              lo lleva de título y aparece de inmediato, sin retardo—: agregarle
              un `data-tip` encima mostraría dos globos a la vez. */}
          <span className="fija-tip"><span className="fija-txt">
          {can.editarTareas(tarea) ? (
            <InlineText
              valor={tarea.titulo}
              onGuardar={(titulo) => actions.updateTarea(tarea.id, { titulo })}
              ariaLabel={`Editar título: ${tarea.titulo}`}
              wrapDisplay={(nodo) => <HoverCard card={tooltip}>{nodo}</HoverCard>}
            />
          ) : (
            <HoverCard card={tooltip}>
              <span
                className="tarea-cell__link"
                role="button"
                tabIndex={0}
                onClick={() => onAbrirTarea(tarea.id)}
                onKeyDown={(e) => e.key === 'Enter' && onAbrirTarea(tarea.id)}
              >
                {tarea.titulo}
              </span>
            </HoverCard>
          )}
          </span></span>
          <span className="con-mas__acciones">
            <button
              className="mas-btn"
              data-tip="Información"
              aria-label="Información"
              onClick={() => onAbrirTarea(tarea.id)}
            >
              ⓘ
            </button>
            {permiteCrear && can.crearTareas && (
              <button
                className="mas-btn"
                data-tip="Agregar tarea debajo"
                aria-label="Agregar tarea debajo"
                onClick={(e) =>
                  abrirCrear(e, { tipo: 'tarea', despuesDe: { id: tarea.id, orden: tarea.orden }, contenedorId: tarea.subFrenteId })
                }
              >
                +
              </button>
            )}
          </span>
        </span>
      </td>
      <td className="fija fija--resp">
        {/* Sin candidatos (Mis Tareas) la columna es de solo lectura. */}
        {candidatos.length > 0 && can.asignarResponsable(tarea) ? (
          <RespPicker
            usuarios={candidatos}
            value={tarea.responsableId}
            onChange={(id) => actions.updateTarea(tarea.id, { responsableId: id })}
            ariaLabel={`Responsable: ${tarea.titulo}`}
            apagado={resp.apagado}
            responsable={resp.usuario}
            motivo={resp.motivo}
          />
        ) : (
          resp.estado !== 'sin-asignar' && (
            <Avatar usuario={resp.usuario} apagado={resp.apagado} motivo={resp.motivo} />
          )
        )}
      </td>

      {dias.map((d) => {
        const tipo = marcas.get(d)
        const esHoy = d === hoy
        return (
          <td
            key={d}
            className={`celda${esLunes(d) ? ' lunes' : ''}${esHoy ? ' col-hoy' : ''}${esFinDeSemana(d) ? ' finde' : ''}${celdaPlanificable(d) ? ' celda--planificable' : ''}`}
            data-tip={tipCelda(d, tipo)}
            /* #327: el único de los cuatro globos con retardo, para que no
               aparezca al cruzar el mouse por la grilla. Antes lo ponía la
               animación del CSS; ahora que el globo vive fuera de la celda, lo
               declara la celda y lo cumple `GloboTip`. */
            data-tip-espera="180"
            onClick={puedeEditar ? (e) => clickCelda(e, d) : undefined}
          >
            {tipo && (
              <HoverCard card={tooltip}>
                <span
                  className={`marca-wrap${puedeEditar || can.marcarHechas(tarea) ? ' marca-wrap--click' : ''}`}
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => clickMarca(e, tipo)}
                  onContextMenu={(e) => clickDerechoMarca(e, tipo)}
                >
                  <Marca tipo={tipo} />
                </span>
              </HoverCard>
            )}
          </td>
        )
      })}
    </tr>
  )
}
