import type { Usuario } from '../types'

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
