import type { Usuario } from '../types'
import type { AuthService } from './auth'
import type { Repo } from '../data/repo'

// Login simulado para el modo Local: se "entra como" cualquier usuario activo
// del estado (sin password). La sesion se conserva en localStorage.

const SESSION_KEY = 'planificador.sesion.v1'
// #207: el modo Local no tiene contraseñas (se entra eligiendo usuario), así
// que para poder ejercitar el flujo se guarda una por correo. La primera vez
// no hay nada guardado y se acepta cualquier "actual"; a partir de ahí se
// comprueba de verdad. Es una simulación local, nunca una credencial: en
// Supabase la contraseña vive en Auth y esto no se usa.
const PASSWORDS_KEY = 'planificador.passwords.v1'

function leerPasswords(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PASSWORDS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export class MemoryAuth implements AuthService {
  readonly modo = 'memoria' as const

  constructor(private repo: Repo) {}

  async getUsuarioActual(): Promise<Usuario | null> {
    let email: string | null = null
    try {
      email = localStorage.getItem(SESSION_KEY)
    } catch {
      /* sin storage */
    }
    if (!email) return null
    const state = await this.repo.loadState()
    return state.usuarios.find((u) => u.email === email && u.activo) ?? null
  }

  async login(email: string): Promise<Usuario> {
    const state = await this.repo.loadState()
    const u = state.usuarios.find(
      (x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.activo,
    )
    if (!u) throw new Error('Usuario no encontrado o inactivo')
    try {
      localStorage.setItem(SESSION_KEY, u.email)
    } catch {
      /* sin storage */
    }
    return u
  }

  async logout(): Promise<void> {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* sin storage */
    }
  }

  async cambiarPassword(actual: string, nueva: string): Promise<void> {
    const u = await this.getUsuarioActual()
    if (!u) throw new Error('No hay sesión')
    const guardadas = leerPasswords()
    const previa = guardadas[u.email]
    if (previa && previa !== actual) throw new Error('La contraseña actual no es correcta')
    guardadas[u.email] = nueva
    try {
      localStorage.setItem(PASSWORDS_KEY, JSON.stringify(guardadas))
    } catch {
      /* sin storage */
    }
  }
}
