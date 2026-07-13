import type { AppState, Tarea } from '../types'
import { formatoFecha } from '../lib/dates'
import { CATEGORIA_LABEL, categoriaDe, colorTarea, historialDe } from '../lib/derive'

// Contenido del tooltip de una tarea (6.6). Se usa igual en Tabla y Gantt.
// El estado en lenguaje llano sale de las 5 categorias; "hecha" es terminal
// (sin distincion de tarde).

export function TaskDetail({ state, tarea, hoy }: { state: AppState; tarea: Tarea; hoy: string }) {
  const hist = historialDe(state, tarea.id)
  const cat = categoriaDe(state, tarea, hoy)
  const color = colorTarea(state, tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)

  // Cadena de fechas por las que paso: original -> nueva1 -> ... -> vigente.
  const cadena: string[] = tarea.fechaOriginal ? [tarea.fechaOriginal] : []
  for (const h of hist) cadena.push(h.fechaNueva)

  return (
    <>
      <div className="hovercard__title">{tarea.titulo}</div>
      <span className={`hovercard__estado hc-estado--${color}`}>
        {CATEGORIA_LABEL[cat]}
      </span>

      {resp && (
        <div className="hovercard__row">
          <span>Responsable</span>
          <span>{resp.nombre} ({resp.iniciales})</span>
        </div>
      )}
      <div className="hovercard__row">
        <span>Fecha comprometida original</span>
        <span>{tarea.fechaOriginal ? formatoFecha(tarea.fechaOriginal) : 'Sin fecha aun'}</span>
      </div>
      <div className="hovercard__row">
        <span>Fecha vigente</span>
        <span>{tarea.fechaObjetivo ? formatoFecha(tarea.fechaObjetivo) : 'Sin fecha aun'}</span>
      </div>
      <div className="hovercard__hist">
        <div className="hovercard__hist-title">
          {hist.length === 0
            ? 'Sin replanificaciones'
            : `Se movio ${hist.length} ${hist.length === 1 ? 'vez' : 'veces'}`}
        </div>
        {cadena.length > 0 && (
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
        )}
        {/* Punto 1: el dia real del marcado es solo un registro historico;
            la marca vive en la ultima fecha planificada. */}
        {tarea.hecha && tarea.fechaReal && (
          <div className="hovercard__marcada">Se marco lista el {formatoFecha(tarea.fechaReal)}</div>
        )}
      </div>
    </>
  )
}
