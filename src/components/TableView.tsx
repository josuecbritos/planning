import type { AppState, Frente, SubFrente, Tarea } from '../types'
import type { FrenteSel } from '../App'
import { colorTarea, estadoDerivado, hechaTarde } from '../lib/derive'
import { cmp, etiquetaCorta } from '../lib/dates'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'

// Vista Tabla tipo Monday (4.2 / 7.2). Cada Frente es una pagina; dentro, cada
// Sub Frente es una tabla independiente.

interface Props {
  state: AppState
  frenteSel: FrenteSel
  hoy: string
  onToggleHecha: (tareaId: string) => void
  onCambiarFecha: (tareaId: string, nueva: string) => void
}

export function TableView({ state, frenteSel, hoy, onToggleHecha, onCambiarFecha }: Props) {
  const frentes = state.frentes
    .filter((f) => frenteSel === 'todos' || f.id === frenteSel)
    .sort((a, b) => a.orden - b.orden)

  return (
    <div className="tabla-wrap">
      {frentes.map((f) => (
        <FrentePagina
          key={f.id}
          frente={f}
          state={state}
          hoy={hoy}
          onToggleHecha={onToggleHecha}
          onCambiarFecha={onCambiarFecha}
        />
      ))}
    </div>
  )
}

function FrentePagina({
  frente,
  state,
  hoy,
  onToggleHecha,
  onCambiarFecha,
}: {
  frente: Frente
  state: AppState
  hoy: string
  onToggleHecha: (id: string) => void
  onCambiarFecha: (id: string, nueva: string) => void
}) {
  const subs = state.subFrentes
    .filter((sf) => sf.frenteId === frente.id)
    .sort((a, b) => a.orden - b.orden)

  return (
    <section>
      <h2 className="frente-titulo">{frente.nombre}</h2>
      {subs.map((sf) => (
        <SubFrenteTabla
          key={sf.id}
          sub={sf}
          state={state}
          hoy={hoy}
          onToggleHecha={onToggleHecha}
          onCambiarFecha={onCambiarFecha}
        />
      ))}
    </section>
  )
}

function SubFrenteTabla({
  sub,
  state,
  hoy,
  onToggleHecha,
  onCambiarFecha,
}: {
  sub: SubFrente
  state: AppState
  hoy: string
  onToggleHecha: (id: string) => void
  onCambiarFecha: (id: string, nueva: string) => void
}) {
  const tareas = state.tareas
    .filter((t) => t.subFrenteId === sub.id)
    .sort((a, b) => a.orden - b.orden)

  return (
    <div className="subfrente">
      <div className="subfrente__titulo">
        {sub.nombre} <span className="subfrente__count">· {tareas.length} tareas</span>
      </div>
      <table className="tareas">
        <thead>
          <tr>
            <th className="col-check">Hecha</th>
            <th>Tarea</th>
            <th className="col-resp">Resp.</th>
            <th className="col-fecha">F. original</th>
            <th className="col-fecha">F. objetivo</th>
            <th className="col-fecha">F. real</th>
          </tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <TareaFila
              key={t.id}
              tarea={t}
              state={state}
              hoy={hoy}
              onToggleHecha={onToggleHecha}
              onCambiarFecha={onCambiarFecha}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TareaFila({
  tarea,
  state,
  hoy,
  onToggleHecha,
  onCambiarFecha,
}: {
  tarea: Tarea
  state: AppState
  hoy: string
  onToggleHecha: (id: string) => void
  onCambiarFecha: (id: string, nueva: string) => void
}) {
  const color = colorTarea(state, tarea, hoy)
  const est = estadoDerivado(tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)
  const tarde = hechaTarde(tarea)

  return (
    <tr>
      <td className="col-check">
        <input
          className="chk"
          type="checkbox"
          checked={tarea.hecha}
          onChange={() => onToggleHecha(tarea.id)}
          aria-label={`Marcar hecha: ${tarea.titulo}`}
        />
      </td>

      <td className={`tarea-cell tarea-cell--${color}`}>
        <HoverCard card={<TaskDetail state={state} tarea={tarea} hoy={hoy} />}>
          <span className="tarea-cell__row">
            {est === 'hecha' && <span className="tarea-cell__mark mk-verde">✓</span>}
            {tarea.titulo}
          </span>
        </HoverCard>
      </td>

      <td className="col-resp">
        {resp && (
          <span className="resp-badge" title={resp.nombre}>
            {resp.iniciales}
          </span>
        )}
      </td>

      <td className="col-fecha">{etiquetaCorta(tarea.fechaOriginal)}</td>

      <td className={`col-fecha${est === 'vencida' ? ' fecha-vencida' : ''}`}>
        <input
          className="fecha-input"
          type="date"
          value={tarea.fechaObjetivo}
          onChange={(e) => e.target.value && onCambiarFecha(tarea.id, e.target.value)}
          aria-label={`Fecha objetivo: ${tarea.titulo}`}
        />
        {est === 'vencida' && <span className="replanificar-tag">Replanificar →</span>}
      </td>

      <td className="col-fecha">
        {tarea.fechaReal ? (
          <span className={tarde && cmp(tarea.fechaReal, tarea.fechaObjetivo) > 0 ? 'fecha-tarde' : ''}>
            {etiquetaCorta(tarea.fechaReal)}
            {tarde && ' (tarde)'}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}
