import type { AppState, ISODate, Replanificacion, Tarea } from '../types'

// Acciones que mutan el estado (siempre inmutables: devuelven un nuevo AppState).
// Son las interacciones operativas del dummy (seccion 8).

let historialSeq = 100000 // ids para nuevos registros de historial

function replaceTarea(state: AppState, tareaId: string, patch: Partial<Tarea>): AppState {
  return {
    ...state,
    tareas: state.tareas.map((t) => (t.id === tareaId ? { ...t, ...patch } : t)),
  }
}

/** Marca una tarea como hecha y registra la fecha real (= hoy). */
export function marcarHecha(state: AppState, tareaId: string, hoy: ISODate): AppState {
  return replaceTarea(state, tareaId, { hecha: true, fechaReal: hoy })
}

/** Desmarca una tarea; limpia la fecha real (6.1). */
export function desmarcarHecha(state: AppState, tareaId: string): AppState {
  return replaceTarea(state, tareaId, { hecha: false, fechaReal: undefined })
}

/** Atajo de checkbox. */
export function toggleHecha(state: AppState, tareaId: string, hoy: ISODate): AppState {
  const t = state.tareas.find((x) => x.id === tareaId)
  if (!t) return state
  return t.hecha ? desmarcarHecha(state, tareaId) : marcarHecha(state, tareaId, hoy)
}

/**
 * Cambia la fecha objetivo de una tarea. Genera automaticamente un registro
 * en el Historial de Replanificaciones (5.6). Regla critica: fecha_original
 * nunca se toca.
 */
export function cambiarFechaObjetivo(
  state: AppState,
  tareaId: string,
  nueva: ISODate,
  usuarioId: string,
): AppState {
  const t = state.tareas.find((x) => x.id === tareaId)
  if (!t || nueva === t.fechaObjetivo) return state

  const numeroCambio = state.historial.filter((h) => h.tareaId === tareaId).length + 1
  const registro: Replanificacion = {
    id: `h-new-${historialSeq++}`,
    tareaId,
    fechaAnterior: t.fechaObjetivo,
    fechaNueva: nueva,
    numeroCambio,
    cambiadoPor: usuarioId,
    // timestamp fijo en el dummy (no usamos reloj real).
    timestamp: `${t.fechaObjetivo}T00:00:00Z`,
  }

  const conHistorial = { ...state, historial: [...state.historial, registro] }
  return replaceTarea(conHistorial, tareaId, { fechaObjetivo: nueva })
}
