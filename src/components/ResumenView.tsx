import type { AppState, Proyecto } from '../types'
import { contar } from '../lib/derive'

// Indicadores por proyecto (Fase 3): salud de todos los proyectos visibles
// de un vistazo — avance, vencidas y replanificadas abiertas.

interface Props {
  state: AppState
  proyectos: Proyecto[]
  hoy: string
  onAbrirProyecto: (id: string) => void
}

const ESTADO_PROYECTO: Record<Proyecto['estado'], string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
}

export function ResumenView({ state, proyectos, hoy, onAbrirProyecto }: Props) {
  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Resumen de proyectos</h2>
          <p className="usuarios-sub">
            Rojo = tareas atrasadas (exigen nueva fecha) · Ambar = replanificadas que siguen abiertas.
          </p>
        </div>
      </div>

      <div className="resumen-grid">
        {proyectos.map((p) => (
          <TarjetaProyecto key={p.id} proyecto={p} state={state} hoy={hoy} onAbrir={onAbrirProyecto} />
        ))}
        {proyectos.length === 0 && <p className="vacio-inline">Sin proyectos visibles.</p>}
      </div>
    </div>
  )
}

function TarjetaProyecto({
  proyecto,
  state,
  hoy,
  onAbrir,
}: {
  proyecto: Proyecto
  state: AppState
  hoy: string
  onAbrir: (id: string) => void
}) {
  const frenteIds = new Set(state.frentes.filter((f) => f.proyectoId === proyecto.id).map((f) => f.id))
  const subIds = new Set(state.subFrentes.filter((sf) => frenteIds.has(sf.frenteId)).map((sf) => sf.id))
  const tareas = state.tareas.filter((t) => subIds.has(t.subFrenteId))
  const c = contar(state, tareas, hoy)
  const avance = c.total > 0 ? Math.round((c.hechas / c.total) * 100) : 0

  return (
    <button className="resumen-card" onClick={() => onAbrir(proyecto.id)}>
      <div className="resumen-card__head">
        <span className="nav-proyecto__dot" style={{ background: proyecto.color ?? '#607d8b' }} />
        <span className="resumen-card__nombre">{proyecto.nombre}</span>
        <span className={`chip-estado chip-estado--${proyecto.estado}`}>
          {ESTADO_PROYECTO[proyecto.estado]}
        </span>
      </div>

      {proyecto.descripcion && <p className="resumen-card__desc">{proyecto.descripcion}</p>}

      <div className="resumen-card__avance">
        <div className="barra">
          <div className="barra__relleno" style={{ width: `${avance}%` }} />
        </div>
        <span className="resumen-card__pct">{avance}%</span>
      </div>

      <div className="resumen-card__stats">
        <span className="stat"><b>{c.total}</b> tareas</span>
        <span className="stat stat--verde"><b>{c.hechas}</b> hechas</span>
        <span className="stat"><b>{c.pendientes}</b> pendientes</span>
        <span className={`stat${c.porReplanificar > 0 ? ' stat--rojo' : ''}`}>
          <b>{c.porReplanificar}</b> atrasadas
        </span>
        <span className={`stat${c.replanificadasAbiertas > 0 ? ' stat--ambar' : ''}`}>
          <b>{c.replanificadasAbiertas}</b> replanificadas abiertas
        </span>
      </div>
    </button>
  )
}
