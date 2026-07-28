import type { AppState, Usuario } from '../types'

// #208 — Menciones en comentarios.
//
// Decisión de fondo: en el texto guardado una mención es un ID, no un nombre —
// `@[<uuid>]`. El nombre se resuelve AL PINTAR, contra el estado actual. Por
// eso una mención sigue apuntando a la persona correcta aunque después cambie
// su nombre (#207 permite justamente eso); guardar "@Daniela Vera" habría
// dejado el comentario mintiendo el día que ella se cambie el nombre.
//
// El mismo marcador lo lee el trigger `notif_comentario` en la base para
// generar las notificaciones: el destinatario se DERIVA del texto, nunca llega
// como parámetro del cliente (invariante 4 de SEGURIDAD.md).
//
// En el editor no se escribe el marcador: ahí se ve "@Nombre" y la conversión
// a `@[uuid]` ocurre al publicar, con la lista de personas que se eligieron en
// el selector. Al abrir un comentario para editarlo se hace el camino inverso.

/**
 * Marcador guardado: `@[id]`. El front acepta cualquier id porque en modo
 * Local los usuarios son `u-dv`, `u-cliente`… y en Supabase son uuid. El
 * trigger de la base, en cambio, exige uuid: ahí la forma estricta es una
 * defensa —solo un id real puede terminar generando una notificación—.
 */
const RE_MENCION = /@\[([\w-]{2,64})\]/g

/** Ids mencionados en un texto ya guardado (sin repetir). */
export function idsMencionados(texto: string): string[] {
  const out = new Set<string>()
  for (const m of texto.matchAll(RE_MENCION)) out.add(m[1])
  return [...out]
}

type ParteComentario =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'mencion'; usuarioId: string }

/** Parte el texto guardado en trozos para pintarlo con las menciones marcadas. */
export function partirComentario(texto: string): ParteComentario[] {
  const partes: ParteComentario[] = []
  let ultimo = 0
  for (const m of texto.matchAll(RE_MENCION)) {
    const i = m.index ?? 0
    if (i > ultimo) partes.push({ tipo: 'texto', valor: texto.slice(ultimo, i) })
    partes.push({ tipo: 'mencion', usuarioId: m[1] })
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) partes.push({ tipo: 'texto', valor: texto.slice(ultimo) })
  return partes
}

/** Personas mencionables en una tarea: las que tienen acceso a SU proyecto
 *  —dueño más invitados, solo activos—, que son las que podrán abrirla. */
export function mencionablesEn(state: AppState, tareaId: string, excluirId?: string): Usuario[] {
  const tarea = state.tareas.find((t) => t.id === tareaId)
  const sub = tarea && state.subFrentes.find((sf) => sf.id === tarea.subFrenteId)
  const frente = sub && state.frentes.find((f) => f.id === sub.frenteId)
  const proyecto = frente && state.proyectos.find((p) => p.id === frente.proyectoId)
  if (!proyecto) return []
  const ids = new Set<string>(proyecto.duenoId ? [proyecto.duenoId] : [])
  for (const a of state.accesos) if (a.proyectoId === proyecto.id) ids.add(a.usuarioId)
  return state.usuarios
    .filter((u) => u.activo && ids.has(u.id) && u.id !== excluirId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** Mención elegida en el editor: se recuerda para poder convertir al publicar. */
export interface MencionElegida {
  id: string
  nombre: string
}

/**
 * Texto del editor → texto guardable. Cada "@Nombre" que sigue vivo en el
 * texto se convierte en su marcador. Se procesan primero los nombres más
 * largos, para que "@Ana María" no lo pise "@Ana".
 */
export function aTextoGuardable(texto: string, elegidas: MencionElegida[]): string {
  let out = texto
  const orden = [...elegidas].sort((a, b) => b.nombre.length - a.nombre.length)
  for (const m of orden) {
    // Sin regex: el nombre puede traer caracteres especiales.
    out = out.split(`@${m.nombre}`).join(`@[${m.id}]`)
  }
  return out
}

/**
 * Texto guardado → texto del editor (#209, al editar un comentario). Devuelve
 * también las menciones reconstruidas, para que al volver a publicar se
 * conviertan igual que la primera vez.
 */
export function aTextoEditable(
  texto: string,
  usuarios: Usuario[],
): { texto: string; elegidas: MencionElegida[] } {
  const elegidas: MencionElegida[] = []
  const out = texto.replace(RE_MENCION, (_todo, id: string) => {
    const u = usuarios.find((x) => x.id === id)
    if (!u) return '@alguien'
    if (!elegidas.some((e) => e.id === u.id)) elegidas.push({ id: u.id, nombre: u.nombre })
    return `@${u.nombre}`
  })
  return { texto: out, elegidas }
}

/**
 * ¿El cursor está escribiendo una mención? Devuelve el trozo tecleado tras la
 * "@" y dónde empieza, o null. La "@" solo cuenta al principio o tras un
 * espacio, para no disparar el selector dentro de un correo.
 */
export function mencionEnCurso(texto: string, cursor: number): { desde: number; termino: string } | null {
  const antes = texto.slice(0, cursor)
  const arroba = antes.lastIndexOf('@')
  if (arroba < 0) return null
  if (arroba > 0 && !/\s/.test(antes[arroba - 1])) return null
  const termino = antes.slice(arroba + 1)
  // Un salto de línea cierra la mención; un espacio todavía no (hay nombres
  // compuestos), pero dos palabras ya es demasiado para seguir buscando.
  if (/\n/.test(termino)) return null
  if (termino.split(/\s+/).length > 2) return null
  return { desde: arroba, termino }
}
