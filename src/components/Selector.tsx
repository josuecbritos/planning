import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * #353 — El desplegable del producto.
 *
 * Quedaban tres `<select>` nativos, los tres dentro de modales: Organización y
 * Perfil en la ficha del usuario, y el de agregar a alguien en Miembros. Ahí
 * conviven con controles que sí llevan el estilo de la aplicación, así que se
 * veían como una pieza ajena —fondo del sistema, tipografía del sistema— junto
 * al resto. Los menús propios del producto (Filtrar, Ordenar, Vistas, el menú
 * de la tarea) ya existían; lo que faltaba era poder usarlos como campo de
 * formulario.
 *
 * Va en PORTAL y `position: fixed` por la misma razón que los menús de la barra
 * (#310): dentro del modal, un menú absoluto lo recortaría el `overflow` de la
 * caja. Y por eso también calcula su alto contra el espacio que queda, en vez
 * de fijar una fracción de la pantalla.
 *
 * Lo que NO hace: no cambia el contenido ni el comportamiento de ninguno de los
 * tres. Es el mismo valor, la misma lista y el mismo efecto al elegir.
 */

export interface OpcionSelector {
  valor: string
  /** Lo que se ve en la lista. Si falta, se usa `etiqueta`. */
  contenido?: ReactNode
  etiqueta: string
  /** Separación visual respecto de la opción anterior (grupos). */
  separado?: boolean
}

interface Props {
  valor: string
  opciones: OpcionSelector[]
  onCambiar: (valor: string) => void
  ariaLabel?: string
  /** Qué mostrar en el disparador cuando no hay nada elegido. */
  vacio?: string
  /** Clase extra para el disparador (ancho, sobre todo). */
  className?: string
  disabled?: boolean
}

export function Selector({ valor, opciones, onCambiar, ariaLabel, vacio, className, disabled }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [caja, setCaja] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const elegida = opciones.find((o) => o.valor === valor)

  const medir = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return null
    const MARGEN = 8
    const abajo = window.innerHeight - r.bottom - MARGEN * 2
    const arriba = r.top - MARGEN * 2
    // Se abre hacia abajo salvo que arriba haya bastante más sitio; el alto
    // máximo es el que REALMENTE queda, no una fracción de la pantalla (#310).
    const haciaArriba = abajo < 160 && arriba > abajo
    return {
      top: haciaArriba ? Math.max(MARGEN, r.top - Math.min(arriba, 320) - 6) : r.bottom + 6,
      left: Math.max(MARGEN, Math.min(r.left, window.innerWidth - r.width - MARGEN)),
      width: r.width,
      maxHeight: Math.max(120, Math.min(haciaArriba ? arriba : abajo, 320)),
    }
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.selector-menu') && !btnRef.current?.contains(t)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // no cerrar además el modal que lo contiene
        setAbierto(false)
      }
    }
    const reubicar = () => setCaja(medir())
    // En captura, igual que el calendario (#262): varias cajas cortan la
    // propagación del mousedown y en burbuja el cierre no llegaría.
    const id = setTimeout(() => document.addEventListener('mousedown', fuera, true), 0)
    document.addEventListener('keydown', tecla, true)
    window.addEventListener('resize', reubicar)
    window.addEventListener('scroll', reubicar, true)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', fuera, true)
      document.removeEventListener('keydown', tecla, true)
      window.removeEventListener('resize', reubicar)
      window.removeEventListener('scroll', reubicar, true)
    }
  }, [abierto])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`selector-btn${abierto ? ' selector-btn--abierto' : ''}${className ? ' ' + className : ''}`}
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (abierto) {
            setAbierto(false)
            return
          }
          setCaja(medir())
          setAbierto(true)
        }}
      >
        <span className={`selector-btn__txt${elegida ? '' : ' selector-btn__txt--vacio'}`}>
          {elegida ? elegida.etiqueta : vacio ?? '—'}
        </span>
        <span className="selector-btn__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {abierto &&
        caja &&
        createPortal(
          <div
            className="selector-menu"
            role="listbox"
            aria-label={ariaLabel}
            style={{ position: 'fixed', top: caja.top, left: caja.left, minWidth: caja.width, maxHeight: caja.maxHeight }}
          >
            {opciones.map((o) => (
              <button
                key={o.valor}
                type="button"
                role="option"
                aria-selected={o.valor === valor}
                className={`selector-op${o.valor === valor ? ' selector-op--on' : ''}${o.separado ? ' selector-op--separada' : ''}`}
                onClick={() => {
                  setAbierto(false)
                  if (o.valor !== valor) onCambiar(o.valor)
                }}
              >
                {o.contenido ?? o.etiqueta}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
