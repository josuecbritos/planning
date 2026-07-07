import type {
  AppState,
  Frente,
  Proyecto,
  Replanificacion,
  SubFrente,
  Tarea,
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
  }
}

export function removeSubFrente(s: AppState, subFrenteId: string): AppState {
  const tareaIds = new Set(s.tareas.filter((t) => t.subFrenteId === subFrenteId).map((t) => t.id))
  return {
    ...s,
    subFrentes: s.subFrentes.filter((sf) => sf.id !== subFrenteId),
    tareas: s.tareas.filter((t) => t.subFrenteId !== subFrenteId),
    historial: s.historial.filter((h) => !tareaIds.has(h.tareaId)),
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
  }
}
