import { useState } from 'react'
import type { Tarea } from '../types'

// #293 — Arrastrar tareas para reordenarlas o moverlas de sub frente.
//
// El estado del gesto (qué tarea está en vuelo, dónde caería) y sus reglas
// viven ACÁ, una sola vez: la Tabla y la Gantt lo consumen igual, así el
// gesto se aprende una vez y no puede divergir entre vistas.
//
// Mecánica: arrastre nativo de HTML (draggable en el ASA, no en la fila —
// la fila está llena de controles que responden al clic y, en la Gantt, el
// clic sobre la grilla ya significa planificar). Cada fila de tarea es un
// destino; soltar sobre la mitad superior deja la tarea ANTES de esa fila,
// sobre la mitad inferior, después. Un destino inválido (otro sub frente
// sin permiso `editarTareas`) no acepta la caída: el navegador muestra el
// cursor de prohibido y al soltar no pasa nada.

export interface DestinoArrastre {
  subFrenteId: string
  /** Tarea ante la cual caería (null = al final del sub frente). */
  antesDeId: string | null
}

export interface DndTareas {
  /** Tarea en vuelo, o null. */
  activo: Tarea | null
  /** Dónde caería si se soltara ahora (para el indicador). */
  destino: DestinoArrastre | null
  /** dragstart del asa: fija el dataTransfer y la imagen de arrastre. */
  iniciar: (e: React.DragEvent, t: Tarea) => void
  /** dragend del asa: limpia el gesto (también al soltar fuera). */
  terminar: () => void
  /** dragover de una fila/tabla destino. Decide validez e indicador. */
  sobre: (e: React.DragEvent, subFrenteId: string, antesDeId: string | null) => void
  /** dragover de zonas que NO son destino: apaga el indicador. */
  fuera: () => void
  /** drop sobre un destino válido. */
  soltar: (e: React.DragEvent) => void
}

/** ¿El cursor está en la mitad superior del elemento con el handler? */
export function enMitadSuperior(e: React.DragEvent): boolean {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY < r.top + r.height / 2
}

/**
 * `habilitado`: miembro del proyecto y en escritorio (lo decide App).
 * `puedeRecibir`: regla de destino — el MISMO sub frente siempre
 *   (reordenar es de cualquier miembro); otro sub frente solo con
 *   `editarTareas` sobre la tarea (sección 5 del pedido).
 * `alSoltar`: persiste el movimiento (y ajusta la foto congelada).
 */
export function useArrastreTareas(opts: {
  habilitado: boolean
  puedeRecibir: (t: Tarea, subFrenteId: string) => boolean
  alSoltar: (t: Tarea, destino: DestinoArrastre) => void
}): DndTareas | undefined {
  const [activo, setActivo] = useState<Tarea | null>(null)
  const [destino, setDestino] = useState<DestinoArrastre | null>(null)
  if (!opts.habilitado) return undefined

  const iniciar = (e: React.DragEvent, t: Tarea) => {
    e.dataTransfer.setData('text/plain', t.id)
    e.dataTransfer.effectAllowed = 'move'
    // La imagen de arrastre es la CELDA del nombre, no la fila entera: en la
    // Gantt la fila abarca todos los días y la sombra saldría gigante.
    const celda = (e.currentTarget as HTMLElement).closest('td')
    if (celda) e.dataTransfer.setDragImage(celda, 14, celda.getBoundingClientRect().height / 2)
    // Chrome cancela el arrastre si el DOM del origen cambia DENTRO del
    // dragstart (y fijar el estado re-renderiza la fila): al siguiente tick.
    window.setTimeout(() => setActivo(t), 0)
  }

  const terminar = () => {
    setActivo(null)
    setDestino(null)
  }

  const sobre = (e: React.DragEvent, subFrenteId: string, antesDeId: string | null) => {
    // La fila ya decidió: que no siga burbujeando hacia la tabla/el fondo.
    e.stopPropagation()
    if (!activo) return
    if (!opts.puedeRecibir(activo, subFrenteId)) {
      // Sin preventDefault el navegador no permite soltar acá (criterio 17).
      setDestino((cur) => (cur ? null : cur))
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDestino((cur) =>
      cur && cur.subFrenteId === subFrenteId && cur.antesDeId === antesDeId
        ? cur
        : { subFrenteId, antesDeId },
    )
  }

  const fuera = () => setDestino((cur) => (cur ? null : cur))

  const soltar = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const t = activo
    const d = destino
    setActivo(null)
    setDestino(null)
    if (t && d && opts.puedeRecibir(t, d.subFrenteId)) opts.alSoltar(t, d)
  }

  return { activo, destino, iniciar, terminar, sobre, fuera, soltar }
}
