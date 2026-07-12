import { useState } from 'react'
import type { ISODate } from '../types'
import { formatoFecha } from '../lib/dates'

// Fecha editable inline: muestra el formato unico dd-mmm-aaaa y al hacer
// click se convierte en date picker. El cambio se CONFIRMA al cerrar el
// editor (blur o Enter), no en cada tecleo: el input nativo dispara un
// change por cada segmento editado, lo que generaba replanificaciones
// intermedias con fechas fantasma en el historial.

interface Props {
  valor: ISODate
  onCambiar: (nueva: ISODate) => void
  ariaLabel?: string
}

export function FechaEditable({ valor, onCambiar, ariaLabel }: Props) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState<ISODate>(valor)

  function confirmar() {
    setEditando(false)
    if (borrador && borrador !== valor) onCambiar(borrador)
  }

  if (!editando) {
    return (
      <button
        type="button"
        className="fecha-btn"
        title="Cambiar fecha (queda registrado en el historial)"
        aria-label={ariaLabel}
        onClick={() => {
          setBorrador(valor)
          setEditando(true)
        }}
      >
        {formatoFecha(valor)}
      </button>
    )
  }

  return (
    <input
      className="fecha-input fecha-input--editando"
      type="date"
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
