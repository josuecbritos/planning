import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// #327 — Los globos de texto corto de la Gantt.
//
// Los cuatro globos de la grilla —el nombre completo del frente y del sub
// frente, el rótulo del proyecto en Mis Tareas, "Información" y "Agregar tarea
// debajo", y el detalle del día— colgaban de su celda con un `::after`. Como
// colgaban de la celda quedaban DENTRO del recuadro con scroll de la grilla, y
// ese recuadro los recortaba: contra el borde de arriba, los que se abren
// hacia arriba aparecían cortados.
//
// Un globo que se abre hacia afuera dentro de un contenedor con `overflow`
// queda recortado sin importar el z-index. El producto ya lo resolvió dos
// veces por el mismo camino —el nombre completo en administración de usuarios
// (#213) y la tarjeta flotante de la tarea—: sacarlo del árbol y dibujarlo en
// una capa aparte, con `position: fixed`, donde el overflow de nadie lo
// alcanza. Esto hace lo mismo para los cuatro de una vez.
//
// No cambia el marcado de cada disparador: se sigue leyendo `data-tip` de la
// celda o del botón, igual que antes. Lo que cada uno declara aparte es su
// lado (`data-tip-lado="derecha"`, si no hacia arriba) y su retardo
// (`data-tip-espera`, en milisegundos; solo lo usan las celdas de la grilla).
// Está escrito en el marcado y no en una lista de selectores acá adentro para
// que se lea junto al elemento que lo pide.

const MARGEN = 8
const SEPARACION = 6

type Disparo = { texto: string; lado: 'arriba' | 'derecha'; espera: boolean; ancla: DOMRect }

/** Un único globo para todo lo que haya bajo `raiz` con `data-tip`. */
export function GloboTip({ raiz }: { raiz: React.RefObject<HTMLElement | null> }) {
  const [disparo, setDisparo] = useState<Disparo | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const globoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = raiz.current
    if (!nodo) return
    let espera = 0
    let actual: HTMLElement | null = null

    const soltar = () => {
      window.clearTimeout(espera)
      actual = null
      setDisparo(null)
      setPos(null)
    }

    // `mouseover` burbujea, así que también avisa cuando el cursor pasa a algo
    // que NO dispara globo: ahí `destino` es null y el globo se suelta. Por eso
    // no hace falta un `mouseout` por elemento, que con hijos anidados obliga a
    // mirar `relatedTarget` y se equivoca al cruzar entre ellos.
    const entrar = (e: MouseEvent) => {
      const destino = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]') ?? null
      if (destino === actual) return
      window.clearTimeout(espera)
      actual = destino
      setPos(null)
      const texto = destino?.getAttribute('data-tip')
      if (!destino || !texto) {
        setDisparo(null)
        return
      }
      const lado = destino.getAttribute('data-tip-lado') === 'derecha' ? 'derecha' : 'arriba'
      const ms = Number(destino.getAttribute('data-tip-espera') ?? 0)
      // La medida del ancla se toma al mostrar, no al entrar: con retardo, la
      // grilla pudo desplazarse en el medio.
      const mostrar = () =>
        setDisparo({ texto, lado, espera: ms > 0, ancla: destino.getBoundingClientRect() })
      if (ms > 0) espera = window.setTimeout(mostrar, ms)
      else mostrar()
    }

    nodo.addEventListener('mouseover', entrar)
    nodo.addEventListener('mouseleave', soltar)
    // El globo cuelga de coordenadas de PANTALLA. Si la grilla o la página se
    // desplazan, su ancla se fue de lugar y quedaría flotando solo: se suelta.
    window.addEventListener('scroll', soltar, true)
    window.addEventListener('resize', soltar)
    return () => {
      window.clearTimeout(espera)
      nodo.removeEventListener('mouseover', entrar)
      nodo.removeEventListener('mouseleave', soltar)
      window.removeEventListener('scroll', soltar, true)
      window.removeEventListener('resize', soltar)
    }
  }, [raiz])

  // Se coloca DESPUÉS de pintarlo: el ancho del globo depende de su texto y
  // hasta no tenerlo en pantalla no se sabe. Mientras tanto va invisible, no
  // fuera de la pantalla: `white-space: nowrap` le da el mismo ancho en
  // cualquier lado, así que medirlo donde caiga es exacto.
  useLayoutEffect(() => {
    if (!disparo || !globoRef.current) return
    const g = globoRef.current.getBoundingClientRect()
    const a = disparo.ancla
    let left: number
    let top: number
    if (disparo.lado === 'derecha') {
      left = a.right + SEPARACION
      // Solo si no cabe se pasa al otro lado: el criterio pide que cada globo
      // se siga abriendo hacia donde se abría.
      if (left + g.width > window.innerWidth - MARGEN) left = a.left - g.width - SEPARACION
      // Un ancla alta —el rótulo del proyecto abarca su frente entero con
      // rowSpan— puede tener su centro fuera de la pantalla. Se centra contra
      // la parte VISIBLE, que es la que el ojo está mirando.
      const arriba = Math.max(a.top, 0)
      const abajo = Math.min(a.bottom, window.innerHeight)
      top = (arriba + abajo) / 2 - g.height / 2
    } else {
      left = a.left + a.width / 2 - g.width / 2
      top = a.top - g.height - SEPARACION
      if (top < MARGEN) top = a.bottom + SEPARACION
    }
    const acotar = (v: number, tope: number) => Math.max(MARGEN, Math.min(v, tope - MARGEN))
    const colocado = {
      left: Math.round(acotar(left, window.innerWidth - g.width)),
      top: Math.round(acotar(top, window.innerHeight - g.height)),
    }
    if (!pos || pos.left !== colocado.left || pos.top !== colocado.top) setPos(colocado)
    // `pos` queda fuera de las dependencias a propósito: el efecto lo escribe y
    // volver a correr por eso sería un ciclo. Lo que lo dispara es el disparo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disparo])

  if (!disparo) return null
  return createPortal(
    <div
      ref={globoRef}
      className={`globo-tip${disparo.espera ? ' globo-tip--suave' : ''}`}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {disparo.texto}
    </div>,
    document.body,
  )
}
