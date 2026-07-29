import type { Usuario } from '../types'
import { MENSAJE_RED } from '../lib/errores'

// Servicio de autenticacion. En Supabase es login real (email + password).
// En modo Local es un selector de usuario para demostrar los roles sin backend.

/**
 * #244: por qué se cayó la sesión. Los dos casos se distinguen porque piden
 * acciones distintas: con la cuenta desactivada, reintentar el login no sirve.
 */
export type MotivoSalida = 'expirada' | 'desactivada'

/** Textos definidos en el pedido #244. No cambiar sin pedirlo. */
export const MENSAJE_SALIDA: Record<MotivoSalida, string> = {
  desactivada: 'Tu cuenta fue desactivada. Para volver a activarla ponte en contacto con tu administrador.',
  expirada: 'Tu sesión ha expirado. Vuelve a ingresar.',
}

/**
 * #252: los cuatro mensajes del login, con su texto exacto. Al servicio de
 * autenticación se le pregunta por el ESTADO (el código de la respuesta), nunca
 * por el texto de su error: viene en inglés y cambia entre versiones. Lo que no
 * cae en ninguno de los cuatro sale como `generico`; el texto original NUNCA
 * llega a la pantalla.
 *
 * `credenciales` dice "correo o contraseña" a propósito, sin precisar cuál
 * falló: si dijera que el correo no existe, cualquiera podría averiguar quién
 * tiene cuenta probando direcciones. No "mejorar".
 *
 * `desactivada` es EL MISMO texto que el de #244 —misma situación, y la persona
 * puede toparse con los dos—, por eso se toma de MENSAJE_SALIDA en vez de
 * repetirlo. `conexion` viene de `errores.ts` por la misma razón.
 *
 * `intentos` no menciona número ni plazo: el límite lo fija el servicio de
 * autenticación, no es exacto, y prometerlo sería mentir.
 */
export const MENSAJE_LOGIN = {
  credenciales: 'Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.',
  desactivada: MENSAJE_SALIDA.desactivada,
  intentos: 'Demasiados intentos fallidos. Vuelve a intentarlo más tarde.',
  conexion: MENSAJE_RED,
  generico: 'No pudimos iniciar sesión. Vuelve a intentarlo; si sigue igual, avísale a tu administrador.',
} as const

export interface AuthService {
  readonly modo: 'memoria' | 'supabase'
  /** Usuario de la sesion vigente, o null si no hay sesion. */
  getUsuarioActual(): Promise<Usuario | null>
  /**
   * #244: ¿la sesión sigue sirviendo? Se consulta al estado real —no al texto
   * del error, que viene en inglés y cambia entre versiones— cuando una acción
   * falla o cuando Auth avisa de un cambio. Devuelve null si todo está bien.
   */
  diagnosticar(): Promise<MotivoSalida | null>
  /**
   * #244: avisa cuando el servicio de autenticación reporta que la sesión dejó
   * de existir (cambio de contraseña en otro dispositivo, cierre en otra
   * pestaña, refresco fallido). Devuelve la función para desuscribirse.
   */
  alPerderSesion(cb: () => void): () => void
  /** En Supabase requiere password; en memoria basta el email. */
  login(email: string, password?: string): Promise<Usuario>
  logout(): Promise<void>
  /**
   * #207: cambia la contraseña de la sesión vigente. Pide la ACTUAL primero:
   * protege de que alguien use una sesión ajena que quedó abierta. Lanza si la
   * actual no es correcta, y entonces no se cambia nada.
   */
  cambiarPassword(actual: string, nueva: string): Promise<void>
}
