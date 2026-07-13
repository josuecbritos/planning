import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Modal base reutilizable (overlay + tarjeta centrada).

interface Props {
  titulo: string
  onClose: () => void
  children: ReactNode
  /** Variante ancha (p. ej. configuracion de permisos). */
  ancho?: boolean
}

export function Modal({ titulo, onClose, children, ancho }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal-card${ancho ? ' modal-card--ancha' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{titulo}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
