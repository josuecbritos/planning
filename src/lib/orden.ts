import type { AppState, Tarea } from '../types'
import { atrasoHabiles, categoriaDe, nReplanificaciones, type Categoria } from './derive'

// Ordenamiento multinivel (menu "Ordenar", proyectos y Mis Tareas). Se apilan
// varias reglas campo + direccion, que se aplican por prioridad (de arriba
// hacia abajo): cada nivel desempata al anterior. Ordena DENTRO de cada sub
// frente, sin mezclar tareas entre sub frentes. Se guarda junto con los
// filtros como una sola "vista"; si no se guarda, es momentaneo (se pierde al
// recargar).

export type CampoOrden = 'resp' | 'estado' | 'objetivo' | 'atraso' | 'proyecto'

/** Direccion de una regla: 1 = ascendente (↑), -1 = descendente (↓). */
export type Direccion = 1 | -1

/** Una regla de orden: un campo y su direccion. */
interface ReglaOrden {
  campo: CampoOrden
  dir: Direccion
}

/** Orden multinivel: reglas apiladas por prioridad (la primera manda). */
export type OrdenMulti = ReglaOrden[]

/**
 * Lo que de verdad se compara. No es lo mismo que `CampoOrden`: un campo del
 * menú puede desplegarse en VARIAS comparaciones, y hay comparaciones que no
 * son campos del menú y nadie puede elegir por su cuenta.
 *
 * - `frente` y `subfrente` (#319) despliegan a `proyecto`, para que dentro de
 *   cada proyecto las tareas queden agrupadas por frente y sub frente.
 * - `replan` (#313) desempata a `estado` con el número de replanificaciones.
 *
 * Ninguna de las tres se agrega al menú: no son criterios que se elijan, son la
 * continuación del criterio que las trae.
 */
export type ClaveOrden = CampoOrden | 'frente' | 'subfrente' | 'replan'

/** Una comparación concreta con su sentido. */
export interface ClaveConDireccion {
  clave: ClaveOrden
  dir: Direccion
}

/**
 * Traduce las reglas del menú a la lista de comparaciones que se aplican, en
 * orden. Acá viven las dos reglas que el menú no muestra:
 *
 * **#319 — Proyecto agrupa por frente y sub frente.** Comparar solo el nombre
 * del proyecto deja empatadas a TODAS sus tareas, así que quedaban revueltas,
 * con frentes y sub frentes intercalados; y no había forma de arreglarlo a
 * mano, porque frente y sub frente no son campos ordenables. Las tres
 * comparaciones van juntas y en el lugar de Proyecto: lo que se apile después
 * manda DENTRO del sub frente, que es lo que se pidió.
 *
 * **#313 — El número de replanificaciones desempata dentro de cada estado.**
 * Va al FINAL de todo, no pegado a Estado: si alguien apila Estado con Fecha
 * Objetivo, la fecha tiene que seguir mandando sobre el desempate. Es el último
 * recurso antes de dejar las cosas como venían.
 *
 * Las dos heredan el SENTIDO de la regla que las trae. En #313 eso no es
 * cosmético: estado y replanificaciones son una sola escala de gravedad —una
 * tarea replanificada es más crítica que una que no lo está, y cuantas más
 * veces se movió, más crítica es—, así que invertir la flecha del estado tiene
 * que invertir también el desempate.
 */
export function clavesDeOrden(reglas: OrdenMulti): ClaveConDireccion[] {
  const claves: ClaveConDireccion[] = []
  for (const r of reglas) {
    claves.push({ clave: r.campo, dir: r.dir })
    if (r.campo === 'proyecto') {
      claves.push({ clave: 'frente', dir: r.dir }, { clave: 'subfrente', dir: r.dir })
    }
  }
  const estado = reglas.find((r) => r.campo === 'estado')
  if (estado) claves.push({ clave: 'replan', dir: estado.dir })
  return claves
}

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
  { campo: 'atraso', label: 'Atraso' },
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

/** Valor comparable de una tarea para una clave (undefined = sin valor). */
export function valorOrden(
  state: AppState,
  t: Tarea,
  clave: Exclude<ClaveOrden, 'proyecto'>,
  hoy: string,
): string | number | undefined {
  switch (clave) {
    case 'resp': {
      const u = state.usuarios.find((x) => x.id === t.responsableId)
      return u ? u.nombre.toLowerCase() : undefined
    }
    case 'estado':
      return GRAVEDAD[categoriaDe(state, t, hoy)]
    case 'objetivo':
      return t.fechaObjetivo
    case 'atraso':
      // Ordena numéricamente por la cantidad de días de atraso.
      return atrasoHabiles(t)
    // #313: el mismo número que muestra el ↻ ×N de la tabla. Vale para TODOS
    // los estados, incluidas las hechas: marcar hecha quita la condición de
    // replanificada a efectos de color y contadores, pero el rastro queda.
    case 'replan':
      return nReplanificaciones(state, t.id)
    // #319: el orden con el que frente y sub frente están armados en su
    // proyecto —el mismo que se ve al entrar—, no alfabético.
    case 'frente': {
      const sub = state.subFrentes.find((sf) => sf.id === t.subFrenteId)
      const f = sub ? state.frentes.find((x) => x.id === sub.frenteId) : undefined
      return f?.orden
    }
    case 'subfrente':
      return state.subFrentes.find((sf) => sf.id === t.subFrenteId)?.orden
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
  valor: (x: T, clave: ClaveOrden) => string | number | undefined,
): T[] {
  if (!reglas.length) return items
  // Las reglas del menú se traducen antes a las comparaciones que de verdad se
  // aplican (ver `clavesDeOrden`): algunas se despliegan en varias y hay una
  // que se agrega al final.
  const claves = clavesDeOrden(reglas)
  return [...items].sort((a, b) => {
    for (const c of claves) {
      const va = valor(a, c.clave)
      const vb = valor(b, c.clave)
      if (va === vb) continue
      if (va === undefined) return 1
      if (vb === undefined) return -1
      return (va < vb ? -1 : 1) * c.dir
    }
    return 0
  })
}
