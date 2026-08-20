import type { AppState } from '../types'
import type { Filtro, FiltroGuardado } from './filtros'
import type { OrdenMulti } from './orden'

// #215 — Vistas guardadas: cuál está activa, y que sobreviva.
//
// La regla de fondo: **lo que se guardó explícitamente persiste; lo que no, es
// temporal.** Guardar una vista es el acto deliberado de decir "esto quiero que
// quede"; un filtro puesto a mano no lo es. Es el modelo de Asana.
//
// Antes la aplicación no sabía en qué vista estabas: aplicar una solo copiaba
// su filtro y su orden a la barra, sin dejar registro. De ahí que el botón
// dijera "Vistas (1)" sin decir cuál, y que al volver no hubiera nada que
// restaurar.
//
// Estar en una vista se controla **solo desde el desplegable**: ninguna acción
// de filtro te mete ni te saca de una. Cambiar un filtro —o limpiarlo, que es
// lo mismo— te deja dentro, marcada como modificada con un asterisco. Es el
// modelo documentado de Dynamics 365.
//
// #289 — DÓNDE VIVE CADA COSA, que son dos cosas distintas:
//
//   · Las VISTAS GUARDADAS viven en la BASE, atadas al usuario (tabla
//     `vista_guardada`, migración 26). Viajan con el resto del estado y
//     siguen a la persona a cualquier computador. Antes vivían en
//     localStorage, y eso nunca fue una decisión de producto: la solicitud
//     que las creó (#87) no decía dónde guardarlas.
//   · EN QUÉ VISTA ESTABAS sigue en localStorage, por máquina. Es
//     deliberado: la vista guardada es tuya, dónde quedaste es de ese
//     computador. Entrar desde uno nuevo abre limpio, con todas tus vistas
//     disponibles en el desplegable.
//
// El agrupamiento no cambia: por usuario y por pantalla (cada proyecto por su
// lado, Mis Tareas por el suyo). Antes eso vivía en la CLAVE de localStorage;
// ahora son las columnas `usuario_id` y `contexto`.

/** Contexto = id del proyecto, o 'mis-tareas'. */
type ContextoVista = string

const claveActiva = (usuarioId: string, contexto: ContextoVista) =>
  `planificador.vistaActiva.${usuarioId}.${contexto}`

/**
 * Las vistas de ESA pantalla, para ESE usuario. Salen del estado ya cargado
 * —no se leen bajo demanda al abrir el desplegable—: en Supabase la RLS solo
 * entrega las propias, y el filtro por `usuarioId` mantiene la regla también
 * en modo Local, donde el estado es uno solo para todos.
 */
export function leerGuardados(
  state: AppState | null,
  usuarioId: string,
  contexto: ContextoVista,
): FiltroGuardado[] {
  if (!state) return []
  return state.vistas.filter((v) => v.usuarioId === usuarioId && v.contexto === contexto)
}

function leerVistaActiva(usuarioId: string, contexto: ContextoVista): string | null {
  try {
    return localStorage.getItem(claveActiva(usuarioId, contexto))
  } catch {
    return null
  }
}

export function escribirVistaActiva(
  usuarioId: string,
  contexto: ContextoVista,
  id: string | null,
): void {
  try {
    if (id) localStorage.setItem(claveActiva(usuarioId, contexto), id)
    else localStorage.removeItem(claveActiva(usuarioId, contexto))
  } catch {
    /* sin storage: la vista activa vive solo en esta sesión */
  }
}

interface EstadoVista {
  filtro: Filtro
  orden: OrdenMulti
  vistaActivaId: string | null
}

const VACIO: EstadoVista = { filtro: {}, orden: [], vistaActivaId: null }

/**
 * Con qué se entra a una pantalla: la vista guardada que estaba activa, o
 * limpio. Nunca restaura un filtro suelto — esa es toda la regla.
 *
 * Si la vista activa ya no existe (se borró desde otra pestaña), se entra
 * limpio y se olvida la referencia.
 */
