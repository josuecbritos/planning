// Control moderno para "Hecha" (§3.10): boton circular estilo
// Monday/Todoist. Vacio con borde punteado; al hover insinua el check; hecho
// se rellena verde con check blanco.

interface Props {
  hecha: boolean
  disabled?: boolean
  onToggle: () => void
  ariaLabel?: string
}

export function CheckHecha({ hecha, disabled, onToggle, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={hecha}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`check-hecha${hecha ? ' check-hecha--on' : ''}`}
      onClick={onToggle}
    >
      ✓
    </button>
  )
}
