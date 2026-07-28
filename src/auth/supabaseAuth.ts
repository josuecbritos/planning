import type { SupabaseClient } from '@supabase/supabase-js'
import type { Usuario } from '../types'
import type { AuthService, MotivoSalida } from './auth'
import { getClient } from '../data/client'

// Login real con Supabase Auth (email + password). El registro en `usuario`
// lo crea el Admin desde el Modulo de Usuarios; al iniciar sesion por primera
// vez, el trigger `vincular_usuario_auth` enlaza ambos registros por email.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const toUsuario = (r: Row): Usuario => ({
  id: r.id, nombre: r.nombre, iniciales: r.iniciales ?? '', email: r.email, rol: r.rol,
  activo: r.activo, authId: r.auth_id ?? undefined,
  // Necesario para gobernar la UI del usuario en sesion (p.ej. el "+" de
  // crear proyecto, que depende de permisos_proyecto.crearProyectos).
  permisosProyecto: r.permisos_proyecto ?? undefined,
})

export class SupabaseAuth implements AuthService {
  readonly modo = 'supabase' as const
  private db: SupabaseClient

  constructor() {
    this.db = getClient()
  }

  private async perfilDe(authId: string): Promise<Usuario | null> {
    // Vista con email/permisos (seguridad §3): para la propia fila los muestra
    // completos; la tabla base ya no permite SELECT directo desde el cliente.
    const { data, error } = await this.db.from('usuario_visible').select('*').eq('auth_id', authId).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toUsuario(data) : null
  }

  async getUsuarioActual(): Promise<Usuario | null> {
    const { data } = await this.db.auth.getSession()
    const session = data.session
    if (!session) return null
    const perfil = await this.perfilDe(session.user.id)
    return perfil && perfil.activo ? perfil : null
  }

  /**
   * #244: se pregunta por el ESTADO, no por el texto del error.
   *
   * - `getUser()` valida el token contra el servidor: si la sesión murió
   *   (contraseña cambiada en otro dispositivo, sesión revocada, refresco
   *   fallido), falla ahí mismo → 'expirada'.
   * - Si el token vive pero el perfil ya no está activo o desapareció de
   *   `usuario_visible` (eliminado), la cuenta fue dada de baja a media
   *   sesión → 'desactivada'. Es el caso en que reintentar el login no sirve.
   */
  async diagnosticar(): Promise<MotivoSalida | null> {
    const { data: ses } = await this.db.auth.getSession()
    if (!ses.session) return 'expirada'
    const { data, error } = await this.db.auth.getUser()
    if (error || !data.user) return 'expirada'
    try {
      const perfil = await this.perfilDe(data.user.id)
      if (!perfil || !perfil.activo) return 'desactivada'
    } catch {
      // La consulta del perfil falló por red o por un problema del servicio:
      // no hay evidencia de que la sesión esté mal, así que no se echa a nadie.
      return null
    }
    return null
  }

  alPerderSesion(cb: () => void): () => void {
    const { data } = this.db.auth.onAuthStateChange((evento) => {
      // SIGNED_OUT llega también cuando el refresco del token falla, que es
      // justo el caso que dejaba la pantalla muerta.
      if (evento === 'SIGNED_OUT') cb()
    })
    return () => data.subscription.unsubscribe()
  }

  async login(email: string, password?: string): Promise<Usuario> {
    if (!password) throw new Error('Ingresa tu contraseña')
    const { data, error } = await this.db.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const perfil = await this.perfilDe(data.user.id)
    if (!perfil) {
      await this.db.auth.signOut()
      throw new Error('Tu cuenta no está registrada en el sistema. Pide a un Admin que te cree como usuario.')
    }
    if (!perfil.activo) {
      await this.db.auth.signOut()
      throw new Error('Tu usuario está desactivado.')
    }
    return perfil
  }

  async logout(): Promise<void> {
    await this.db.auth.signOut()
  }

  async cambiarPassword(actual: string, nueva: string): Promise<void> {
    // Supabase no ofrece "verificar contraseña actual", así que se comprueba
    // reintentando el login con ella. Es la práctica habitual y no deja
    // ninguna sesión colgando: signInWithPassword renueva la que ya existe.
    const { data } = await this.db.auth.getSession()
    const email = data.session?.user.email
    if (!email) throw new Error('No hay sesión')
    const { error: errActual } = await this.db.auth.signInWithPassword({ email, password: actual })
    if (errActual) throw new Error('La contraseña actual no es correcta')
    const { error } = await this.db.auth.updateUser({ password: nueva })
    if (error) throw new Error(error.message)
  }
}
