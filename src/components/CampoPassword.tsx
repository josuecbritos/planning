import { useId, useState } from 'react'

// #217 — Campo de contraseña con su propio ojo. Uno por campo, independiente
// de los demás: es el patrón que la gente ya conoce.
//
// Reemplaza al interruptor único de "Ver contraseñas" que había en la pantalla
// de configuración, que mostraba u ocultaba los tres a la vez. Se usa en TODOS
// los campos de contraseña de la aplicación —login, definir contraseña por
// invitación o recuperación, y los tres de configuración—, para que el gesto
// sea siempre el mismo.

interface Props {
  etiqueta: React.ReactNode
  valor: string
  onCambiar: (v: string) => void
  /** 'current-password' al iniciar sesión; 'new-password' al definir una. */
  autoComplete?: string
  autoFocus?: boolean
}

/** Ojo abierto / tachado, en SVG por lo mismo que #203: un glifo del sistema
 *  puede no existir en la fuente del dispositivo. */
function IconoOjo({ abierto }: { abierto: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {!abierto && <path d="M4 20 20 4" />}
    </svg>
  )
}

export function CampoPassword({ etiqueta, valor, onCambiar, autoComplete, autoFocus }: Props) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  return (
    <label className="campo campo--password" htmlFor={id}>
      <span>{etiqueta}</span>
      <span className="campo-password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
        />
        <button
          type="button"
          className="campo-password__ojo"
          // El estado se anuncia en el nombre accesible: quien no ve el icono
          // necesita saber qué va a pasar al pulsarlo.
          aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          aria-pressed={visible}
          title={visible ? 'Ocultar' : 'Mostrar'}
          onClick={() => setVisible((v) => !v)}
        >
          <IconoOjo abierto={visible} />
        </button>
      </span>
    </label>
  )
}
