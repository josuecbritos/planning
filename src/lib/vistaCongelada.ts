import { useMemo, useRef } from 'react'

// P1 — Vista congelada ("foto"). Cuando hay un filtro y/u orden activo, el
// conjunto de filas visibles y su orden quedan CONGELADOS: editar una tarea no
// la saca de la vista ni la reordena. La foto se recalcula (re-snapshot) solo
// cuando cambia la "firma" (proyecto/frente/filtro/orden) o al tocar
// "Actualizar vista" (un nonce que entra en la firma). Mientras tanto, si un
// recálculo cambiaría la foto (una fila que ya no calza, o que cambiaría de
// posición), `stale` es true para ofrecer "Actualizar vista".

export interface VistaCongelada {
  /** ¿La vista está congelada? (hay filtro y/u orden activo). */
  congelada: boolean
  /** IDs que se muestran = congelados ∩ existentes (tolera borrados). */
  visibleIds: Set<string>
  /** id → índice de orden congelado (para ordenar dentro de cada sub frente). */
  indice: Map<string, number>
  /** ¿Un recálculo cambiaría la foto? → mostrar "Actualizar vista". */
  stale: boolean
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
  const ref = useRef<{ firma: string; ids: string[] } | null>(null)

  if (!activo) {
    ref.current = null
  } else if (!ref.current || ref.current.firma !== firma) {
    // (Re)tomar la foto: primera vez o cambió la firma (filtro/orden/nonce…).
    ref.current = { firma, ids: frescoIds }
  }
  // `frozenIds` es una referencia ESTABLE (el array memoizado del snapshot)
  // hasta el próximo re-snapshot: permite memoizar el resultado y evitar
  // recomputar `filas`/subtablas en re-renders que no cambian la foto.
  const frozenIds = activo && ref.current ? ref.current.ids : null

  return useMemo<VistaCongelada>(() => {
    if (!frozenIds) {
      return { congelada: false, visibleIds: new Set(), indice: new Map(), stale: false }
    }
    const existentes = new Set(existentesIds)
    const renderIds = frozenIds.filter((id) => existentes.has(id))
    const stale = !mismaSecuencia(renderIds, frescoIds)
    return {
      congelada: true,
      visibleIds: new Set(renderIds),
      indice: new Map(renderIds.map((id, i) => [id, i])),
      stale,
    }
  }, [frozenIds, existentesIds, frescoIds])
}
