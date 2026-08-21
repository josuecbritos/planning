import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Frente, PermisosTareas, Rol, SubFrente, Tarea, Usuario } from './types'
import { HOY_SIMULADO } from './data/hoy'
import { MENSAJE_SALIDA, makeAuth, type MotivoSalida } from './auth'
import { supabaseConfigured } from './data/client'
import { hoyISO } from './lib/dates'
import { mensajeError } from './lib/errores'
import { contar } from './lib/derive'
import { esDuenoDe, makeCan, miembrosDeProyecto, puedeCrearProyectos, usuariosVisiblesPara } from './lib/permisos'
import type { Filtro } from './lib/filtros'
import { CAMPOS_PROYECTO, type OrdenMulti } from './lib/orden'
import { escribirVistaActiva, estadoInicial, leerGuardados } from './lib/vistas'
import { planMoverTarea } from './lib/mover'
import * as apply from './data/apply'
import { suscribirTabla } from './data/tiempoReal'
import type {
  NuevaTarea,
  NuevoFrente,
  NuevoProyecto,
  NuevoSubFrente,
  NuevoUsuario,
  PatchProyecto,
  PatchTarea,
  PatchUsuario,
  Repo,
} from './data/repo'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { TableView } from './components/TableView'
import { GanttView, type ModoHorizonte } from './components/GanttView'
import { LoginPage } from './components/LoginPage'
import { UsersView } from './components/UsersView'
import { TaskPanel } from './components/TaskPanel'
import { FiltrosBar } from './components/FiltrosBar'
import { MisTareasView } from './components/MisTareasView'
import { MiembrosModal } from './components/MiembrosModal'
import { ResumenView } from './components/ResumenView'
import { AdminProyectosView } from './components/AdminProyectosView'
import { NotificacionesPanel, NotificacionesView } from './components/Notificaciones'
import { DefinirPassword, type FlujoPassword } from './components/DefinirPassword'
import { ConfiguracionView } from './components/ConfiguracionView'
import { IconoMisTareas, IconoResumen } from './components/Iconos'
import type { Notificacion } from './types'

export type Vista = 'tabla' | 'gantt'
export type FrenteSel = string | 'todos'
// 'proyectos' = vista DENTRO de un proyecto. 'admin-proyectos' = módulo de
// administración de proyectos (#132). 'notificaciones' = historial completo (#137).
export type Pantalla =
  | 'proyectos' | 'usuarios' | 'mipanel' | 'resumen' | 'admin-proyectos' | 'notificaciones'
  // #207: configuración de la propia cuenta, desde el pie de la barra lateral.
  | 'configuracion'
/** Modos de la barra lateral (punto 6): fija (default) o escondida. */
export type SidebarModo = 'fija' | 'escondida'
/** Tema de la interfaz (punto 4): sigue `prefers-color-scheme` del sistema por
 * defecto, con override manual persistente por usuario. */
export type Tema = 'claro' | 'oscuro'

/** Acciones expuestas a los componentes. Todas persisten via Repo. */
/**
 * Acciones del producto. Devuelven si el cambio SE APLICÓ (`run` traduce el
 * error a la barra de aviso y responde `false`): quien orquesta varios
 * cambios —el formulario de editar usuario, #303— lo necesita para no dejar
 * nada a medias. Quien solo dispara una acción puede ignorarlo.
 */
export interface Actions {
  createProyecto: (i: NuevoProyecto) => Promise<boolean>
  updateProyecto: (id: string, p: PatchProyecto) => Promise<boolean>
  deleteProyecto: (id: string) => Promise<boolean>
  /** #333: los tres `create` devuelven lo creado (o `null` si falló), igual que
   *  `createUsuario`. Quien crea con la vista congelada necesita el id en el
   *  acto para meterlo en la foto en su posición; `run` ya mostró el error. */
  createFrente: (i: NuevoFrente) => Promise<Frente | null>
  updateFrente: (id: string, p: { nombre?: string; orden?: number }) => Promise<boolean>
  deleteFrente: (id: string) => Promise<boolean>
  createSubFrente: (i: NuevoSubFrente) => Promise<SubFrente | null>
  updateSubFrente: (id: string, p: { nombre?: string; orden?: number }) => Promise<boolean>
  deleteSubFrente: (id: string) => Promise<boolean>
  createTarea: (i: NuevaTarea) => Promise<Tarea | null>
  updateTarea: (id: string, p: PatchTarea) => Promise<boolean>
  deleteTarea: (id: string) => Promise<boolean>
  /** #293: deja la tarea ANTE `antesDeId` (null = al final) del sub frente
   *  destino, renumerando a los hermanos. No toca fecha, responsable ni
   *  estado; no escribe historial ni genera notificación. */
  moverTarea: (tareaId: string, subFrenteId: string, antesDeId: string | null) => Promise<boolean>
  toggleHecha: (tareaId: string, hecha: boolean) => Promise<boolean>
  /** `nueva = null` desplanifica (borra la marca; queda "sin fecha"). */
  cambiarFechaObjetivo: (tareaId: string, nueva: string | null) => Promise<boolean>
  /** #257: devuelve el usuario creado (o null si falló) para poder invitarlo
   *  en el mismo acto. `run` ya se encargó de mostrar el error si lo hubo. */
  createUsuario: (i: NuevoUsuario) => Promise<Usuario | null>
  updateUsuario: (id: string, p: PatchUsuario) => Promise<boolean>
  /** #300: cambia el perfil entre consultor y cliente (solo admin).
   *  #303: devuelve si SE APLICÓ — el formulario de editar usuario lo usa
   *  para no guardar nada más cuando la base rechaza el cambio. */
  cambiarRolUsuario: (id: string, rol: Rol) => Promise<boolean>
  /** #136: eliminar = desactivar + invisible (no hard delete). */
  eliminarUsuario: (id: string) => Promise<boolean>
  asignarAcceso: (usuarioId: string, proyectoId: string) => Promise<boolean>
  quitarAcceso: (usuarioId: string, proyectoId: string) => Promise<boolean>
  /** Configura el set de ocho DE UN ACCESO (usuario × proyecto). */
  updateAccesoPermisos: (usuarioId: string, proyectoId: string, permisos: PermisosTareas) => Promise<boolean>
  addComentario: (tareaId: string, texto: string) => Promise<boolean>
  /** #209: edita el texto del propio comentario (la RLS comprueba la autoría). */
  editComentario: (id: string, texto: string) => Promise<boolean>
  /** #207: cambios en MI propia ficha (nombre e iniciales). A diferencia del
   *  resto, propaga el error en vez de mandarlo al aviso global: la pantalla
   *  de Configuración necesita decir en el sitio si se guardó o no. */
  actualizarPerfil: (patch: PatchUsuario) => Promise<void>
  /** #137: marca todas las notificaciones del usuario actual como leídas. */
  marcarNotificacionesLeidas: () => Promise<boolean>
  /** #289: vistas guardadas, ahora en la base. `crearVista` devuelve el id
   *  que asignó la base (o null si falló), para poder entrar a la recién
   *  creada como antes. */
  crearVista: (contexto: string, nombre: string, filtro: Filtro, orden: OrdenMulti) => Promise<string | null>
  guardarVista: (id: string, patch: { nombre?: string; filtro?: Filtro; orden?: OrdenMulti }) => Promise<boolean>
  eliminarVista: (id: string) => Promise<boolean>
}

/** Vista de la pantalla de proyecto (punto 3/4): filtro, orden y la vista
 *  guardada en la que se está, juntos. Se recarga al entrar a cada proyecto
 *  (#221), así que no se contamina entre uno y otro. Referencias estables para
 *  el estado "vacío". */
