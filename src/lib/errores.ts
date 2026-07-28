// #210 — Traducción de errores para la interfaz.
//
// El problema: sin conexión, el navegador lanza "Failed to fetch" (Chrome),
// "NetworkError when attempting to fetch resource" (Firefox) o "Load failed"
// (Safari). Ese texto crudo llegaba tal cual a la pantalla de login y a
// cualquier acción de la aplicación, y no le dice nada a nadie.
//
// La regla es acotada a propósito: SOLO se reemplazan los fallos de red. Un
// "contraseña incorrecta" o un "permiso denegado" son informativos y se
// muestran como vienen — traducirlos también sería esconder información útil.

export const MENSAJE_RED = 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'

// Firmas de fallo de red de los tres motores, más las que agrega el cliente de
// Supabase cuando el fetch subyacente se cae.
const FIRMAS_RED = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'fetch failed',
  'err_internet_disconnected',
  'err_network',
  'network request failed',
  // supabase-js envuelve el fallo de red de functions.invoke con su propio
  // texto, que es igual de opaco para quien lo lee.
  'failed to send a request to the edge function',
]

/** ¿Este error es una caída de red (y no una respuesta del servidor)? */
export function esErrorDeRed(e: unknown): boolean {
  const texto = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  if (!texto) return false
  return FIRMAS_RED.some((f) => texto.includes(f))
}

/**
 * Texto a mostrar para un error cualquiera: el mensaje de red si lo es, y si
 * no, el mensaje original sin tocar.
 */
export function mensajeError(e: unknown): string {
  if (esErrorDeRed(e)) return MENSAJE_RED
  const texto = e instanceof Error ? e.message : String(e ?? '')
  return texto || 'Ocurrió un error inesperado.'
}
