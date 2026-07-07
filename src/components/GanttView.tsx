import { useMemo } from 'react'
import type { AppState, ISODate, Tarea, TipoMarca } from '../types'
import type { FrenteSel } from '../App'
import {
  cmp,
  diasHabiles,
  etiquetaDia,
  etiquetaSemana,
  esLunes,
  inicioSemana,
  addDays,
} from '../lib/dates'
import { colorTarea, marcasDe } from '../lib/derive'
import { Marca } from './Marca'
import { Legend } from './Legend'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'

// Vista Gantt — grilla tipo Excel (4.3). Marcas segun 6.4.

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
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

export function GanttView({ state, proyectoId, frenteSel, hoy }: Props) {
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
      const tareasFrente = state.tareas.filter((t) =>
        subs.some((sf) => sf.id === t.subFrenteId),
      )
      if (tareasFrente.length === 0) continue

      let inicioFrente = true
      for (const sf of subs) {
        const tareas = state.tareas
          .filter((t) => t.subFrenteId === sf.id)
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

  // -- Rango de dias habiles a mostrar --
  const dias = useMemo<ISODate[]>(() => {
    if (filas.length === 0) return []
    const fechas: ISODate[] = [hoy]
    for (const { tarea } of filas) {
      fechas.push(tarea.fechaOriginal, tarea.fechaObjetivo)
      if (tarea.fechaReal) fechas.push(tarea.fechaReal)
      for (const h of state.historial.filter((x) => x.tareaId === tarea.id)) {
        fechas.push(h.fechaAnterior, h.fechaNueva)
      }
    }
    const min = fechas.reduce((a, b) => (cmp(a, b) <= 0 ? a : b))
    const max = fechas.reduce((a, b) => (cmp(a, b) >= 0 ? a : b))
    // Extiende al lunes de la primera semana y al viernes de la ultima.
    const desde = inicioSemana(min)
    const hasta = addDays(inicioSemana(max), 4)
    return diasHabiles(desde, hasta)
  }, [filas, state.historial, hoy])

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
      <Legend />
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
}: {
  fila: FilaGantt
  dias: ISODate[]
  state: AppState
  hoy: string
}) {
  const { tarea } = fila
  const color = colorTarea(state, tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)

  // Mapa fecha -> marca. La marca principal (ultima en la lista) prevalece.
  const marcas = useMemo(() => {
    const m = new Map<ISODate, TipoMarca>()
    for (const mk of marcasDe(state, tarea, hoy)) m.set(mk.fecha, mk.tipo)
    return m
  }, [state, tarea, hoy])

  const sep = fila.esInicioSub && !fila.esPrimeraGlobal ? ' sep-sf' : ''

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
        <HoverCard card={<TaskDetail state={state} tarea={tarea} hoy={hoy} />}>
          {tarea.titulo}
        </HoverCard>
      </td>
      <td className="fija fija--resp">
        {resp && <span className="resp-badge" title={resp.nombre}>{resp.iniciales}</span>}
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
              <HoverCard card={<TaskDetail state={state} tarea={tarea} hoy={hoy} />}>
                <Marca tipo={tipo} />
              </HoverCard>
            )}
          </td>
        )
      })}
    </tr>
  )
}
