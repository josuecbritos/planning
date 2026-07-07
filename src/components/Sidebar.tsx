import type { AppState, Proyecto } from '../types'
import type { FrenteSel } from '../App'

// Barra lateral de navegacion (4.2): el proyecto es una carpeta; cada Frente
// es una pagina navegable. El frente seleccionado tambien filtra el Gantt.

interface Props {
  state: AppState
  proyecto: Proyecto
  frenteSel: FrenteSel
  onSelectFrente: (f: FrenteSel) => void
  hoy: string
}

export function Sidebar({ state, proyecto, frenteSel, onSelectFrente }: Props) {
  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyecto.id)
    .sort((a, b) => a.orden - b.orden)

  function tareasEnFrente(frenteId: string): number {
    const subIds = new Set(state.subFrentes.filter((sf) => sf.frenteId === frenteId).map((sf) => sf.id))
    return state.tareas.filter((t) => subIds.has(t.subFrenteId)).length
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        Planificador
        <small>Documento Funcional v3.1</small>
      </div>

      <div className="sidebar__section">Proyectos</div>
      <div className="nav-proyecto">
        <div className="nav-proyecto__title">
          <span className="nav-proyecto__dot" style={{ background: proyecto.color }} />
          {proyecto.nombre}
        </div>

        <button
          className={`nav-frente${frenteSel === 'todos' ? ' nav-frente--activo' : ''}`}
          onClick={() => onSelectFrente('todos')}
        >
          <span>Todos los frentes</span>
          <span className="nav-frente__count">{state.tareas.length}</span>
        </button>

        {frentes.map((f) => (
          <button
            key={f.id}
            className={`nav-frente${frenteSel === f.id ? ' nav-frente--activo' : ''}`}
            onClick={() => onSelectFrente(f.id)}
          >
            <span>{f.nombre}</span>
            <span className="nav-frente__count">{tareasEnFrente(f.id)}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
