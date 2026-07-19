import { useRef, useState } from 'react'
import { ordenarMulti, valorOrden, type CampoOrden, type OrdenMulti } from '../lib/orden'
import type { AppState, Frente, SubFrente, Tarea, Usuario } from '../types'
import type { Actions, FrenteSel } from '../App'
import type { Can } from '../lib/permisos'
import { CATEGORIA_LABEL, categoriaDe, colorTarea, desviacionHabiles, esAtrasada, nReplanificaciones, textoDesviacion } from '../lib/derive'
import { filtroVacio, pasaFiltroCompleto, type Filtro } from '../lib/filtros'
import { formatoFecha } from '../lib/dates'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { InlineText } from './InlineText'
import { FechaEditable } from './FechaEditable'
import { Avatar, RespPicker } from './RespPicker'
import { CheckHecha } from './CheckHecha'

// Vista Tabla tipo Monday (4.2 / 7.2) con interaccion inline (Bloque 2):
// crear y editar pasa en la fila, sin formularios ni ventanas emergentes.

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  /** Permisos del usuario actual (§7): gobiernan cada control de la vista. */
  can: Can
  /** Filtro activo (punto 3): en la tabla filtran los tres campos. */
  filtro: Filtro
  /** Orden multinivel activo (punto 4): parte de la vista, por proyecto. */
  orden: OrdenMulti
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
}

