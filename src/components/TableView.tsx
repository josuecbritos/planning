import { useEffect, useMemo, useRef, useState } from 'react'
import { ordenarMulti, valorOrden, type CampoOrden, type OrdenMulti } from '../lib/orden'
import { useVistaCongelada } from '../lib/vistaCongelada'
import type { AppState, Frente, SubFrente, Tarea, Usuario } from '../types'
import type { Actions, FrenteSel } from '../App'
import type { Can } from '../lib/permisos'
import { CATEGORIA_LABEL, categoriaDe, colorTarea, esAtrasada, nReplanificaciones, textoAtraso } from '../lib/derive'
import { filtroVacio, pasaFiltroCompleto, type Filtro } from '../lib/filtros'
import { formatoFecha } from '../lib/dates'
import { EmptyFrentes } from './EmptyFrentes'
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
  /** P1: nonce que fuerza el re-snapshot de la vista congelada ("Actualizar"). */
  snapshotNonce: number
  /** P1: informa si la foto quedó desactualizada (para "Actualizar vista"). */
  onStale: (stale: boolean) => void
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
  /** #137: tarea a resaltar al llegar desde una notificación (scroll + realce). */
  resaltarTareaId?: string | null
  /** #137: se llama cuando el realce ya se mostró (para bajar el estado). */
  onResaltado?: () => void
}

