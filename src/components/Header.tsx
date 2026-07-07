import type { Proyecto } from '../types'
import type { Vista } from '../App'
import type { Contadores } from '../lib/derive'
import { etiquetaLarga } from '../lib/dates'

// Encabezado del proyecto (7.2): resumen permanente con contadores por estado
// derivado + toggle de vista. Los contadores se recalculan segun el frente
// filtrado.

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
          <span className={`modo-chip modo-chip--${modo}`} title={modo === 'supabase' ? 'Conectado a Supabase' : 'Datos locales (sin backend)'}>
            {modo === 'supabase' ? 'Supabase' : 'Local'}
          </span>
          <span className="hoy-chip">Hoy{modo === 'supabase' ? '' : ' (simulado)'}: <b>{etiquetaLarga(hoy)}</b></span>
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

      <div className="counters">
        <div className="counter counter--verde">
          <span className="counter__num">{c.hechas}</span>
          <span className="counter__lbl">Hechas</span>
        </div>
        <div className="counter">
          <span className="counter__num">{c.pendientes}</span>
          <span className="counter__lbl">Pendientes</span>
        </div>
        <div className="counter counter--rojo">
          <span className="counter__swatch" style={{ background: 'var(--rojo)' }} />
          <span className="counter__num">{c.porReplanificar}</span>
          <span className="counter__lbl">Por replanificar</span>
        </div>
        <div className="counter counter--ambar">
          <span className="counter__swatch" style={{ background: 'var(--ambar)' }} />
          <span className="counter__num">{c.replanificadasAbiertas}</span>
          <span className="counter__lbl">Replanificadas abiertas</span>
        </div>
      </div>
    </header>
  )
}
