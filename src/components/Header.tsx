import type { Proyecto, Usuario } from '../types'
import type { Vista } from '../App'
import type { Contadores } from '../lib/derive'
import { etiquetaLarga } from '../lib/dates'

// Encabezado del proyecto (7.2): contadores por estado derivado + toggle de
// vista + sesion actual.

interface Props {
  proyecto: Proyecto
  modo: 'memoria' | 'supabase'
  usuario: Usuario
  vista: Vista
  onVista: (v: Vista) => void
  contadores: Contadores
  hoy: string
  onLogout: () => void
}

export function Header({ proyecto, modo, usuario, vista, onVista, contadores, hoy, onLogout }: Props) {
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
          <span className="sesion" title={usuario.email}>
            <span className="resp-badge">{usuario.iniciales}</span>
            <span className="sesion__info">
              <b>{usuario.nombre}</b>
              <small>{usuario.rol === 'admin' ? 'Admin' : 'Cliente'}</small>
            </span>
            <button className="link-btn sesion__salir" onClick={onLogout}>Salir</button>
          </span>
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
