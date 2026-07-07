import { useState } from 'react'
import type { AppState, Frente, SubFrente, Tarea } from '../types'
import type { Actions, FrenteSel } from '../App'
import { colorTarea, estadoDerivado, hechaTarde } from '../lib/derive'
import { cmp, etiquetaCorta } from '../lib/dates'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { TextPromptModal } from './TextPromptModal'
import { TareaModal } from './TareaModal'

// Vista Tabla tipo Monday (4.2 / 7.2) con CRUD de sub frentes y tareas.

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  /** false para el rol Cliente: misma vista, sin ninguna accion de edicion. */
  puedeEditar: boolean
  actions: Actions
}

type ModalState =
  | { tipo: 'sub-nuevo'; frenteId: string }
  | { tipo: 'sub-editar'; id: string; nombre: string }
  | { tipo: 'tarea-nueva'; subFrenteId: string }
  | { tipo: 'tarea-editar'; tarea: Tarea }
  | null

export function TableView({ state, proyectoId, frenteSel, hoy, puedeEditar, actions }: Props) {
  const [modal, setModal] = useState<ModalState>(null)

  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
    .sort((a, b) => a.orden - b.orden)

  return (
    <div className="tabla-wrap">
      {frentes.map((f) => (
        <FrentePagina key={f.id} frente={f} state={state} hoy={hoy} puedeEditar={puedeEditar} actions={actions} setModal={setModal} />
      ))}
      {frentes.length === 0 && (
        <p className="vacio-inline">Este proyecto aun no tiene frentes. Crea uno desde la barra lateral.</p>
      )}

      {modal?.tipo === 'sub-nuevo' && (
        <TextPromptModal
          titulo="Nuevo sub frente"
          label="Nombre del sub frente"
          textoBoton="Crear"
          onSubmit={(nombre) => actions.createSubFrente({ frenteId: modal.frenteId, nombre })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'sub-editar' && (
        <TextPromptModal
          titulo="Renombrar sub frente"
          label="Nombre del sub frente"
          valorInicial={modal.nombre}
          onSubmit={(nombre) => actions.updateSubFrente(modal.id, { nombre })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'tarea-nueva' && (
        <TareaModal
          usuarios={state.usuarios.filter((u) => u.rol === 'admin' && u.activo)}
          fechaSugerida={hoy}
          onSubmit={(d) =>
            actions.createTarea({
              subFrenteId: modal.subFrenteId,
              titulo: d.titulo,
              responsableId: d.responsableId,
              fechaObjetivo: d.fechaObjetivo,
              descripcion: d.descripcion,
              comentarios: d.comentarios,
            })
          }
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'tarea-editar' && (
        <TareaModal
          tarea={modal.tarea}
          usuarios={state.usuarios.filter((u) => u.rol === 'admin' && u.activo)}
          onSubmit={(d) =>
            actions.updateTarea(modal.tarea.id, {
              titulo: d.titulo,
              responsableId: d.responsableId,
              descripcion: d.descripcion,
              comentarios: d.comentarios,
            })
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function FrentePagina({
  frente,
  state,
  hoy,
  puedeEditar,
  actions,
  setModal,
}: {
  frente: Frente
  state: AppState
  hoy: string
  puedeEditar: boolean
  actions: Actions
  setModal: (m: ModalState) => void
}) {
  const subs = state.subFrentes
    .filter((sf) => sf.frenteId === frente.id)
    .sort((a, b) => a.orden - b.orden)

  return (
    <section>
      <div className="frente-cabecera">
        <h2 className="frente-titulo">{frente.nombre}</h2>
        {puedeEditar && (
          <button className="btn btn--sm" onClick={() => setModal({ tipo: 'sub-nuevo', frenteId: frente.id })}>
            + Sub Frente
          </button>
        )}
      </div>
      {subs.map((sf) => (
        <SubFrenteTabla key={sf.id} sub={sf} state={state} hoy={hoy} puedeEditar={puedeEditar} actions={actions} setModal={setModal} />
      ))}
      {subs.length === 0 && <p className="vacio-inline">Sin sub frentes en este frente.</p>}
    </section>
  )
}

function SubFrenteTabla({
  sub,
  state,
  hoy,
  puedeEditar,
  actions,
  setModal,
}: {
  sub: SubFrente
  state: AppState
  hoy: string
  puedeEditar: boolean
  actions: Actions
  setModal: (m: ModalState) => void
}) {
  const tareas = state.tareas
    .filter((t) => t.subFrenteId === sub.id)
    .sort((a, b) => a.orden - b.orden)

  return (
    <div className="subfrente">
      <div className="subfrente__titulo">
        <span>{sub.nombre} <span className="subfrente__count">· {tareas.length} tareas</span></span>
        {puedeEditar && (
          <span className="subfrente__tools">
            <button className="icon-btn" title="Renombrar" onClick={() => setModal({ tipo: 'sub-editar', id: sub.id, nombre: sub.nombre })}>✎</button>
            <button
              className="icon-btn"
              title="Eliminar sub frente"
              onClick={() => { if (confirm(`¿Eliminar el sub frente "${sub.nombre}" y sus tareas?`)) actions.deleteSubFrente(sub.id) }}
            >🗑</button>
          </span>
        )}
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
            {puedeEditar && <th className="col-acc"></th>}
          </tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <TareaFila key={t.id} tarea={t} state={state} hoy={hoy} puedeEditar={puedeEditar} actions={actions} setModal={setModal} />
          ))}
          {puedeEditar && (
            <tr className="fila-add">
              <td colSpan={7}>
                <button className="btn btn--ghost" onClick={() => setModal({ tipo: 'tarea-nueva', subFrenteId: sub.id })}>
                  + Tarea
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TareaFila({
  tarea,
  state,
  hoy,
  puedeEditar,
  actions,
  setModal,
}: {
  tarea: Tarea
  state: AppState
  hoy: string
  puedeEditar: boolean
  actions: Actions
  setModal: (m: ModalState) => void
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
          disabled={!puedeEditar}
          onChange={() => actions.toggleHecha(tarea.id, !tarea.hecha)}
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
        {resp && <span className="resp-badge" title={resp.nombre}>{resp.iniciales}</span>}
      </td>

      <td className="col-fecha">{etiquetaCorta(tarea.fechaOriginal)}</td>

      <td className={`col-fecha${est === 'vencida' ? ' fecha-vencida' : ''}`}>
        {puedeEditar ? (
          <input
            className="fecha-input"
            type="date"
            value={tarea.fechaObjetivo}
            onChange={(e) => e.target.value && actions.cambiarFechaObjetivo(tarea.id, e.target.value)}
            aria-label={`Fecha objetivo: ${tarea.titulo}`}
          />
        ) : (
          etiquetaCorta(tarea.fechaObjetivo)
        )}
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

      {puedeEditar && (
        <td className="col-acc">
          <button className="icon-btn" title="Editar tarea" onClick={() => setModal({ tipo: 'tarea-editar', tarea })}>✎</button>
          <button
            className="icon-btn"
            title="Eliminar tarea"
            onClick={() => { if (confirm(`¿Eliminar la tarea "${tarea.titulo}"?`)) actions.deleteTarea(tarea.id) }}
          >🗑</button>
        </td>
      )}
    </tr>
  )
}
