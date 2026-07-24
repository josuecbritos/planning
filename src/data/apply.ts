import type {
  Acceso,
  AppState,
  Comentario,
  Frente,
  Proyecto,
  Replanificacion,
  SubFrente,
  Tarea,
  Usuario,
} from '../types'

// Helpers puros para reflejar en el AppState local el resultado de una mutacion
// del Repo, evitando recargar todo desde el backend en cada accion.

function upsert<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex((x) => x.id === item.id)
  if (i === -1) return [...arr, item]
  const copy = arr.slice()
  copy[i] = item
  return copy
}

export function upsertProyecto(s: AppState, p: Proyecto): AppState {
  return { ...s, proyectos: upsert(s.proyectos, p) }
}
export function upsertFrente(s: AppState, f: Frente): AppState {
  return { ...s, frentes: upsert(s.frentes, f) }
}
export function upsertSubFrente(s: AppState, sf: SubFrente): AppState {
  return { ...s, subFrentes: upsert(s.subFrentes, sf) }
}
export function upsertTarea(s: AppState, t: Tarea): AppState {
  return { ...s, tareas: upsert(s.tareas, t) }
}

export function upsertUsuario(s: AppState, u: Usuario): AppState {
  return { ...s, usuarios: upsert(s.usuarios, u) }
}

/** #136: eliminar = sacar de la UI. La fila sigue en la base; localmente se
 *  quita del estado (queda invisible en el módulo y en todos los selectores). */
export function removeUsuario(s: AppState, usuarioId: string): AppState {
  return { ...s, usuarios: s.usuarios.filter((u) => u.id !== usuarioId) }
}

/** #137: marca como leídas las notificaciones con los ids dados. */
export function marcarNotificacionesLeidas(s: AppState, ids: string[]): AppState {
  if (ids.length === 0) return s
  const set = new Set(ids)
  return { ...s, notificaciones: s.notificaciones.map((n) => (set.has(n.id) ? { ...n, leida: true } : n)) }
}

export function addAcceso(s: AppState, a: Acceso): AppState {
  const existe = s.accesos.some(
    (x) => x.usuarioId === a.usuarioId && x.proyectoId === a.proyectoId,
  )
  return existe ? s : { ...s, accesos: [...s.accesos, a] }
}

export function removeAcceso(s: AppState, usuarioId: string, proyectoId: string): AppState {
  return {
    ...s,
    accesos: s.accesos.filter((a) => !(a.usuarioId === usuarioId && a.proyectoId === proyectoId)),
  }
}

/** Reemplaza (o agrega) un acceso — para actualizar sus permisos. */
export function upsertAcceso(s: AppState, a: Acceso): AppState {
  const existe = s.accesos.some(
    (x) => x.usuarioId === a.usuarioId && x.proyectoId === a.proyectoId,
  )
  return {
    ...s,
    accesos: existe
      ? s.accesos.map((x) => (x.usuarioId === a.usuarioId && x.proyectoId === a.proyectoId ? a : x))
      : [...s.accesos, a],
  }
}

export function addComentario(s: AppState, c: Comentario): AppState {
  return { ...s, comentarios: [...s.comentarios, c] }
}

/** Reemplaza el historial de una tarea por la lista dada. */
export function setHistorialTarea(s: AppState, tareaId: string, hist: Replanificacion[]): AppState {
  return {
    ...s,
    historial: [...s.historial.filter((h) => h.tareaId !== tareaId), ...hist],
  }
}

// ---- Eliminaciones con cascada (equivale al ON DELETE CASCADE de Postgres) ----

export function removeTarea(s: AppState, tareaId: string): AppState {
  return {
    ...s,
    tareas: s.tareas.filter((t) => t.id !== tareaId),
    historial: s.historial.filter((h) => h.tareaId !== tareaId),
    comentarios: s.comentarios.filter((c) => c.tareaId !== tareaId),
  }
}

export function removeSubFrente(s: AppState, subFrenteId: string): AppState {
  const tareaIds = new Set(s.tareas.filter((t) => t.subFrenteId === subFrenteId).map((t) => t.id))
  return {
    ...s,
    subFrentes: s.subFrentes.filter((sf) => sf.id !== subFrenteId),
    tareas: s.tareas.filter((t) => t.subFrenteId !== subFrenteId),
    historial: s.historial.filter((h) => !tareaIds.has(h.tareaId)),
    comentarios: s.comentarios.filter((c) => !tareaIds.has(c.tareaId)),
  }
}

export function removeFrente(s: AppState, frenteId: string): AppState {
  const subIds = new Set(s.subFrentes.filter((sf) => sf.frenteId === frenteId).map((sf) => sf.id))
  const tareaIds = new Set(s.tareas.filter((t) => subIds.has(t.subFrenteId)).map((t) => t.id))
  return {
    ...s,
    frentes: s.frentes.filter((f) => f.id !== frenteId),
    subFrentes: s.subFrentes.filter((sf) => sf.frenteId !== frenteId),
    tareas: s.tareas.filter((t) => !subIds.has(t.subFrenteId)),
    historial: s.historial.filter((h) => !tareaIds.has(h.tareaId)),
    comentarios: s.comentarios.filter((c) => !tareaIds.has(c.tareaId)),
  }
}

export function removeProyecto(s: AppState, proyectoId: string): AppState {
  const frenteIds = new Set(s.frentes.filter((f) => f.proyectoId === proyectoId).map((f) => f.id))
  const subIds = new Set(s.subFrentes.filter((sf) => frenteIds.has(sf.frenteId)).map((sf) => sf.id))
  const tareaIds = new Set(s.tareas.filter((t) => subIds.has(t.subFrenteId)).map((t) => t.id))
  return {
    ...s,
    proyectos: s.proyectos.filter((p) => p.id !== proyectoId),
    frentes: s.frentes.filter((f) => f.proyectoId !== proyectoId),
    subFrentes: s.subFrentes.filter((sf) => !frenteIds.has(sf.frenteId)),
    tareas: s.tareas.filter((t) => !subIds.has(t.subFrenteId)),
    historial: s.historial.filter((h) => !tareaIds.has(h.tareaId)),
    comentarios: s.comentarios.filter((c) => !tareaIds.has(c.tareaId)),
    accesos: s.accesos.filter((a) => a.proyectoId !== proyectoId),
  }
}
