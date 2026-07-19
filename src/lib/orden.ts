import type { AppState, Tarea } from '../types'
import { categoriaDe, desviacionHabiles, type Categoria } from './derive'

// Ordenamiento multinivel (menu "Ordenar", proyectos y Mis Tareas). Se apilan
// varias reglas campo + direccion, que se aplican por prioridad (de arriba
// hacia abajo): cada nivel desempata al anterior. Ordena DENTRO de cada sub
// frente, sin mezclar tareas entre sub frentes. Se guarda junto con los
// filtros como una sola "vista"; si no se guarda, es momentaneo (se pierde al
// recargar).

export type CampoOrden = 'resp' | 'estado' | 'objetivo' | 'desviacion' | 'proyecto'

/** Direccion de una regla: 1 = ascendente (↑), -1 = descendente (↓). */
export type Direccion = 1 | -1

/** Una regla de orden: un campo y su direccion. */
export interface ReglaOrden {
  campo: CampoOrden
  dir: Direccion
}

/** Orden multinivel: reglas apiladas por prioridad (la primera manda). */
export type OrdenMulti = ReglaOrden[]

/** Etiqueta de un campo ordenable, para el menu. */
export interface CampoOrdenOpc {
  campo: CampoOrden
  label: string
}

/** Campos ordenables en tablas de proyecto y en la Gantt. */
export const CAMPOS_PROYECTO: CampoOrdenOpc[] = [
  { campo: 'resp', label: 'Responsable' },
  { campo: 'estado', label: 'Estado' },
  { campo: 'objetivo', label: 'Fecha Objetivo' },
  { campo: 'desviacion', label: 'Desviación' },
]

/** En Mis Tareas se agrega Proyecto a los campos ordenables. */
export const CAMPOS_MIS_TAREAS: CampoOrdenOpc[] = [...CAMPOS_PROYECTO, { campo: 'proyecto', label: 'Proyecto' }]

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
    case 'desviacion':
      // Ordena numéricamente por la magnitud (con signo) de la desviación.
      return desviacionHabiles(t)
  }
}

/**
 * Ordena una copia de `items` aplicando las reglas por prioridad (la primera
 * manda; las siguientes desempatan). Los sin valor de un campo van SIEMPRE al
 * final de ese nivel (en ambas direcciones). Sin reglas devuelve `items` tal
 * cual (el orden manual). El sort es estable: los empates totales conservan el
 * orden de entrada.
 */
export function ordenarMulti<T>(
  items: T[],
  reglas: OrdenMulti,
  valor: (x: T, campo: CampoOrden) => string | number | undefined,
): T[] {
  if (!reglas.length) return items
  return [...items].sort((a, b) => {
    for (const r of reglas) {
      const va = valor(a, r.campo)
      const vb = valor(b, r.campo)
      if (va === vb) continue
      if (va === undefined) return 1
      if (vb === undefined) return -1
      return (va < vb ? -1 : 1) * r.dir
    }
    return 0
  })
}
