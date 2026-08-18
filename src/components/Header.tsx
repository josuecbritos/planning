import type { Proyecto } from '../types'
import type { Vista } from '../App'
import type { Contadores } from '../lib/derive'
import { formatoFecha } from '../lib/dates'
import { Marca } from './Marca'

// Encabezado del proyecto (7.2): contadores por estado derivado + toggle de
// vista. La sesion vive en el pie del sidebar.
//
// #305 — Franjas 1 y 2 de las tres que hay sobre la grilla. La franja 2
// absorbió la leyenda de la Gantt: eran las mismas cinco categorías, en el
// mismo orden y con los mismos colores, a dos filas de distancia. Lo único que
// la leyenda agregaba —la marca de "fecha anterior"— es ahora la sexta caja,
// sin número: no es un estado, es el rastro de dónde estaba la tarea.

interface Props {
  proyecto: Proyecto
  modo: 'memoria' | 'supabase'
  vista: Vista
  onVista: (v: Vista) => void
  /** P5: en mobile no hay Gantt, así que se oculta el toggle de vistas. */
  mostrarToggle: boolean
  contadores: Contadores
  hoy: string
  /** Miembros del proyecto (roles punto 7): presente si el usuario puede
   *  verlos (admin o dueño). */
  onMiembros?: () => void
}

export function Header({ proyecto, modo, vista, onVista, mostrarToggle, contadores, hoy, onMiembros }: Props) {
  const c = contadores
  // #305: en Gantt las muestras de los contadores son las marcas REALES de la
  // grilla (el check verde, la equis, los cuadrados de color) para que la fila
  // sirva además de leyenda. En tabla siguen siendo muestras de color, que es
  // lo que la tabla usa.
  const enGantt = vista === 'gantt'
  return (
    <header className="topbar">
      <div className="topbar__row">
        <h1 className="topbar__title">
          {proyecto.nombre}
          <small>{c.total} tareas</small>
        </h1>
        <div className="topbar__row" style={{ gap: 12 }}>
          {onMiembros && (
            <button className="btn btn--ghost btn--sm" onClick={onMiembros} title="Personas con acceso a este proyecto">
              Miembros
            </button>
          )}
          {/* #305: el chip pierde la etiqueta "Hoy:" —era ruido junto a una
              fecha— y muestra solo la fecha. En modo simulado se mantiene el
              aviso de que la fecha está trucada, que es donde esa palabra sí
              trabaja. */}
          <span className="hoy-chip" title={modo === 'supabase' ? 'Fecha de hoy' : 'Fecha simulada (modo demo)'}>
            {modo !== 'supabase' && <em className="hoy-chip__sim">Simulado</em>}
            <b>{formatoFecha(hoy)}</b>
          </span>
          {mostrarToggle && (
            <div className="toggle">
              <button className={vista === 'tabla' ? 'activo' : ''} onClick={() => onVista('tabla')}>
                Tabla
              </button>
              <button className={vista === 'gantt' ? 'activo' : ''} onClick={() => onVista('gantt')}>
                Gantt
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cinco categorias excluyentes, de menos a mas critica; suman el total (1.3).
          En Gantt se les suma la sexta caja de rastro, que no cuenta nada. */}
      <div className={`counters${enGantt ? ' counters--gantt' : ''}`}>
        <div className="counter counter--verde">
          {enGantt ? <Marca tipo="hecha" /> : <span className="counter__swatch" style={{ background: 'var(--verde)' }} />}
          <span className="counter__num">{c.hechas}</span>
          <span className="counter__lbl">Hechas</span>
        </div>
        <div className="counter">
          {/* Pendiente = "sin color" de fila: cuadro blanco con borde. En la
              grilla es la equis. */}
          {enGantt ? <Marca tipo="pendiente" /> : <span className="counter__swatch counter__swatch--vacio" />}
          <span className="counter__num">{c.pendientes}</span>
          <span className="counter__lbl">Pendientes</span>
        </div>
        <div className="counter counter--ambar">
          {enGantt ? <span className="mark mark--ambar" /> : <span className="counter__swatch" style={{ background: 'var(--ambar)' }} />}
          <span className="counter__num">{c.pendientesReplan}</span>
          <span className="counter__lbl">Pendientes replanificadas</span>
        </div>
        <div className="counter counter--rojo">
          {enGantt ? <Marca tipo="incumplida" /> : <span className="counter__swatch" style={{ background: 'var(--rojo)' }} />}
          <span className="counter__num">{c.atrasadas}</span>
          <span className="counter__lbl">Atrasadas</span>
        </div>
        <div className="counter counter--morado">
          {enGantt ? <Marca tipo="incumplida_replan" /> : <span className="counter__swatch" style={{ background: 'var(--morado)' }} />}
          <span className="counter__num">{c.atrasadasReplan}</span>
          <span className="counter__lbl">Atrasadas replanificadas</span>
        </div>
        {/* #305: sexta caja, solo en Gantt y SIN número: no es un estado de la
            tarea sino la huella de la fecha que tenía antes de replanificarse.
            Es lo único que la leyenda agregaba a los contadores. */}
        {enGantt && (
          <div className="counter counter--rastro" title="Dónde estaba la tarea antes de replanificarse">
            <Marca tipo="anterior" />
            <span className="counter__lbl">Fecha anterior</span>
          </div>
        )}
      </div>
    </header>
  )
}
