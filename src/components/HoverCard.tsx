import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Envuelve un elemento disparador y muestra una tarjeta flotante al pasar el
// cursor (seccion 6.6: "todo el detalle vive en el tooltip"). Usa position
// fixed via portal para no ser recortada por los contenedores con scroll.

// #239: tenía una prop `className` que ningún sitio le pasaba (los seis usos
// envuelven un elemento que trae su propia clase). Se quita.
interface Props {
  card: ReactNode
  children: ReactNode
}

export function HoverCard({ card, children }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  function place(e: React.MouseEvent) {
    // Se ubica arriba-derecha del cursor; se corrige si se sale por el borde.
    const margin = 16
    let x = e.clientX + 14
    let y = e.clientY + 16
    const maxX = window.innerWidth - 356
    const maxY = window.innerHeight - 220
    if (x > maxX) x = e.clientX - 354
    if (y > maxY) y = Math.max(margin, e.clientY - 200)
    setPos({ x, y })
  }

  return (
    <span
      className="trigger"
      onMouseEnter={place}
      onMouseMove={place}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div className="hovercard" style={{ left: pos.x, top: pos.y }}>
            {card}
          </div>,
          document.body,
        )}
    </span>
  )
}
