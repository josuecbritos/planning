import { useMemo, useState } from 'react'
import type { AppState, Proyecto, Tarea, Usuario } from '../types'
import { cmp, formatoFecha } from '../lib/dates'
import { colorTarea, estadoDerivado } from '../lib/derive'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'

// Mi Panel (Modulo 3): todas mis tareas de todos los proyectos, con filtro
// por estado o proyecto e indicador visual de vencidas.

type FiltroEstado = 'todas' | 'pendientes' | 'vencidas' | 'hechas' | 'replanificadas'

interface Props {
  state: AppState
  usuario: Usuario
  proyectos: Proyecto[]
  hoy: string
  onAbrirTarea: (tareaId: string) => void
}

interface FilaPanel {
  tarea: Tarea
  proyecto: Proyecto
  ruta: string
}

const FILTROS: { key: FiltroEstado; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'vencidas', label: 'Atrasadas' },
  { key: 'replanificadas', label: 'Replanificadas abiertas' },
  { key: 'hechas', label: 'Hechas' },
]

export function MiPanelView({ state, usuario, proyectos, hoy, onAbrirTarea }: Props) {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todas')
  const [filtroProyecto, setFiltroProyecto] = useState<string>('todos')

  // Todas mis tareas activas, de todos los proyectos visibles.
  const misFilas = useMemo<FilaPanel[]>(() => {
    const out: FilaPanel[] = []
    for (const t of state.tareas) {
      if (t.responsableId !== usuario.id || t.archivada) continue
      const sub = state.subFrentes.find((sf) => sf.id === t.subFrenteId)
      const frente = sub ? state.frentes.find((f) => f.id === sub.frenteId) : undefined
      const proyecto = frente ? proyectos.find((p) => p.id === frente.proyectoId) : undefined
      if (!proyecto) continue
      out.push({ tarea: t, proyecto, ruta: `${frente!.nombre} › ${sub!.nombre}` })
    }
    // Vencidas primero, luego por fecha objetivo ascendente; hechas al final.
    return out.sort((a, b) => {
      const ea = estadoDerivado(a.tarea, hoy)
      const eb = estadoDerivado(b.tarea, hoy)
      const peso = (e: string) => (e === 'vencida' ? 0 : e === 'pendiente' ? 1 : 2)
      if (peso(ea) !== peso(eb)) return peso(ea) - peso(eb)
      return cmp(a.tarea.fechaObjetivo, b.tarea.fechaObjetivo)
    })
  }, [state, usuario.id, proyectos, hoy])

  const filtradas = useMemo(() => {
    return misFilas.filter(({ tarea, proyecto }) => {
      if (filtroProyecto !== 'todos' && proyecto.id !== filtroProyecto) return false
      const est = estadoDerivado(tarea, hoy)
      const color = colorTarea(state, tarea, hoy)
      switch (filtroEstado) {
        case 'pendientes': return est === 'pendiente'
        case 'vencidas': return est === 'vencida'
        case 'hechas': return est === 'hecha'
        case 'replanificadas': return color === 'ambar'
        default: return true
      }
    })
  }, [misFilas, filtroEstado, filtroProyecto, state, hoy])

  const vencidas = misFilas.filter(({ tarea }) => estadoDerivado(tarea, hoy) === 'vencida').length

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Mi Panel</h2>
          <p className="usuarios-sub">
            {misFilas.length} tareas a mi cargo en {proyectos.length} proyecto{proyectos.length === 1 ? '' : 's'}
            {vencidas > 0 && (
              <span className="mipanel-alerta"> · {vencidas} atrasada{vencidas === 1 ? '' : 's'} — asignar nueva fecha</span>
            )}
          </p>
        </div>
      </div>

      <div className="mipanel-filtros">
        <div className="toggle">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              className={filtroEstado === f.key ? 'activo' : ''}
              onClick={() => setFiltroEstado(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          className="asignar-select"
          value={filtroProyecto}
          onChange={(e) => setFiltroProyecto(e.target.value)}
        >
          <option value="todos">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      <table className="tareas">
        <thead>
          <tr>
            <th>Tarea</th>
            <th>Proyecto</th>
            <th>Ubicacion</th>
            <th className="col-fecha">F. objetivo</th>
            <th className="col-fecha">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filtradas.map(({ tarea, proyecto, ruta }) => (
            <FilaMiPanel
              key={tarea.id}
              tarea={tarea}
              proyecto={proyecto}
              ruta={ruta}
              state={state}
              hoy={hoy}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {filtradas.length === 0 && (
            <tr>
              <td colSpan={5} className="vacio-inline">Sin tareas para este filtro.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const ESTADO_CHIP: Record<string, { texto: string; clase: string }> = {
  verde: { texto: 'Hecha', clase: 'hc-estado--verde' },
  rojo: { texto: 'Atrasada', clase: 'hc-estado--rojo' },
  ambar: { texto: 'Replanificada, abierta', clase: 'hc-estado--ambar' },
  ninguno: { texto: 'En curso', clase: 'hc-estado--ninguno-claro' },
}

function FilaMiPanel({
  tarea,
  proyecto,
  ruta,
  state,
  hoy,
  onAbrirTarea,
}: {
  tarea: Tarea
  proyecto: Proyecto
  ruta: string
  state: AppState
  hoy: string
  onAbrirTarea: (id: string) => void
}) {
  const color = colorTarea(state, tarea, hoy)
  const est = estadoDerivado(tarea, hoy)
  const chip = ESTADO_CHIP[color]

  return (
    <tr>
      <td className={`tarea-cell tarea-cell--${color}`}>
        <HoverCard card={<TaskDetail state={state} tarea={tarea} hoy={hoy} />}>
          <span
            className="tarea-cell__row tarea-cell__link"
            role="button"
            tabIndex={0}
            onClick={() => onAbrirTarea(tarea.id)}
            onKeyDown={(e) => e.key === 'Enter' && onAbrirTarea(tarea.id)}
          >
            {est === 'hecha' && <span className="tarea-cell__mark mk-verde">✓</span>}
            {tarea.titulo}
          </span>
        </HoverCard>
      </td>
      <td>
        <span className="mipanel-proyecto">
          <span className="nav-proyecto__dot" style={{ background: proyecto.color ?? '#607d8b' }} />
          {proyecto.nombre}
        </span>
      </td>
      <td className="mipanel-ruta">{ruta}</td>
      <td className={`col-fecha${est === 'vencida' ? ' fecha-vencida' : ''}`}>
        {formatoFecha(tarea.fechaObjetivo)}
      </td>
      <td>
        <span className={`hovercard__estado ${chip.clase}`}>{chip.texto}</span>
      </td>
    </tr>
  )
}
