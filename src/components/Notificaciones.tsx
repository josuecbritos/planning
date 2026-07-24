import { useEffect, useRef } from 'react'
import type { AppState, Notificacion, Usuario } from '../types'
import { formatoFecha } from '../lib/dates'
import { Avatar } from './RespPicker'

// Notificaciones in-app (#137): panel emergente anclado a la entrada de la
// barra + vista completa "Ver todas". El texto se arma aquí a partir del tipo,
// la tarea y el autor; la generación de las notificaciones vive en la base.

/** Proyecto al que pertenece una tarea (tarea → sub frente → frente → proyecto). */
function proyectoDeTarea(state: AppState, tareaId: string) {
  const t = state.tareas.find((x) => x.id === tareaId)
  const sf = t && state.subFrentes.find((x) => x.id === t.subFrenteId)
  const f = sf && state.frentes.find((x) => x.id === sf.frenteId)
  return f && state.proyectos.find((p) => p.id === f.proyectoId)
}

/** Tiempo relativo compacto: "hace 2 h", "hace 3 d", "ahora". */
function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} d`
  return formatoFecha(iso.slice(0, 10))
}

interface Resuelta {
  autor?: Usuario
  proyectoNombre: string
  texto: React.ReactNode
}

function resolver(state: AppState, n: Notificacion): Resuelta {
  const autor = n.autorId ? state.usuarios.find((u) => u.id === n.autorId) : undefined
  const tarea = state.tareas.find((t) => t.id === n.tareaId)
  const titulo = tarea?.titulo ?? 'una tarea'
  const proyecto = proyectoDeTarea(state, n.tareaId)
  const quien = autor?.nombre ?? 'Alguien'
  const T = <em>{titulo}</em>
  let texto: React.ReactNode
  if (n.tipo === 'asignacion') texto = <>{quien} te asignó {T}</>
  else if (n.tipo === 'comentario') texto = <>{quien} comentó en {T}</>
  else texto = <>{quien} replanificó {T}{n.dato?.fecha ? <> al {formatoFecha(n.dato.fecha)}</> : null}</>
  return { autor, proyectoNombre: proyecto?.nombre ?? '', texto }
}

function Item({ n, state, onAbrir }: { n: Notificacion; state: AppState; onAbrir: (n: Notificacion) => void }) {
  const { autor, proyectoNombre, texto } = resolver(state, n)
  return (
    <button className={`notif-item${n.leida ? ' notif-item--leida' : ''}`} onClick={() => onAbrir(n)}>
      {autor ? <Avatar usuario={autor} /> : <span className="resp-badge">·</span>}
      <span className="notif-item__cuerpo">
        <span className="notif-item__texto">{texto}</span>
        <span className="notif-item__meta">
          {proyectoNombre && <span className="notif-item__proy">{proyectoNombre}</span>}
          <span className="notif-item__tiempo">{hace(n.creada)}</span>
        </span>
      </span>
    </button>
  )
}

// -- Panel emergente (últimas 10) --------------------------------------

interface PanelProps {
  state: AppState
  notificaciones: Notificacion[] // ya filtradas al usuario actual, recientes primero
  onAbrir: (n: Notificacion) => void
  onVerTodas: () => void
  onClose: () => void
}

export function NotificacionesPanel({ state, notificaciones, onAbrir, onVerTodas, onClose }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    // En el siguiente tick, para no capturar el propio clic que lo abrió.
    const id = setTimeout(() => document.addEventListener('mousedown', fuera), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', fuera)
    }
  }, [onClose])

  return (
    <div className="notif-panel" ref={ref} role="dialog" aria-label="Notificaciones">
      <div className="notif-panel__head">Notificaciones</div>
      <div className="notif-panel__lista">
        {notificaciones.length === 0 ? (
          <p className="notif-vacio">No tienes notificaciones.</p>
        ) : (
          notificaciones.slice(0, 10).map((n) => <Item key={n.id} n={n} state={state} onAbrir={onAbrir} />)
        )}
      </div>
      {notificaciones.length > 0 && (
        <button className="notif-panel__vertodas" onClick={onVerTodas}>Ver todas</button>
      )}
    </div>
  )
}

// -- Vista completa (historial) ----------------------------------------

interface ViewProps {
  state: AppState
  notificaciones: Notificacion[]
  onAbrir: (n: Notificacion) => void
}

export function NotificacionesView({ state, notificaciones, onAbrir }: ViewProps) {
  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <h2>Notificaciones</h2>
      </div>
      <div className="notif-historial">
        {notificaciones.length === 0 ? (
          <p className="vacio-inline">No tienes notificaciones.</p>
        ) : (
          notificaciones.map((n) => <Item key={n.id} n={n} state={state} onAbrir={onAbrir} />)
        )}
      </div>
    </div>
  )
}
