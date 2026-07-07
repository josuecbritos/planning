import { useEffect } from 'react'
import type { AppState, Tarea } from '../types'
import type { Actions } from '../App'
import { etiquetaLarga } from '../lib/dates'
import { colorTarea, estadoDerivado, hechaTarde, historialDe } from '../lib/derive'

// Panel lateral de detalle (7.2, era backlog en v3.1): click sobre una tarea
// o una marca abre este panel con el detalle completo, el historial y las
// acciones operativas (solo admin).

interface Props {
  state: AppState
  tarea: Tarea
  hoy: string
  puedeEditar: boolean
  actions: Actions
  onClose: () => void
}

const ESTADO_TEXTO: Record<string, string> = {
  verde: 'Hecha',
  rojo: 'No se cumplio — replanificar',
  ambar: 'Replanificada, sigue abierta',
  ninguno: 'En curso',
}

export function TaskPanel({ state, tarea, hoy, puedeEditar, actions, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const color = colorTarea(state, tarea, hoy)
  const est = estadoDerivado(tarea, hoy)
  const hist = historialDe(state, tarea.id)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)
  const sub = state.subFrentes.find((sf) => sf.id === tarea.subFrenteId)
  const frente = state.frentes.find((f) => f.id === sub?.frenteId)
  const tarde = hechaTarde(tarea)

  const cadena: string[] = [tarea.fechaOriginal, ...hist.map((h) => h.fechaNueva)]

  return (
    <aside className="panel-detalle">
      <div className="panel-detalle__head">
        <span className={`hovercard__estado hc-estado--${color}`}>
          {tarea.archivada ? 'Archivada' : ESTADO_TEXTO[color]}
        </span>
        <button className="modal-x" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      <h3 className="panel-detalle__titulo">{tarea.titulo}</h3>
      <p className="panel-detalle__ruta">
        {frente?.nombre} › {sub?.nombre}
      </p>

      {tarea.descripcion && <p className="panel-detalle__desc">{tarea.descripcion}</p>}

      <dl className="panel-detalle__datos">
        {resp && (
          <>
            <dt>Responsable</dt>
            <dd><span className="resp-badge">{resp.iniciales}</span> {resp.nombre}</dd>
          </>
        )}
        <dt>Fecha comprometida original</dt>
        <dd>{etiquetaLarga(tarea.fechaOriginal)}</dd>
        <dt>Fecha vigente</dt>
        <dd className={est === 'vencida' ? 'fecha-vencida' : ''}>{etiquetaLarga(tarea.fechaObjetivo)}</dd>
        {tarea.hecha && tarea.fechaReal && (
          <>
            <dt>Fecha real de termino</dt>
            <dd className={tarde ? 'fecha-tarde' : ''}>
              {etiquetaLarga(tarea.fechaReal)}{tarde ? ' (tarde)' : ''}
            </dd>
          </>
        )}
      </dl>

      <div className="panel-detalle__hist">
        <h4>
          {hist.length === 0
            ? 'Sin replanificaciones'
            : `Se movio ${hist.length} ${hist.length === 1 ? 'vez' : 'veces'}`}
        </h4>
        <ol className="panel-detalle__cadena">
          {cadena.map((f, i) => {
            const esVigente = i === cadena.length - 1
            const registro = i > 0 ? hist[i - 1] : null
            const autor = registro
              ? state.usuarios.find((u) => u.id === registro.cambiadoPor)
              : null
            return (
              <li key={i} className={esVigente ? 'vigente' : 'pasada'}>
                <span className="fecha-cadena">{etiquetaLarga(f)}</span>
                <small>
                  {i === 0
                    ? 'Compromiso inicial'
                    : `Replanificacion ${i}${autor ? ` · ${autor.iniciales}` : ''}`}
                  {esVigente && i > 0 ? ' · vigente' : ''}
                </small>
              </li>
            )
          })}
        </ol>
      </div>

      {tarea.comentarios && (
        <div className="panel-detalle__comentarios">
          <h4>Comentarios</h4>
          <p>{tarea.comentarios}</p>
        </div>
      )}

      {puedeEditar && (
        <div className="panel-detalle__acciones">
          {!tarea.archivada && (
            <>
              <label className="panel-accion">
                <input
                  className="chk"
                  type="checkbox"
                  checked={tarea.hecha}
                  onChange={() => actions.toggleHecha(tarea.id, !tarea.hecha)}
                />
                Hecha
              </label>
              <label className="panel-accion">
                Replanificar a
                <input
                  className="fecha-input panel-accion__fecha"
                  type="date"
                  value={tarea.fechaObjetivo}
                  onChange={(e) => e.target.value && actions.cambiarFechaObjetivo(tarea.id, e.target.value)}
                />
              </label>
              <button
                className="btn"
                title="Cancelar la tarea: sale del plan y conserva su historial"
                onClick={() => {
                  if (confirm(`¿Archivar la tarea "${tarea.titulo}"? Sale del plan y conserva su historial.`)) {
                    actions.updateTarea(tarea.id, { archivada: true })
                  }
                }}
              >
                Archivar (cancelar)
              </button>
            </>
          )}
          {tarea.archivada && (
            <button className="btn btn--primary" onClick={() => actions.updateTarea(tarea.id, { archivada: false })}>
              Restaurar al plan
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
