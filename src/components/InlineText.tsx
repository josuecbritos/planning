import { useEffect, useRef, useState, type ReactNode } from 'react'

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
  /** #292: pulso para abrir la edición desde afuera —la opción "Renombrar" del
   *  menú contextual—. Cada número distinto de 0 abre el input una vez; es un
   *  contador y no un booleano para que pedirlo dos veces seguidas sobre la
   *  misma tarea vuelva a abrirlo. El gesto de siempre —clic sobre el texto— no
   *  cambia: esto es la MISMA edición, pedida desde otro lado. */
  abrirEdicion?: number
}

export function InlineText({ valor, onGuardar, wrapDisplay, className, inputClassName, ariaLabel, abrirEdicion = 0 }: Props) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(valor)

  // El pulso que este componente ya atendió. Se inicializa con el que trae al
  // montarse, y ahí está la parte que importa: la fila puede REMONTARSE por
  // razones que no tienen nada que ver con renombrar —archivar una tarea y
  // restaurarla, por ejemplo— y llegar con un pulso viejo todavía puesto. Sin
  // esta comparación, la tarea restaurada volvía a la tabla con el nombre en
  // modo edición sola. Medido: así se manifestaba, y por eso el pulso se
  // ATIENDE una vez y no se queda encendido.
  const pulsoVisto = useRef(abrirEdicion)
  useEffect(() => {
    if (abrirEdicion === pulsoVisto.current) return
    pulsoVisto.current = abrirEdicion
    if (!abrirEdicion) return
    setBorrador(valor)
    setEditando(true)
    // `valor` queda fuera de las dependencias: lo que abre la edición es el
    // pulso, no que el texto cambie mientras tanto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirEdicion])

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
