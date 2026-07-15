import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppState, Tarea, Usuario } from './types'
import { HOY as HOY_SIM } from './data/seed'
import { makeRepo } from './data'
import { makeAuth } from './auth'
import { supabaseConfigured } from './data/client'
import { hoyISO } from './lib/dates'
import { contar } from './lib/derive'
import { makeCan } from './lib/permisos'
import * as apply from './data/apply'
import type {
  NuevaTarea,
  NuevoFrente,
  NuevoProyecto,
  NuevoSubFrente,
  NuevoUsuario,
  PatchProyecto,
  PatchTarea,
  PatchUsuario,
} from './data/repo'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { TableView } from './components/TableView'
import { GanttView } from './components/GanttView'
import { LoginPage } from './components/LoginPage'
import { UsersView } from './components/UsersView'
import { TaskPanel } from './components/TaskPanel'
import { MiPanelView } from './components/MiPanelView'
import { ResumenView } from './components/ResumenView'
import { AceptarInvitacion } from './components/AceptarInvitacion'

export type Vista = 'tabla' | 'gantt'
export type FrenteSel = string | 'todos'
export type Pantalla = 'proyectos' | 'usuarios' | 'mipanel' | 'resumen'
/** Modos de la barra lateral (punto 6): fija (default) o escondida. */
export type SidebarModo = 'fija' | 'escondida'

/** Acciones expuestas a los componentes. Todas persisten via Repo. */
export interface Actions {
  createProyecto: (i: NuevoProyecto) => Promise<void>
  updateProyecto: (id: string, p: PatchProyecto) => Promise<void>
  deleteProyecto: (id: string) => Promise<void>
  createFrente: (i: NuevoFrente) => Promise<void>
  updateFrente: (id: string, p: { nombre?: string; orden?: number }) => Promise<void>
  deleteFrente: (id: string) => Promise<void>
  createSubFrente: (i: NuevoSubFrente) => Promise<void>
  updateSubFrente: (id: string, p: { nombre?: string; orden?: number }) => Promise<void>
  deleteSubFrente: (id: string) => Promise<void>
  createTarea: (i: NuevaTarea) => Promise<void>
  updateTarea: (id: string, p: PatchTarea) => Promise<void>
  deleteTarea: (id: string) => Promise<void>
  toggleHecha: (tareaId: string, hecha: boolean) => Promise<void>
  /** `nueva = null` desplanifica (borra la marca; queda "sin fecha"). */
  cambiarFechaObjetivo: (tareaId: string, nueva: string | null) => Promise<void>
  createUsuario: (i: NuevoUsuario) => Promise<void>
  updateUsuario: (id: string, p: PatchUsuario) => Promise<void>
  asignarAcceso: (usuarioId: string, proyectoId: string) => Promise<void>
  quitarAcceso: (usuarioId: string, proyectoId: string) => Promise<void>
  addComentario: (tareaId: string, texto: string) => Promise<void>
}