export function estadoInicial(
  state: AppState | null,
  usuarioId: string,
  contexto: ContextoVista,
): EstadoVista {
  const id = leerVistaActiva(usuarioId, contexto)
  if (!id) return VACIO
  const vista = leerGuardados(state, usuarioId, contexto).find((v) => v.id === id)
  if (!vista) {
    escribirVistaActiva(usuarioId, contexto, null)
    return VACIO
  }
  return { filtro: vista.filtro, orden: vista.orden ?? [], vistaActivaId: vista.id }
}

/**
 * #305e — Clave canónica de un dato plano, para compararlo por CONTENIDO.
 *
 * `JSON.stringify` compara letra por letra, así que solo da igual si las
 * propiedades vienen en el mismo orden. Y el orden de las propiedades no es
 * información: es un accidente de cómo se armó el objeto. Dos caminos lo
 * cambian sin que cambie nada real —
 *
 *   · **La base.** El filtro se guarda en una columna `jsonb`, que reordena
 *     las claves por su cuenta. Al guardar, la vista en memoria se reemplaza
 *     con lo que devolvió la base (correcto: la base es la fuente de verdad),
 *     y esa versión reordenada dejaba de "coincidir" con la de la pantalla.
 *   · **El orden en que armaste el filtro.** Elegir Estado y después "Sin
 *     fecha" produce `{estados, sinFecha}`; al revés produce
 *     `{sinFecha, estados}`. Mismo filtro, distinto texto. Esto pasa **sin
 *     base real**, así que el defecto también se reproduce en modo local.
 *
 * `listasComoConjunto` distingue los dos casos que hay:
 *   · El **filtro** lleva listas de valores elegidos (responsables, estados,
 *     proyectos). Son conjuntos: los mismos valores en distinta secuencia son
 *     el mismo filtro. Destildar y volver a tildar una opción la manda al
 *     final de la lista, y eso no debe encender el asterisco.
 *   · El **orden** es una secuencia: `[fecha, estado]` y `[estado, fecha]` son
 *     órdenes DISTINTOS y deben seguir contando como diferentes. Ahí las
 *     listas se comparan tal como vienen; lo único que se normaliza son las
 *     claves de cada regla.
 */
function canonico(valor: unknown, listasComoConjunto: boolean): unknown {
  if (Array.isArray(valor)) {
    const items = valor.map((v) => canonico(v, listasComoConjunto))
    if (!listasComoConjunto) return items
    return [...items].sort((a, b) => {
      const sa = JSON.stringify(a)
      const sb = JSON.stringify(b)
      return sa < sb ? -1 : sa > sb ? 1 : 0
    })
  }
  if (valor && typeof valor === 'object') {
    // Las claves en `undefined` no existen: es como las escribe la pantalla
    // (`{ ...filtro, estados: undefined }`) y es lo que JSON descarta al
    // guardar, así que la vista que vuelve de la base no las trae.
    return Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonico(v, listasComoConjunto)])
  }
  return valor ?? null
}

const mismoContenido = (a: unknown, b: unknown, listasComoConjunto: boolean) =>
  JSON.stringify(canonico(a, listasComoConjunto)) === JSON.stringify(canonico(b, listasComoConjunto))

/**
 * ¿El filtro y el orden actuales siguen siendo los de la vista guardada? De
 * esto dependen el asterisco y el ícono de guardar de esa vista, que son la
 * misma señal dicha dos veces.
 *
 * Se compara por CONTENIDO, no por texto (#305e): ver `canonico`.
 */
export function coincideConVista(
  vista: FiltroGuardado | undefined,
  filtro: Filtro,
  orden: OrdenMulti,
): boolean {
  if (!vista) return false
  return (
    mismoContenido(vista.filtro ?? {}, filtro ?? {}, true) &&
    mismoContenido(vista.orden ?? [], orden ?? [], false)
  )
}
