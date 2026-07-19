import type { Proyecto } from '../types'
import type { Vista } from '../App'
import type { Contadores } from '../lib/derive'
import { formatoFecha } from '../lib/dates'

// Encabezado del proyecto (7.2): contadores por estado derivado + toggle de
// vista. La sesion vive en el pie del sidebar.

interface Props {
  proyecto: Proyecto
  modo: 'memoria' | 'supabase'
  vista: Vista
  onVista: (v: Vista) => void
  contadores: Contadores
  hoy: string
}

export function Header({ proyecto, modo, vista, onVista, contadores, hoy }: Props) {
  const c = contadores
  return (
    <header className="topbar">
      <div className="topbar__row">
        <h1 className="topbar__title">
          {proyecto.nombre}
          <small>{c.total} tareas</small>
        </h1>
        <div className="topbar__row" style={{ gap: 12 }}>
          <span className="hoy-chip">Hoy{modo === 'supabase' ? '' : ' (simulado)'}: <b>{formatoFecha(hoy)}</b></span>
          <div className="toggle">
            <button className={vista === 'tabla' ? 'activo' : ''} onClick={() => onVista('tabla')}>
              Tabla
            </button>
            <button className={vista === 'gantt' ? 'activo' : ''} onClick={() => onVista('gantt')}>
              Gantt
            </button>
          </div>
        </div>
      </div>

      {/* Cinco categorias excluyentes, de menos a mas critica; suman el total (1.3). */}
      <div className="counters">
        <div className="counter counter--verde">
          <span className="counter__swatch" style={{ background: 'var(--verde)' }} />
          <span className="counter__num">{c.hechas}</span>
          <span className="counter__lbl">Hechas</span>
        </div>
        <div className="counter">
          {/* Pendiente = "sin color" de fila: cuadro blanco con borde. */}
          <span className="counter__swatch counter__swatch--vacio" />
          <span className="counter__num">{c.pendientes}</span>
          <span className="counter__lbl">Pendientes</span>
        </div>
        <div className="counter counter--ambar">
          <span className="counter__swatch" style={{ background: 'var(--ambar)' }} />
          <span className="counter__num">{c.pendientesReplan}</span>
          <span className="counter__lbl">Pendientes replanificadas</span>
        </div>
        <div className="counter counter--rojo">
          <span className="counter__swatch" style={{ background: 'var(--rojo)' }} />
          <span className="counter__num">{c.atrasadas}</span>
          <span className="counter__lbl">Atrasadas</span>
        </div>
        <div className="counter counter--morado">
          <span className="counter__swatch" style={{ background: 'var(--morado)' }} />
          <span className="counter__num">{c.atrasadasReplan}</span>
          <span className="counter__lbl">Atrasadas replanificadas</span>
        </div>
      </div>
    </header>
  )
}
