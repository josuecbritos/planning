import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, PermisosTareas, Tarea, Usuario } from './types'
import { HOY as HOY_SIM } from './data/seed'
import { makeRepo } from './data'
import { makeAuth } from './auth'
import { supabaseConfigured } from './data/client'
import { hoyISO } from './lib/dates'
import { contar } from './lib/derive'
import { esDuenoDe, makeCan, puedeCrearProyectos } from './lib/permisos'
import type { Filtro } from './lib/filtros'
import { CAMPOS_PROYECTO, type OrdenMulti } from './lib/orden'
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
import { FiltrosBar } from './components/FiltrosBar'
import { MisTareasView } from './components/MisTareasView'
import { MiembrosModal } from './components/MiembrosModal'
import { ResumenView } from './components/ResumenView'
import { AceptarInvitacion } from './components/AceptarInvitacion'

export type Vista = 'tabla' | 'gantt'
export type FrenteSel = string | 'todos'
export type Pantalla = 'proyectos' | 'usuarios' | 'mipanel' | 'resumen'
/** Modos de la barra lateral (punto 6): fija (default) o escondida. */
export type SidebarModo = 'fija' | 'escondida'
/** Tema de la interfaz (punto 4): manual, no sigue al sistema operativo. */
export type Tema = 'claro' | 'oscuro'

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
  /** Configura el set de ocho DE UN ACCESO (usuario × proyecto). */
  updateAccesoPermisos: (usuarioId: string, proyectoId: string, permisos: PermisosTareas) => Promise<void>
  addComentario: (tareaId: string, texto: string) => Promise<void>
}

/** Vista de un proyecto (punto 3/4): filtro y orden viven juntos y son
 *  propios de cada proyecto. Referencias estables para el estado "vacio". */
interface VistaProyecto {
  filtro: Filtro
  orden: OrdenMulti
}
const FILTRO_VACIO: Filtro = {}
const ORDEN_VACIO: OrdenMulti = []
const VISTA_VACIA: VistaProyecto = { filtro: FILTRO_VACIO, orden: ORDEN_VACIO }

// --- Tema: sigue al sistema del dispositivo por defecto, con override manual ---
// Si el usuario tocó el interruptor, esa elección (guardada en localStorage,
// por usuario) manda; si nunca lo tocó, se sigue el modo del sistema
// (prefers-color-scheme), en vivo. El override sobrevive porque es explícito.

/** Preferencia EXPLÍCITA del usuario, o null si no eligió (→ sigue el sistema). */
function leerTemaPref(usuarioId: string | null): Tema | null {
  if (!usuarioId) return null
  try {
    const v = localStorage.getItem(`planificador.tema.${usuarioId}`)
    return v === 'claro' || v === 'oscuro' ? v : null
  } catch {
    return null
  }
}