interface VistaProyecto {
  filtro: Filtro
  orden: OrdenMulti
  /** #215: vista guardada en la que se está, o null (filtro suelto). */
  vistaActivaId: string | null
}
const FILTRO_VACIO: Filtro = {}
const ORDEN_VACIO: OrdenMulti = []
const VISTA_VACIA: VistaProyecto = { filtro: FILTRO_VACIO, orden: ORDEN_VACIO, vistaActivaId: null }

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

// --- #226: ancho de la barra lateral, ajustable arrastrando su borde ---
// Preferencia por usuario, con el MISMO mecanismo que el tema y el modo de la
// barra (localStorage): no toca la base de datos. Solo aplica en escritorio;
// en mobile la barra es un panel superpuesto de ancho fijo.
export const SIDEBAR_ANCHO_MIN = 244
export const SIDEBAR_ANCHO_MAX = 400

function acotarAncho(px: number): number {
  return Math.min(SIDEBAR_ANCHO_MAX, Math.max(SIDEBAR_ANCHO_MIN, Math.round(px)))
}

/** Ancho guardado del usuario, o el mínimo (= el ancho de siempre) si no hay. */
function leerAnchoSidebar(usuarioId: string | null): number {
  if (!usuarioId) return SIDEBAR_ANCHO_MIN
  try {
    const v = Number(localStorage.getItem(`planificador.sidebarAncho.${usuarioId}`))
    return Number.isFinite(v) && v > 0 ? acotarAncho(v) : SIDEBAR_ANCHO_MIN
  } catch {
    return SIDEBAR_ANCHO_MIN
  }
}

