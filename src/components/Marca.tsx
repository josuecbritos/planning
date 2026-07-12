import type { TipoMarca } from '../types'

// Muestras visuales de las marcas de la grilla Gantt (6.4) y la leyenda.

export function Marca({ tipo }: { tipo: TipoMarca }) {
  switch (tipo) {
    case 'pendiente':
      return <span className="mark mark--pendiente" aria-label="Pendiente">✕</span>
    case 'hecha':
      return <span className="mark mark--hecha" aria-label="Hecha">✓</span>
    case 'incumplida':
      return <span className="mark mark--incumplida" aria-label="Atrasado" />
    case 'anterior':
      return <span className="mark mark--anterior" aria-label="Fecha anterior" />
  }
}
