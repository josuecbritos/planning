import type { SupabaseClient } from '@supabase/supabase-js'
import type { Usuario } from '../types'
import type { AuthService } from './auth'
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
    // La RLS permite a cada usuario leer su propia fila.
    const { data, error } = await this.db.from('usuario').select('*').eq('auth_id', authId).maybeSingle()
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

  async login(email: string, password?: string): Promise<Usuario> {
    if (!password) throw new Error('Ingresa tu contraseña')
    const { data, error } = await this.db.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const perfil = await this.perfilDe(data.user.id)
    if (!perfil) {
      await this.db.auth.signOut()
      throw new Error('Tu cuenta no esta registrada en el sistema. Pide a un Admin que te cree como usuario.')
    }
    if (!perfil.activo) {
      await this.db.auth.signOut()
      throw new Error('Tu usuario esta desactivado.')
    }
    return perfil
  }

  async logout(): Promise<void> {
    await this.db.auth.signOut()
  }
}
