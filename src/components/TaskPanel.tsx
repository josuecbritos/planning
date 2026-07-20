import { useEffect, useRef, useState } from 'react'
import type { AppState, Tarea } from '../types'
import type { Actions } from '../App'
import type { Can } from '../lib/permisos'
import { formatoFecha, formatoFechaHora } from '../lib/dates'
import { CATEGORIA_LABEL, categoriaDe, colorTarea, esAtrasada, historialDe } from '../lib/derive'
import { FechaEditable } from './FechaEditable'

// Panel lateral de detalle (7.2, era backlog en v3.1): click sobre una tarea
// o una marca abre este panel con el detalle completo, el historial y las
// acciones operativas (solo admin).

interface Props {
  state: AppState
  tarea: Tarea
  hoy: string
  can: Can
  actions: Actions
  onClose: () => void
}

export function TaskPanel({ state, tarea, hoy, can, actions, onClose }: Props) {
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Cerrar al hacer clic fuera del panel (además del botón ✕ y Escape). El
  // listener se difiere un tick para que el mismo clic que abre el panel no
  // lo cierre de inmediato; los clics DENTRO del panel no lo cierran.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) onClose()
    }
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const color = colorTarea(state, tarea, hoy)
  const cat = categoriaDe(state, tarea, hoy)
  const hist = historialDe(state, tarea.id)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)
  const sub = state.subFrentes.find((sf) => sf.id === tarea.subFrenteId)
  const frente = state.frentes.find((f) => f.id === sub?.frenteId)

  const cadena: string[] = tarea.fechaOriginal
    ? [tarea.fechaOriginal, ...hist.map((h) => h.fechaNueva)]
    : []

  return (
    <aside className="panel-detalle" ref={asideRef}>
      <div className="panel-detalle__head">
        <span className={`hovercard__estado hc-estado--${color}`}>
          {tarea.archivada ? 'Archivada' : CATEGORIA_LABEL[cat]}
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
        <dd>{tarea.fechaOriginal ? formatoFecha(tarea.fechaOriginal) : 'Sin fecha aún'}</dd>
        <dt>Fecha vigente</dt>
        <dd className={esAtrasada(cat) ? 'fecha-vencida' : ''}>
          {tarea.fechaObjetivo ? formatoFecha(tarea.fechaObjetivo) : 'Sin fecha aún'}
        </dd>
      </dl>

      <div className="panel-detalle__hist">
        <h4>
          {hist.length === 0
            ? 'Sin replanificaciones'
            : `Se movió ${hist.length} ${hist.length === 1 ? 'vez' : 'veces'}`}
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
                <span className="fecha-cadena">{formatoFecha(f)}</span>
                <small>
                  {i === 0
                    ? 'Compromiso inicial'
                    : `Replanificación ${i}${autor ? ` · ${autor.iniciales}` : ''}`}
                  {esVigente && i > 0 ? ' · vigente' : ''}
                </small>
              </li>
            )
          })}
          {/* Punto 1: el dia real del marcado vive SOLO en el historial;
              la marca queda en la ultima fecha planificada. */}
          {tarea.hecha && tarea.fechaReal && (
            <li className="marcada-lista">
              <span className="fecha-cadena">{formatoFecha(tarea.fechaReal)}</span>
              <small>Se marcó lista este día</small>
            </li>
          )}
        </ol>
      </div>

      {/* 3.3: TODOS los miembros pueden comentar, siempre (append-only). */}
      <Comentarios state={state} tarea={tarea} puedeComentar actions={actions} />

      {can.algunoDeTareas && (
        <div className="panel-detalle__acciones">
          {!tarea.archivada && (
            <>
              {can.marcarHechas(tarea) && (
                <label className="panel-accion">
                  <input
                    className="chk"
                    type="checkbox"
                    checked={tarea.hecha}
                    onChange={() => actions.toggleHecha(tarea.id, !tarea.hecha)}
                  />
                  Hecha
                </label>
              )}
              {can.editarFechas(tarea) && (
                <label className="panel-accion">
                  {tarea.fechaObjetivo ? 'Replanificar a' : 'Planificar para'}
                  <FechaEditable
                    valor={tarea.fechaObjetivo}
                    onCambiar={(nueva) => actions.cambiarFechaObjetivo(tarea.id, nueva)}
                    ariaLabel="Nueva fecha objetivo"
                  />
                </label>
              )}
              {can.archivarEliminar(tarea) && (
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
              )}
            </>
          )}
          {tarea.archivada && can.archivarEliminar(tarea) && (
            <button className="btn btn--primary" onClick={() => actions.updateTarea(tarea.id, { archivada: false })}>
              Restaurar al plan
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

/**
 * N5: hilo de comentarios acumulables. Cada comentario suma al historial
 * (con autor y fecha); no se sobrescriben ni se borran. Comentan los admins;
 * el cliente lee el hilo completo.
 */
function Comentarios({
  state,
  tarea,
  puedeComentar,
  actions,
}: {
  state: AppState
  tarea: Tarea
  puedeComentar: boolean
  actions: Actions
}) {
  const [texto, setTexto] = useState('')
  const hilo = state.comentarios
    .filter((c) => c.tareaId === tarea.id)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))

  function publicar() {
    const limpio = texto.trim()
    if (!limpio) return
    actions.addComentario(tarea.id, limpio)
    setTexto('')
  }

  return (
    <div className="panel-detalle__comentarios">
      <h4>Comentarios {hilo.length > 0 && `(${hilo.length})`}</h4>

      {hilo.length === 0 && <p className="comentario-vacio">Sin comentarios aún.</p>}

      <ul className="comentarios-hilo">
        {hilo.map((c) => {
          const autor = state.usuarios.find((u) => u.id === c.autorId)
          return (
            <li key={c.id} className="comentario">
              <div className="comentario__meta">
                {autor ? (
                  <>
                    <span className="resp-badge">{autor.iniciales}</span>
                    <b>{autor.nombre}</b>
                  </>
                ) : (
                  <b>—</b>
                )}
                <span className="comentario__fecha">{formatoFechaHora(c.timestamp)}</span>
              </div>
              <p className="comentario__texto">{c.texto}</p>
            </li>
          )
        })}
      </ul>

      {puedeComentar && (
        <div className="comentario-nuevo">
          <textarea
            rows={2}
            placeholder="Agregar un comentario… (se suma al hilo, no reemplaza)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) publicar()
            }}
          />
          <button className="btn btn--primary btn--sm" disabled={!texto.trim()} onClick={publicar}>
            Comentar
          </button>
        </div>
      )}
    </div>
  )
}