export default function App() {
  const repo = useMemo(() => makeRepo(), [])
  const auth = useMemo(() => makeAuth(repo), [repo])
  const HOY = useMemo(() => (supabaseConfigured ? hoyISO() : HOY_SIM), [])

  // §8: enlace de invitacion (#invitacion=TOKEN) — tiene prioridad sobre todo.
  const [tokenInvitacion, setTokenInvitacion] = useState<string | null>(() => {
    const m = window.location.hash.match(/#invitacion=([\w-]+)/)
    return m ? m[1] : null
  })

  // undefined = comprobando sesion; null = sin sesion.
  const [sesion, setSesion] = useState<Usuario | null | undefined>(undefined)
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('tabla')
  const [pantalla, setPantalla] = useState<Pantalla>('proyectos')
  // Punto 6: modo de la sidebar. Primera preferencia persistente de la app
  // (por usuario, sobrevive a recargas y sesiones posteriores).
  const [sidebarModo, setSidebarModo] = useState<SidebarModo>('fija')
  const [frenteSel, setFrenteSel] = useState<FrenteSel>('todos')
  const [proyectoActivoId, setProyectoActivoId] = useState<string | null>(null)
  // Panel lateral de detalle (7.2): id de la tarea abierta, o null.
  const [tareaDetalleId, setTareaDetalleId] = useState<string | null>(null)

  const esAdmin: boolean = sesion?.rol === 'admin'
  const can = useMemo(() => makeCan(sesion ?? null), [sesion])

  // Comprobar sesion vigente al arrancar.
  useEffect(() => {
    auth.getUsuarioActual().then(setSesion).catch(() => setSesion(null))
  }, [auth])

  // Cargar la preferencia de sidebar del usuario al iniciar sesion.
  useEffect(() => {
    if (!sesion) return
    try {
      const v = localStorage.getItem(`planificador.sidebar.${sesion.id}`)
      setSidebarModo(v === 'escondida' ? 'escondida' : 'fija')
    } catch {
      /* storage no disponible: queda el default */
    }
  }, [sesion])

  const toggleSidebarModo = useCallback(() => {
    setSidebarModo((m) => {
      const nuevo: SidebarModo = m === 'fija' ? 'escondida' : 'fija'
      if (sesion) {
        try {
          localStorage.setItem(`planificador.sidebar.${sesion.id}`, nuevo)
        } catch {
          /* sin persistencia: el modo aplica igual en esta sesion */
        }
      }
      return nuevo
    })
  }, [sesion])

  // En modo Local, lista de usuarios activos para "entrar como" en el login
  // (del repo, para incluir usuarios creados despues del seed).
  const [usuariosDemo, setUsuariosDemo] = useState<Usuario[]>([])
  useEffect(() => {
    if (sesion === null && !supabaseConfigured) {
      repo.loadState().then((s) => setUsuariosDemo(s.usuarios.filter((u) => u.activo)))
    }
  }, [sesion, repo])

  // Cargar datos cuando hay sesion.
  useEffect(() => {
    if (!sesion) return
    let vivo = true
    repo
      .loadState()
      .then((s) => {
        if (!vivo) return
        setState(s)
      })
      .catch((e) => vivo && setError(String(e.message ?? e)))
    return () => {
      vivo = false
    }
  }, [repo, sesion])

  // Proyectos visibles segun el rol: admin todo; cliente solo asignados.
  // (En Supabase la RLS ya filtra en el servidor; aqui se refuerza en la UI
  //  y se resuelve el modo Local.)
  const proyectosVisibles = useMemo(() => {
    if (!state || !sesion) return []
    if (sesion.rol === 'admin') return state.proyectos
    const ids = new Set(state.accesos.filter((a) => a.usuarioId === sesion.id).map((a) => a.proyectoId))
    return state.proyectos.filter((p) => ids.has(p.id))
  }, [state, sesion])

  // Seleccion inicial / correccion de proyecto activo.
  useEffect(() => {
    if (!state || !sesion) return
    setProyectoActivoId((prev) => {
      if (prev && proyectosVisibles.some((p) => p.id === prev)) return prev
      return proyectosVisibles[0]?.id ?? null
    })
  }, [state, sesion, proyectosVisibles])

  const run = useCallback(async (fn: () => Promise<(s: AppState) => AppState>) => {
    try {
      const patch = await fn()
      setState((s) => (s ? patch(s) : s))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }, [])

  const actions: Actions = useMemo(
    () => ({
      createProyecto: (i) =>
        run(async () => {
          const p = await repo.createProyecto({ ...i, creadoPor: sesion?.id })
          setProyectoActivoId(p.id)
          setPantalla('proyectos')
          return (s) => apply.upsertProyecto(s, p)
        }),
      updateProyecto: (id, p) =>
        run(async () => {
          const r = await repo.updateProyecto(id, p)
          return (s) => apply.upsertProyecto(s, r)
        }),
      deleteProyecto: (id) =>
        run(async () => {
          await repo.deleteProyecto(id)
          setProyectoActivoId((cur) => (cur === id ? null : cur))
          return (s) => apply.removeProyecto(s, id)
        }),
      createFrente: (i) =>
        run(async () => {
          const f = await repo.createFrente(i)
          return (s) => apply.upsertFrente(s, f)
        }),
      updateFrente: (id, p) =>
        run(async () => {
          const f = await repo.updateFrente(id, p)
          return (s) => apply.upsertFrente(s, f)
        }),
      deleteFrente: (id) =>
        run(async () => {
          await repo.deleteFrente(id)
          return (s) => apply.removeFrente(s, id)
        }),
      createSubFrente: (i) =>
        run(async () => {
          const sf = await repo.createSubFrente(i)
          return (s) => apply.upsertSubFrente(s, sf)
        }),
      updateSubFrente: (id, p) =>
        run(async () => {
          const sf = await repo.updateSubFrente(id, p)
          return (s) => apply.upsertSubFrente(s, sf)
        }),
      deleteSubFrente: (id) =>
        run(async () => {
          await repo.deleteSubFrente(id)
          return (s) => apply.removeSubFrente(s, id)
        }),
      createTarea: (i) =>
        run(async () => {
          const t = await repo.createTarea(i)
          return (s) => apply.upsertTarea(s, t)
        }),
      updateTarea: (id, p) =>
        run(async () => {
          const t = await repo.updateTarea(id, p)
          return (s) => apply.upsertTarea(s, t)
        }),
      deleteTarea: (id) =>
        run(async () => {
          await repo.deleteTarea(id)
          setTareaDetalleId((cur) => (cur === id ? null : cur))
          return (s) => apply.removeTarea(s, id)
        }),
      toggleHecha: (tareaId, hecha) =>
        run(async () => {
          const patch: PatchTarea = hecha ? { hecha: true, fechaReal: HOY } : { hecha: false }
          const t = await repo.updateTarea(tareaId, patch)
          return (s) => apply.upsertTarea(s, t)
        }),
      cambiarFechaObjetivo: (tareaId, nueva) =>
        run(async () => {
          const { tarea, historial } = await repo.cambiarFechaObjetivo(tareaId, nueva, sesion?.id, HOY)
          return (s) => apply.setHistorialTarea(apply.upsertTarea(s, tarea), tareaId, historial)
        }),
      createUsuario: (i) =>
        run(async () => {
          const u = await repo.createUsuario(i)
          return (s) => apply.upsertUsuario(s, u)
        }),
      updateUsuario: (id, p) =>
        run(async () => {
          const u = await repo.updateUsuario(id, p)
          return (s) => apply.upsertUsuario(s, u)
        }),
      asignarAcceso: (usuarioId, proyectoId) =>
        run(async () => {
          const a = await repo.asignarAcceso(usuarioId, proyectoId)
          return (s) => apply.addAcceso(s, a)
        }),
      quitarAcceso: (usuarioId, proyectoId) =>
        run(async () => {
          await repo.quitarAcceso(usuarioId, proyectoId)
          return (s) => apply.removeAcceso(s, usuarioId, proyectoId)
        }),
      addComentario: (tareaId, texto) =>
        run(async () => {
          const c = await repo.addComentario(tareaId, texto, sesion?.id)
          return (s) => apply.addComentario(s, c)
        }),
    }),
    [repo, run, HOY, sesion],
  )

  const onLogin = useCallback(
    async (email: string, password?: string) => {
      const u = await auth.login(email, password)
      setSesion(u)
      setPantalla('proyectos')
      setFrenteSel('todos')
    },
    [auth],
  )

  const onLogout = useCallback(async () => {
    await auth.logout()
    setSesion(null)
    setState(null)
    setProyectoActivoId(null)
  }, [auth])

  const onSelectProyecto = useCallback((id: string) => {
    setProyectoActivoId(id)
    setFrenteSel('todos')
    setPantalla('proyectos')
  }, [])

  const onSelectPantalla = useCallback((p: Pantalla) => {
    setPantalla(p)
    setTareaDetalleId(null)
  }, [])

  const abrirDetalle = useCallback((tareaId: string) => setTareaDetalleId(tareaId), [])

  const tareasVisibles = useMemo<Tarea[]>(() => {
    if (!state || !proyectoActivoId) return []
    const frenteIds = new Set(state.frentes.filter((f) => f.proyectoId === proyectoActivoId).map((f) => f.id))
    const subIds = new Set(
      state.subFrentes
        .filter((sf) => frenteIds.has(sf.frenteId) && (frenteSel === 'todos' || sf.frenteId === frenteSel))
        .map((sf) => sf.id),
    )
    return state.tareas.filter((t) => subIds.has(t.subFrenteId))
  }, [state, proyectoActivoId, frenteSel])

  const contadores = useMemo(
    () => (state ? contar(state, tareasVisibles, HOY) : null),
    [state, tareasVisibles, HOY],
  )

  // -- Render --

  if (tokenInvitacion) {
    return (
      <AceptarInvitacion
        token={tokenInvitacion}
        onListo={() => {
          window.location.hash = ''
          setTokenInvitacion(null)
        }}
      />
    )
  }

  if (sesion === undefined) {
    return <div className="cargando">Cargando…</div>
  }

  if (sesion === null) {
    return <LoginPage modo={auth.modo} usuariosDemo={usuariosDemo} onLogin={onLogin} />
  }

  if (error && !state) {
    return <div className="fatal">No se pudo cargar: {error}</div>
  }
  if (!state) {
    return <div className="cargando">Cargando datos…</div>
  }

  const proyecto = proyectosVisibles.find((p) => p.id === proyectoActivoId) ?? null
  const tareaDetalle = tareaDetalleId ? state.tareas.find((t) => t.id === tareaDetalleId) ?? null : null

  return (
    <div className={`app${sidebarModo === 'escondida' ? ' app--sidebar-escondida' : ''}`}>
      {/* Punto 6: en modo escondida queda una franja de iconos siempre
          clicable; al pasar el mouse, la sidebar completa se despliega
          encima y se repliega al salir. */}
      <div className="sidebar-zona">
        {sidebarModo === 'escondida' && (
          <div className="sidebar-mini" aria-label="Proyectos">
            <button
              className="sidebar-mini__btn"
              title="Fijar barra lateral"
              aria-label="Fijar barra lateral"
              onClick={toggleSidebarModo}
            >
              »
            </button>
            {proyectosVisibles.map((p) => (
              <button
                key={p.id}
                className={`sidebar-mini__proy${
                  p.id === proyectoActivoId && pantalla === 'proyectos' ? ' sidebar-mini__proy--activo' : ''
                }`}
                title={p.nombre}
                style={{ background: p.color ?? '#607d8b' }}
                onClick={() => onSelectProyecto(p.id)}
              >
                {p.nombre.trim().charAt(0).toUpperCase() || '·'}
              </button>
            ))}
          </div>
        )}
        <Sidebar
          state={state}
          proyectos={proyectosVisibles}
          proyectoActivoId={proyectoActivoId}
          frenteSel={frenteSel}
          pantalla={pantalla}
          esAdmin={esAdmin}
          can={can}
          usuario={sesion}
          sidebarModo={sidebarModo}
          onToggleSidebar={toggleSidebarModo}
          onSelectProyecto={onSelectProyecto}
          onSelectFrente={setFrenteSel}
          onSelectPantalla={onSelectPantalla}
          onLogout={onLogout}
          actions={actions}
        />
      </div>
      <div className="main">
        {error && (
          <div className="banner-error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Cerrar">✕</button>
          </div>
        )}

        {pantalla === 'usuarios' && esAdmin ? (
          <UsersView state={state} usuarioActual={sesion} actions={actions} />
        ) : pantalla === 'mipanel' && esAdmin ? (
          <MiPanelView
            state={state}
            usuario={sesion}
            proyectos={proyectosVisibles}
            hoy={HOY}
            onAbrirTarea={abrirDetalle}
          />
        ) : pantalla === 'resumen' ? (
          <ResumenView
            state={state}
            proyectos={proyectosVisibles}
            hoy={HOY}
            onAbrirProyecto={onSelectProyecto}
          />
        ) : proyecto && contadores ? (
          <>
            <Header
              proyecto={proyecto}
              modo={repo.modo}
              vista={vista}
              onVista={setVista}
              contadores={contadores}
              hoy={HOY}
            />
            <div className="content">
              {vista === 'tabla' ? (
                <TableView
                  state={state}
                  proyectoId={proyecto.id}
                  frenteSel={frenteSel}
                  hoy={HOY}
                  can={can}
                  actions={actions}
                  onAbrirTarea={abrirDetalle}
                />
              ) : (
                <GanttView
                  state={state}
                  proyectoId={proyecto.id}
                  frenteSel={frenteSel}
                  hoy={HOY}
                  can={can}
                  actions={actions}
                  onAbrirTarea={abrirDetalle}
                />
              )}
            </div>
          </>
        ) : (
          <div className="vacio">
            {esAdmin ? (
              <>
                <p>No hay ningun proyecto seleccionado.</p>
                <p>Crea uno desde la barra lateral para empezar.</p>
              </>
            ) : (
              <p>Aun no tienes proyectos asignados. Contacta a tu consultor.</p>
            )}
          </div>
        )}
      </div>

      {tareaDetalle && (
        <TaskPanel
          state={state}
          tarea={tareaDetalle}
          hoy={HOY}
          can={can}
          actions={actions}
          onClose={() => setTareaDetalleId(null)}
        />
      )}
    </div>
  )
}
