import { useMemo, useState } from 'react'
import type { AppState, ISODate, Tarea, TipoMarca, Usuario } from '../types'
import type { Actions, FrenteSel } from '../App'
import {
  addDays,
  cmp,
  diasHabiles,
  etiquetaDia,
  etiquetaSemana,
  esLunes,
  inicioSemana,
} from '../lib/dates'
import { colorTarea, marcasDe, puntoAmbar } from '../lib/derive'
import { Marca } from './Marca'
import { Avatar, RespPicker } from './RespPicker'
import { Legend } from './Legend'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { InlineText } from './InlineText'

// Vista Gantt — grilla tipo Excel (4.3). Horizonte temporal con tres modos
// (definiciones cerradas §2) y edicion inline reutilizando el mismo patron
// de la vista tabla (titulo y responsable; el resto via panel de detalle).

/** Modos del horizonte. Siempre arranca en 'hoy'; no se persiste. */
type ModoHorizonte = 'hoy' | 'rango' | 'todo'

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  puedeEditar: boolean
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
}

interface FilaGantt {
  tarea: Tarea
  frenteNombre: string
  subNombre: string
  esInicioFrente: boolean
  spanFrente: number
  esInicioSub: boolean
  spanSub: number
  esPrimeraGlobal: boolean
}

/**
 * Ventana fija del modo "Alrededor de hoy": 2 semanas hacia atras + la
 * semana actual + 2 semanas hacia adelante.
 */
function ventanaHoy(hoy: ISODate): { desde: ISODate; hasta: ISODate } {
  return {
    desde: inicioSemana(addDays(hoy, -14)),
    hasta: addDays(inicioSemana(addDays(hoy, 14)), 4),
  }
}

export function GanttView({ state, proyectoId, frenteSel, hoy, puedeEditar, actions, onAbrirTarea }: Props) {
  // Horizonte: por defecto "Alrededor de hoy"; se puede cambiar durante la
  // sesion pero NO se persiste (al recargar vuelve al default).
  const [modo, setModo] = useState<ModoHorizonte>('hoy')
  const [rango, setRango] = useState<{ desde: ISODate; hasta: ISODate }>(() => ventanaHoy(hoy))

  // Candidatos a responsable: admins + clientes con acceso a ESTE proyecto.
  const candidatos = state.usuarios.filter(
    (u) =>
      u.activo &&
      (u.rol === 'admin' ||
        state.accesos.some((a) => a.usuarioId === u.id && a.proyectoId === proyectoId)),
  )

  // -- Filas ordenadas con spans para celdas combinadas --
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
      const tareasFrente = state.tareas.filter(
        (t) => !t.archivada && subs.some((sf) => sf.id === t.subFrenteId),
      )
      if (tareasFrente.length === 0) continue

      let inicioFrente = true
      for (const sf of subs) {
        const tareas = state.tareas
          .filter((t) => t.subFrenteId === sf.id && !t.archivada)
          .sort((a, b) => a.orden - b.orden)
        if (tareas.length === 0) continue

        let inicioSub = true
        for (const t of tareas) {
          out.push({
            tarea: t,
            frenteNombre: f.nombre,
            subNombre: sf.nombre,
            esInicioFrente: inicioFrente,
            spanFrente: tareasFrente.length,
            esInicioSub: inicioSub,
            spanSub: tareas.length,
            esPrimeraGlobal: primera,
          })
          inicioFrente = false
          inicioSub = false
          primera = false
        }
      }
    }
    return out
  }, [state, proyectoId, frenteSel])

  // -- Rango de dias habiles segun el modo de horizonte --
  const dias = useMemo<ISODate[]>(() => {
    if (filas.length === 0) return []

    let desde: ISODate
    let hasta: ISODate

    if (modo === 'rango' && rango.desde && rango.hasta && cmp(rango.desde, rango.hasta) <= 0) {
      desde = rango.desde
      hasta = rango.hasta
    } else if (modo === 'todo') {
      // Desde la primera hasta la ultima fecha del proyecto.
      const fechas: ISODate[] = [hoy]
      for (const { tarea } of filas) {
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
      hasta = addDays(inicioSemana(max), 4)
    } else {
      // Default: alrededor de hoy (2 atras + actual + 2 adelante, fijo).
      const v = ventanaHoy(hoy)
      desde = v.desde
      hasta = v.hasta
    }

    return diasHabiles(desde, hasta)
  }, [filas, state.historial, hoy, modo, rango])

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

  if (filas.length === 0) {
    return <div className="gantt-wrap">No hay tareas en este frente.</div>
  }

  return (
    <div>
      <div className="gantt-toolbar">
        <Legend />
        <div className="horizonte">
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
                    {etiquetaSemana(s.lunes)}
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
                      className={`dia${esLunes(d) ? ' lunes' : ''}${esHoy ? ' hoy-head' : ''}`}
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
                <FilaTarea
                  key={fila.tarea.id}
                  fila={fila}
                  dias={dias}
                  state={state}
                  hoy={hoy}
                  candidatos={candidatos}
                  puedeEditar={puedeEditar}
                  actions={actions}
                  onAbrirTarea={onAbrirTarea}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FilaTarea({
  fila,
  dias,
  state,
  hoy,
  candidatos,
  puedeEditar,
  actions,
  onAbrirTarea,
}: {
  fila: FilaGantt
  dias: ISODate[]
  state: AppState
  hoy: string
  candidatos: Usuario[]
  puedeEditar: boolean
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const { tarea } = fila
  const color = colorTarea(state, tarea, hoy)
  const conPunto = puntoAmbar(state, tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)

  // Mapa fecha -> marca. La marca principal (ultima en la lista) prevalece.
  const marcas = useMemo(() => {
    const m = new Map<ISODate, TipoMarca>()
    for (const mk of marcasDe(state, tarea, hoy)) m.set(mk.fecha, mk.tipo)
    return m
  }, [state, tarea, hoy])

  const sep = fila.esInicioSub && !fila.esPrimeraGlobal ? ' sep-sf' : ''
  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

  return (
    <tr className={sep.trim()}>
      {fila.esInicioFrente && (
        <td className="fija fija--frente" rowSpan={fila.spanFrente}>
          {fila.frenteNombre}
        </td>
      )}
      {fila.esInicioSub && (
        <td className="fija fija--sf" rowSpan={fila.spanSub}>
          {fila.subNombre}
        </td>
      )}
      <td className={`fija fija--tarea tarea-cell--${color}`}>
        {conPunto && <span className="punto-ambar" title="Atrasada replanificada" />}
        {puedeEditar ? (
          // Mismo patron inline que la tabla: click en el titulo lo edita.
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
      </td>
      <td className="fija fija--resp">
        {puedeEditar ? (
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
            className={`celda${esLunes(d) ? ' lunes' : ''}${esHoy ? ' col-hoy' : ''}`}
          >
            {tipo && (
              <HoverCard card={tooltip}>
                <span
                  className="tarea-cell__link"
                  role="button"
                  tabIndex={-1}
                  onClick={() => onAbrirTarea(tarea.id)}
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
