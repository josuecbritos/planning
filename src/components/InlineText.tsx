import { useState, type ReactNode } from 'react'

// Texto editable inline (N3): click sobre el texto → input en el lugar →
// guarda al salir o con Enter (Escape cancela). Sin formularios.

interface Props {
  valor: string
  onGuardar: (nuevo: string) => void
  /** Envuelve la vista no-editable (p. ej. con HoverCard); el input queda fuera. */
  wrapDisplay?: (nodo: ReactNode) => ReactNode
  className?: string
  inputClassName?: string
  ariaLabel?: string
}

export function InlineText({ valor, onGuardar, wrapDisplay, className, inputClassName, ariaLabel }: Props) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(valor)

  function confirmar() {
    setEditando(false)
    const limpio = borrador.trim()
    if (limpio && limpio !== valor) onGuardar(limpio)
  }

  if (editando) {
    return (
      <input
        className={`inline-input${inputClassName ? ' ' + inputClassName : ''}`}
        autoFocus
        value={borrador}
        aria-label={ariaLabel}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar()
          if (e.key === 'Escape') {
            setBorrador(valor)
            setEditando(false)
          }
        }}
      />
    )
  }

  const display = (
    <span
      className={`inline-text${className ? ' ' + className : ''}`}
      role="button"
      tabIndex={0}
      title="Click para editar"
      onClick={() => {
        setBorrador(valor)
        setEditando(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setBorrador(valor)
          setEditando(true)
        }
      }}
    >
      {valor}
    </span>
  )

  return <>{wrapDisplay ? wrapDisplay(display) : display}</>
}