export function TableView({ state, proyectoId, frenteSel, hoy, can, filtro, orden, snapshotNonce, onStale, actions, onAbrirTarea, resaltarTareaId, onResaltado }: Props) {
  const filtrando = !filtroVacio(filtro)
  // P1: la vista se congela cuando hay filtro y/u orden activo.
  const activo = filtrando || orden.length > 0
  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
    .sort((a, b) => a.orden - b.orden)

  // #142: colapso momentáneo (no persistente) de frentes y sub frentes. En
  // vista "Todos" colapsan ambos niveles; en una vista de un solo frente solo
  // colapsan los sub frentes. El encabezado se mantiene: solo se ocultan el
  // chevron y las tareas debajo.
  const [frentesCol, setFrentesCol] = useState<Set<string>>(new Set())
  const [subsCol, setSubsCol] = useState<Set<string>>(new Set())
  const frenteColapsable = frenteSel === 'todos'
  const toggleFrente = (id: string) =>
    setFrentesCol((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleSub = (id: string) =>
    setSubsCol((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // Candidatos a responsable: admins, el dueño y quienes tienen acceso.
  const candidatos = state.usuarios.filter(
    (u) =>
      u.activo &&
      (u.rol === 'admin' ||
        state.proyectos.some((p) => p.id === proyectoId && p.duenoId === u.id) ||
        state.accesos.some((a) => a.usuarioId === u.id && a.proyectoId === proyectoId)),
  )

  // P1: lista FRESCA de ids (filtro+orden aplicados ahora) y existentes del
  // scope, recorriendo frentes→subs→tareas igual que el render. La foto se
  // toma de aquí y se compara contra esto para saber si está desactualizada.
  const { frescoIds, existentesIds } = useMemo(() => {
    const fresco: string[] = []
    const existentes: string[] = []
    for (const f of frentes) {
      const subs = state.subFrentes.filter((sf) => sf.frenteId === f.id).sort((a, b) => a.orden - b.orden)
      for (const sf of subs) {
        const todas = state.tareas
          .filter((t) => t.subFrenteId === sf.id && !t.archivada)
          .sort((a, b) => a.orden - b.orden)
        for (const t of todas) existentes.push(t.id)
        const visibles = todas.filter((t) => !filtrando || pasaFiltroCompleto(state, t, filtro, hoy))
        const ordenadas = ordenarMulti(visibles, orden, (t, campo) =>
          valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
        )
        for (const t of ordenadas) fresco.push(t.id)
      }
    }
    return { frescoIds: fresco, existentesIds: existentes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, proyectoId, frenteSel, filtrando, filtro, orden, hoy])

  const firma = JSON.stringify([proyectoId, frenteSel, filtro, orden, snapshotNonce])
  const { congelada, visibleIds, indice, stale } = useVistaCongelada(frescoIds, existentesIds, activo, firma)

  // #137: ¿la tarea a resaltar queda FUERA de la vista actual (por filtro o por
  // la foto congelada)? Si es del proyecto pero no se muestra, se fuerza su
  // aparición y se marca la vista como desactualizada ("Actualizar vista").
  const resaltadaExcluida = useMemo(() => {
    if (!resaltarTareaId) return false
    const t = state.tareas.find((x) => x.id === resaltarTareaId)
    if (!t || t.archivada) return false
    const sf = state.subFrentes.find((x) => x.id === t.subFrenteId)
    const fr = sf && state.frentes.find((x) => x.id === sf.frenteId)
    if (!fr || fr.proyectoId !== proyectoId) return false
    const enVista = congelada ? visibleIds.has(t.id) : !filtrando || pasaFiltroCompleto(state, t, filtro, hoy)
    return !enVista
  }, [resaltarTareaId, state, proyectoId, congelada, visibleIds, filtrando, filtro, hoy])
  const forzarId = resaltadaExcluida ? resaltarTareaId ?? null : null

  useEffect(() => onStale(stale || resaltadaExcluida), [stale, resaltadaExcluida, onStale])

  // #137: al llegar desde una notificación, asegura que el frente y el sub
  // frente de la tarea estén expandidos para poder verla.
  useEffect(() => {
    if (!resaltarTareaId) return
    const t = state.tareas.find((x) => x.id === resaltarTareaId)
    const sf = t && state.subFrentes.find((x) => x.id === t.subFrenteId)
    const fr = sf && state.frentes.find((x) => x.id === sf.frenteId)
    if (sf) setSubsCol((prev) => (prev.has(sf.id) ? new Set([...prev].filter((x) => x !== sf.id)) : prev))
    if (fr) setFrentesCol((prev) => (prev.has(fr.id) ? new Set([...prev].filter((x) => x !== fr.id)) : prev))
  }, [resaltarTareaId, state])

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
          congelada={congelada}
          visibleIds={visibleIds}
          indice={indice}
          forzarId={forzarId}
          resaltarTareaId={resaltarTareaId}
          onResaltado={onResaltado}
          colapsado={frentesCol.has(f.id)}
          colapsable={frenteColapsable}
          onToggleColapso={() => toggleFrente(f.id)}
          subsCol={subsCol}
          onToggleSub={toggleSub}
          actions={actions}
          onAbrirTarea={onAbrirTarea}
        />
      ))}
      {frentes.length === 0 && (
        <EmptyFrentes proyectoId={proyectoId} puedeCrear={can.crearFrentes} actions={actions} />
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
  congelada,
  visibleIds,
  indice,
  forzarId,
  resaltarTareaId,
  onResaltado,
  colapsado,
  colapsable,
  onToggleColapso,
  subsCol,
  onToggleSub,
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
  congelada: boolean
  visibleIds: Set<string>
  indice: Map<string, number>
  forzarId: string | null
  resaltarTareaId?: string | null
  onResaltado?: () => void
  colapsado: boolean
  colapsable: boolean
  onToggleColapso: () => void
  subsCol: Set<string>
  onToggleSub: (id: string) => void
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const subs = state.subFrentes
    .filter((sf) => sf.frenteId === frente.id)
    .sort((a, b) => a.orden - b.orden)

  // Con filtro activo, los contenedores sin coincidencias se omiten. La foto
  // congelada manda: un sub muestra las tareas de su foto (aunque una edición
  // las haya sacado del filtro); se omite solo si su foto quedó vacía. #137: el
  // sub que contiene la tarea forzada nunca se omite.
  const coincidencias = (subId: string) =>
    (forzarId && state.tareas.some((t) => t.subFrenteId === subId && t.id === forzarId)) ||
    (congelada
      ? state.tareas.some((t) => t.subFrenteId === subId && visibleIds.has(t.id))
      : state.tareas.some(
          (t) => t.subFrenteId === subId && !t.archivada && pasaFiltroCompleto(state, t, filtro, hoy),
        ))
  const subsVisibles = filtrando ? subs.filter((sf) => coincidencias(sf.id)) : subs
  if (filtrando && subsVisibles.length === 0) return null

  return (
    <section>
      {/* #142: en vista "Todos" el frente colapsa; su encabezado no cambia,
          solo se antepone el chevron y se ocultan los sub frentes. */}
      <div className="frente-cabecera">
        {colapsable && (
          <button
            className="colapso-btn"
            aria-expanded={!colapsado}
            aria-label={colapsado ? `Expandir ${frente.nombre}` : `Colapsar ${frente.nombre}`}
            onClick={onToggleColapso}
          >
            {colapsado ? '▸' : '▾'}
          </button>
        )}
        <h2 className="frente-titulo">{frente.nombre}</h2>
      </div>
      {!colapsado && (
        <>
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
              congelada={congelada}
              visibleIds={visibleIds}
              indice={indice}
              forzarId={forzarId}
              resaltarTareaId={resaltarTareaId}
              onResaltado={onResaltado}
              colapsado={subsCol.has(sf.id)}
              onToggleColapso={() => onToggleSub(sf.id)}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {subs.length === 0 && <p className="vacio-inline">Sin sub frentes en este frente.</p>}
          {can.crearSubFrentes && !filtrando && <NuevoSubFrenteInline frenteId={frente.id} actions={actions} />}
        </>
      )}
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
  congelada,
  visibleIds,
  indice,
  forzarId,
  resaltarTareaId,
  onResaltado,
  colapsado,
  onToggleColapso,
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
  congelada: boolean
  visibleIds: Set<string>
  indice: Map<string, number>
  forzarId: string | null
  resaltarTareaId?: string | null
  onResaltado?: () => void
  colapsado: boolean
  onToggleColapso: () => void
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const todas = state.tareas
    .filter((t) => t.subFrenteId === sub.id)
    .sort((a, b) => a.orden - b.orden)
  // P1: con la vista congelada, se muestran EXACTAMENTE las tareas de la foto
  // (membresía + orden congelados): editar una tarea no la saca ni la reordena.
  // Sin congelar (vista live), se filtra y ordena en vivo.
  let tareas = congelada
    ? todas
        .filter((t) => visibleIds.has(t.id))
        .sort((a, b) => (indice.get(a.id) ?? 0) - (indice.get(b.id) ?? 0))
    : ordenarMulti(
        todas.filter((t) => !t.archivada && (!filtrando || pasaFiltroCompleto(state, t, filtro, hoy))),
        orden,
        (t, campo) => valorOrden(state, t, campo as Exclude<CampoOrden, 'proyecto'>, hoy),
      )
  // #137: la tarea forzada (excluida por el filtro/foto) se inserta igual para
  // poder resaltarla; el aviso "Actualizar vista" ya está activo.
  if (forzarId && !tareas.some((t) => t.id === forzarId)) {
    const extra = todas.find((t) => t.id === forzarId)
    if (extra) tareas = [...tareas, extra]
  }
  const archivadas = filtrando ? [] : todas.filter((t) => t.archivada)

  return (
    <div className="subfrente">
      {/* #142: chevron para colapsar el sub frente; su fila-título no cambia,
          solo se antepone el chevron y se oculta la tabla de tareas. */}
      <div className="subfrente__titulo">
        <span>
          <button
            className="colapso-btn"
            aria-expanded={!colapsado}
            aria-label={colapsado ? `Expandir ${sub.nombre}` : `Colapsar ${sub.nombre}`}
            onClick={onToggleColapso}
          >
            {colapsado ? '▸' : '▾'}
          </button>{' '}
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
      {!colapsado && (
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
            {/* Atraso (días hábiles corridos hacia adelante). En mobile se
                oculta (5 columnas), igual que hacía col-orig. */}
            <th className="col-desv">Atraso</th>
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
              resaltar={t.id === resaltarTareaId}
              onResaltado={onResaltado}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {can.crearTareas && !filtrando && (
            <NuevaTareaFila subFrenteId={sub.id} candidatos={candidatos} actions={actions} />
          )}
        </tbody>
      </table>
      )}

      {!colapsado && archivadas.length > 0 && (
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
          placeholder="Título de la tarea… (Enter guarda y encadena)"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          aria-label="Título de la nueva tarea"
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
  resaltar,
  onResaltado,
  actions,
  onAbrirTarea,
}: {
  tarea: Tarea
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  resaltar?: boolean
  onResaltado?: () => void
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const cat = categoriaDe(state, tarea, hoy)
  const color = colorTarea(state, tarea, hoy)
  const resp = state.usuarios.find((u) => u.id === tarea.responsableId)
  const nComentarios = state.comentarios.filter((c) => c.tareaId === tarea.id).length
  const nReplan = nReplanificaciones(state, tarea.id)

  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

  // #137: al resaltar (llegada desde una notificación), centra la fila y deja
  // el realce ~2.5 s; luego avisa para que el estado se baje.
  const filaRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (!resaltar) return
    filaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const id = setTimeout(() => onResaltado?.(), 2500)
    return () => clearTimeout(id)
  }, [resaltar, onResaltado])

  return (
    <tr ref={filaRef} className={`${color !== 'ninguno' ? `fila--${color}` : ''}${resaltar ? ' fila--resaltada' : ''}`.trim() || undefined}>
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
              ariaLabel={`Editar título: ${tarea.titulo}`}
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
            <span className="replan-count" title={`Se replanificó ${nReplan} ${nReplan === 1 ? 'vez' : 'veces'}`}>
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

      {/* Atraso: "N días" (hábiles) si se corrió hacia adelante, o "—".
          Mismo estilo que la fecha. Visible en desktop; en mobile se oculta. */}
      <td className="col-desv">{textoAtraso(tarea)}</td>

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
