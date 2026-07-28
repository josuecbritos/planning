import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Proyecto, Tarea, Usuario } from '../types'
import type { Actions, Vista } from '../App'
import { makeCan, type Can } from '../lib/permisos'
import { cmp, formatoFecha } from '../lib/dates'
import {
  CATEGORIA_LABEL,
  categoriaDe,
  colorTarea,
  esAtrasada,
  nReplanificaciones,
  textoAtraso,
} from '../lib/derive'
import { filtroVacio, pasaFiltroCompleto, type Filtro } from '../lib/filtros'
import { CAMPOS_MIS_TAREAS, GRAVEDAD, ordenarMulti, valorOrden, type OrdenMulti } from '../lib/orden'
import { useVistaCongelada } from '../lib/vistaCongelada'
import { escribirVistaActiva, estadoInicial } from '../lib/vistas'
import { FiltrosBar } from './FiltrosBar'
import { GanttView } from './GanttView'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { CheckHecha } from './CheckHecha'
import { FechaEditable } from './FechaEditable'

// Mis Tareas (antes "Mi Panel"): unicamente las tareas donde el usuario es
// responsable, cruzando todos sus proyectos. Mismo formato que las demas
// tablas de la app (alto de fila, pills de estado, colores de fila) y el
// mismo sistema de filtros guardables — con campo Proyecto en vez de
// Responsable, y guardados propios de este contexto (no se mezclan con los
// de los proyectos).

interface Props {
  state: AppState
  usuario: Usuario
  proyectos: Proyecto[]
  hoy: string
  actions: Actions
  onAbrirTarea: (tareaId: string) => void
  /** P5: en mobile no hay Gantt (la grilla no funciona en pantalla angosta). */
  esMovil: boolean
}

interface FilaMisTareas {
  tarea: Tarea
  proyecto: Proyecto
  ruta: string
}

