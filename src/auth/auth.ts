import type { Usuario } from '../types'

// Servicio de autenticacion. En Supabase es login real (email + password).
// En modo Local es un selector de usuario para demostrar los roles sin backend.

export interface AuthService {
  readonly modo: 'memoria' | 'supabase'
  /** Usuario de la sesion vigente, o null si no hay sesion. */
  getUsuarioActual(): Promise<Usuario | null>
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
