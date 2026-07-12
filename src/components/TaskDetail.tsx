import type { AppState, Tarea } from '../types'
import { formatoFecha } from '../lib/dates'
import {
  colorTarea,
  estadoDerivado,
  hechaTarde,
  historialDe,
} from '../lib/derive'

// Contenido del tooltip de una tarea (6.6). Se usa igual en Tabla y Gantt.

function estadoLlano(state: AppState, t: Tarea, hoy: string): { texto: string; clase: string } {
  const color = colorTarea(state, t, hoy)
  const est = estadoDerivado(t, hoy)
  if (est === 'hecha') {
    return {
      texto: hechaTarde(t) ? 'Hecha (tarde)' : 'Hecha',
      clase: 'hc-estado--verde',
    }
  }
  if (est === 'vencida') return { texto: 'Atrasada', clase: 'hc-estado--rojo' }
  if (color === 'ambar') return { texto: 'Replanificada, sigue abierta', clase: 'hc-estado--ambar' }
  return { texto: 'En curso', clase: 'hc-estado--ninguno' }
}

export function TaskDetail({ state, tarea, hoy }: { state: AppState; tarea: Tarea; hoy: string }) {
  const hist = historialDe(state, tarea.id)
  const est = estadoLlano(state, tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)

  // Cadena de fechas por las que paso: original -> nueva1 -> ... -> vigente.
  const cadena: string[] = [tarea.fechaOriginal]
  for (const h of hist) cadena.push(h.fechaNueva)

  return (
    <>
      <div className="hovercard__title">{tarea.titulo}</div>
      <span className={`hovercard__estado ${est.clase}`}>{est.texto}</span>

      {resp && (
        <div className="hovercard__row">
          <span>Responsable</span>
          <span>{resp.nombre} ({resp.iniciales})</span>
        </div>
      )}
      <div className="hovercard__row">
        <span>Fecha comprometida original</span>
        <span>{formatoFecha(tarea.fechaOriginal)}</span>
      </div>
      <div className="hovercard__row">
        <span>Fecha vigente</span>
        <span>{formatoFecha(tarea.fechaObjetivo)}</span>
      </div>
      {tarea.hecha && tarea.fechaReal && (
        <div className="hovercard__row">
          <span>Fecha real de termino</span>
          <span>{formatoFecha(tarea.fechaReal)}</span>
        </div>
      )}

      <div className="hovercard__hist">
        <div className="hovercard__hist-title">
          {hist.length === 0
            ? 'Sin replanificaciones'
            : `Se movio ${hist.length} ${hist.length === 1 ? 'vez' : 'veces'}`}
        </div>
        <div className="hovercard__chain">
          {cadena.map((f, i) => {
            const esVigente = i === cadena.length - 1
            return (
              <span key={i} style={{ display: 'contents' }}>
                <span className={`fecha ${esVigente ? 'fecha--vigente' : 'fecha--tachada'}`}>
                  {formatoFecha(f)}
                </span>
                {!esVigente && <span className="flecha">→</span>}
              </span>
            )
          })}
        </div>
      </div>

      {hechaTarde(tarea) && (
        <div className="hovercard__tarde">Se cerro despues de la fecha comprometida.</div>
      )}
    </>
  )
}
