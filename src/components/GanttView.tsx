import { useMemo, useRef, useState } from 'react'
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
import { colorTarea, marcasDe } from '../lib/derive'
import type { Can } from '../lib/permisos'
import { Marca } from './Marca'
import { Avatar, RespPicker } from './RespPicker'
import { Legend } from './Legend'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { InlineText } from './InlineText'

// Vista Gantt — grilla tipo Excel (4.3), editable (§6.4):
//  - click en celda vacia planifica una tarea sin fecha
//  - arrastrar la marca replanifica (aplican las reglas 1.2/1.3)
//  - click sobre la marca alterna hecha / no hecha
//  - "+" al pasar el mouse crea un hermano justo debajo (frente/sub/tarea)
//  - contenedores vacios muestran "+ agregar"
// Al pie, filas de carga por persona (§6.5).

/** Modos del horizonte. Siempre arranca en 'hoy'; no se persiste. */
type ModoHorizonte = 'hoy' | 'rango' | 'todo'

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  can: Can
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

/** Estado del mini-input flotante para crear elementos desde la grilla. */
interface CrearEn {
  tipo: 'frente' | 'sub' | 'tarea'
  /** Hermano tras el cual insertar (undefined = al final del contenedor). */
  despuesDe?: { id: string; orden: number }
  /** Contenedor del nuevo elemento (proyecto/frente/sub segun tipo). */
  contenedorId: string
  x: number
  y: number
}

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

