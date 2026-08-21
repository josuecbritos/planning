// #203: iconos de acción como SVG de trazo, NO como emojis del sistema.
//
// Los glifos que se usaban (✎ U+270E, ⏻ U+23FB, ✉ U+2709, ↺ U+21BA…) son
// símbolos de presentación de texto: no están en el set de emoji a color, así
// que si la fuente del sistema no los trae, Android los dibuja como un cuadro
// vacío (▯). En escritorio se veían porque las fuentes de escritorio sí los
// cubren. Un SVG no depende de ninguna fuente y se ve igual en todas partes.
//
// Trazo y peso coherentes con la iconografía Andotek (la campana de
// notificaciones y el chevron de plegar son las referencias). Heredan el color
// con `currentColor`, así que los estados (hover, atenuado, grayscale) siguen
// funcionando igual que con los emojis.

interface Props {
  /** Tamaño en px (cuadrado). Por defecto 16, el alto de los iconos de tabla. */
  size?: number
  /** #331: grosor del trazo. Por defecto 1.7, el del juego de acciones. Los
   *  dos iconos de la franja lateral usan 1.6, que es el de la campana con la
   *  que comparten esa columna. */
  trazo?: number
}

function Svg({ size = 16, trazo = 1.7, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={trazo}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Editar (reemplaza ✎). */
export const IconoEditar = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M14.5 6.5l3 3" />
  </Svg>
)

/** Permisos de proyecto — llave inglesa (reemplaza 🔧). */
export const IconoLlaveInglesa = (p: Props) => (
  <Svg {...p}>
    <path d="M15.6 5.4a4.5 4.5 0 0 0-6 5.9l-5 5a1.8 1.8 0 0 0 2.5 2.5l5-5a4.5 4.5 0 0 0 5.9-6l-2.6 2.6-2.4-2.4 2.6-2.6Z" />
  </Svg>
)

/** Invitar por correo (reemplaza ✉). */
export const IconoCorreo = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Svg>
)

/** Activar / desactivar (reemplaza ⏻). */
export const IconoEncendido = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3v9" />
    <path d="M6.8 6.8a7.3 7.3 0 1 0 10.4 0" />
  </Svg>
)

/** Eliminar (reemplaza 🗑). */
export const IconoPapelera = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6.5h16" />
    <path d="M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
    <path d="M10.5 10v6.5M13.5 10v6.5" />
  </Svg>
)

/** Miembros (reemplaza 👥). */
export const IconoMiembros = (p: Props) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8.5" r="3" />
    <path d="M3.8 19.5a5.7 5.7 0 0 1 11.4 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.8M17.4 15.4a5.2 5.2 0 0 1 2.8 4.1" />
  </Svg>
)

/** Archivar / desarchivar (reemplaza 📦). */
export const IconoArchivar = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="4.5" rx="1.2" />
    <path d="M4.8 9v9.3c0 .9.7 1.7 1.7 1.7h11c1 0 1.7-.8 1.7-1.7V9" />
    <path d="M10 13h4" />
  </Svg>
)

/** Permisos del acceso — llave (reemplaza 🔑). */
export const IconoLlave = (p: Props) => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M15.5 12v2.2" />
  </Svg>
)

/** Reactivar (reemplaza ↺). */
export const IconoReactivar = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 1 2.4 5.5" />
    <path d="M4.2 7.2v4.4h4.4" />
  </Svg>
)

/** Información (reemplaza ⓘ). */
export const IconoInfo = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8v.6" />
  </Svg>
)

// #331 — Los dos primeros iconos que NO son de una acción sobre una fila: son
// las dos secciones fijas de la barra que faltaban en la franja contraída
// (Notificaciones ya estaba, con su campana, desde #159). Siguen la misma base
// que el resto —trazo, `currentColor`, viewBox de 24— y se dibujan con el
// trazo de la campana, que es su vecina en la franja.

/** Resumen — tres barras verticales sobre una misma línea de base, la del
 *  medio la más alta. */
export const IconoResumen = (p: Props) => (
  <Svg {...p}>
    <path d="M6 13v6" />
    <path d="M12 6v13" />
    <path d="M18 10v9" />
  </Svg>
)

/** Mis Tareas — una lista de tres renglones con un visto a la izquierda del
 *  primero. El visto va SOLO en el primero: con los tres marcados se leería
 *  como "todo terminado" y no como "cosas por hacer". */
export const IconoMisTareas = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7.6l1.9 1.9L9.4 5.6" />
    <path d="M12.5 8h7" />
    <path d="M12.5 13h7" />
    <path d="M12.5 18h7" />
  </Svg>
)
