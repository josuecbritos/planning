import type { AppState, Tarea } from '../types'
import { categoriaDe, type Categoria } from './derive'

// Ordenamiento por columna (proyectos y Mis Tareas). El clic sobre un
// encabezado cicla ascendente → descendente → orden original (el manual).
// Es una accion exploratoria: NO se persiste (al recargar vuelve el orden
// original), y es independiente de los filtros.

export type CampoOrden = 'resp' | 'estado' | 'objetivo' | 'original' | 'proyecto'

export interface Orden {
  campo: CampoOrden
  dir: 1 | -1
}

/** Ciclo del clic: sin orden → ↑ → ↓ → sin orden. */
export function siguienteOrden(actual: Orden | null, campo: CampoOrden): Orden | null {
  if (!actual || actual.campo !== campo) return { campo, dir: 1 }
  if (actual.dir === 1) return { campo, dir: -1 }
  return null
}

/**
 * Estado NO es alfabetico: gravedad del modelo, de menos a mas critico
 * (Hecha → Pendiente → Pendiente replanificada → Atrasada → Atrasada
 * replanificada). Ascendente = de menos a mas critico.
 */
export const GRAVEDAD: Record<Categoria, number> = {
  hecha: 0,
  pendiente: 1,
  pendiente_replan: 2,
  atrasada: 3,
  atrasada_replan: 4,
}

/** Valor comparable de una tarea para un campo (undefined = sin valor). */
export function valorOrden(
  state: AppState,
  t: Tarea,
  campo: Exclude<CampoOrden, 'proyecto'>,
  hoy: string,
): string | number | undefined {
  switch (campo) {
    case 'resp': {
      const u = state.usuarios.find((x) => x.id === t.responsableId)
      return u ? u.nombre.toLowerCase() : undefined
    }
    case 'estado':
      return GRAVEDAD[categoriaDe(state, t, hoy)]
    case 'objetivo':
      return t.fechaObjetivo
    case 'original':
      return t.fechaOriginal
  }
}

/**
 * Ordena una copia de `items` por el valor extraido. Los sin valor van
 * SIEMPRE al final (en ambas direcciones); el sort es estable, asi que los
 * empates conservan el orden original.
 */
export function ordenar<T>(
  items: T[],
  orden: Orden | null,
  valor: (x: T) => string | number | undefined,
): T[] {
  if (!orden) return items
  return [...items].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    if (va === vb) return 0
    if (va === undefined) return 1
    if (vb === undefined) return -1
    return (va < vb ? -1 : 1) * orden.dir
  })
}
