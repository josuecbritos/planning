import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Actions } from '../App'
import type { Tarea } from '../types'
import type { Can } from '../lib/permisos'

// #292 — El menú contextual de una tarea (clic derecho).
//
// Las acciones sobre una tarea existían SOLO en la columna de acciones de la
// tabla: Información, Archivar y Eliminar. En la Gantt no había ninguna, así
// que desde ahí no se podía archivar ni eliminar. Este menú las lleva a las dos
// vistas sin crear ninguna acción nueva ni ningún permiso nuevo: son las mismas,
// disponibles donde faltaban.
//
// Es SOLO de tareas: frente, sub frente y las filas de carga no lo tienen. Y es
// un atajo de escritorio: en el teléfono no existe, ni por pulsación larga —ahí
// la columna de acciones sigue siendo el camino—.
//
// *Duplicar entrará acá cuando se defina #273. No entra ahora, ni siquiera
// apagada: una opción que no hace nada gasta la confianza del menú justo cuando
// la persona lo está descubriendo.*

const MARGEN = 8

export interface OpcionMenu {
  texto: string
  onClick: () => void
}

/** Dónde se abrió el menú, en coordenadas de pantalla, y para qué tarea. */
export interface MenuAbierto {
  x: number
  y: number
  tareaId: string
}

/** ¿Estamos en el teléfono? Ahí el menú no existe. */
function esMovil(): boolean {
  try {
    return window.matchMedia('(max-width: 768px)').matches
  } catch {
    return false
  }
}

/**
 * Estado del menú para una vista (la tabla o la Gantt). Cada vista tiene el
 * suyo, porque es la que sabe sobre qué fila se hizo clic derecho.
 *
 * `renombrar` es un pulso: cambia de número cada vez que se elige Renombrar, y
 * la fila que coincide abre su edición. Es un número y no un booleano para que
 * pedir renombrar DOS VECES seguidas sobre la misma tarea vuelva a abrirla.
 */
export function useMenuTarea() {
  const [menu, setMenu] = useState<MenuAbierto | null>(null)
  const [renombrar, setRenombrar] = useState<{ tareaId: string; pulso: number }>({
    tareaId: '',
    pulso: 0,
  })

  /** Para el `onContextMenu` de una fila de tarea. */
  const abrir = (e: React.MouseEvent, tareaId: string) => {
    if (esMovil()) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, tareaId })
  }
  const cerrar = () => setMenu(null)
  const pedirRenombrar = (tareaId: string) =>
    setRenombrar((r) => ({ tareaId, pulso: r.pulso + 1 }))

  /** El pulso que le toca a una fila: 0 si no es la que hay que renombrar. */
  const pulsoDe = (tareaId: string) => (renombrar.tareaId === tareaId ? renombrar.pulso : 0)

  return { menu, abrir, cerrar, pedirRenombrar, pulsoDe }
}

/**
 * Las opciones de una tarea, en un solo lugar: la tabla y la Gantt muestran
 * exactamente las mismas, con las mismas condiciones.
 *
 * **Información no depende de ningún permiso**, así que el menú SIEMPRE tiene
 * al menos una opción: quien ve la tarea puede abrir su panel. Un usuario sin
 * permisos ve el menú con Información sola — a diferencia de la columna de
 * acciones de la tabla, que en ese caso no se muestra.
 */
