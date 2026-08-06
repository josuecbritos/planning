import type { Tarea } from '../types'

// #293 — Plan de movimiento de una tarea (arrastrar y soltar).
//
// Semántica del destino: `antesDeId` es la tarea ante la cual se suelta
// (null = al final del sub frente destino). El plan REENUMERA el sub frente
// destino completo (0..n): los `orden` reales pueden traer huecos y empates
// (creaciones intermedias, tareas archivadas), así que "correr en +1" no
// alcanza para dejar la posición exacta. Las archivadas conservan su orden:
// no están a la vista, no hay posición visual que respetarles.
//
// Vive aquí — y no dentro de la acción — porque la vista lo usa ANTES de
// tocar nada para saber si el gesto cambia algo (soltar una tarea en su
// propio lugar no debe escribir ni encender "Actualizar vista").

export interface MovimientoTarea {
  id: string
  orden: number
  /** Solo presente en la tarea movida cuando cambia de sub frente. */
  subFrenteId?: string
}

/**
 * Movimientos (id → orden nuevo) que dejan a `tareaId` en la posición
 * pedida del sub frente `subFrenteId`. Devuelve SOLO lo que cambia:
 * lista vacía = el gesto no mueve nada.
 */
export function planMoverTarea(
  tareas: Tarea[],
  tareaId: string,
  subFrenteId: string,
  antesDeId: string | null,
): MovimientoTarea[] {
  const tarea = tareas.find((t) => t.id === tareaId)
  if (!tarea || antesDeId === tareaId) return []

  const destino = tareas
    .filter((t) => t.subFrenteId === subFrenteId && !t.archivada && t.id !== tareaId)
    .sort((a, b) => a.orden - b.orden)
  let idx = antesDeId ? destino.findIndex((t) => t.id === antesDeId) : destino.length
  if (idx < 0) idx = destino.length
  const lista = [...destino.slice(0, idx), tarea, ...destino.slice(idx)]

  const cambiaSub = tarea.subFrenteId !== subFrenteId
  const out: MovimientoTarea[] = []
  lista.forEach((t, i) => {
    if (t.id === tareaId) {
      if (t.orden !== i || cambiaSub) out.push(cambiaSub ? { id: t.id, orden: i, subFrenteId } : { id: t.id, orden: i })
    } else if (t.orden !== i) {
      out.push({ id: t.id, orden: i })
    }
  })
  return out
}