export function TableView({ state, proyectoId, frenteSel, hoy, can, filtro, orden, actions, onAbrirTarea }: Props) {
  const filtrando = !filtroVacio(filtro)
  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
    .sort((a, b) => a.orden - b.orden)

  // Candidatos a responsable: admins + clientes con acceso a ESTE proyecto.
  const candidatos = state.usuarios.filter(
    (u) =>
      u.activo &&
      (u.rol === 'admin' ||
        state.accesos.some((a) => a.usuarioId === u.id && a.proyectoId === proyectoId)),
  )

  return (
    <div className="tabla-wrap">
      {frentes.map((f) => (
        <FrentePagina
          key={f.id}
          frente={f}
          state={state}
          hoy={hoy}
          candidatos={candidatos}
          can={can}
          filtro={filtro}
          filtrando={filtrando}
          orden={orden}
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
  candidatos,
  can,
  filtro,
  filtrando,
  orden,
  actions,
  onAbrirTarea,
}: {
  frente: Frente
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  filtro: Filtro
  filtrando: boolean
  orden: OrdenMulti
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const subs = state.subFrentes
    .filter((sf) => sf.frenteId === frente.id)
    .sort((a, b) => a.orden - b.orden)

  // Con filtro activo, los contenedores sin coincidencias se omiten.
  const coincidencias = (subId: string) =>
    state.tareas.filter(
      (t) => t.subFrenteId === subId && !t.archivada && pasaFiltroCompleto(state, t, filtro, hoy),
    ).length
  const subsVisibles = filtrando ? subs.filter((sf) => coincidencias(sf.id) > 0) : subs
  if (filtrando && subsVisibles.length === 0) return null

  return (
    <section>
      <div className="frente-cabecera">
        <h2 className="frente-titulo">{frente.nombre}</h2>
      </div>
      {subsVisibles.map((sf) => (
        <SubFrenteTabla
          key={sf.id}
          sub={sf}
          state={state}
          hoy={hoy}
          candidatos={candidatos}
          can={can}
          filtro={filtro}
          filtrando={filtrando}
          orden={orden}
          actions={actions}
          onAbrirTarea={onAbrirTarea}
        />
      ))}
      {subs.length === 0 && <p className="vacio-inline">Sin sub frentes en este frente.</p>}
      {can.crearSubFrentes && !filtrando && <NuevoSubFrenteInline frenteId={frente.id} actions={actions} />}
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
  candidatos,
  can,
  filtro,
  filtrando,
  orden,
  actions,
  onAbrirTarea,
}: {
  sub: SubFrente
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  filtro: Filtro
  filtrando: boolean
  orden: OrdenMulti
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const todas = state.tareas
    .filter((t) => t.subFrenteId === sub.id)
    .sort((a, b) => a.orden - b.orden)
  // Las archivadas (canceladas, 6.3) salen del plan; quedan consultables abajo.
  const visibles = todas.filter(
    (t) => !t.archivada && (!filtrando || pasaFiltroCompleto(state, t, filtro, hoy)),
  )
  // Punto 4: el orden multinivel se aplica DENTRO del sub frente (las tareas
  // no se mezclan entre sub frentes); sin reglas queda la secuencia manual.
  const tareas = ordenarMulti(visibles, orden, (t, campo) =>
    valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
  )
  const archivadas = filtrando ? [] : todas.filter((t) => t.archivada)

  return (
    <div className="subfrente">
      <div className="subfrente__titulo">
        <span>
          {can.editarEstructura ? (
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
        {can.editarEstructura && (
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
            {/* Orden de columnas: primero COMO ESTA la tarea (Estado junto al
                nombre), despues las fechas — la Objetivo es la operativa y
                la Original queda al final como referencia. El ordenamiento
                ya no es por clic aqui (punto 4): se maneja desde "Ordenar". */}
            <th className="col-check">Hecha</th>
            <th>Tarea</th>
            <th className="col-resp">Resp.</th>
            <th className="col-estado">Estado</th>
            <th className="col-fecha">Fecha Objetivo</th>
            {/* Desviación (punto 6): reemplaza Fecha Original. En mobile se
                oculta (5 columnas), igual que hacía col-orig. */}
            <th className="col-desv">Desviación</th>
            {can.algunoDeTareas && <th className="col-acc"></th>}
          </tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <TareaFila
              key={t.id}
              tarea={t}
              state={state}
              hoy={hoy}
              candidatos={candidatos}
              can={can}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {can.crearTareas && !filtrando && (
            <NuevaTareaFila subFrenteId={sub.id} candidatos={candidatos} actions={actions} />
          )}
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
                {can.archivarEliminar(t) && (
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
  candidatos,
  actions,
}: {
  subFrenteId: string
  candidatos: Usuario[]
  actions: Actions
}) {
  const [activa, setActiva] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [responsableId, setResponsableId] = useState('')
  // La tarea nace SIN FECHA (1.2): el campo parte en blanco; la primera fecha
  // que se le asigne fijara su compromiso inicial.
  const [fechaObjetivo, setFechaObjetivo] = useState('')
  const filaRef = useRef<HTMLTableRowElement>(null)
  const tituloRef = useRef<HTMLInputElement>(null)

  function guardar(): boolean {
    const limpio = titulo.trim()
    if (!limpio) return false
    actions.createTarea({
      subFrenteId,
      titulo: limpio,
      responsableId: responsableId || undefined,
      fechaObjetivo: fechaObjetivo || undefined,
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
        <RespPicker
          usuarios={candidatos}
          value={responsableId || undefined}
          onChange={(id) => setResponsableId(id ?? '')}
          ariaLabel="Responsable de la nueva tarea"
        />
      </td>
      <td className="col-estado mudo">—</td>
      <td className="col-fecha">
        <input
          className="fecha-input"
          type="date"
          value={fechaObjetivo}
          onChange={(e) => setFechaObjetivo(e.target.value)}
          aria-label="Fecha objetivo de la nueva tarea"
        />
      </td>
      <td className="col-desv mudo">—</td>
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
  candidatos,
  can,
  actions,
  onAbrirTarea,
}: {
  tarea: Tarea
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const cat = categoriaDe(state, tarea, hoy)
  const color = colorTarea(state, tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)
  const nComentarios = state.comentarios.filter((c) => c.tareaId === tarea.id).length
  const nReplan = nReplanificaciones(state, tarea.id)

  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

  return (
    <tr className={color !== 'ninguno' ? `fila--${color}` : undefined}>
      <td className="col-check">
        <CheckHecha
          hecha={tarea.hecha}
          disabled={!can.marcarHechas(tarea)}
          onToggle={() => actions.toggleHecha(tarea.id, !tarea.hecha)}
          ariaLabel={`Marcar hecha: ${tarea.titulo}`}
        />
      </td>

      <td className="tarea-cell">
        <span className="tarea-cell__row">
          {cat === 'hecha' && <span className="tarea-cell__mark mk-verde">✓</span>}
          {can.editarTareas(tarea) ? (
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
          {nReplan > 0 && (
            <span className="replan-count" title={`Se replanifico ${nReplan} ${nReplan === 1 ? 'vez' : 'veces'}`}>
              ↻ ×{nReplan}
            </span>
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
        {can.asignarResponsable(tarea) ? (
          // N3: el selector se despliega directo en la celda, sin formulario.
          <RespPicker
            usuarios={candidatos}
            value={tarea.responsableId}
            onChange={(id) => actions.updateTarea(tarea.id, { responsableId: id })}
            ariaLabel={`Responsable: ${tarea.titulo}`}
          />
        ) : (
          resp && <Avatar usuario={resp} />
        )}
      </td>

      {/* La categoria en texto refuerza el color de fila; va junto al
          nombre para el barrido visual (punto 5). */}
      <td className="col-estado">
        <span className={`estado-chip estado-chip--${color}`}>{CATEGORIA_LABEL[cat]}</span>
      </td>

      <td className={`col-fecha${esAtrasada(cat) ? ' fecha-vencida' : ''}`}>
        {can.editarFechas(tarea) ? (
          <FechaEditable
            valor={tarea.fechaObjetivo}
            onCambiar={(nueva) => actions.cambiarFechaObjetivo(tarea.id, nueva)}
            ariaLabel={`Fecha objetivo: ${tarea.titulo}`}
          />
        ) : (
          tarea.fechaObjetivo ? formatoFecha(tarea.fechaObjetivo) : '—'
        )}
      </td>

      {/* Desviación (punto 6): +N/-N días hábiles, o "—" si no se movió.
          Visible en desktop; en mobile se oculta. */}
      <td className={`col-desv${desviacionHabiles(tarea) ? ' col-desv--mov' : ''}`}>{textoDesviacion(tarea)}</td>

      {can.algunoDeTareas && (
        <td className="col-acc">
          <button className="icon-btn" data-tip="Información" aria-label="Información" onClick={() => onAbrirTarea(tarea.id)}>ⓘ</button>
          {can.archivarEliminar(tarea) && (
            <>
              <button
                className="icon-btn"
                data-tip="Archivar"
                aria-label="Archivar"
                onClick={() => { if (confirm(`¿Archivar la tarea "${tarea.titulo}"? Sale del plan y conserva su historial.`)) actions.updateTarea(tarea.id, { archivada: true }) }}
              >⤵</button>
              <button
                className="icon-btn"
                data-tip="Eliminar"
                aria-label="Eliminar"
                onClick={() => { if (confirm(`¿Eliminar definitivamente la tarea "${tarea.titulo}"? Se pierde su historial; si solo quieres cancelarla, usa Archivar.`)) actions.deleteTarea(tarea.id) }}
              >🗑</button>
            </>
          )}
        </td>
      )}
    </tr>
  )
}