/** ¿El sistema del dispositivo pide modo oscuro? */
function sistemaPrefiereOscuro(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** Tema efectivo: el override del usuario si existe; si no, el del sistema. */
function temaEfectivo(usuarioId: string | null): Tema {
  return leerTemaPref(usuarioId) ?? (sistemaPrefiereOscuro() ? 'oscuro' : 'claro')
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
  // P1: vista congelada ("foto"). El nonce fuerza el re-snapshot al tocar
  // "Actualizar vista"; `vistaStale` lo reporta la vista activa (tabla/Gantt).
  const [snapshotNonce, setSnapshotNonce] = useState(0)
  const [vistaStale, setVistaStale] = useState(false)
  // Punto 6: modo de la sidebar. Primera preferencia persistente de la app
  // (por usuario, sobrevive a recargas y sesiones posteriores).
  const [sidebarModo, setSidebarModo] = useState<SidebarModo>('fija')
  // Punto 3/4: filtro + orden POR PROYECTO. Cada proyecto conserva su propio
  // estado (aplicar un filtro/orden en A no afecta a B); es momentaneo (vive
  // en memoria) salvo que se guarde como vista. Mapa keyed por id de proyecto.
  const [vistasProyecto, setVistasProyecto] = useState<Record<string, VistaProyecto>>({})
  // Tema claro/oscuro: por defecto sigue el modo del sistema; el interruptor
  // manual (persistente por usuario) actúa como override una vez usado.
  const [tema, setTema] = useState<Tema>(() => temaEfectivo(null))
  // Mobile: la sidebar se superpone al contenido al llamarla (boton ☰) y
  // se cierra al elegir una opcion. Sin efecto en desktop (CSS lo esconde).
  const [movilSidebar, setMovilSidebar] = useState(false)
  // ¿Viewport mobile? En mobile no existe la Gantt (P5): la grilla no funciona
  // en pantalla angosta, así que la vista se fuerza a Tabla y se oculta el
  // toggle de vistas. Desktop mantiene Tabla + Gantt.
  const [esMovil, setEsMovil] = useState(() => {
    try {
      return window.matchMedia('(max-width: 768px)').matches
    } catch {
      return false
    }
  })
  const [frenteSel, setFrenteSel] = useState<FrenteSel>('todos')
  const [proyectoActivoId, setProyectoActivoId] = useState<string | null>(null)
  // Panel lateral de detalle (7.2): id de la tarea abierta, o null.
  const [tareaDetalleId, setTareaDetalleId] = useState<string | null>(null)
  // Miembros del proyecto activo (roles punto 7): modal abierto/cerrado.
  const [miembrosAbierto, setMiembrosAbierto] = useState(false)
  // Contenedor con scroll de la vista de proyecto. Se mide el alto de la
  // barra de filtros (que es sticky, punto 2) para que el encabezado de la
  // tabla se congele JUSTO debajo, sin taparse ni superponerse.
  const contentRef = useRef<HTMLDivElement>(null)

  const esAdmin: boolean = sesion?.rol === 'admin'
  // Can por PROYECTO ACTIVO (principio dueño vs invitado): admin y dueño
  // hacen todo; un invitado opera según los permisos de su acceso.
  const can = useMemo(
    () => makeCan(state, sesion ?? null, proyectoActivoId),
    [state, sesion, proyectoActivoId],
  )

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

  // El tema se aplica en la raiz del documento: asi tambien alcanza a los
  // portales (modales, menus, hovercards, mini-avisos).
  useEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])

  // Seguir el ancho del viewport para saber si estamos en mobile (P5).
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(max-width: 768px)')
    } catch {
      return
    }
    const onChange = () => setEsMovil(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // Tema efectivo al cambiar de sesión: el override del usuario si eligió uno;
  // si no, el modo del sistema del dispositivo.
  useEffect(() => {
    setTema(temaEfectivo(sesion?.id ?? null))
  }, [sesion])

  // Mientras el usuario NO haya fijado un override, seguir EN VIVO el modo del
  // sistema: si el teléfono cambia de claro a oscuro (o al revés), la app
  // acompaña. Con override activo, se respeta la elección manual.
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const onChange = () => {
      if (leerTemaPref(sesion?.id ?? null) === null) setTema(mq.matches ? 'oscuro' : 'claro')
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [sesion])

  const toggleTema = useCallback(() => {
    setTema((t) => {
      const nuevo: Tema = t === 'claro' ? 'oscuro' : 'claro'
      if (sesion) {
        try {
          localStorage.setItem(`planificador.tema.${sesion.id}`, nuevo)
        } catch {
          /* sin persistencia: el tema aplica igual en esta sesion */
        }
      }
      return nuevo
    })
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

  // Proyectos visibles segun el rol (1): admin todo; consultor los SUYOS
  // (dueño) + los asignados; cliente solo los asignados. (En Supabase la RLS
  // ya filtra en el servidor; aqui se refuerza en la UI y se resuelve el
  // modo Local.)
  const proyectosVisibles = useMemo(() => {
    if (!state || !sesion) return []
    if (sesion.rol === 'admin') return state.proyectos
    const ids = new Set(state.accesos.filter((a) => a.usuarioId === sesion.id).map((a) => a.proyectoId))
    return state.proyectos.filter((p) => p.duenoId === sesion.id || ids.has(p.id))
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
      updateAccesoPermisos: (usuarioId, proyectoId, permisos) =>
        run(async () => {
          const a = await repo.updateAccesoPermisos(usuarioId, proyectoId, permisos)
          return (s) => apply.upsertAcceso(s, a)
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

  // P1: "Actualizar vista" recalcula la foto (nuevo snapshot) y baja el flag.
  const actualizarVista = useCallback(() => {
    setSnapshotNonce((n) => n + 1)
    setVistaStale(false)
  }, [])

  // Cambiar de vista/proyecto recalcula la foto naturalmente (no cuenta como
  // "edición"): se baja el flag de desactualizada por si venía de la anterior.
  const cambiarVista = useCallback((v: Vista) => {
    setVista(v)
    setVistaStale(false)
  }, [])

  const onSelectProyecto = useCallback((id: string) => {
    setProyectoActivoId(id)
    setFrenteSel('todos')
    setPantalla('proyectos')
    // Punto 3: NO se limpia el filtro/orden — cada proyecto conserva el suyo.
    setVistaStale(false)
    setMovilSidebar(false)
  }, [])

  // Vista (filtro + orden) del proyecto activo; setters que solo tocan la
  // entrada de ESE proyecto (punto 3: no se contaminan entre proyectos).
  const vistaActiva = proyectoActivoId ? vistasProyecto[proyectoActivoId] ?? VISTA_VACIA : VISTA_VACIA
  const setFiltro = useCallback(
    (f: Filtro) => {
      // Cambiar el filtro recalcula la foto (no es una "edición" de datos).
      setVistaStale(false)
      setVistasProyecto((prev) => {
        if (!proyectoActivoId) return prev
        const cur = prev[proyectoActivoId] ?? VISTA_VACIA
        return { ...prev, [proyectoActivoId]: { ...cur, filtro: f } }
      })
    },
    [proyectoActivoId],
  )
  const setOrden = useCallback(
    (o: OrdenMulti) => {
      setVistaStale(false)
      setVistasProyecto((prev) => {
        if (!proyectoActivoId) return prev
        const cur = prev[proyectoActivoId] ?? VISTA_VACIA
        return { ...prev, [proyectoActivoId]: { ...cur, orden: o } }
      })
    },
    [proyectoActivoId],
  )

  const onSelectFrente = useCallback((f: FrenteSel) => {
    setFrenteSel(f)
    setVistaStale(false)
    setMovilSidebar(false)
  }, [])

  const onSelectPantalla = useCallback((p: Pantalla) => {
    setPantalla(p)
    setTareaDetalleId(null)
    setMovilSidebar(false)
  }, [])

  const abrirDetalle = useCallback((tareaId: string) => setTareaDetalleId(tareaId), [])

  // Punto 2: mide el alto de la barra de filtros (sticky) y lo publica en
  // --filtros-h para que el thead de la tabla se congele justo debajo.
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const bar = content.querySelector<HTMLElement>('.filtros-bar')
    if (!bar) {
      content.style.removeProperty('--filtros-h')
      return
    }
    const update = () => content.style.setProperty('--filtros-h', `${bar.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [pantalla, vista, proyectoActivoId])

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
  // P5: en mobile la Gantt no existe; la vista efectiva se fuerza a Tabla.
  const vistaEfectiva: Vista = esMovil ? 'tabla' : vista

  // Candidatos a responsable del proyecto activo: admins, el dueño y los
  // usuarios con acceso.
  const candidatosFiltro = proyecto
    ? state.usuarios.filter(
        (u) =>
          u.activo &&
          (u.rol === 'admin' ||
            u.id === proyecto.duenoId ||
            state.accesos.some((a) => a.usuarioId === u.id && a.proyectoId === proyecto.id)),
      )
    : []
  // Miembros (7): el admin y el dueño pueden abrir la lista del proyecto.
  const puedeVerMiembros = !!proyecto && (esAdmin || esDuenoDe(state, sesion, proyecto.id))
  // Mis Tareas: para el personal de la consultora (admins y consultores).
  const conMisTareas = esAdmin || sesion.rol === 'consultor'

  return (
    <div
      className={`app${sidebarModo === 'escondida' ? ' app--sidebar-escondida' : ''}${
        movilSidebar ? ' app--movil-abierta' : ''
      }`}
    >
      {/* Mobile: boton flotante que llama a la sidebar superpuesta; se
          cierra al elegir una opcion. Oculto en desktop via CSS. */}
      <button
        className="movil-menu"
        aria-label={movilSidebar ? 'Cerrar menu' : 'Abrir menu'}
        onClick={() => setMovilSidebar((v) => !v)}
      >
        {movilSidebar ? '✕' : '☰'}
      </button>
      {/* Interruptor de tema visible y alcanzable en mobile (además del que
          vive en el pie de la sidebar). Oculto en desktop via CSS. */}
      <button
        className="movil-tema"
        aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        onClick={toggleTema}
      >
        {tema === 'oscuro' ? '☀' : '🌙'}
      </button>
      {movilSidebar && <div className="movil-velo" onClick={() => setMovilSidebar(false)} />}
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
          conMisTareas={conMisTareas}
          puedeCrearProyecto={puedeCrearProyectos(sesion)}
          can={can}
          usuario={sesion}
          sidebarModo={sidebarModo}
          onToggleSidebar={toggleSidebarModo}
          tema={tema}
          onToggleTema={toggleTema}
          onSelectProyecto={onSelectProyecto}
          onSelectFrente={onSelectFrente}
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
        ) : pantalla === 'mipanel' && conMisTareas ? (
          <MisTareasView
            state={state}
            usuario={sesion}
            proyectos={proyectosVisibles}
            hoy={HOY}
            actions={actions}
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
              onVista={cambiarVista}
              mostrarToggle={!esMovil}
              contadores={contadores}
              hoy={HOY}
              onMiembros={puedeVerMiembros ? () => setMiembrosAbierto(true) : undefined}
            />
            <div className="content" ref={contentRef}>
              <FiltrosBar
                contexto={proyecto.id}
                usuarioId={sesion.id}
                candidatos={candidatosFiltro}
                filtro={vistaActiva.filtro}
                onCambiar={setFiltro}
                orden={vistaActiva.orden}
                onCambiarOrden={setOrden}
                camposOrden={CAMPOS_PROYECTO}
                vistaGantt={vistaEfectiva === 'gantt'}
                stale={vistaStale}
                onActualizarVista={actualizarVista}
              />
              {vistaEfectiva === 'tabla' ? (
                <TableView
                  state={state}
                  proyectoId={proyecto.id}
                  frenteSel={frenteSel}
                  hoy={HOY}
                  can={can}
                  filtro={vistaActiva.filtro}
                  orden={vistaActiva.orden}
                  snapshotNonce={snapshotNonce}
                  onStale={setVistaStale}
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
                  filtro={vistaActiva.filtro}
                  orden={vistaActiva.orden}
                  onCambiarFiltro={setFiltro}
                  snapshotNonce={snapshotNonce}
                  onStale={setVistaStale}
                  actions={actions}
                  onAbrirTarea={abrirDetalle}
                />
              )}
            </div>
          </>
        ) : (
          <div className="vacio">
            {esAdmin || puedeCrearProyectos(sesion) ? (
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

      {/* Miembros del proyecto (7): el dueño ve QUIENES están, no sus
          permisos; configura solo lo que sus permisos de proyecto habilitan. */}
      {miembrosAbierto && proyecto && (
        <MiembrosModal
          state={state}
          proyecto={proyecto}
          sesion={sesion}
          actions={actions}
          onClose={() => setMiembrosAbierto(false)}
        />
      )}
    </div>
  )
}
