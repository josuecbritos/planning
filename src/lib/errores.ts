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
// Cuando el navegador SÍ tiene red pero la petición no llegó a destino, culpar
// a la conexión manda a la persona a revisar donde no es. Pasó de verdad: una
// Edge Function bloqueada por CORS desde un dominio de preview reportaba
// "revisa tu conexión" mientras la conexión estaba perfecta.
export const MENSAJE_SERVICIO =
  'No pudimos completar la operación. Vuelve a intentarlo; si sigue igual, avísale a tu administrador.'

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
]

// supabase-js envuelve con este texto CUALQUIER fallo al llamar una Edge
// Function: sin conexión, pero también función no desplegada o respuesta
// bloqueada por CORS. No se puede distinguir desde el cliente mirando el
// mensaje, así que se decide por el estado real de la red.
const FIRMA_EDGE = 'failed to send a request to the edge function'

/** ¿El navegador se declara sin conexión? */
function sinConexion(): boolean {
  try {
    return navigator.onLine === false
  } catch {
    return false
  }
}

/** ¿Este error es una caída de red (y no una respuesta del servidor)? */
export function esErrorDeRed(e: unknown): boolean {
  const texto = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  if (!texto) return false
  if (texto.includes(FIRMA_EDGE)) return sinConexion()
  return FIRMAS_RED.some((f) => texto.includes(f))
}

/**
 * Texto a mostrar para un error cualquiera: el mensaje de red si lo es, y si
 * no, el mensaje original sin tocar.
 */
export function mensajeError(e: unknown): string {
  if (esErrorDeRed(e)) return MENSAJE_RED
  const texto = e instanceof Error ? e.message : String(e ?? '')
  // Fallo de una Edge Function con la red en pie: el problema está del otro
  // lado (no desplegada, CORS, caída), no en la conexión de quien mira.
  if (texto.toLowerCase().includes(FIRMA_EDGE)) return MENSAJE_SERVICIO
  return texto || 'Ocurrió un error inesperado.'
}
