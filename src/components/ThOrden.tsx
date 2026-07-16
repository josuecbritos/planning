import type { ReactNode } from 'react'
import { siguienteOrden, type CampoOrden, type Orden } from '../lib/orden'

// Encabezado de columna ordenable: clic cicla ↑ / ↓ / orden original. La
// flecha se dibuja en TODOS los encabezados de esa columna (los sub frentes
// repiten encabezados y el orden es global), porque comparten el estado.

export function ThOrden({
  campo,
  orden,
  onCambiar,
  className,
  children,
}: {
  campo: CampoOrden
  orden: Orden | null
  onCambiar: (o: Orden | null) => void
  className?: string
  children: ReactNode
}) {
  const activo = orden?.campo === campo
  return (
    <th
      className={`${className ? className + ' ' : ''}th-orden${activo ? ' th-orden--activa' : ''}`}
      role="button"
      tabIndex={0}
      aria-sort={activo ? (orden!.dir === 1 ? 'ascending' : 'descending') : undefined}
      title="Ordenar por esta columna"
      onClick={() => onCambiar(siguienteOrden(orden, campo))}
      onKeyDown={(e) => e.key === 'Enter' && onCambiar(siguienteOrden(orden, campo))}
    >
      {children}
      {activo && <span className="th-orden__flecha">{orden!.dir === 1 ? '↑' : '↓'}</span>}
    </th>
  )
}