export default function App({ repo }: { repo: Repo }) {
  const auth = useMemo(() => makeAuth(repo), [repo])
  // #247: "hoy" se recalcula solo. Antes se fijaba al montar, así que una
  // pestaña abierta al cruzar la medianoche seguía calculando categorías,
  // atrasos, la columna de hoy de la Gantt y la fecha de "marcar hecha" con el
  // día anterior. Con sesiones que no expiran (#244), tener la aplicación
  // abierta varios días es un caso real. Se revisa cada minuto y solo se
  // actualiza el estado si el día CAMBIÓ, así no provoca renders de más ni
  // interrumpe lo que se esté haciendo. En modo Local la fecha es simulada y
  // fija a propósito: ahí no hay nada que recalcular.
  const [HOY, setHoy] = useState<string>(() => (supabaseConfigured ? hoyISO() : HOY_SIMULADO))
  useEffect(() => {
    if (!supabaseConfigured) return
    const revisar = () => setHoy((actual) => (hoyISO() === actual ? actual : hoyISO()))
    const id = window.setInterval(revisar, 60_000)
    // Volver a la pestaña tras dejarla dormida es el caso más frecuente de
    // todos: se comprueba en el acto, sin esperar al siguiente minuto.
    document.addEventListener('visibilitychange', revisar)
    window.addEventListener('focus', revisar)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', revisar)
      window.removeEventListener('focus', revisar)
    }
  }, [])

  // §8 / #205: enlaces por correo — invitación (#invitacion=TOKEN) y
  // recuperación (#recuperar=TOKEN). Tienen prioridad sobre todo: los dos
  // llevan a la MISMA pantalla, que solo cambia de texto (#204).
  const [enlace, setEnlace] = useState<{ flujo: FlujoPassword; token: string } | null>(() => {
    const inv = window.location.hash.match(/#invitacion=([\w-]+)/)
    if (inv) return { flujo: 'invitacion', token: inv[1] }
    const rec = window.location.hash.match(/#recuperar=([\w-]+)/)
    if (rec) return { flujo: 'recuperacion', token: rec[1] }
    return null
  })

  // undefined = comprobando sesion; null = sin sesion.
  const [sesion, setSesion] = useState<Usuario | null | undefined>(undefined)
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('tabla')
  // #274: la aplicación SIEMPRE parte en Resumen — también al volver a entrar,
  // sea cual sea el rol. No se recuerda el último proyecto visitado: decisión
  // tomada, no simplificación. (Llegar desde una notificación navega después.)
  const [pantalla, setPantalla] = useState<Pantalla>('resumen')
  // P1: vista congelada ("foto"). El nonce fuerza el re-snapshot al tocar
  // "Actualizar vista"; `vistaStale` lo reporta la vista activa (tabla/Gantt).
  const [snapshotNonce, setSnapshotNonce] = useState(0)
  const [vistaStale, setVistaStale] = useState(false)
  // #305: el horizonte de la Gantt se elige en el control "Rango" de la barra
  // de controles y lo usa la grilla, así que su estado vive acá, entre las dos.
  // No se persiste: cada entrada a un proyecto arranca en "Alrededor de hoy".
  const [ganttModo, setGanttModo] = useState<ModoHorizonte>('hoy')
  const [ganttHabiles, setGanttHabiles] = useState(true)
  // §6.3.20: tareas con fecha de fin de semana que el modo hábil esconde. Lo
  // informa la grilla; "Rango" lo muestra como círculo.
  const [ganttOcultas, setGanttOcultas] = useState(0)
  // Punto 6: modo de la sidebar. Primera preferencia persistente de la app
  // (por usuario, sobrevive a recargas y sesiones posteriores).
  const [sidebarModo, setSidebarModo] = useState<SidebarModo>('fija')
  // #226: ancho de la barra (escritorio), ajustable arrastrando su borde
  // derecho. Se recuerda por usuario junto al modo y al tema.
  const [sidebarAncho, setSidebarAncho] = useState(SIDEBAR_ANCHO_MIN)
  const [redimensionando, setRedimensionando] = useState(false)
  // Punto 3/4 + #215/#221: filtro + orden de la pantalla de proyecto. Es UNO
  // solo, no un mapa por proyecto: al entrar a una pantalla se carga lo que
  // corresponda y al salir no queda nada que recordar. Cambiar de proyecto es
  // cambiar de pantalla.
  const [vistaActiva, setVistaActiva] = useState<VistaProyecto>(VISTA_VACIA)
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
  // #137: panel de notificaciones (anclado a la barra) y tarea a resaltar al
  // navegar desde un aviso.
  const [notifAbierto, setNotifAbierto] = useState(false)
  // #263: ¿hay un menú ⋯ (proyecto o frente) desplegado en la barra? Con la
  // barra escondida, mientras el panel de notificaciones o un ⋯ estén abiertos
  // la barra se sostiene desplegada (clase app--sidebar-sostenida); si no, al
  // salir el mouse la barra se contrae y el popover queda flotando, huérfano.
  const [menuSidebarAbierto, setMenuSidebarAbierto] = useState(false)
  const [tareaResaltada, setTareaResaltada] = useState<string | null>(null)
  // #253: ids de las tareas creadas desde la última foto. Con un orden (o un
  // filtro) aplicado, la vista congelada dejaba fuera a la recién creada y se
  // leía como que no se había guardado. Se fuerza su aparición con el MISMO
  // mecanismo que ya usa la llegada desde una notificación, y se enciende
  // "Actualizar vista"; la lista no se reordena sola.
  const [tareasNuevas, setTareasNuevas] = useState<string[]>([])
  // #333: lo mismo para los CONTENEDORES. Un frente o un sub frente recién
  // creado nace vacío, y con un filtro puesto la vista omite los contenedores
  // sin coincidencias: el elemento nuevo no aparecía en ninguna parte —ni en su
  // sitio ni fuera de él— hasta quitar el filtro. Se muestra por la misma razón
  // que la tarea recién creada, y con "Actualizar vista" encendido.
  const [contenedoresNuevos, setContenedoresNuevos] = useState<string[]>([])
  // #219: contador que sube en cada llegada desde una notificación. Sin él, si
  // ya estás en el proyecto de la tarea, `setTareaResaltada` asigna el MISMO
  // valor, React descarta la actualización y el efecto del realce no vuelve a
  // correr: la notificación parecía no hacer nada. Con el contador, cada toque
  // es un evento distinto aunque la tarea sea la misma.
  const [resaltadoNonce, setResaltadoNonce] = useState(0)
  // #179: proyecto al que se llegó desde una notificación SIN ser miembro. Se
  // muestra de forma transitoria (no entra a la barra lateral); se suelta al
  // navegar a cualquier otra cosa.
  const [peekProyectoId, setPeekProyectoId] = useState<string | null>(null)
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

  // Fija el actor en el repo (#137): en modo Local atribuye acciones y genera
  // notificaciones; en Supabase es no-op (el actor sale del JWT).
  useEffect(() => {
    repo.setActor(sesion?.id ?? null)
  }, [repo, sesion])

  // Cargar las preferencias de sidebar del usuario al iniciar sesion: modo
  // (punto 6) y ancho (#226).
  useEffect(() => {
    if (!sesion) return
    setSidebarAncho(leerAnchoSidebar(sesion.id))
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

  // #226: persistir el ancho elegido. Se llama al soltar el arrastre y al
  // restablecer con doble clic, no en cada píxel del movimiento.
  const guardarAncho = useCallback(
    (px: number) => {
      if (!sesion) return
      try {
        localStorage.setItem(`planificador.sidebarAncho.${sesion.id}`, String(px))
      } catch {
        /* sin persistencia: el ancho aplica igual en esta sesion */
      }
    },
    [sesion],
  )

  // #226: arrastre del borde derecho. Se usa `setPointerCapture` para que el
  // gesto siga vivo aunque el cursor se salga de la manija o pase por encima
  // de un iframe/tabla; el ancho se recalcula desde el DELTA, así vale igual
  // con la barra fija (empieza en 0) que escondida (empieza en 54px).
  const onResizeInicio = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const manija = e.currentTarget
      const x0 = e.clientX
      const w0 = sidebarAncho
      manija.setPointerCapture(e.pointerId)
      setRedimensionando(true)
      const mover = (ev: PointerEvent) => setSidebarAncho(acotarAncho(w0 + (ev.clientX - x0)))
      const soltar = (ev: PointerEvent) => {
        manija.removeEventListener('pointermove', mover)
        manija.removeEventListener('pointerup', soltar)
        manija.removeEventListener('pointercancel', soltar)
        const fin = acotarAncho(w0 + (ev.clientX - x0))
        setSidebarAncho(fin)
        setRedimensionando(false)
        guardarAncho(fin)
      }
      manija.addEventListener('pointermove', mover)
      manija.addEventListener('pointerup', soltar)
      manija.addEventListener('pointercancel', soltar)
    },
    [sidebarAncho, guardarAncho],
  )

  /** #226: doble clic en el borde → ancho por defecto. Nadie queda atrapado. */
  const onResizeReset = useCallback(() => {
    setSidebarAncho(SIDEBAR_ANCHO_MIN)
    guardarAncho(SIDEBAR_ANCHO_MIN)
  }, [guardarAncho])

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
      // #210: un fallo de red se muestra entendible; el resto, tal cual.
      .catch((e) => vivo && setError(mensajeError(e)))
    return () => {
      vivo = false
    }
  }, [repo, sesion])

  // El estado del último render, para que la relectura del canal pueda
  // compararse contra "lo que había" sin sumar dependencias al efecto.
  const stateRef = useRef<AppState | null>(null)
  stateRef.current = state

  // #255/#260 — Tiempo real: la campana (entrega 1) y los datos (entrega 2).
  //
  // El canal AVISA; la verdad se relee de la base (principio 1): cada evento
  // —de cualquier tabla—, la reconexión y el despertar de la pestaña disparan
  // la MISMA relectura, cuyo resultado REEMPLAZA el estado. Nunca se aplica el
  // contenido de un evento. Por eso el eco no existe (releer tras una acción
  // propia devuelve el mismo estado final) y una pestaña dormida queda bien al
  // despertar sin importar qué eventos perdió.
  //
  // La relectura es UNA y es COMPLETA (loadState) a propósito: la notificación
  // y su tarea llegan en el mismo estado, atómicamente. Con relecturas
  // separadas la campana podía anunciar una tarea que el navegador aún no
  // tenía — y el clic diría "ya no existe" siendo mentira, justo lo que el
  // pedido prohíbe.
  //
  // Los borradores en curso (un título a medio editar, un comentario a medio
  // escribir, un selector abierto) NO se pisan: viven como estado local de sus
  // componentes, y las filas tienen key estable — reemplazar el estado de
  // fondo re-renderiza sin desmontar. Al guardar, gana el último en guardar.
  //
  // Si el canal no conecta, no pasa nada visible (principio 2): todo al
  // recargar, como siempre. En modo Local no hay canal.
  //
  // #260: las tablas publicadas son las que hacen VISIBLE lo que las
  // notificaciones anuncian (criterio del dueño). `usuario` queda fuera a
  // sabiendas: un cambio de nombre se ve al recargar. Las de datos van SIN
  // filtro de servidor: su visibilidad la decide la RLS por membresía, que
  // Realtime evalúa con el JWT del suscriptor. La cañería es la de #255
  // (`suscribirTabla`), sin cambios.
  const TABLAS_VIVAS = [
    'tarea', 'frente', 'sub_frente', 'proyecto',
    'acceso_proyecto', 'comentario', 'replanificacion',
  ]
  useEffect(() => {
    if (repo.modo !== 'supabase' || !sesion) return
    let vivo = true
    let pendiente: number | null = null

    // Coalesce: una ráfaga de avisos (p. ej. crear frente + sub frente +
    // tarea, o un borrado en cascada) produce UNA relectura, no una por evento.
    const releer = () => {
      if (pendiente !== null) return
      pendiente = window.setTimeout(async () => {
        pendiente = null
        try {
          const ns = await repo.loadState()
          if (!vivo) return
          // #253 aplicado a los AJENOS: una tarea que otro creó se trata igual
          // que una creada por uno mismo — se fuerza su aparición aunque la
          // foto congelada la deje fuera, con "Actualizar vista" encendido, y
          // sin reordenar nada. "Actualizar vista" las suelta, como siempre.
          const prev = stateRef.current
          if (prev) {
            const conocidas = new Set(prev.tareas.map((t) => t.id))
            const recienLlegadas = ns.tareas.filter((t) => !conocidas.has(t.id)).map((t) => t.id)
            if (recienLlegadas.length) {
              setTareasNuevas((pv) => [...pv, ...recienLlegadas.filter((id) => !pv.includes(id))])
            }
          }
          setState(ns)
        } catch {
          // Silencio (principio 2): el próximo aviso o el próximo foco
          // reintentan; mientras tanto la pantalla muestra lo último leído.
        }
      }, 250)
    }

    const subs = [
      suscribirTabla({
        tabla: 'notificacion',
        // Acota el tráfico a lo propio. La BARRERA es la RLS, que Realtime
        // evalúa con el JWT del suscriptor; esto solo evita ruido.
        filtro: `usuario_id=eq.${sesion.id}`,
        alAviso: releer,
      }),
      ...TABLAS_VIVAS.map((tabla) => suscribirTabla({ tabla, alAviso: releer })),
    ]

    // Pestaña dormida o fuera de foco: el canal pudo perder eventos que no se
    // recuperan. Al volver, se relee — el mismo patrón que #247 con "hoy".
    const alVolver = () => {
      if (document.visibilityState === 'visible') releer()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      vivo = false
      if (pendiente !== null) window.clearTimeout(pendiente)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      for (const s of subs) s.cerrar()
    }
    // TABLAS_VIVAS es constante; no entra en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, sesion])


  // Proyectos visibles = de los que ERES MIEMBRO (pedido §3): dueño o con
  // acceso. Vale para TODOS los roles, admin incluido — el admin ya no queda
  // asociado por default a cada proyecto; se agrega/saca desde el Módulo de
  // Usuarios. Su poder no cambia: sigue viendo y gestionando cualquier
  // proyecto desde ahí (donde la lista es completa), pero su barra lateral
  // solo muestra los proyectos donde es miembro.
  // Proyectos de los que ERES MIEMBRO (dueño o con acceso), en cualquier
  // estado. El módulo Administración → Proyectos (#132) trabaja sobre esta
  // lista (incluye archivados, con su propio filtro).
  // #179: la barra lateral (y Resumen / Mis Tareas) muestran SOLO los proyectos
  // de los que el usuario es MIEMBRO — dueño o con acceso — para todos los roles,
  // admin incluido. El módulo Administración → Proyectos sí ve todos (proyectos-
  // Admin). Ser responsable de una tarea NO alcanza para aparecer aquí (eso
  // arrastraba proyectos ajenos a la barra). La navegación desde una notificación
  // a un proyecto no-miembro se resuelve con `peekProyectoId` (abajo).
  const proyectosMiembro = useMemo(() => {
    if (!state || !sesion) return []
    const ids = new Set(state.accesos.filter((a) => a.usuarioId === sesion.id).map((a) => a.proyectoId))
    return state.proyectos.filter((p) => p.duenoId === sesion.id || ids.has(p.id))
  }, [state, sesion])

  // #133: los archivados salen de la barra lateral, Resumen y Mis Tareas.
  const proyectosVisibles = useMemo(
    () => proyectosMiembro.filter((p) => p.estado !== 'archivado'),
    [proyectosMiembro],
  )

  // #260 — El acceso quitado no rompe la pantalla. Si el proyecto que se está
  // mirando deja de ser accesible —quitaron el acceso, lo archivaron o lo
  // eliminaron—, la aplicación lleva al Resumen, sin error. Decisión del
  // pedido: al Resumen, y la persona sigue trabajando.
  //
  // El "peek" (#179, mirar un proyecto ajeno llegando desde una notificación)
  // se respeta: ahí `proyectoActivoId` nunca fue de un miembro y la vista es
  // deliberada; solo se expulsa si el proyecto desapareció o se archivó.
  useEffect(() => {
    if (!state || pantalla !== 'proyectos' || !proyectoActivoId) return
    const p = state.proyectos.find((x) => x.id === proyectoActivoId)
    const esMiembro = proyectosVisibles.some((x) => x.id === proyectoActivoId)
    const esPeek = proyectoActivoId === peekProyectoId && !!p && p.estado !== 'archivado'
    if (esMiembro || esPeek) return
    setPantalla('resumen')
    setProyectoActivoId(null)
    setPeekProyectoId(null)
    setTareaDetalleId(null)
  }, [state, pantalla, proyectoActivoId, proyectosVisibles, peekProyectoId])

  // #146: administrar ≠ ser miembro. El módulo Administración → Proyectos usa
  // TODO lo que la RLS entrega: para el admin son todos los proyectos (sea o no
  // miembro); para el consultor, los suyos (dueño + asignados). La barra lateral
  // sigue con proyectosVisibles (solo donde es miembro).
  const proyectosAdmin = useMemo(
    () => (esAdmin ? state?.proyectos ?? [] : proyectosMiembro),
    [esAdmin, state, proyectosMiembro],
  )

  // #289: las vistas guardadas del proyecto abierto. Salen del estado ya
  // cargado; en Supabase la RLS solo entrega las propias y el filtro por
  // usuario mantiene la regla también en modo Local.
  const vistasDeProyecto = useMemo(
    () => leerGuardados(state, sesion?.id ?? '', proyectoActivoId ?? ''),
    [state, sesion, proyectoActivoId],
  )

  // #137: mis notificaciones (más recientes primero) y cuántas sin leer.
  // #283: la entrega depende del acceso AL PROYECTO de la tarea — el mismo
  // criterio del resto de la app (admin, dueño o fila de acceso). En Supabase
  // la RLS ya filtra (migración 23) y esta condición no quita nada; en modo
  // Local emula esa política. Las que no pasan no se borran: quedan guardadas
  // e invisibles, y vuelven intactas si se recupera el acceso.
  const notifsMias = useMemo(() => {
    if (!state || !sesion) return [] as Notificacion[]
    const conAccesoAlProyectoDe = (tareaId: string): boolean => {
      if (esAdmin) return true
      const t = state.tareas.find((x) => x.id === tareaId)
      const sf = t && state.subFrentes.find((x) => x.id === t.subFrenteId)
      const f = sf && state.frentes.find((x) => x.id === sf.frenteId)
      if (!f) return false
      return (
        state.proyectos.some((p) => p.id === f.proyectoId && p.duenoId === sesion.id) ||
        state.accesos.some((a) => a.usuarioId === sesion.id && a.proyectoId === f.proyectoId)
      )
    }
    return state.notificaciones
      .filter((n) => n.usuarioId === sesion.id && conAccesoAlProyectoDe(n.tareaId))
      .sort((a, b) => (a.creada < b.creada ? 1 : -1))
  }, [state, sesion, esAdmin])
  const noLeidas = notifsMias.filter((n) => !n.leida).length

  // Seleccion inicial / correccion de proyecto activo.
  useEffect(() => {
    if (!state || !sesion) return
    setProyectoActivoId((prev) => {
      // #179: no descartar el proyecto "peek" (llegado por notificación).
      if (prev && (proyectosVisibles.some((p) => p.id === prev) || prev === peekProyectoId)) return prev
      return proyectosVisibles[0]?.id ?? null
    })
  }, [state, sesion, proyectosVisibles, peekProyectoId])

  // #244: la sesión se cayó sola. Se sale al login con el motivo, en vez de
  // dejar un error del servidor —en inglés— sobre una pantalla que ya no
  // responde. Lo que estuviera a medio escribir se pierde: decisión tomada.
  const [motivoSalida, setMotivoSalida] = useState<MotivoSalida | null>(null)
  /**
   * #282: CERROJO de salida — se levanta al iniciar cualquier salida (el
   * "Salir" del usuario o una expulsión por sesión) y solo se baja al volver
   * a entrar (onLogin). Antes era una bandera de un solo uso que consumía el
   * primer SIGNED_OUT, pero un "Salir" puede producir MÁS de una señal en la
   * misma pestaña: el servicio puede emitir SIGNED_OUT duplicado, y una
   * acción en vuelo al momento de salir falla al revocarse la sesión — su
   * catch diagnostica 'expirada' sin pasar por la bandera. La segunda señal
   * encontraba la bandera consumida y mostraba "Tu sesión ha expirado" tras
   * una salida voluntaria (caso A de #282). Con el cerrojo, toda señal
   * posterior a una salida ya en curso se ignora.
   */
  const salidaEnCurso = useRef(false)
  const salirPorSesion = useCallback(
    (motivo: MotivoSalida) => {
      if (salidaEnCurso.current) return // #282: ya se salió; nada que avisar
      salidaEnCurso.current = true
      setMotivoSalida(motivo)
      setSesion(null)
      setState(null)
      setProyectoActivoId(null)
      setTareaDetalleId(null)
      setError(null)
      void auth.logout().catch(() => {})
    },
    [auth],
  )

  // El servicio de autenticación avisa que la sesión dejó de existir (cambio
  // de contraseña desde otro dispositivo, cierre en otra pestaña, refresco
  // fallido). Si la cuenta siguiera activa no habría evento: una desactivación
  // no cierra la sesión de Auth, la detecta `diagnosticar` al fallar la acción.
  useEffect(
    () =>
      auth.alPerderSesion(() => {
        // #282: sin consumo — el cerrojo sigue puesto hasta el próximo login,
        // así un SIGNED_OUT duplicado del mismo "Salir" tampoco avisa.
        if (salidaEnCurso.current) return
        salirPorSesion('expirada')
      }),
    [auth, salirPorSesion],
  )

  /**
   * Ejecuta una acción y aplica su parche al estado. Devuelve si SE APLICÓ:
   * #303 lo necesita para ordenar un formulario cuyos cambios no viajan por
   * el mismo camino —si el cambio de perfil se rechaza, no se aplica ningún
   * otro— sin tener que duplicar el manejo de errores de acá.
   */
  const run = useCallback(
    async (fn: () => Promise<(s: AppState) => AppState>): Promise<boolean> => {
      try {
        const patch = await fn()
        setState((s) => (s ? patch(s) : s))
        return true
      } catch (e) {
        // #244: antes de mostrar nada, se comprueba si el problema es que la
        // sesión dejó de servir. Si lo es, se sale al login con el motivo en
        // vez de dejar el error crudo del servidor y la pantalla muerta.
        const motivo = await auth.diagnosticar().catch(() => null)
        if (motivo) {
          salirPorSesion(motivo)
          return false
        }
        setError(mensajeError(e)) // #210
        return false
      }
    },
    [auth, salirPorSesion],
  )

  const actions: Actions = useMemo(
    () => ({
      createProyecto: (i) =>
        run(async () => {
          const p = await repo.createProyecto({ ...i, creadoPor: sesion?.id })
          // #297: el proyecto entra al ESTADO antes de navegar hacia él, en el
          // mismo lote que la navegación. `run` aplica el parche al terminar,
          // pero eso cae en un render posterior: entremedio la pantalla
          // apuntaba a un proyecto que el estado todavía no tenía, y el efecto
          // que corrige el proyecto activo (#260) lo leía como "ya no
          // accesible" y devolvía a Resumen. Se veía solo cuando la respuesta
          // llegaba muy rápido —siempre en modo Local—; con la latencia de red
          // los dos cambios caían en el mismo lote y no se notaba.
          // `upsertProyecto` es idempotente: aplicarlo dos veces no cambia nada.
          setState((s) => (s ? apply.upsertProyecto(s, p) : s))
          setProyectoActivoId(p.id)
          // #297: entrar al proyecto nuevo con la selección de frente LIMPIA,
          // igual que por cualquier otro camino de entrada. Sin esto se
          // entraba filtrando por un frente de OTRO proyecto: la vista
          // principal no encontraba nada y mostraba "aún no tiene frentes"
          // incluso después de crear el primero (la barra lateral, que no
          // filtra por frente, sí lo mostraba — de ahí lo desconcertante).
          setFrenteSel('todos')
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
      createFrente: async (i) => {
        const salida: { frente: Frente | null } = { frente: null }
        await run(async () => {
          const f = await repo.createFrente(i)
          salida.frente = f
          setContenedoresNuevos((prev) => (prev.includes(f.id) ? prev : [...prev, f.id]))
          return (s) => apply.upsertFrente(s, f)
        })
        return salida.frente
      },
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
      createSubFrente: async (i) => {
        const salida: { sub: SubFrente | null } = { sub: null }
        await run(async () => {
          const sf = await repo.createSubFrente(i)
          salida.sub = sf
          setContenedoresNuevos((prev) => (prev.includes(sf.id) ? prev : [...prev, sf.id]))
          return (s) => apply.upsertSubFrente(s, sf)
        })
        return salida.sub
      },
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
      createTarea: async (i) => {
        const salida: { tarea: Tarea | null } = { tarea: null }
        await run(async () => {
          const t = await repo.createTarea(i)
          salida.tarea = t
          setTareasNuevas((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]))
          return (s) => apply.upsertTarea(s, t)
        })
        return salida.tarea
      },
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
      // #293 — mover arrastrando. El plan renumera el sub frente destino
      // completo; acá solo se persiste lo que cambia. La tarea movida va
      // PRIMERO y esperada: si la base rechaza el movimiento (permiso o
      // proyecto), los hermanos no quedan renumerados a medias.
      moverTarea: (tareaId, subFrenteId, antesDeId) =>
        run(async () => {
          const s = stateRef.current
          if (!s) return (x) => x
          const plan = planMoverTarea(s.tareas, tareaId, subFrenteId, antesDeId)
          if (plan.length === 0) return (x) => x
          const movida = plan.find((m) => m.id === tareaId)
          const resto = plan.filter((m) => m.id !== tareaId)
          const actualizadas: Tarea[] = []
          if (movida) {
            actualizadas.push(
              await repo.updateTarea(
                movida.id,
                movida.subFrenteId
                  ? { orden: movida.orden, subFrenteId: movida.subFrenteId }
                  : { orden: movida.orden },
              ),
            )
          }
          actualizadas.push(...(await Promise.all(resto.map((m) => repo.updateTarea(m.id, { orden: m.orden })))))
          return (s2) => actualizadas.reduce(apply.upsertTarea, s2)
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
      createUsuario: async (i) => {
        const salida: { usuario: Usuario | null } = { usuario: null }
        await run(async () => {
          const u = await repo.createUsuario(i)
          salida.usuario = u
          return (s) => apply.upsertUsuario(s, u)
        })
        return salida.usuario
      },
      updateUsuario: (id, p) =>
        run(async () => {
          const u = await repo.updateUsuario(id, p)
          return (s) => apply.upsertUsuario(s, u)
        }),
      cambiarRolUsuario: (id, rol) =>
        run(async () => {
          const u = await repo.cambiarRolUsuario(id, rol, sesion?.id)
          return (s) => apply.upsertUsuario(s, u)
        }),
      eliminarUsuario: (id) =>
        run(async () => {
          await repo.eliminarUsuario(id)
          // #136: desaparece de la UI (la fila queda en la base, invisible).
          // #301: sus accesos a proyectos se fueron con él, así que también
          // salen del estado local — si no, la pantalla seguiría mostrándolo
          // como miembro de proyectos de los que ya no lo es.
          return (s) => apply.removeUsuario(s, id)
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
      editComentario: (id, texto) =>
        run(async () => {
          const c = await repo.editComentario(id, texto)
          return (s) => apply.updateComentario(s, c)
        }),
      actualizarPerfil: async (patch) => {
        if (!sesion) return
        const u = await repo.updateUsuario(sesion.id, patch)
        setState((s) => (s ? apply.upsertUsuario(s, u) : s))
        // La sesión es una copia aparte del estado: sin esto, el pie de la
        // barra lateral seguiría mostrando el nombre viejo hasta recargar.
        setSesion(u)
      },
      marcarNotificacionesLeidas: () =>
        run(async () => {
          const ids = sesion ? await repo.marcarNotificacionesLeidas(sesion.id) : []
          return (s) => apply.marcarNotificacionesLeidas(s, ids)
        }),
      // #289 — vistas guardadas. `crearVista` no pasa por `run` porque
      // necesita devolver el id nuevo a quien la llamó (para entrar a la
      // vista recién creada); el diagnóstico de sesión se hace igual.
      crearVista: async (contexto, nombre, filtro, orden) => {
        try {
          const v = await repo.createVista({ contexto, nombre, filtro, orden })
          setState((s) => (s ? apply.upsertVista(s, v) : s))
          return v.id
        } catch (e) {
          const motivo = await auth.diagnosticar().catch(() => null)
          if (motivo) salirPorSesion(motivo)
          else setError(mensajeError(e))
          return null
        }
      },
      guardarVista: (id, patch) =>
        run(async () => {
          const v = await repo.updateVista(id, patch)
          return (s) => apply.upsertVista(s, v)
        }),
      eliminarVista: (id) =>
        run(async () => {
          await repo.deleteVista(id)
          return (s) => apply.removeVista(s, id)
        }),
    }),
    [repo, run, HOY, sesion, auth, salirPorSesion],
  )

  const onLogin = useCallback(
    async (email: string, password?: string) => {
      const u = await auth.login(email, password)
      salidaEnCurso.current = false // #282: sesión nueva, el cerrojo se rearma
      setSesion(u)
      setPantalla('resumen') // #274: cada entrada parte en Resumen
      setFrenteSel('todos')
    },
    [auth],
  )

  const onLogout = useCallback(async () => {
    salidaEnCurso.current = true // #244/#282: salida propia, sin aviso
    setMotivoSalida(null)
    await auth.logout()
    setSesion(null)
    setState(null)
    setProyectoActivoId(null)
  }, [auth])

  // P1: "Actualizar vista" recalcula la foto (nuevo snapshot) y baja el flag.
  // #158: también suelta la tarea resaltada/forzada — al recalcular, si el
  // filtro la excluye, deja de mostrarse.
  const actualizarVista = useCallback(() => {
    setSnapshotNonce((n) => n + 1)
    setVistaStale(false)
    setTareaResaltada(null)
    setTareasNuevas([])
    setContenedoresNuevos([])
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
    // #221: el filtro no se arrastra entre proyectos. Lo carga el efecto de
    // entrada a la pantalla, que restaura la vista guardada o deja limpio.
    setVistaStale(false)
    setMovilSidebar(false)
    setTareaResaltada(null) // #158: navegar suelta el resaltado
    setPeekProyectoId(null) // #179
  }, [])

  // #221: al ENTRAR a la pantalla de un proyecto se carga su vista guardada, y
  // nada más. Salir descarta lo no guardado, y cambiar de proyecto es salir:
  // cada proyecto es una pantalla distinta. La regla queda sin excepciones —
  // lo que se guardó explícitamente persiste; lo demás se descarta—.
  //
  // (#215 había mantenido en memoria el filtro suelto de cada proyecto dentro
  // de la sesión. Era una contradicción con la propia regla y se elimina.)
  //
  // Depende de `sesion?.id`, NO del objeto: la sesión se reemplaza al editar el
  // propio perfil (#207) y eso no debe reiniciar el filtro que se esté usando.
  const sesionId = sesion?.id
  useEffect(() => {
    if (!proyectoActivoId || !sesionId || pantalla !== 'proyectos') return
    setVistaActiva(estadoInicial(stateRef.current, sesionId, proyectoActivoId))
    // `state` NO va en las dependencias a propósito: la vista de entrada se
    // resuelve UNA vez al entrar a la pantalla (#221). Que llegue un cambio
    // de otro no debe reiniciar el filtro que se está usando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoActivoId, pantalla, sesionId])

  // #215: entrar o salir de una vista guardada. Se persiste el id, nunca el
  // filtro: lo que no se guardó es temporal.
  const setVistaGuardada = useCallback(
    (id: string | null) => {
      if (!proyectoActivoId || !sesionId) return
      escribirVistaActiva(sesionId, proyectoActivoId, id)
      setVistaActiva((cur) => ({ ...cur, vistaActivaId: id }))
    },
    [proyectoActivoId, sesionId],
  )
  const setFiltro = useCallback((f: Filtro) => {
    // Cambiar el filtro recalcula la foto (no es una "edición" de datos).
    setVistaStale(false)
    // #173: cambiar el filtro suelta la tarea insertada por una notificación,
    // para que la foto vuelva a ser consistente con el filtro (no persiste).
    setTareaResaltada(null)
    setVistaActiva((cur) => ({ ...cur, filtro: f }))
  }, [])
  const setOrden = useCallback((o: OrdenMulti) => {
    setVistaStale(false)
    setTareaResaltada(null) // #173
    setVistaActiva((cur) => ({ ...cur, orden: o }))
  }, [])

  const onSelectFrente = useCallback((f: FrenteSel) => {
    setFrenteSel(f)
    setVistaStale(false)
    setMovilSidebar(false)
    setTareaResaltada(null) // #158
  }, [])

  const onSelectPantalla = useCallback((p: Pantalla) => {
    setPantalla(p)
    setTareaDetalleId(null)
    setMovilSidebar(false)
    setTareaResaltada(null) // #158
    setPeekProyectoId(null) // #179
  }, [])

  const abrirDetalle = useCallback((tareaId: string) => setTareaDetalleId(tareaId), [])

  // #156: cerrar el panel marca todo como leído (y el contador desaparece).
  // Mientras está abierto, lo no leído conserva su estilo destacado.
  const cerrarNotificaciones = useCallback(() => {
    setNotifAbierto(false)
    if (noLeidas > 0) actions.marcarNotificacionesLeidas()
  }, [noLeidas, actions])

  // #137/#156: abrir/cerrar el panel. Al ABRIR ya no se marca nada; se marca al
  // cerrar (arriba).
  const abrirNotificaciones = useCallback(() => {
    if (notifAbierto) cerrarNotificaciones()
    else {
      // #195: en mobile el panel va a pantalla completa, así que el drawer se
      // cierra al abrirlo — dos capas flotantes encimadas en 390px es peor
      // que cerrar una.
      setMovilSidebar(false)
      setNotifAbierto(true)
    }
  }, [notifAbierto, cerrarNotificaciones])

  // #137: click en un aviso → ir a la Tabla del proyecto, resaltar la tarea y
  // abrir su panel de detalle. Si el filtro la excluye, la Tabla la muestra
  // igual (y queda "Actualizar vista"); #158: la tarea forzada PERMANECE hasta
  // que el usuario navegue o actualice la vista, no se cae sola.
  const abrirNotificacion = useCallback(
    (n: Notificacion) => {
      cerrarNotificaciones()
      if (!state) return
      const tarea = state.tareas.find((t) => t.id === n.tareaId)
      // #246: la tarea ya no existe. Antes el clic no hacía nada y la
      // notificación parecía rota. Se avisa por el banner de siempre y se
      // retira de la lista (la base ya la borró en cascada; esto pone al día
      // la pantalla sin recargar).
      if (!tarea) {
        setError('Esta tarea ya no existe.')
        setState((prev) =>
          prev ? { ...prev, notificaciones: prev.notificaciones.filter((x) => x.id !== n.id) } : prev,
        )
        return
      }
      const sf = state.subFrentes.find((x) => x.id === tarea.subFrenteId)
      const f = sf && state.frentes.find((x) => x.id === sf.frenteId)
      if (f) {
        setProyectoActivoId(f.proyectoId)
        // #179: si el proyecto no es de los que soy miembro, se muestra en modo
        // "peek" (transitorio), sin entrar a la barra lateral.
        const esMiembro = proyectosVisibles.some((p) => p.id === f.proyectoId)
        setPeekProyectoId(esMiembro ? null : f.proyectoId)
        setFrenteSel('todos')
        setVista('tabla')
        setVistaStale(false)
      }
      setPantalla('proyectos')
      // #212: en mobile NO se abre el panel de detalle. Mide 359px de los 390
      // de pantalla, así que taparía justo el plan al que se acaba de navegar
      // —que era el motivo de tocar la notificación—. Se navega, se resalta y
      // el detalle queda a un toque de distancia. En escritorio no cambia:
      // ahí el panel se ve al frente con el plan de fondo.
      if (!esMovil) setTareaDetalleId(n.tareaId)
      setTareaResaltada(n.tareaId)
      setResaltadoNonce((k) => k + 1) // #219
      setMovilSidebar(false)
    },
    [state, cerrarNotificaciones, proyectosVisibles, esMovil],
  )

  // Punto 2: mide el alto de la barra de filtros (sticky) y lo publica en
  // --filtros-h para que el thead de la tabla se congele justo debajo.
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const bar = content.querySelector<HTMLElement>('.controles-bar')
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

  // #243/#307: el panel de detalle resolvía sus permisos por el proyecto DE LA
  // TAREA y no por el proyecto activo de la barra —el panel también se abre
  // desde Mis Tareas, que cruza proyectos, y con el `can` del activo alguien
  // con control total en A veía acciones que no le correspondían al abrir una
  // tarea de B—. #307 le sacó el bloque de acciones: el panel solo lee y
  // comenta, así que ya no decide nada por permisos y el `can` se fue con
  // ellas. La regla de #243 sigue viva donde sí hay acciones que cruzan
  // proyectos: las filas de Mis Tareas, que arman su `makeCan` por tarea.

  // -- Render --

  if (enlace) {
    return (
      <DefinirPassword
        flujo={enlace.flujo}
        token={enlace.token}
        onListo={() => {
          window.location.hash = ''
          setEnlace(null)
        }}
      />
    )
  }

  if (sesion === undefined) {
    return <div className="cargando">Cargando…</div>
  }

  if (sesion === null) {
    return (
      <LoginPage
        modo={auth.modo}
        usuariosDemo={usuariosDemo}
        onLogin={onLogin}
        /* #244: por qué se cerró la sesión sola. Se ve al llegar al login,
           sin pasos adicionales, y se va al primer intento de entrar. */
        aviso={motivoSalida ? MENSAJE_SALIDA[motivoSalida] : null}
        onAvisoVisto={() => setMotivoSalida(null)}
      />
    )
  }

  if (error && !state) {
    return <div className="fatal">No se pudo cargar: {error}</div>
  }
  if (!state) {
    return <div className="cargando">Cargando datos…</div>
  }

  // #179: normalmente el proyecto activo es uno del que soy miembro; si llegué
  // por notificación a uno ajeno (peek), se muestra igual de forma transitoria.
  const proyecto =
    proyectosVisibles.find((p) => p.id === proyectoActivoId) ??
    (proyectoActivoId && proyectoActivoId === peekProyectoId
      ? state.proyectos.find((p) => p.id === proyectoActivoId) ?? null
      : null)
  const tareaDetalle = tareaDetalleId ? state.tareas.find((t) => t.id === tareaDetalleId) ?? null : null
  // P5: en mobile la Gantt no existe; la vista efectiva se fuerza a Tabla.
  const vistaEfectiva: Vista = esMovil ? 'tabla' : vista

  // #228: el filtro de Responsable ofrece los MIEMBROS del proyecto activo, la
  // misma lista que los selectores de la tabla, la Gantt y el panel.
  const candidatosFiltro = miembrosDeProyecto(state, proyecto?.id ?? null)
  // #293: el asa de arrastre es para MIEMBROS del proyecto (o admin/dueño) y
  // solo en escritorio. Un "peek" (#179) mira sin ser miembro: sin asa — la
  // base le rechazaría el movimiento de todos modos.
  const puedeArrastrar =
    !esMovil &&
    !!proyecto &&
    (can.controlTotal || state.accesos.some((a) => a.usuarioId === sesion.id && a.proyectoId === proyecto.id))
  // Miembros (7): el admin y el dueño pueden abrir la lista del proyecto.
  const puedeVerMiembros = !!proyecto && (esAdmin || esDuenoDe(state, sesion, proyecto.id))
  // Módulo de Usuarios (§4): admin (todo) o consultor (acotado a sus proyectos:
  // ve a la gente con acceso a ellos y gestiona a los clientes según permisos).
  const puedeVerUsuarios = esAdmin || sesion.rol === 'consultor'

  return (
    <div
      className={`app${sidebarModo === 'escondida' ? ' app--sidebar-escondida' : ''}${
        movilSidebar ? ' app--movil-abierta' : ''
      }${redimensionando ? ' app--redimensionando' : ''}${
        notifAbierto || menuSidebarAbierto ? ' app--sidebar-sostenida' : ''
      }`}
      /* #226: el ancho vive en una variable CSS. La columna de la grilla y la
         barra desplegada del modo escondido la leen, así los dos modos usan
         el ancho que eligió el usuario. En mobile no se usa (la barra es un
         panel superpuesto de ancho fijo). */
      style={{ '--sidebar-w': `${sidebarAncho}px` } as React.CSSProperties}
    >
      {/* Mobile: boton flotante que llama a la sidebar superpuesta; se
          cierra al elegir una opcion. Oculto en desktop via CSS. */}
      <button
        className="movil-menu"
        aria-label={movilSidebar ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setMovilSidebar((v) => !v)}
      >
        {movilSidebar ? '✕' : '☰'}
      </button>
      {/* #284: la campana reemplaza al interruptor de tema como segundo botón
          flotante — el contador de no leídas se ve sin abrir el menú. Tocarla
          abre Notificaciones a pantalla completa y cierra el menú lateral,
          igual que la campana del menú (#195). El interruptor de tema queda
          en el pie de la barra lateral, que en mobile es el menú ☰. Oculto en
          desktop via CSS. */}
      <button className="movil-campana" aria-label="Notificaciones" onClick={abrirNotificaciones}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9.5a6 6 0 0 1 12 0c0 3.6.9 5.2 1.8 6.2.4.4.1 1.1-.5 1.1H4.7c-.6 0-.9-.7-.5-1.1C5.1 14.7 6 13.1 6 9.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9.7 19.5a2.4 2.4 0 0 0 4.6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {noLeidas > 0 && <span className="movil-campana__badge">{noLeidas}</span>}
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
            {/* #159: campana fija en la barra contraída — misma posición que
                "Notificaciones" en la barra desplegada (primera, bajo el logo),
                con el contador naranja de no leídas. */}
            <button
              className={`sidebar-mini__seccion${notifAbierto ? ' sidebar-mini__seccion--activo' : ''}`}
              title="Notificaciones"
              aria-label="Notificaciones"
              onClick={abrirNotificaciones}
            >
              {/* #174: campana de trazo, coherente con la iconografía Andotek. */}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 9.5a6 6 0 0 1 12 0c0 3.6.9 5.2 1.8 6.2.4.4.1 1.1-.5 1.1H4.7c-.6 0-.9-.7-.5-1.1C5.1 14.7 6 13.1 6 9.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M9.7 19.5a2.4 2.4 0 0 0 4.6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {noLeidas > 0 && <span className="sidebar-mini__badge">{noLeidas}</span>}
            </button>
            {/* #331: de las tres secciones fijas de la barra desplegada, a la
                franja solo había llegado la campana (#159). Resumen y Mis
                Tareas van acá, entre ella y los proyectos, en el MISMO orden
                que arriba: campana · Resumen · Mis Tareas · proyectos. Se
                comportan como lo que ya vive en la franja — el nombre en globo
                al pasar el mouse, como la campana, y marcados como activos
                cuando se está en su pantalla, como los cuadritos. */}
            <button
              className={`sidebar-mini__seccion${pantalla === 'resumen' ? ' sidebar-mini__seccion--activo' : ''}`}
              title="Resumen"
              aria-label="Resumen"
              onClick={() => onSelectPantalla('resumen')}
            >
              <IconoResumen size={19} trazo={1.6} />
            </button>
            <button
              className={`sidebar-mini__seccion${pantalla === 'mipanel' ? ' sidebar-mini__seccion--activo' : ''}`}
              title="Mis Tareas"
              aria-label="Mis Tareas"
              onClick={() => onSelectPantalla('mipanel')}
            >
              <IconoMisTareas size={19} trazo={1.6} />
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
          puedeVerUsuarios={puedeVerUsuarios}
          noLeidas={noLeidas}
          notifAbierto={notifAbierto}
          onNotificaciones={abrirNotificaciones}
          onMenuAbierto={setMenuSidebarAbierto}
          nProyectosAdmin={proyectosAdmin.filter((p) => p.estado !== 'archivado').length}
          /* #201: el mismo criterio que la pantalla de Usuarios — activos y,
             para el consultor, solo su gente. */
          nUsuarios={usuariosVisiblesPara(state, sesion).filter((u) => u.activo).length}
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
        {/* #226: manija de ancho sobre el borde derecho de la barra. Oculta en
            mobile por CSS (ahí la barra es un panel superpuesto de ancho fijo).
            Doble clic devuelve el ancho por defecto. */}
        <div
          className="sidebar-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ajustar el ancho de la barra lateral"
          title="Arrastra para ajustar el ancho · doble clic para restablecer"
          onPointerDown={onResizeInicio}
          onDoubleClick={onResizeReset}
        />
      </div>
      <div className="main">
        {error && (
          <div className="banner-error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Cerrar">✕</button>
          </div>
        )}

        {pantalla === 'usuarios' && puedeVerUsuarios ? (
          <UsersView
            state={state}
            usuarioActual={sesion}
            actions={actions}
            onIrAProyectos={() => onSelectPantalla('admin-proyectos')}
          />
        ) : pantalla === 'mipanel' ? (
          <MisTareasView
            state={state}
            usuario={sesion}
            proyectos={proyectosVisibles}
            hoy={HOY}
            actions={actions}
            onAbrirTarea={abrirDetalle}
            esMovil={esMovil}
            modo={repo.modo}
          />
        ) : pantalla === 'configuracion' ? (
          /* #207: la propia cuenta. No depende de rol: todos la tienen. */
          <ConfiguracionView usuario={sesion} actions={actions} auth={auth} />
        ) : pantalla === 'resumen' ? (
          <ResumenView
            state={state}
            proyectos={proyectosVisibles}
            hoy={HOY}
            onAbrirProyecto={onSelectProyecto}
          />
        ) : pantalla === 'admin-proyectos' && puedeVerUsuarios ? (
          <AdminProyectosView state={state} proyectos={proyectosAdmin} sesion={sesion} actions={actions} />
        ) : pantalla === 'notificaciones' ? (
          <NotificacionesView state={state} notificaciones={notifsMias} onAbrir={abrirNotificacion} />
        ) : proyecto && contadores ? (
          <>
            <Header
              titulo={proyecto.nombre}
              cuenta={`${contadores.total} tareas`}
              modo={repo.modo}
              // #305: la franja de contadores cambia de muestras según la
              // vista que se está VIENDO — en mobile siempre es la tabla.
              vista={vistaEfectiva}
              onVista={cambiarVista}
              mostrarToggle={!esMovil}
              contadores={contadores}
              hoy={HOY}
              onMiembros={puedeVerMiembros ? () => setMiembrosAbierto(true) : undefined}
            />
            {/* #321: en Gantt la pantalla no se desplaza. La grilla ocupa lo
                que sobra bajo el encabezado y es lo único con scroll, así que
                los controles quedan siempre a la vista y no puede volver a
                sobrar ni faltar alto: no hay número escrito a mano que
                desalinear. En tabla se conserva el scroll de pantalla, que es
                lo que corresponde a una lista larga. */}
            <div
              className={`content${vistaEfectiva === 'gantt' ? ' content--gantt' : ''}`}
              ref={contentRef}
            >
              <FiltrosBar
                contexto={proyecto.id}
                guardados={vistasDeProyecto}
                onCrearVista={(nombre, f, o) => actions.crearVista(proyecto.id, nombre, f, o)}
                onGuardarVista={actions.guardarVista}
                onEliminarVista={actions.eliminarVista}
                candidatos={candidatosFiltro}
                filtro={vistaActiva.filtro}
                onCambiar={setFiltro}
                orden={vistaActiva.orden}
                onCambiarOrden={setOrden}
                camposOrden={CAMPOS_PROYECTO}
                vistaGantt={vistaEfectiva === 'gantt'}
                // #305: "Rango" solo existe en Gantt; en tabla la barra tiene
                // tres controles.
                rango={
                  vistaEfectiva === 'gantt'
                    ? {
                        soloHabiles: ganttHabiles,
                        onSoloHabiles: setGanttHabiles,
                        modo: ganttModo,
                        onModo: setGanttModo,
                        ocultasFinde: ganttOcultas,
                        etiquetaTodo: 'Todo el proyecto',
                      }
                    : undefined
                }
                vistaActivaId={vistaActiva.vistaActivaId}
                onVistaActiva={setVistaGuardada}
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
                  resaltarTareaId={tareaResaltada}
                  resaltarNonce={resaltadoNonce}
                  tareasNuevas={tareasNuevas}
                  puedeArrastrar={puedeArrastrar}
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
                  tareasNuevas={tareasNuevas}
                  contenedoresNuevos={contenedoresNuevos}
                  puedeArrastrar={puedeArrastrar}
                  modoHorizonte={ganttModo}
                  soloHabiles={ganttHabiles}
                  onOcultasFinde={setGanttOcultas}
                />
              )}
            </div>
          </>
        ) : (
          <div className="vacio">
            {esAdmin || puedeCrearProyectos(sesion) ? (
              <>
                <p>No hay ningún proyecto seleccionado.</p>
                <p>Crea uno desde la barra lateral para empezar.</p>
              </>
            ) : (
              <p>Aún no tienes proyectos asignados. Contacta a tu consultor.</p>
            )}
          </div>
        )}
      </div>

      {tareaDetalle && (
        <TaskPanel
          state={state}
          tarea={tareaDetalle}
          hoy={HOY}
          actions={actions}
          sesionId={sesion.id}
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

      {/* #137: panel emergente de notificaciones, anclado a la barra. No
          cambia de pantalla; el click en un aviso navega a su tarea. */}
      {notifAbierto && (
        <NotificacionesPanel
          state={state}
          notificaciones={notifsMias}
          onAbrir={abrirNotificacion}
          onVerTodas={() => {
            cerrarNotificaciones()
            setPantalla('notificaciones')
            setMovilSidebar(false)
          }}
          onClose={cerrarNotificaciones}
        />
      )}
    </div>
  )
}
