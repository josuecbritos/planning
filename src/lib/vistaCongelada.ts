import { useCallback, useMemo, useReducer, useRef } from 'react'
import type { Tarea } from '../types'

// P1 — Vista congelada ("foto"). Cuando hay un filtro y/u orden activo, el
// conjunto de filas visibles y su orden quedan CONGELADOS: editar una tarea no
// la saca de la vista ni la reordena. La foto se recalcula (re-snapshot) solo
// cuando cambia la "firma" (proyecto/frente/filtro/orden) o al tocar
// "Actualizar vista" (un nonce que entra en la firma). Mientras tanto, si un
// recálculo cambiaría la foto (una fila que ya no calza, o que cambiaría de
// posición), `stale` es true para ofrecer "Actualizar vista".
//
// #293: arrastrar una tarea con la vista congelada es una edición SOBRE LA
// FOTO — la tarea queda donde se la soltó (la foto manda) y se enciende
// "Actualizar vista". `moverEnFoto` reposiciona el id dentro de la foto y la
// marca sucia; al tocar "Actualizar vista" (o cambiar filtro/orden) la foto
// se retoma por criterios, como con cualquier otra edición.

/** Referencia de posición dentro de la foto (#293). `null` = solo marcar
 *  sucia, sin reposicionar (soltar en un sub frente sin filas visibles: el
 *  render agrupa por sub frente primero, no hay posición que disputar). */
export type ReferenciaFoto = { antesDe: string } | { despuesDe: string } | null

interface VistaCongelada {
  /** ¿La vista está congelada? (hay filtro y/u orden activo). */
  congelada: boolean
  /** IDs que se muestran = congelados ∩ existentes (tolera borrados). */
  visibleIds: Set<string>
  /** id → índice de orden congelado (para ordenar dentro de cada sub frente). */
  indice: Map<string, number>
  /** ¿Un recálculo cambiaría la foto? → mostrar "Actualizar vista". */
  stale: boolean
  /** #293: reposiciona `id` en la foto tras un arrastre y la marca sucia. */
  moverEnFoto: (id: string, ref: ReferenciaFoto) => void
}

/**
 * #293: a qué referencia de la foto se traduce una caída. Soltar ANTE una
 * fila visible → antes de ella; al FINAL de un sub frente → después de la
 * última visible de ese sub frente en la foto; en un sub frente sin filas
 * visibles → sin reposicionar (el render agrupa por sub frente primero).
 */
export function referenciaEnFoto(
  tareas: Tarea[],
  visibleIds: Set<string>,
  indice: Map<string, number>,
  tareaId: string,
  destino: { subFrenteId: string; antesDeId: string | null },
): ReferenciaFoto {
  if (destino.antesDeId && destino.antesDeId !== tareaId) return { antesDe: destino.antesDeId }
  const visibles = tareas
    .filter((t) => t.subFrenteId === destino.subFrenteId && t.id !== tareaId && visibleIds.has(t.id))
    .sort((a, b) => (indice.get(a.id) ?? 0) - (indice.get(b.id) ?? 0))
  const ultima = visibles[visibles.length - 1]
  return ultima ? { despuesDe: ultima.id } : null
}

function mismaSecuencia(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * `frescoIds`: ids que HOY calzan filtro+orden, en el orden fresco (plano).
 * `existentesIds`: todos los ids del scope (para congelar tras ediciones y
 *   descartar los borrados de la foto).
 * `activo`: hay filtro y/u orden activo → se congela.
 * `firma`: cambia ⇒ se recalcula la foto (incluye el nonce de "Actualizar").
 */
export function useVistaCongelada(
  frescoIds: string[],
  existentesIds: string[],
  activo: boolean,
  firma: string,
): VistaCongelada {
  const ref = useRef<{ firma: string; ids: string[]; sucia: boolean } | null>(null)
  // #293: `moverEnFoto` muta la foto fuera del ciclo de render; este reductor
  // fuerza el re-render que la hace visible.
  const [, refrescar] = useReducer((n: number) => n + 1, 0)

  if (!activo) {
    ref.current = null
  } else if (!ref.current || ref.current.firma !== firma) {
    // (Re)tomar la foto: primera vez o cambió la firma (filtro/orden/nonce…).
    ref.current = { firma, ids: frescoIds, sucia: false }
  }
  // `frozenIds` es una referencia ESTABLE (el array memoizado del snapshot)
  // hasta el próximo re-snapshot: permite memoizar el resultado y evitar
  // recomputar `filas`/subtablas en re-renders que no cambian la foto.
  const frozenIds = activo && ref.current ? ref.current.ids : null
  const sucia = activo && !!ref.current?.sucia

  const moverEnFoto = useCallback((id: string, referencia: ReferenciaFoto) => {
    const foto = ref.current
    if (!foto) return
    let ids = foto.ids
    if (referencia) {
      ids = ids.filter((x) => x !== id)
      const clave = 'antesDe' in referencia ? referencia.antesDe : referencia.despuesDe
      const i = ids.indexOf(clave)
      if (i >= 0) ids.splice('antesDe' in referencia ? i : i + 1, 0, id)
      else ids.push(id)
    }
    ref.current = { ...foto, ids, sucia: true }
    refrescar()
  }, [])

  return useMemo<VistaCongelada>(() => {
    if (!frozenIds) {
      return { congelada: false, visibleIds: new Set(), indice: new Map(), stale: false, moverEnFoto }
    }
    const existentes = new Set(existentesIds)
    const renderIds = frozenIds.filter((id) => existentes.has(id))
    const stale = sucia || !mismaSecuencia(renderIds, frescoIds)
    return {
      congelada: true,
      visibleIds: new Set(renderIds),
      indice: new Map(renderIds.map((id, i) => [id, i])),
      stale,
      moverEnFoto,
    }
  }, [frozenIds, existentesIds, frescoIds, sucia, moverEnFoto])
}
