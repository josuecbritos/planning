// Wordmark Andotek (sistema "Industrial Precision"): se construye
// tipograficamente con Inter Bold — "Ando" en charcoal y "tek" en Safety
// Orange, sin espacio (una sola palabra con dos colores) — mas la palabra
// "Planning" en tono secundario. Sobre fondos oscuros (sidebar), "Ando"
// pasa a blanco conservando el "tek" naranja.

export function Wordmark({ claro }: { claro?: boolean }) {
  return (
    <span className={`wordmark${claro ? ' wordmark--claro' : ''}`}>
      <span className="wordmark__nombre">
        Ando<span className="wordmark__tek">tek</span>
      </span>
      <span className="wordmark__producto">Planning</span>
    </span>
  )
}
