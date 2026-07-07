import type { Usuario } from '../types'
import type { AuthService } from './auth'
import type { Repo } from '../data/repo'

// Login simulado para el modo Local: se "entra como" cualquier usuario activo
// del estado (sin password). La sesion se conserva en localStorage.

const SESSION_KEY = 'planificador.sesion.v1'

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
}
