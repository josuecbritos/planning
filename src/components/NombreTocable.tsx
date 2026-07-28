import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// #213 — El nombre de la primera columna de las tablas de administración se
// trunca cuando no cabe, y AL TOCARLO se abre un globo con el contenido
// completo: nombre entero más el pill que corresponda (Dueño/Miembro en
// Proyectos, "tú" en Usuarios). Si es muy largo, el globo se envuelve en
// varias líneas; no se corta nunca.
//
// Por qué hace falta: en una pantalla táctil no hay hover, así que un nombre
// cortado con "…" queda ilegible para siempre. Se descartaron envolver el
// nombre en dos líneas (crece la fila) y sacar el pill de la columna (se
// pierde saber si uno es dueño).
//
// El globo va en un PORTAL con `position: fixed`, no dentro de la celda. Es
// deliberado: un globo que se abre hacia arriba dentro de un contenedor con
// `overflow` queda recortado sin importar el z-index — pasó con el menú de
// Vistas y costó tres intentos. Fuera del árbol de la tabla, el overflow de
// nadie lo alcanza. Se comprueba especialmente en la PRIMERA fila, que es
// donde aquello se manifestó.
//
// En escritorio no cambia nada: el globo solo se abre bajo 768px.

const ANCHO_MAX = 280
const MARGEN = 8

interface Props {
  /** Punto de color o avatar, a la izquierda del nombre. */
  icono?: React.ReactNode
  nombre: string
  /** Pill de la fila (Dueño / Miembro / tú), o nada. */
  pill?: React.ReactNode
}

function esMovil(): boolean {
  try {
    return window.matchMedia('(max-width: 768px)').matches
  } catch {
    return false
  }
}

export function NombreTocable({ icono, nombre, pill }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const globoRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Se coloca DESPUÉS de medir el globo ya renderizado: su alto depende de en
  // cuántas líneas se envolvió el nombre, y hasta no pintarlo no se sabe.
  useLayoutEffect(() => {
    if (!pos || !ref.current || !globoRef.current) return
    const ancla = ref.current.getBoundingClientRect()
    const globo = globoRef.current.getBoundingClientRect()
    const left = Math.max(MARGEN, Math.min(ancla.left, window.innerWidth - globo.width - MARGEN))
    // Debajo del nombre si cabe; si no, encima. Nunca contra un borde.
    const abajo = ancla.bottom + 6
    const arriba = ancla.top - globo.height - 6
    const top = abajo + globo.height + MARGEN <= window.innerHeight ? abajo : Math.max(MARGEN, arriba)
    if (Math.round(left) !== Math.round(pos.left) || Math.round(top) !== Math.round(pos.top)) {
      setPos({ top, left })
    }
  }, [pos])

  useEffect(() => {
    if (!pos) return
    // Un toque sobre el propio nombre no se trata como "cerrar": lo resuelve
    // su onClick, que alterna. Si no, el globo se cerraría en el pointerdown
    // (fase de captura, antes del click) y volvería a abrirse enseguida — el
    // segundo toque no lo cerraría nunca.
    const cerrar = (e?: Event) => {
      if (e && e.target instanceof Node && ref.current?.contains(e.target)) return
      setPos(null)
    }
    const porTecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    // Los cierres se enganchan en el SIGUIENTE frame, no en este. Si no, un
    // scroll que llega en el mismo tick que la apertura cierra el globo antes
    // de que se vea: pasaba al tocar un nombre justo después de cerrar un
    // modal, cuando el navegador devuelve el scroll al body y dispara el
    // evento. El primer toque parecía no hacer nada y había que insistir.
    let quitar = () => {}
    const id = requestAnimationFrame(() => {
      // `capture` para enterarse del toque aunque el destino lo detenga.
      document.addEventListener('pointerdown', cerrar, true)
      document.addEventListener('keydown', porTecla)
      window.addEventListener('scroll', cerrar, true)
      window.addEventListener('resize', cerrar)
      quitar = () => {
        document.removeEventListener('pointerdown', cerrar, true)
        document.removeEventListener('keydown', porTecla)
        window.removeEventListener('scroll', cerrar, true)
        window.removeEventListener('resize', cerrar)
      }
    })
    return () => {
      cancelAnimationFrame(id)
      quitar()
    }
  }, [pos])

  return (
    <span className="usuario-nombre">
      {icono}
      <button
        ref={ref}
        type="button"
        className="usuario-nombre__txt"
        title={nombre}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (!esMovil()) return
          // El toque abre el globo y NADA MÁS: no debe disparar ninguna otra
          // acción de la fila.
          e.stopPropagation()
          e.preventDefault()
          setPos((p) => (p ? null : { top: -9999, left: -9999 }))
        }}
      >
        {nombre}
      </button>
      {pill}
      {pos &&
        createPortal(
          <div
            ref={globoRef}
            className="nombre-globo"
            style={{ top: pos.top, left: pos.left, maxWidth: Math.min(ANCHO_MAX, window.innerWidth - MARGEN * 2) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="nombre-globo__txt">{nombre}</span>
            {pill}
          </div>,
          document.body,
        )}
    </span>
  )
}
