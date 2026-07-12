import { useRef, useState } from 'react'
import type { AppState, Frente, SubFrente, Tarea, Usuario } from '../types'
import type { Actions, FrenteSel } from '../App'
import { colorTarea, estadoDerivado, hechaTarde } from '../lib/derive'
import { cmp, formatoFecha } from '../lib/dates'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { InlineText } from './InlineText'
import { FechaEditable } from './FechaEditable'

// Vista Tabla tipo Monday (4.2 / 7.2) con interaccion inline (Bloque 2):
// crear y editar pasa en la fila, sin formularios ni ventanas emergentes.

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  /** false para el rol Cliente: misma vista, sin ninguna accion de edicion. */
  puedeEditar: boolean
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
}

export function TableView({ state, proyectoId, frenteSel, hoy, puedeEditar, actions, onAbrirTarea }: Props) {
  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
    .sort((a, b) => a.orden - b.orden)

  return (
    <div className="tabla-wrap">
      {frentes.map((f) => (
        <FrentePagina
          key={f.id}
          frente={f}
          state={state}
          hoy={hoy}
          puedeEditar={puedeEditar}
          actions={actions}
          onAbrirTarea={onAbrirTarea}
        />
      ))}
      {frentes.length === 0 && (
        <p className="vacio-inline">Este proyecto aun no tiene frentes. Crea uno desde la barra lateral.</p>
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
  onAbrirTarea,
}: {
  frente: Frente
  state: AppState
  hoy: string
  puedeEditar: boolean
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const subs = state.subFrentes
    .filter((sf) => sf.frenteId === frente.id)
    .sort((a, b) => a.orden - b.orden)

  return (
    <section>
      <div className="frente-cabecera">
        <h2 className="frente-titulo">{frente.nombre}</h2>
      </div>
      {subs.map((sf) => (
        <SubFrenteTabla
          key={sf.id}
          sub={sf}
          state={state}
          hoy={hoy}
          puedeEditar={puedeEditar}
          actions={actions}
          onAbrirTarea={onAbrirTarea}
        />
      ))}
      {subs.length === 0 && <p className="vacio-inline">Sin sub frentes en este frente.</p>}
      {puedeEditar && <NuevoSubFrenteInline frenteId={frente.id} actions={actions} />}
    </section>
  )
}

/** N2: crear sub frente escribiendo el nombre directo, sin ventana. */
function NuevoSubFrenteInline({ frenteId, actions }: { frenteId: string; actions: Actions }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')

  function crear() {
    const limpio = nombre.trim()
    if (limpio) {
      actions.createSubFrente({ frenteId, nombre: limpio })
      setNombre('')
      // queda abierto por si quiere encadenar otro sub frente
    }
  }

  if (!editando) {
    return (
      <button className="btn btn--ghost subfrente-add" onClick={() => setEditando(true)}>
        + Sub Frente
      </button>
    )
  }

  return (
    <div className="subfrente subfrente--nuevo">
      <div className="subfrente__titulo">
        <input
          className="inline-input inline-input--subfrente"
          autoFocus
          placeholder="Nombre del nuevo sub frente… (Enter crea, Esc cierra)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') crear()
            if (e.key === 'Escape') {
              setNombre('')
              setEditando(false)
            }
          }}
          onBlur={() => {
            crear()
            setEditando(false)
          }}
        />
      </div>
    </div>
  )
}

function SubFrenteTabla({
  sub,
  state,
  hoy,
  puedeEditar,
  actions,
  onAbrirTarea,
}: {
  sub: SubFrente
  state: AppState
  hoy: string
  puedeEditar: boolean
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const todas = state.tareas
    .filter((t) => t.subFrenteId === sub.id)
    .sort((a, b) => a.orden - b.orden)
  // Las archivadas (canceladas, 6.3) salen del plan; quedan consultables abajo.
  const tareas = todas.filter((t) => !t.archivada)
  const archivadas = todas.filter((t) => t.archivada)

  const admins = state.usuarios.filter((u) => u.rol === 'admin' && u.activo)

  return (
    <div className="subfrente">
      <div className="subfrente__titulo">
        <span>
          {puedeEditar ? (
            <InlineText
              valor={sub.nombre}
              onGuardar={(nombre) => actions.updateSubFrente(sub.id, { nombre })}
              ariaLabel={`Renombrar sub frente ${sub.nombre}`}
              inputClassName="inline-input--subfrente"
            />
          ) : (
            sub.nombre
          )}{' '}
          <span className="subfrente__count">· {tareas.length} tareas</span>
        </span>
        {puedeEditar && (
          <span className="subfrente__tools">
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
            <TareaFila
              key={t.id}
              tarea={t}
              state={state}
              hoy={hoy}
              admins={admins}
              puedeEditar={puedeEditar}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {puedeEditar && <NuevaTareaFila subFrenteId={sub.id} admins={admins} hoy={hoy} actions={actions} />}
        </tbody>
      </table>

      {archivadas.length > 0 && (
        <details className="archivadas">
          <summary>
            {archivadas.length} tarea{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'}
          </summary>
          <ul>
            {archivadas.map((t) => (
              <li key={t.id}>
                <button className="link-tarea" onClick={() => onAbrirTarea(t.id)}>{t.titulo}</button>
                {puedeEditar && (
                  <button
                    className="link-btn"
                    onClick={() => actions.updateTarea(t.id, { archivada: false })}
                  >
                    Restaurar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/**
 * N1: fila de creacion inline. Click en "+ Tarea" abre una fila vacia con el
 * cursor en el titulo; Enter guarda y deja lista la siguiente (encadena);
 * el foco fuera de la fila guarda si hay titulo; Escape cierra.
 */
function NuevaTareaFila({
  subFrenteId,
  admins,
  hoy,
  actions,
}: {
  subFrenteId: string
  admins: Usuario[]
  hoy: string
  actions: Actions
}) {
  const [activa, setActiva] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [fechaObjetivo, setFechaObjetivo] = useState(hoy)
  const filaRef = useRef<HTMLTableRowElement>(null)
  const tituloRef = useRef<HTMLInputElement>(null)

  function guardar(): boolean {
    const limpio = titulo.trim()
    if (!limpio || !fechaObjetivo) return false
    actions.createTarea({
      subFrenteId,
      titulo: limpio,
      responsableId: responsableId || undefined,
      fechaObjetivo,
    })
    // Encadena: limpia el titulo y conserva responsable/fecha como defaults.
    setTitulo('')
    tituloRef.current?.focus()
    return true
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      guardar()
    }
    if (e.key === 'Escape') {
      setTitulo('')
      setActiva(false)
    }
  }

  // Guarda (o cierra) cuando el foco sale de la fila completa.
  function onBlurFila() {
    setTimeout(() => {
      if (filaRef.current && !filaRef.current.contains(document.activeElement)) {
        const guardo = titulo.trim() ? guardar() : false
        if (!guardo) setActiva(false)
      }
    }, 0)
  }

  if (!activa) {
    return (
      <tr className="fila-add">
        <td colSpan={7}>
          <button className="btn btn--ghost" onClick={() => setActiva(true)}>
            + Tarea
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="fila-nueva" ref={filaRef} onBlur={onBlurFila} onKeyDown={onKeyDown}>
      <td className="col-check">
        <input className="chk" type="checkbox" disabled />
      </td>
      <td>
        <input
          ref={tituloRef}
          className="inline-input"
          autoFocus
          placeholder="Titulo de la tarea… (Enter guarda y encadena)"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          aria-label="Titulo de la nueva tarea"
        />
      </td>
      <td className="col-resp">
        <select
          className="resp-select"
          value={responsableId}
          onChange={(e) => setResponsableId(e.target.value)}
          aria-label="Responsable de la nueva tarea"
        >
          <option value="">—</option>
          {admins.map((u) => (
            <option key={u.id} value={u.id} title={u.nombre}>{u.iniciales}</option>
          ))}
        </select>
      </td>
      <td className="col-fecha mudo">{fechaObjetivo ? formatoFecha(fechaObjetivo) : '—'}</td>
      <td className="col-fecha">
        <input
          className="fecha-input"
          type="date"
          value={fechaObjetivo}
          onChange={(e) => setFechaObjetivo(e.target.value)}
          aria-label="Fecha objetivo de la nueva tarea"
        />
      </td>
      <td className="col-fecha mudo">—</td>
      <td className="col-acc">
        <button className="icon-btn" title="Guardar (Enter)" onMouseDown={(e) => e.preventDefault()} onClick={guardar}>✓</button>
        <button className="icon-btn" title="Cerrar (Esc)" onMouseDown={(e) => e.preventDefault()} onClick={() => { setTitulo(''); setActiva(false) }}>✕</button>
      </td>
    </tr>
  )
}

function TareaFila({
  tarea,
  state,
  hoy,
  admins,
  puedeEditar,
  actions,
  onAbrirTarea,
}: {
  tarea: Tarea
  state: AppState
  hoy: string
  admins: Usuario[]
  puedeEditar: boolean
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const color = colorTarea(state, tarea, hoy)
  const est = estadoDerivado(tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)
  const tarde = hechaTarde(tarea)
  const nComentarios = state.comentarios.filter((c) => c.tareaId === tarea.id).length

  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

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
        <span className="tarea-cell__row">
          {est === 'hecha' && <span className="tarea-cell__mark mk-verde">✓</span>}
          {puedeEditar ? (
            // N3: click en el titulo lo edita en el lugar (el detalle vive en ⓘ).
            <InlineText
              valor={tarea.titulo}
              onGuardar={(titulo) => actions.updateTarea(tarea.id, { titulo })}
              ariaLabel={`Editar titulo: ${tarea.titulo}`}
              wrapDisplay={(nodo) => <HoverCard card={tooltip}>{nodo}</HoverCard>}
            />
          ) : (
            <HoverCard card={tooltip}>
              <span
                className="tarea-cell__link"
                role="button"
                tabIndex={0}
                onClick={() => onAbrirTarea(tarea.id)}
                onKeyDown={(e) => e.key === 'Enter' && onAbrirTarea(tarea.id)}
              >
                {tarea.titulo}
              </span>
            </HoverCard>
          )}
          {nComentarios > 0 && (
            <button
              className="comentarios-chip"
              title={`${nComentarios} comentario${nComentarios === 1 ? '' : 's'}`}
              onClick={() => onAbrirTarea(tarea.id)}
            >
              💬{nComentarios}
            </button>
          )}
        </span>
      </td>

      <td className="col-resp">
        {puedeEditar ? (
          // N3: el selector se despliega directo en la celda, sin formulario.
          <select
            className="resp-select"
            value={tarea.responsableId ?? ''}
            title={resp?.nombre ?? 'Sin asignar'}
            onChange={(e) => actions.updateTarea(tarea.id, { responsableId: e.target.value || undefined })}
            aria-label={`Responsable: ${tarea.titulo}`}
          >
            <option value="">—</option>
            {admins.map((u) => (
              <option key={u.id} value={u.id} title={u.nombre}>{u.iniciales}</option>
            ))}
          </select>
        ) : (
          resp && <span className="resp-badge" title={resp.nombre}>{resp.iniciales}</span>
        )}
      </td>

      <td className="col-fecha">{formatoFecha(tarea.fechaOriginal)}</td>

      <td className={`col-fecha${est === 'vencida' ? ' fecha-vencida' : ''}`}>
        {puedeEditar ? (
          <FechaEditable
            valor={tarea.fechaObjetivo}
            onCambiar={(nueva) => actions.cambiarFechaObjetivo(tarea.id, nueva)}
            ariaLabel={`Fecha objetivo: ${tarea.titulo}`}
          />
        ) : (
          formatoFecha(tarea.fechaObjetivo)
        )}
        {est === 'vencida' && <span className="tag-atrasada">Atrasada</span>}
      </td>

      <td className="col-fecha">
        {tarea.fechaReal ? (
          <span className={tarde && cmp(tarea.fechaReal, tarea.fechaObjetivo) > 0 ? 'fecha-tarde' : ''}>
            {formatoFecha(tarea.fechaReal)}
            {tarde && ' (tarde)'}
          </span>
        ) : (
          '—'
        )}
      </td>

      {puedeEditar && (
        <td className="col-acc">
          <button className="icon-btn" title="Detalle e historial" onClick={() => onAbrirTarea(tarea.id)}>ⓘ</button>
          <button
            className="icon-btn"
            title="Archivar (cancelar): sale del plan y conserva su historial"
            onClick={() => { if (confirm(`¿Archivar la tarea "${tarea.titulo}"? Sale del plan y conserva su historial.`)) actions.updateTarea(tarea.id, { archivada: true }) }}
          >⤵</button>
          <button
            className="icon-btn"
            title="Eliminar tarea (definitivo)"
            onClick={() => { if (confirm(`¿Eliminar definitivamente la tarea "${tarea.titulo}"? Se pierde su historial; si solo quieres cancelarla, usa Archivar.`)) actions.deleteTarea(tarea.id) }}
          >🗑</button>
        </td>
      )}
    </tr>
  )
}
