import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppState, Frente, ISODate, SubFrente, Tarea, TipoMarca, Usuario } from '../types'
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
import { fechaFiltraGantt, filtraTareas, pasaFechaGantt, pasaFiltroTareas, rangoDeFecha, type Filtro } from '../lib/filtros'
import { useVistaCongelada } from '../lib/vistaCongelada'
import { ordenarMulti, valorOrden, type CampoOrden, type OrdenMulti } from '../lib/orden'
import type { Can } from '../lib/permisos'
import { EmptyFrentes } from './EmptyFrentes'
import { Marca } from './Marca'
import { Avatar, RespPicker } from './RespPicker'
import { Legend } from './Legend'
import { HoverCard } from './HoverCard'
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
 * Modos del horizonte. Siempre arranca en 'hoy'; no se persiste. El antiguo
 * "Rango personalizado" se elimino: un rango especifico se pide con el
 * filtro de fechas (rango fijo), que ya se traduce al horizonte.
 */
type ModoHorizonte = 'hoy' | 'todo'

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  can: Can
  /** Filtro activo (punto 3): responsable/estado filtran tareas; la parte
   *  de fecha NO filtra — se traduce al horizonte visible. */
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
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
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

export function GanttView({ state, proyectoId, frenteSel, hoy, can, filtro, orden, onCambiarFiltro, snapshotNonce, onStale, actions, onAbrirTarea }: Props) {
  // Horizonte: por defecto "Alrededor de hoy"; no se persiste.
  const [modo, setModo] = useState<ModoHorizonte>('hoy')
  // §6.3.19: solo dias habiles (default) o semana completa de 7 dias.
  const [soloHabiles, setSoloHabiles] = useState(true)
  const [crearEn, setCrearEn] = useState<CrearEn | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const avisoTimer = useRef<number | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement>(null)

  function mostrarAviso(e: React.MouseEvent, texto: string) {
    setAviso({ x: Math.min(e.clientX, window.innerWidth - 280), y: e.clientY + 14, texto })
    window.clearTimeout(avisoTimer.current)
    avisoTimer.current = window.setTimeout(() => setAviso(null), 2400)
  }

  // Candidatos a responsable: admins, el dueño y quienes tienen acceso.
  const candidatos = state.usuarios.filter(
    (u) =>
      u.activo &&
      (u.rol === 'admin' ||
        state.proyectos.some((p) => p.id === proyectoId && p.duenoId === u.id) ||
        state.accesos.some((a) => a.usuarioId === u.id && a.proyectoId === proyectoId)),
  )

  // Responsable/estado filtran las tareas mostradas en la grilla (la fecha
  // del filtro no: define el horizonte). EXCEPCION: "Sin fecha" — una tarea
  // sin fecha no esta en ningun dia, asi que no puede traducirse a un
  // horizonte; en su lugar FILTRA: quedan solo las tareas sin fecha (filas
  // sin marcas, planificables con un clic) y el horizonte no cambia. Con
  // filtro de tareas activo, los contenedores sin coincidencias se omiten.
  const hayFiltroTareas = filtraTareas(filtro) || fechaFiltraGantt(filtro)
  const pasaEnGantt = (t: Tarea) =>
    pasaFiltroTareas(state, t, filtro, hoy) && pasaFechaGantt(filtro, t, hoy)

  // P1: vista congelada. Se congela con filtro y/u orden activo. `frescoIds`
  // recorre frentes→subs→tareas aplicando el filtro/orden actual; la foto se
  // compara contra esto para saber si quedó desactualizada por una edición.
  const activo = hayFiltroTareas || orden.length > 0
  const { frescoIds, existentesIds } = useMemo(() => {
    const fresco: string[] = []
    const existentes: string[] = []
    const frentesOrd = state.frentes
      .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
      .sort((a, b) => a.orden - b.orden)
    for (const f of frentesOrd) {
      const subs = state.subFrentes.filter((sf) => sf.frenteId === f.id).sort((a, b) => a.orden - b.orden)
      for (const sf of subs) {
        const todas = state.tareas
          .filter((t) => t.subFrenteId === sf.id && !t.archivada)
          .sort((a, b) => a.orden - b.orden)
        for (const t of todas) existentes.push(t.id)
        const visibles = todas.filter(
          (t) => !hayFiltroTareas || (pasaFiltroTareas(state, t, filtro, hoy) && pasaFechaGantt(filtro, t, hoy)),
        )
        const ord = ordenarMulti(visibles, orden, (t, campo) =>
          valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
        )
        for (const t of ord) fresco.push(t.id)
      }
    }
    return { frescoIds: fresco, existentesIds: existentes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, proyectoId, frenteSel, hayFiltroTareas, filtro, orden, hoy])

  const firma = JSON.stringify([proyectoId, frenteSel, filtro, orden, snapshotNonce])
  const { congelada, visibleIds, indice, stale } = useVistaCongelada(frescoIds, existentesIds, activo, firma)
  useEffect(() => onStale(stale), [stale, onStale])

  // -- Filas (incluye contenedores vacios §6.4.26 e inputs inline §6.4.25) --
  const filas = useMemo<FilaGantt[]>(() => {
    const out: FilaGantt[] = []
    const frentes = state.frentes
      .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
      .sort((a, b) => a.orden - b.orden)

    let primera = true
    for (const f of frentes) {
      const subs = state.subFrentes
        .filter((sf) => sf.frenteId === f.id)
        .sort((a, b) => a.orden - b.orden)

      const filasFrente: FilaGantt[] = []
      if (subs.length === 0) {
        if (!hayFiltroTareas) filasFrente.push({ tipo: 'vacio-frente', frente: f, esPrimeraGlobal: false })
      } else {
        for (const sf of subs) {
          const todasSub = state.tareas
            .filter((t) => t.subFrenteId === sf.id && !t.archivada)
            .sort((a, b) => a.orden - b.orden)
          // Punto 4: el orden reordena DENTRO del bloque de sub frente (no mezcla
          // entre bloques). P1: con la vista congelada se muestran EXACTAMENTE las
          // tareas de la foto (membresía + orden), sin sacar ni reordenar por
          // ediciones; sin congelar, se filtra y ordena en vivo.
          const tareas = congelada
            ? todasSub
                .filter((t) => visibleIds.has(t.id))
                .sort((a, b) => (indice.get(a.id) ?? 0) - (indice.get(b.id) ?? 0))
            : ordenarMulti(
                todasSub.filter((t) => !hayFiltroTareas || pasaEnGantt(t)),
                orden,
                (t, campo) => valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
              )
          const filasSub: FilaGantt[] = []
          if (tareas.length === 0) {
            if (hayFiltroTareas) continue
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
      primera = false
      // Input de frente nuevo justo debajo del frente hermano.
      if (crearEn?.tipo === 'frente' && crearEn.despuesDe?.id === f.id) {
        out.push({ tipo: 'input-frente', esPrimeraGlobal: false })
      }
    }
    if (crearEn?.tipo === 'frente' && !crearEn.despuesDe) {
      out.push({ tipo: 'input-frente', esPrimeraGlobal: out.length === 0 })
    }
    return out
  }, [state, proyectoId, frenteSel, crearEn, filtro, orden, hoy, hayFiltroTareas, congelada, visibleIds, indice])

  const filasTarea = useMemo(
    () => filas.filter((f): f is Extract<FilaGantt, { tipo: 'tarea' }> => f.tipo === 'tarea'),
    [filas],
  )

  // -- Rango de dias segun el modo de horizonte + toggle habiles/completa --
  // Punto 3.5: si el filtro trae fecha, ESA define el horizonte (la ventana
  // temporal visible); las relativas se recalculan contra hoy.
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
    return {
      personas,
      sinAsignar: porClave.get(SIN_ASIGNAR) ?? null,
      total: total.size > 0 ? total : null,
    }
  }, [filasTarea, dias, state.usuarios])

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

  if (filas.length === 0) {
    return (
      <div className="gantt-wrap">
        {hayFiltroTareas ? (
          'Ninguna tarea coincide con el filtro activo.'
        ) : (
          <EmptyFrentes proyectoId={proyectoId} puedeCrear={can.crearFrentes} actions={actions} />
        )}
      </div>
    )
  }

  const finOffsetSemana = soloHabiles ? 4 : 6
  const hayCarga = carga.personas.length > 0 || carga.sinAsignar !== null

  return (
    <div>
      <div className="gantt-toolbar">
        <Legend />
        {/* La leyenda de instrucciones se elimino (punto 1): cada celda
            explica SOLO lo que aplica ahi via tooltip contextual (punto 2).
            El aviso de tareas de fin de semana ocultas se mantiene. */}
        <div className="horizonte">
          {ocultasFinde > 0 && (
            <span className="aviso-finde">
              {ocultasFinde} tarea{ocultasFinde === 1 ? '' : 's'} con fecha de fin de semana no se{' '}
              {ocultasFinde === 1 ? 'muestra' : 'muestran'} ·{' '}
              <button className="link-btn" onClick={() => setSoloHabiles(false)}>Ver semana completa</button>
            </span>
          )}
          <div className="toggle">
            <button className={soloHabiles ? 'activo' : ''} onClick={() => setSoloHabiles(true)} title="Lunes a viernes">
              Dias habiles
            </button>
            <button className={!soloHabiles ? 'activo' : ''} onClick={() => setSoloHabiles(false)} title="7 dias">
              Semana completa
            </button>
          </div>
          {/* "En horizonte visible" NO fija el horizonte: deja el toggle de modo
              disponible (su rango se deriva del horizonte elegido). */}
          {filtro.fecha && filtro.fecha.tipo !== 'horizonte' ? (
            <span className="horizonte-filtro" title="Quita el filtro de fecha para volver a elegir el horizonte">
              Horizonte definido por el filtro de fecha
            </span>
          ) : (
            <div className="toggle">
              <button className={modo === 'hoy' ? 'activo' : ''} onClick={() => setModo('hoy')} title="2 semanas atras + semana actual + 2 adelante, fijo">
                Alrededor de hoy
              </button>
              <button className={modo === 'todo' ? 'activo' : ''} onClick={() => setModo('todo')} title="De la primera a la ultima tarea">
                Todo el proyecto
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="gantt-wrap">
        <div className="gantt-scroll" ref={scrollRef}>
          {/* 2.1: sin menu contextual del navegador sobre la grilla (el clic
              derecho es el gesto de marcar lista). */}
          <table className="gantt" onContextMenu={(e) => e.preventDefault()}>
            <thead>
              <tr className="semana">
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
              {filas.map((fila, i) => (
                <FilaGanttRow
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
                  can={can}
                  actions={actions}
                  onAbrirTarea={onAbrirTarea}
                  abrirCrear={abrirCrear}
                  crearEn={crearEn}
                  onCrear={crearElemento}
                  onCerrarCrear={() => setCrearEn(null)}
                  mostrarAviso={mostrarAviso}
                />
              ))}

              {/* §6.5 — Carga por persona + "Sin asignar" (puntos 3 y 4) */}
              {hayCarga && (
                <tr className="carga-sep">
                  <td className="fija fija--frente carga-sep__label">Carga por persona</td>
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
              {/* Punto 4: total de tareas por dia (personas + sin asignar) */}
              {carga.total && (
                <FilaCarga
                  nombre="Total"
                  avatar={<span className="avatar avatar--total" title="Total de tareas por dia">Σ</span>}
                  porDia={carga.total}
                  dias={dias}
                  hoy={hoy}
                  esTotal
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

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
}: {
  nombre: string
  avatar: React.ReactNode
  porDia: Map<ISODate, number>
  dias: ISODate[]
  hoy: string
  atenuada?: boolean
  esTotal?: boolean
}) {
  return (
    <tr className={`carga-fila${atenuada ? ' carga-fila--sin' : ''}${esTotal ? ' carga-fila--total' : ''}`}>
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
  fila,
  dias,
  state,
  hoy,
  candidatos,
  can,
  actions,
  onAbrirTarea,
  abrirCrear,
  crearEn,
  onCrear,
  onCerrarCrear,
  mostrarAviso,
}: {
  fila: FilaGantt
  dias: ISODate[]
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
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
  const celdaFrente = (frente: Frente, span: number) => (
    <td className="fija fija--frente fija--rotula" rowSpan={span}>
      <span className="fija-nombre">
        <span className="con-mas">
          {frente.nombre}
          {can.crearFrentes && (
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
          {sub.nombre}
          {can.crearSubFrentes && (
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
          ) : can.crearSubFrentes ? (
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
    return (
      <tr className={fila.esPrimeraGlobal ? '' : 'sep-sf'}>
        {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
        {celdaSub(fila.frente, fila.sub, 1)}
        <td className={`fija fija--tarea gantt-vacio${creandoAca ? ' fija--input' : ''}`}>
          {creandoAca ? (
            <CrearInput placeholder="Nueva tarea… (Enter crea)" onCrear={onCrear} onCerrar={onCerrarCrear} />
          ) : can.crearTareas ? (
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
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)

  const marcas = new Map<ISODate, TipoMarca>()
  for (const mk of marcasDe(state, tarea, hoy)) marcas.set(mk.fecha, mk.tipo)

  const sep = fila.esInicioSub && !fila.esPrimeraGlobal ? ' sep-sf' : ''
  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

  // -- Estandar de planificacion por clics (punto 2) --
  const puedeEditar = can.editarFechas(tarea) && !tarea.hecha
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

  return (
    <tr className={sep.trim()}>
      {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
      {fila.esInicioSub && celdaSub(fila.frente, fila.sub, fila.spanSub)}

      <td className={`fija fija--tarea tarea-cell--${color}`}>
        <span className="con-mas">
          {can.editarTareas(tarea) ? (
            <InlineText
              valor={tarea.titulo}
              onGuardar={(titulo) => actions.updateTarea(tarea.id, { titulo })}
              ariaLabel={`Editar titulo: ${tarea.titulo}`}
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
          <span className="con-mas__acciones">
            <button
              className="mas-btn"
              data-tip="Información"
              aria-label="Información"
              onClick={() => onAbrirTarea(tarea.id)}
            >
              ⓘ
            </button>
            {can.crearTareas && (
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
        {can.asignarResponsable(tarea) ? (
          <RespPicker
            usuarios={candidatos}
            value={tarea.responsableId}
            onChange={(id) => actions.updateTarea(tarea.id, { responsableId: id })}
            ariaLabel={`Responsable: ${tarea.titulo}`}
          />
        ) : (
          resp && <Avatar usuario={resp} />
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