export function GanttView({ state, proyectoId, frenteSel, hoy, can, actions, onAbrirTarea }: Props) {
  // Horizonte: por defecto "Alrededor de hoy"; no se persiste.
  const [modo, setModo] = useState<ModoHorizonte>('hoy')
  const [rango, setRango] = useState<{ desde: ISODate; hasta: ISODate }>(() => {
    const v = ventanaHoy(hoy)
    return { desde: v.desde, hasta: addDays(v.desde, 32) }
  })
  // §6.3.19: solo dias habiles (default) o semana completa de 7 dias.
  const [soloHabiles, setSoloHabiles] = useState(true)
  const [crearEn, setCrearEn] = useState<CrearEn | null>(null)

  // Candidatos a responsable: admins + clientes con acceso a ESTE proyecto.
  const candidatos = state.usuarios.filter(
    (u) =>
      u.activo &&
      (u.rol === 'admin' ||
        state.accesos.some((a) => a.usuarioId === u.id && a.proyectoId === proyectoId)),
  )

  // -- Filas (incluye contenedores vacios, §6.4.26) --
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

      if (subs.length === 0) {
        out.push({ tipo: 'vacio-frente', frente: f, esPrimeraGlobal: primera })
        primera = false
        continue
      }

      // Filas por sub frente (una por tarea, o una vacia).
      const filasFrente: FilaGantt[] = []
      for (const sf of subs) {
        const tareas = state.tareas
          .filter((t) => t.subFrenteId === sf.id && !t.archivada)
          .sort((a, b) => a.orden - b.orden)
        if (tareas.length === 0) {
          filasFrente.push({
            tipo: 'vacio-sub',
            frente: f,
            sub: sf,
            esInicioFrente: false,
            spanFrente: 0,
            esPrimeraGlobal: false,
          })
        } else {
          tareas.forEach((t, i) =>
            filasFrente.push({
              tipo: 'tarea',
              tarea: t,
              frente: f,
              sub: sf,
              esInicioFrente: false,
              spanFrente: 0,
              esInicioSub: i === 0,
              spanSub: tareas.length,
              esPrimeraGlobal: false,
            }),
          )
        }
      }
      filasFrente.forEach((fila, i) => {
        if (fila.tipo !== 'vacio-frente') {
          fila.esInicioFrente = i === 0
          fila.spanFrente = filasFrente.length
        }
        fila.esPrimeraGlobal = primera && i === 0
      })
      out.push(...filasFrente)
      primera = false
    }
    return out
  }, [state, proyectoId, frenteSel])

  const filasTarea = useMemo(
    () => filas.filter((f): f is Extract<FilaGantt, { tipo: 'tarea' }> => f.tipo === 'tarea'),
    [filas],
  )

  // -- Rango de dias segun el modo de horizonte + toggle habiles/completa --
  const dias = useMemo<ISODate[]>(() => {
    let desde: ISODate
    let hasta: ISODate

    if (modo === 'rango' && rango.desde && rango.hasta && cmp(rango.desde, rango.hasta) <= 0) {
      desde = rango.desde
      hasta = rango.hasta
    } else if (modo === 'todo' && filasTarea.length > 0) {
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
  }, [filasTarea, state.historial, hoy, modo, rango, soloHabiles])

  // §6.3.20: en modo dias habiles, tareas con fecha de finde quedan ocultas.
  const ocultasFinde = useMemo(() => {
    if (!soloHabiles) return 0
    return filasTarea.filter(({ tarea }) => {
      const fechas = [tarea.fechaObjetivo, tarea.hecha ? tarea.fechaReal : undefined]
      return fechas.some((d) => d && esFinDeSemana(d))
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

  // §6.5: carga por persona — tareas cuya fecha VIGENTE cae en el rango
  // visible, hechas y no hechas; cada tarea cuenta una sola vez.
  const carga = useMemo(() => {
    const diasSet = new Set(dias)
    const porPersona = new Map<string, Map<ISODate, number>>()
    for (const { tarea } of filasTarea) {
      if (!tarea.responsableId || !tarea.fechaObjetivo) continue
      if (!diasSet.has(tarea.fechaObjetivo)) continue
      let m = porPersona.get(tarea.responsableId)
      if (!m) {
        m = new Map()
        porPersona.set(tarea.responsableId, m)
      }
      m.set(tarea.fechaObjetivo, (m.get(tarea.fechaObjetivo) ?? 0) + 1)
    }
    return [...porPersona.entries()]
      .map(([usuarioId, porDia]) => ({
        usuario: state.usuarios.find((u) => u.id === usuarioId),
        porDia,
      }))
      .filter((x): x is { usuario: Usuario; porDia: Map<ISODate, number> } => Boolean(x.usuario))
      .sort((a, b) => a.usuario.nombre.localeCompare(b.usuario.nombre))
  }, [filasTarea, dias, state.usuarios])

  // -- Creacion de hermanos "justo debajo" (§6.4.25) --
  function abrirCrear(e: React.MouseEvent, crear: Omit<CrearEn, 'x' | 'y'>) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCrearEn({ ...crear, x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 4 })
  }

  async function crearElemento(nombre: string) {
    if (!crearEn) return
    const { tipo, despuesDe, contenedorId } = crearEn
    // Insertar justo debajo del hermano: se corren los ordenes siguientes.
    // (Los clientes crean al final: el corrimiento exige editar hermanos.)
    const insertar = can.esAdmin && despuesDe ? despuesDe.orden + 1 : undefined
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

  if (filas.length === 0) {
    return <div className="gantt-wrap">Este proyecto aun no tiene frentes.</div>
  }

  const finOffsetSemana = soloHabiles ? 4 : 6

  return (
    <div>
      <div className="gantt-toolbar">
        <Legend />
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
          <div className="toggle">
            <button className={modo === 'hoy' ? 'activo' : ''} onClick={() => setModo('hoy')} title="2 semanas atras + semana actual + 2 adelante, fijo">
              Alrededor de hoy
            </button>
            <button className={modo === 'rango' ? 'activo' : ''} onClick={() => setModo('rango')}>
              Rango
            </button>
            <button className={modo === 'todo' ? 'activo' : ''} onClick={() => setModo('todo')}>
              Todo el proyecto
            </button>
          </div>
          {modo === 'rango' && (
            <span className="horizonte__rango">
              <input
                type="date"
                className="fecha-input horizonte__fecha"
                value={rango.desde}
                aria-label="Desde"
                onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
              />
              –
              <input
                type="date"
                className="fecha-input horizonte__fecha"
                value={rango.hasta}
                aria-label="Hasta"
                onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              />
            </span>
          )}
        </div>
      </div>
      <div className="gantt-wrap">
        <div className="gantt-scroll">
          <table className="gantt">
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
              {filas.map((fila) => (
                <FilaGanttRow
                  key={
                    fila.tipo === 'tarea'
                      ? fila.tarea.id
                      : fila.tipo === 'vacio-sub'
                        ? `vs-${fila.sub.id}`
                        : `vf-${fila.frente.id}`
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
                />
              ))}

              {/* §6.5 — Carga por persona (solo personas con tareas en rango) */}
              {carga.length > 0 && (
                <tr className="carga-sep">
                  <td className="fija carga-sep__label" colSpan={4}>Carga por persona</td>
                  {dias.map((d) => (
                    <td key={d} className={`celda${esLunes(d) ? ' lunes' : ''}${d === hoy ? ' col-hoy' : ''}`} />
                  ))}
                </tr>
              )}
              {carga.map(({ usuario, porDia }) => (
                <tr key={`carga-${usuario.id}`} className="carga-fila">
                  <td className="fija carga-fila__nombre" colSpan={3}>{usuario.nombre}</td>
                  <td className="fija fija--resp"><Avatar usuario={usuario} /></td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {crearEn &&
        createPortal(
          <CrearPopover
            crear={crearEn}
            onCrear={(nombre) => {
              crearElemento(nombre)
            }}
            onCerrar={() => setCrearEn(null)}
          />,
          document.body,
        )}
    </div>
  )
}

/** Mini input flotante para crear frente/sub/tarea desde la grilla. */
function CrearPopover({
  crear,
  onCrear,
  onCerrar,
}: {
  crear: CrearEn
  onCrear: (nombre: string) => void
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const etiqueta = crear.tipo === 'frente' ? 'Nuevo frente' : crear.tipo === 'sub' ? 'Nuevo sub frente' : 'Nueva tarea'

  function confirmar() {
    const limpio = nombre.trim()
    if (limpio) onCrear(limpio)
    onCerrar()
  }

  return (
    <div className="crear-pop" style={{ left: crear.x, top: crear.y }}>
      <input
        autoFocus
        placeholder={`${etiqueta}… (Enter crea)`}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar()
          if (e.key === 'Escape') onCerrar()
        }}
        onBlur={confirmar}
      />
    </div>
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
}: {
  fila: FilaGantt
  dias: ISODate[]
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  actions: Actions
  onAbrirTarea: (id: string) => void
  abrirCrear: (e: React.MouseEvent, crear: Omit<CrearEn, 'x' | 'y'>) => void
}) {
  const dragTareaId = useRef<string | null>(null)

  // -- Celdas fijas de frente / sub frente (con "+" para crear hermanos) --

  const celdaFrente = (frente: Frente, span: number) => (
    <td className="fija fija--frente" rowSpan={span}>
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
    </td>
  )

  const celdaSub = (frente: Frente, sub: SubFrente, span: number) => (
    <td className="fija fija--sf" rowSpan={span}>
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
    </td>
  )

  // -- Contenedores vacios (§6.4.26) --

  if (fila.tipo === 'vacio-frente') {
    return (
      <tr className={fila.esPrimeraGlobal ? '' : 'sep-sf'}>
        {celdaFrente(fila.frente, 1)}
        <td className="fija fija--sf gantt-vacio" colSpan={1}>
          {can.crearSubFrentes ? (
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
        {dias.map((d) => (
          <td key={d} className={`celda${esLunes(d) ? ' lunes' : ''}${d === hoy ? ' col-hoy' : ''}${esFinDeSemana(d) ? ' finde' : ''}`} />
        ))}
      </tr>
    )
  }

  if (fila.tipo === 'vacio-sub') {
    return (
      <tr className={fila.esPrimeraGlobal ? '' : 'sep-sf'}>
        {fila.esInicioFrente && celdaFrente(fila.frente, fila.spanFrente)}
        {celdaSub(fila.frente, fila.sub, 1)}
        <td className="fija fija--tarea gantt-vacio">
          {can.crearTareas ? (
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
        {dias.map((d) => (
          <td key={d} className={`celda${esLunes(d) ? ' lunes' : ''}${d === hoy ? ' col-hoy' : ''}${esFinDeSemana(d) ? ' finde' : ''}`} />
        ))}
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

  const puedePlanificarCelda = can.editarFechas(tarea) && !tarea.fechaObjetivo && !tarea.hecha
  const puedeArrastrar = can.editarFechas(tarea) && !tarea.hecha && !!tarea.fechaObjetivo

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
        const esPrincipal =
          tipo === 'pendiente' || tipo === 'incumplida' || tipo === 'incumplida_replan' || tipo === 'hecha'
        return (
          <td
            key={d}
            className={`celda${esLunes(d) ? ' lunes' : ''}${esHoy ? ' col-hoy' : ''}${esFinDeSemana(d) ? ' finde' : ''}${puedePlanificarCelda ? ' celda--planificable' : ''}`}
            // §6.4.21: click en la celda del dia planifica una tarea sin fecha.
            onClick={puedePlanificarCelda ? () => actions.cambiarFechaObjetivo(tarea.id, d) : undefined}
            // §6.4.22: soltar una marca arrastrada replanifica a este dia.
            onDragOver={can.editarFechas(tarea) ? (e) => e.preventDefault() : undefined}
            onDrop={
              can.editarFechas(tarea)
                ? (e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain')
                    if (id === tarea.id && d !== tarea.fechaObjetivo) actions.cambiarFechaObjetivo(tarea.id, d)
                  }
                : undefined
            }
          >
            {tipo && (
              <HoverCard card={tooltip}>
                <span
                  className={`marca-wrap${esPrincipal && can.marcarHechas(tarea) ? ' marca-wrap--click' : ''}`}
                  role="button"
                  tabIndex={-1}
                  draggable={esPrincipal && puedeArrastrar}
                  onDragStart={(e) => {
                    dragTareaId.current = tarea.id
                    e.dataTransfer.setData('text/plain', tarea.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  // §6.4.23: click sobre la marca alterna hecha / no hecha.
                  onClick={
                    esPrincipal && can.marcarHechas(tarea)
                      ? (e) => {
                          e.stopPropagation()
                          actions.toggleHecha(tarea.id, !tarea.hecha)
                        }
                      : () => onAbrirTarea(tarea.id)
                  }
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
