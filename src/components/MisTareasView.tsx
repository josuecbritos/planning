import { useMemo, useState } from 'react'
import type { AppState, Proyecto, Tarea, Usuario } from '../types'
import type { Actions } from '../App'
import type { Can } from '../lib/permisos'
import { cmp, formatoFecha } from '../lib/dates'
import {
  CATEGORIA_LABEL,
  atrasoHabiles,
  categoriaDe,
  colorTarea,
  esAtrasada,
  nReplanificaciones,
  textoAtraso,
  type Categoria,
} from '../lib/derive'
import { filtroVacio, pasaFiltroCompleto, type Filtro } from '../lib/filtros'
import { CAMPOS_MIS_TAREAS, ordenarMulti, valorOrden, type OrdenMulti } from '../lib/orden'
import { FiltrosBar } from './FiltrosBar'
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
  can: Can
  actions: Actions
  onAbrirTarea: (tareaId: string) => void
}

interface FilaMisTareas {
  tarea: Tarea
  proyecto: Proyecto
  ruta: string
}

export function MisTareasView({ state, usuario, proyectos, hoy, can, actions, onAbrirTarea }: Props) {
  const [filtro, setFiltro] = useState<Filtro>({})
  // Orden multinivel del menu "Ordenar" (punto 4). Momentaneo salvo que se
  // guarde como vista; el "orden base" aqui es el propio de Mis Tareas
  // (atrasadas primero, luego por fecha).
  const [orden, setOrden] = useState<OrdenMulti>([])

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
    const peso = (c: Categoria) =>
      c === 'atrasada_replan' ? 0 : c === 'atrasada' ? 1 : c === 'pendiente_replan' ? 2 : c === 'pendiente' ? 3 : 4
    return out.sort((a, b) => {
      const pa = peso(categoriaDe(state, a.tarea, hoy))
      const pb = peso(categoriaDe(state, b.tarea, hoy))
      if (pa !== pb) return pa - pb
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

  const atrasadas = misFilas.filter(({ tarea }) => esAtrasada(categoriaDe(state, tarea, hoy))).length

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Mis Tareas</h2>
          <p className="usuarios-sub">
            {misFilas.length} tareas a mi cargo en {proyectos.length} proyecto{proyectos.length === 1 ? '' : 's'}
            {atrasadas > 0 && (
              <span className="mipanel-alerta"> · {atrasadas} atrasada{atrasadas === 1 ? '' : 's'} — asignar nueva fecha</span>
            )}
          </p>
        </div>
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
      />

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
          {filtradas.map((fila) => (
            <FilaTarea
              key={fila.tarea.id}
              fila={fila}
              state={state}
              hoy={hoy}
              can={can}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
            />
          ))}
          {filtradas.length === 0 && (
            <tr>
              <td colSpan={7} className="vacio-inline">
                {filtrando ? 'Ninguna tarea coincide con el filtro activo.' : 'Sin tareas a tu cargo.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
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

      <td className={`col-desv${atrasoHabiles(tarea) ? ' col-desv--mov' : ''}`}>{textoAtraso(tarea)}</td>
    </tr>
  )
}
