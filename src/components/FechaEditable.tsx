import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ISODate } from '../types'
import { etiquetaMes, formatoFecha, hoyISO } from '../lib/dates'

// Fecha editable inline (N4): un solo click abre el calendario de inmediato y
// elegir un día guarda y cierra al instante.
//
// #262: el calendario es PROPIO, ya no el nativo del navegador (showPicker).
// Con el nativo no había forma de distinguir "navegó de mes" de "eligió un
// día": ambos disparaban un change sin tecleo, y navegar meses asignaba la
// fecha (con historial de replanificación de por medio si la tarea ya tenía
// compromiso). Con calendario propio la regla queda inequívoca:
//   · navegar meses solo cambia lo que se ve;
//   · SOLO el clic en un día concreto confirma y cierra;
//   · clic fuera, Escape o scroll cierran SIN tocar la fecha.

interface Props {
  /** Sin valor = tarea aun no planificada ("nace sin fecha"). */
  valor?: ISODate
  onCambiar: (nueva: ISODate) => void
  ariaLabel?: string
}

const DIAS_SEMANA = ['lu', 'ma', 'mi', 'ju', 'vi', 'sa', 'do']
const ANCHO_CAL = 248
const ALTO_CAL = 330

/** Año y mes (0-11) del mes que el calendario muestra. */
interface Mes {
  anio: number
  mes0: number
}

function mesDe(iso: ISODate): Mes {
  const [y, m] = iso.split('-').map(Number)
  return { anio: y, mes0: m - 1 }
}

function sumarMes({ anio, mes0 }: Mes, delta: number): Mes {
  const total = anio * 12 + mes0 + delta
  return { anio: Math.floor(total / 12), mes0: ((total % 12) + 12) % 12 }
}

function isoDe(anio: number, mes0: number, dia: number): ISODate {
  return `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function FechaEditable({ valor, onCambiar, ariaLabel }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [mes, setMes] = useState<Mes>(() => mesDe(valor ?? hoyISO()))
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const cerrar = () => {
    setAbierto(false)
    setPos(null)
  }

  /** Posición pegada al botón, acotada al viewport: debajo; si no cabe,
   *  encima. Devuelve null si el botón salió de la vista. */
  const posicionDelBoton = (): { top: number; left: number } | null => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return null
    const MARGEN = 8
    const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - ANCHO_CAL - MARGEN))
    let top = r.bottom + 6
    if (top + ALTO_CAL > window.innerHeight - MARGEN) top = r.top - ALTO_CAL - 6
    return { top: Math.max(MARGEN, top), left }
  }

  // Cerrar SIN asignar: clic fuera o Escape (mismo patrón que los menús ⋯ del
  // sidebar). El clic sobre el propio botón no cuenta como "fuera": su onClick
  // alterna abierto/cerrado. Al hacer scroll el calendario NO se cierra: SIGUE
  // al botón (y recién se cierra si este sale del viewport) — cerrarlo ahí
  // rompería la apertura cuando el propio clic desplaza la celda a la vista.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.fecha-cal') && !btnRef.current?.contains(t)) cerrar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    const reposicionar = () => {
      const pos = posicionDelBoton()
      if (pos) setPos(pos)
      else cerrar()
    }
    // El clic-fuera va en fase de CAPTURA: varias celdas de la tabla cortan la
    // propagación de mousedown y en burbuja el cierre nunca llegaría.
    const id = setTimeout(() => document.addEventListener('mousedown', fuera, true), 0)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', fuera, true)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
    }
  }, [abierto])

  const abrir = () => {
    if (abierto) {
      cerrar()
      return
    }
    setMes(mesDe(valor ?? hoyISO()))
    setPos(posicionDelBoton() ?? { top: 80, left: 80 })
    setAbierto(true)
  }

  const elegir = (iso: ISODate) => {
    cerrar()
    // Cualquier dia es valido, incluidos sabado y domingo (§6.3.18).
    if (iso !== valor) onCambiar(iso)
  }

  // Celdas del mes visible: huecos hasta el primer día (semana inicia lunes).
  const primerDow = new Date(Date.UTC(mes.anio, mes.mes0, 1)).getUTCDay() // 0=do
  const huecos = (primerDow + 6) % 7
  const nDias = new Date(Date.UTC(mes.anio, mes.mes0 + 1, 0)).getUTCDate()
  // #285: hoy se marca SIEMPRE (con borde; el elegido va relleno; si coinciden,
  // relleno con borde). Si el mes visible es otro, hoy simplemente no aparece.
  const hoy = hoyISO()

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`fecha-btn${valor ? '' : ' fecha-btn--vacia'}`}
        title={valor ? 'Cambiar fecha (queda registrado en el historial)' : 'Asignar la primera fecha (compromiso inicial)'}
        aria-label={ariaLabel}
        aria-expanded={abierto}
        onClick={abrir}
      >
        {valor ? formatoFecha(valor) : 'Planificar'}
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            className="fecha-cal"
            role="dialog"
            aria-label={ariaLabel ? `Calendario: ${ariaLabel}` : 'Calendario'}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: ANCHO_CAL }}
            /* El calendario no roba el foco (mismo truco que los ✓/✕ de la
               fila de creación): si lo hiciera, el guardado-por-foco-fuera de
               esa fila la cerraría al primer clic en una flecha de mes. */
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="fecha-cal__cabecera">
              <button
                type="button"
                className="fecha-cal__nav"
                aria-label="Mes anterior"
                onClick={() => setMes((m) => sumarMes(m, -1))}
              >
                ‹
              </button>
              <span className="fecha-cal__mes">{etiquetaMes(mes.anio, mes.mes0)}</span>
              <button
                type="button"
                className="fecha-cal__nav"
                aria-label="Mes siguiente"
                onClick={() => setMes((m) => sumarMes(m, 1))}
              >
                ›
              </button>
            </div>
            <div className="fecha-cal__grilla">
              {DIAS_SEMANA.map((d) => (
                <span key={d} className="fecha-cal__dow">
                  {d}
                </span>
              ))}
              {Array.from({ length: huecos }, (_, i) => (
                <span key={`h${i}`} />
              ))}
              {Array.from({ length: nDias }, (_, i) => {
                const iso = isoDe(mes.anio, mes.mes0, i + 1)
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`fecha-cal__dia${iso === valor ? ' fecha-cal__dia--sel' : ''}${
                      iso === hoy ? ' fecha-cal__dia--hoy' : ''
                    }`}
                    data-fecha={iso}
                    aria-label={formatoFecha(iso)}
                    onClick={() => elegir(iso)}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            {/* #285: "Hoy" SOLO navega al mes actual — no asigna ni cierra,
                igual que las flechas (la regla central de #262 no se toca). */}
            <div className="fecha-cal__pie">
              <button type="button" className="fecha-cal__ir-hoy" onClick={() => setMes(mesDe(hoy))}>
                Hoy
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