export function MisTareasView({ state, usuario, proyectos, hoy, actions, onAbrirTarea, esMovil }: Props) {
  // Los permisos dependen del PROYECTO de cada tarea (dueño vs invitado):
  // se resuelve un Can por proyecto visible.
  const canPorProyecto = useMemo(
    () => new Map(proyectos.map((p) => [p.id, makeCan(state, usuario, p.id)])),
    [state, usuario, proyectos],
  )
  const canDe = useCallback(
    (proyectoId: string) => canPorProyecto.get(proyectoId) ?? makeCan(state, usuario, null),
    [canPorProyecto, state, usuario],
  )
  // #190: conmutador Tabla/Gantt, igual al de un proyecto. El filtro y el
  // orden son los MISMOS para ambas vistas (cambiar de vista no los pierde).
  const [vista, setVista] = useState<Vista>('tabla')
  // P5: en mobile no hay Gantt. Si se achica la ventana con la Gantt abierta,
  // la vista vuelve a Tabla (el conmutador se oculta y no habría forma de
  // salir de la grilla).
  const vistaEfectiva: Vista = esMovil ? 'tabla' : vista
  // #215: al entrar se restaura la vista guardada activa —y solo eso—. Un
  // filtro puesto a mano es temporal: esta pantalla se desmonta al salir, así
  // que se pierde, que es justo lo esperado.
  const inicial = useMemo(() => estadoInicial(usuario.id, 'mis-tareas'), [usuario.id])
  const [filtro, setFiltro] = useState<Filtro>(inicial.filtro)
  const [vistaActivaId, setVistaActivaId] = useState<string | null>(inicial.vistaActivaId)
  const cambiarVistaActiva = useCallback(
    (id: string | null) => {
      escribirVistaActiva(usuario.id, 'mis-tareas', id)
      setVistaActivaId(id)
    },
    [usuario.id],
  )
  // Orden multinivel del menu "Ordenar" (punto 4). Momentaneo salvo que se
  // guarde como vista; el "orden base" aqui es el propio de Mis Tareas
  // (atrasadas primero, luego por fecha).
  const [orden, setOrden] = useState<OrdenMulti>(inicial.orden)
  // P1: nonce para re-snapshot de la vista congelada ("Actualizar vista").
  const [snapNonce, setSnapNonce] = useState(0)
  // P1: la Gantt reporta su propia foto desactualizada (tiene su recorrido).
  const [ganttStale, setGanttStale] = useState(false)

  // Todas mis tareas activas, de todos los proyectos visibles.
  const misFilas = useMemo<FilaMisTareas[]>(() => {
    const out: FilaMisTareas[] = []
    for (const t of state.tareas) {
      if (t.responsableId !== usuario.id || t.archivada) continue
      const sub = state.subFrentes.find((sf) => sf.id === t.subFrenteId)
      const frente = sub ? state.frentes.find((f) => f.id === sub.frenteId) : undefined
      const proyecto = frente ? proyectos.find((p) => p.id === frente.proyectoId) : undefined
      if (!proyecto) continue
      out.push({ tarea: t, proyecto, ruta: `${frente!.nombre} › ${sub!.nombre}` })
    }
    // Atrasadas primero, luego por fecha objetivo ascendente; hechas al
    // final; las sin fecha al final de su grupo.
    // #239: la escala sale de `GRAVEDAD` (lib/orden), la misma que usa el menú
    // Ordenar. Antes estaba escrita otra vez acá, invertida a mano; el orden
    // resultante es idéntico —GRAVEDAD descendente ES "lo más crítico primero"—
    // pero ahora no pueden separarse si se agrega una categoría.
    return out.sort((a, b) => {
      const ga = GRAVEDAD[categoriaDe(state, a.tarea, hoy)]
      const gb = GRAVEDAD[categoriaDe(state, b.tarea, hoy)]
      if (ga !== gb) return gb - ga
      if (!a.tarea.fechaObjetivo) return 1
      if (!b.tarea.fechaObjetivo) return -1
      return cmp(a.tarea.fechaObjetivo, b.tarea.fechaObjetivo)
    })
  }, [state, usuario.id, proyectos, hoy])

  const filtrando = !filtroVacio(filtro)
  const filtradas = useMemo(() => {
    const base = !filtrando
      ? misFilas
      : misFilas.filter(({ tarea, proyecto }) => {
          if (filtro.proyectos && filtro.proyectos.length > 0 && !filtro.proyectos.includes(proyecto.id)) return false
          return pasaFiltroCompleto(state, tarea, filtro, hoy)
        })
    return ordenarMulti(base, orden, (f, campo) =>
      campo === 'proyecto'
        ? f.proyecto.nombre.toLowerCase()
        : valorOrden(state, f.tarea, campo, hoy),
    )
  }, [misFilas, filtro, filtrando, orden, state, hoy])

  // P1: la vista se congela con filtro y/u orden activo (misma "foto" que en
  // las tablas de proyecto). Editar una tarea no la saca ni la reordena; el
  // control "Actualizar vista" recalcula.
  const activo = filtrando || orden.length > 0
  const frescoIds = useMemo(() => filtradas.map((f) => f.tarea.id), [filtradas])
  const existentesIds = useMemo(() => misFilas.map((f) => f.tarea.id), [misFilas])
  const firma = JSON.stringify([usuario.id, filtro, orden, snapNonce])
  const { congelada, visibleIds, indice, stale } = useVistaCongelada(frescoIds, existentesIds, activo, firma)
  const mostradas = useMemo(
    () =>
      congelada
        ? misFilas
            .filter((f) => visibleIds.has(f.tarea.id))
            .sort((a, b) => (indice.get(a.tarea.id) ?? 0) - (indice.get(b.tarea.id) ?? 0))
        : filtradas,
    [congelada, visibleIds, indice, misFilas, filtradas],
  )

  const atrasadas = misFilas.filter(({ tarea }) => esAtrasada(categoriaDe(state, tarea, hoy))).length
  // #139: proyectos DISTINTOS realmente presentes en mis filas (no todos los
  // visibles): si no tengo tareas en un proyecto, no cuenta.
  const nProyectos = useMemo(() => new Set(misFilas.map((f) => f.proyecto.id)).size, [misFilas])

  // #163: mide la barra de filtros (sticky) y publica --filtros-h para que el
  // thead de la tabla se congele JUSTO debajo, sin taparse — igual que en la
  // vista de proyecto.
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const bar = wrap.querySelector<HTMLElement>('.filtros-bar')
    if (!bar) return
    const update = () => wrap.style.setProperty('--filtros-h', `${bar.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="usuarios-wrap" ref={wrapRef}>
      <div className="usuarios-cabecera">
        <div>
          <h2>Mis Tareas</h2>
          <p className="usuarios-sub">
            {misFilas.length} tareas a mi cargo en {nProyectos} proyecto{nProyectos === 1 ? '' : 's'}
            {atrasadas > 0 && (
              <span className="mipanel-alerta"> · {atrasadas} atrasada{atrasadas === 1 ? '' : 's'} — asignar nueva fecha</span>
            )}
          </p>
        </div>
        {/* #190: mismo conmutador que dentro de un proyecto. En mobile no hay
            Gantt (la grilla no funciona en pantalla angosta). */}
        {!esMovil && (
          <div className="toggle">
            <button className={vista === 'tabla' ? 'activo' : ''} onClick={() => setVista('tabla')}>
              Tabla
            </button>
            <button className={vista === 'gantt' ? 'activo' : ''} onClick={() => setVista('gantt')}>
              Gantt
            </button>
          </div>
        )}
      </div>

      {/* Filtros del sistema comun, con Proyecto en vez de Responsable.
          Los guardados viven en el contexto 'mis-tareas' (no por proyecto). */}
      <FiltrosBar
        contexto="mis-tareas"
        usuarioId={usuario.id}
        proyectos={proyectos}
        filtro={filtro}
        onCambiar={setFiltro}
        orden={orden}
        onCambiarOrden={setOrden}
        camposOrden={CAMPOS_MIS_TAREAS}
        vistaActivaId={vistaActivaId}
        onVistaActiva={cambiarVistaActiva}
        stale={vistaEfectiva === 'tabla' ? stale : ganttStale}
        onActualizarVista={() => setSnapNonce((n) => n + 1)}
      />

      {/* #190: la Gantt de Mis Tareas — misma grilla, con la columna de
          proyecto a la izquierda. Comparte filtro y orden con la tabla. */}
      {vistaEfectiva === 'gantt' ? (
        <GanttView
          state={state}
          frenteSel="todos"
          hoy={hoy}
          can={canDe('')}
          filtro={filtro}
          orden={orden}
          onCambiarFiltro={setFiltro}
          snapshotNonce={snapNonce}
          onStale={setGanttStale}
          actions={actions}
          onAbrirTarea={onAbrirTarea}
          misTareas={{ usuarioId: usuario.id, proyectos, canDe }}
        />
      ) : (
      <table className="tareas mistareas">
        <thead>
          <tr>
            <th className="col-check">Hecha</th>
            <th>Tarea</th>
            <th className="col-proyecto">Proyecto</th>
            <th className="col-ruta">Ubicación</th>
            <th className="col-estado">Estado</th>
            <th className="col-fecha">Fecha Objetivo</th>
            <th className="col-desv">Atraso</th>
          </tr>
        </thead>
        <tbody>
          {mostradas.map((fila) => (
            <FilaTarea
              key={fila.tarea.id}
              fila={fila}
              state={state}
              hoy={hoy}
              can={canPorProyecto.get(fila.proyecto.id) ?? makeCan(state, usuario, null)}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {mostradas.length === 0 && (
            <tr>
              <td colSpan={7} className="vacio-inline">
                {filtrando ? 'Ninguna tarea coincide con el filtro activo.' : 'Sin tareas a tu cargo.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      )}
    </div>
  )
}

function FilaTarea({
  fila,
  state,
  hoy,
  can,
  actions,
  onAbrirTarea,
}: {
  fila: FilaMisTareas
  state: AppState
  hoy: string
  can: Can
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const { tarea, proyecto, ruta } = fila
  const color = colorTarea(state, tarea, hoy)
  const cat = categoriaDe(state, tarea, hoy)
  const nReplan = nReplanificaciones(state, tarea.id)
  const nComentarios = state.comentarios.filter((c) => c.tareaId === tarea.id).length

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
          <HoverCard card={<TaskDetail state={state} tarea={tarea} hoy={hoy} />}>
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

      <td className="col-proyecto">
        <span className="mipanel-proyecto">
          <span className="nav-proyecto__dot" style={{ background: proyecto.color ?? '#607d8b' }} />
          {proyecto.nombre}
        </span>
      </td>

      {/* En mobile, Proyecto se fusiona aqui: la ruta pasa a ser completa
          (Proyecto › Frente › Sub Frente). El prefijo solo se ve en movil. */}
      <td className="col-ruta mipanel-ruta">
        <span className="ruta-proy">{proyecto.nombre} › </span>
        {ruta}
      </td>

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
        ) : tarea.fechaObjetivo ? (
          formatoFecha(tarea.fechaObjetivo)
        ) : (
          '—'
        )}
      </td>

      <td className="col-desv">{textoAtraso(tarea)}</td>
    </tr>
  )
}
