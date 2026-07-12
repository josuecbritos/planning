import { useEffect, useRef, useState } from 'react'
import type { ISODate } from '../types'
import { ajustarDiaHabil, formatoFecha } from '../lib/dates'

// Fecha editable inline (N4): un solo click abre el calendario de inmediato
// (showPicker) y elegir una fecha guarda y cierra al instante.
//
// Regla anti "fecha fantasma": el input nativo dispara un change por cada
// segmento tipeado. Distinguimos el origen del cambio: si NO hubo tecleo,
// vino del calendario y se confirma al momento; si el usuario tipeo, se
// confirma recien al cerrar (blur/Enter; Escape cancela), nunca por segmento.

interface Props {
  /** Sin valor = tarea aun no planificada ("nace sin fecha"). */
  valor?: ISODate
  onCambiar: (nueva: ISODate) => void
  ariaLabel?: string
}

export function FechaEditable({ valor, onCambiar, ariaLabel }: Props) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState<ISODate>(valor ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const huboTecleo = useRef(false)

  useEffect(() => {
    if (!editando) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    try {
      el.showPicker?.()
    } catch {
      /* sin gesto de usuario o sin soporte: queda el input enfocado */
    }
  }, [editando])

  function confirmar(nueva: ISODate) {
    setEditando(false)
    if (!nueva) return
    // Sin fechas de fin de semana: se ancla al dia habil mas cercano.
    const habil = ajustarDiaHabil(nueva)
    if (habil !== valor) onCambiar(habil)
  }

  if (!editando) {
    return (
      <button
        type="button"
        className={`fecha-btn${valor ? '' : ' fecha-btn--vacia'}`}
        title={valor ? 'Cambiar fecha (queda registrado en el historial)' : 'Asignar la primera fecha (compromiso inicial)'}
        aria-label={ariaLabel}
        onClick={() => {
          setBorrador(valor ?? '')
          huboTecleo.current = false
          setEditando(true)
        }}
      >
        {valor ? formatoFecha(valor) : 'Planificar'}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      className="fecha-input fecha-input--editando"
      type="date"
      value={borrador}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value
        setBorrador(v)
        // Cambio sin tecleo previo = seleccion en el calendario: guarda ya.
        if (!huboTecleo.current && v) confirmar(v)
      }}
      onBlur={() => confirmar(borrador)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          confirmar(borrador)
        } else if (e.key === 'Escape') {
          setBorrador(valor ?? '')
          setEditando(false)
        } else {
          huboTecleo.current = true
        }
      }}
    />
  )
}