export function opcionesDeTarea(
  tarea: Tarea,
  can: Can,
  actions: Actions,
  onAbrirTarea: (id: string) => void,
  /**
   * Qué hacer al elegir "Renombrar", o `null` donde ese gesto no existe.
   *
   * Renombrar no es una acción nueva: es el clic sobre el nombre, y el menú lo
   * pide desde otro lado. En la TABLA DE MIS TAREAS ese gesto no existe —el
   * nombre abre el panel de detalle, no la edición—, así que ahí la opción no
   * se ofrece: un menú que promete renombrar y no abre nada gasta la misma
   * confianza que una opción apagada. Su Gantt sí la tiene, porque ahí el
   * nombre siempre fue editable.
   */
  onRenombrar: (() => void) | null,
): OpcionMenu[] {
  const ops: OpcionMenu[] = [{ texto: 'Información', onClick: () => onAbrirTarea(tarea.id) }]
  if (onRenombrar && can.editarTareas(tarea)) ops.push({ texto: 'Renombrar', onClick: onRenombrar })
  if (can.archivarEliminar(tarea)) {
    // Las mismas dos confirmaciones que la columna de acciones, palabra por
    // palabra: es la misma acción, no una versión del menú.
    ops.push({
      texto: 'Archivar',
      onClick: () => {
        if (confirm(`¿Archivar la tarea "${tarea.titulo}"? Sale del plan y conserva su historial.`)) {
          actions.updateTarea(tarea.id, { archivada: true })
        }
      },
    })
    ops.push({
      texto: 'Eliminar',
      onClick: () => {
        if (
          confirm(
            `¿Eliminar definitivamente la tarea "${tarea.titulo}"? Se pierde su historial; si solo quieres cancelarla, usa Archivar.`,
          )
        ) {
          actions.deleteTarea(tarea.id)
        }
      },
    })
  }
  return ops
}

/**
 * El menú en sí. Va en un PORTAL con `position: fixed`, como la tarjeta
 * flotante y los globos de #327: nace dentro de una tabla con scroll y desde
 * ahí cualquier `overflow` lo recortaría.
 */
export function MenuTarea({
  menu,
  opciones,
  onCerrar,
}: {
  menu: MenuAbierto | null
  opciones: OpcionMenu[]
  onCerrar: () => void
}) {
  const cajaRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // Se coloca DESPUÉS de medirlo: cuánto mide depende de cuántas opciones tenga
  // —de una a cuatro, según los permisos— y del largo de sus textos.
  useLayoutEffect(() => {
    if (!menu || !cajaRef.current) return
    const c = cajaRef.current.getBoundingClientRect()
    const x = Math.max(MARGEN, Math.min(menu.x, window.innerWidth - c.width - MARGEN))
    const y = Math.max(MARGEN, Math.min(menu.y, window.innerHeight - c.height - MARGEN))
    const nuevo = { x: Math.round(x), y: Math.round(y) }
    if (!pos || pos.x !== nuevo.x || pos.y !== nuevo.y) setPos(nuevo)
    // `pos` fuera de las dependencias a propósito: el efecto lo escribe y volver
    // a correr por eso sería un ciclo. Lo dispara la apertura del menú.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu])

  useEffect(() => {
    if (!menu) return
    // Ojo: acá NO se reinicia `pos`. Este efecto corre DESPUÉS del de medida,
    // así que borrarlo dejaba el menú invisible para siempre. Y no hace falta:
    // el menú no cambia de tamaño según dónde esté —es `fixed` y su contenido
    // no envuelve—, así que medirlo donde quedó del anterior es exacto.
    const fuera = () => onCerrar()
    const porTecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    // Se enganchan en el SIGUIENTE frame: el mismo gesto que abre el menú no
    // debe cerrarlo.
    const id = requestAnimationFrame(() => {
      document.addEventListener('mousedown', fuera)
      document.addEventListener('contextmenu', fuera)
      document.addEventListener('keydown', porTecla)
      window.addEventListener('scroll', fuera, true)
      window.addEventListener('resize', fuera)
    })
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('contextmenu', fuera)
      document.removeEventListener('keydown', porTecla)
      window.removeEventListener('scroll', fuera, true)
      window.removeEventListener('resize', fuera)
    }
  }, [menu, onCerrar])

  if (!menu || opciones.length === 0) return null
  return createPortal(
    <div
      ref={cajaRef}
      className="menu-tarea"
      role="menu"
      style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {opciones.map((o) => (
        <button
          key={o.texto}
          type="button"
          role="menuitem"
          className="menu-tarea__op"
          onClick={() => {
            onCerrar()
            o.onClick()
          }}
        >
          {o.texto}
        </button>
      ))}
    </div>,
    document.body,
  )
}
