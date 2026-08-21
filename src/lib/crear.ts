// #328/#333 — Insertar un elemento nuevo DEBAJO de un hermano.
//
// La Gantt ya lo hacía desde su "+"; #328 le da la misma capacidad a la tabla
// desde el menú del clic derecho. Las dos pasan por acá en vez de repetir el
// cálculo: el orden que le toca al nuevo y el corrimiento de los hermanos
// posteriores es la misma regla, y compartiéndola no pueden separarse.

/** Lo mínimo que hace falta de un hermano para abrirle hueco al nuevo. */
export interface Hermano {
  id: string
  orden: number
}

/**
 * Abre hueco justo debajo de `despuesDe` y devuelve el `orden` que le toca al
 * elemento nuevo — o `undefined`, que significa "al final del contenedor".
 *
 * **Insertar en el medio obliga a editar hermanos ajenos**, así que solo lo
 * hace quien tiene control total; el resto crea al final. Esa condición entra
 * como parámetro (`puedeInsertar`) y no se decide acá: quien llama ya tiene el
 * `can` del proyecto de ESE elemento —en Mis Tareas no es el del proyecto
 * activo—.
 */
export async function abrirHueco(
  hermanos: Hermano[],
  despuesDe: Hermano | undefined,
  puedeInsertar: boolean,
  correr: (id: string, orden: number) => Promise<unknown>,
): Promise<number | undefined> {
  if (!puedeInsertar || !despuesDe) return undefined
  const orden = despuesDe.orden + 1
  // Los posteriores bajan de a uno. Se esperan TODOS antes de crear: si alguno
  // falla, el nuevo no se mete en un hueco que no se abrió.
  await Promise.all(hermanos.filter((h) => h.orden >= orden).map((h) => correr(h.id, h.orden + 1)))
  return orden
}
