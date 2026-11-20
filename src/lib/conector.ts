import type { Usuario } from '../types'

// #350 — Reglas del conector de Claude que comparten la pantalla de
// autorización (la app) y el MCP (función de Vercel). Un solo lugar para que
// no puedan decir cosas distintas.

/** Ruta de la pantalla de autorización. Debe coincidir con "Authorization
 *  Path" en Supabase → Authentication → OAuth Server (ver DEPLOY.md). */
export const RUTA_AUTORIZACION = '/oauth/consent'

/** Por ahora, solo administradores activos (decisión del pedido #350). */
export function puedeUsarConector(u: Pick<Usuario, 'rol' | 'activo' | 'eliminado'>): boolean {
  return u.rol === 'admin' && u.activo && !u.eliminado
}

export const MENSAJE_SOLO_ADMIN =
  'Andotek Planning desde Claude está disponible, por ahora, solo para administradores. Tu cuenta no es de administrador.'
