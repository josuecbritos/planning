// #350 — Puerta HTTP del MCP: token → identidad → servidor MCP → respuesta.
//
// IDENTIDAD. Cada petición trae el token OAuth que emitió Supabase Auth (su
// servidor OAuth 2.1) cuando el dueño autorizó el conector. Con ese token se
// arma un cliente de Supabase con la llave PÚBLICA (anon) —el mismo que la
// aplicación en el navegador—, así que la RLS decide qué se lee y qué se
// escribe exactamente como en la app. La llave de servicio no existe acá, y
// no se guarda ninguna contraseña: el MCP no tiene estado.
//
// QUIÉN PUEDE. Por ahora, solo administradores activos (decisión del pedido).
// La pantalla de autorización ya se lo dice a quien no lo es; esto es la
// cerradura de verdad.
//
// SIN ESTADO. Cada petición crea su propio servidor MCP y su transporte
// (Streamable HTTP sin sesiones, respuestas JSON). Es lo que pide una función
// de Vercel: nada sobrevive entre una invocación y la siguiente.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { SupabaseRepo } from '../src/data/supabaseRepo.js'
import { usuarioDesdeFila } from '../src/data/repo.js'
import type { Usuario } from '../src/types.js'
import { MENSAJE_SOLO_ADMIN, puedeUsarConector } from '../src/lib/conector.js'
import { INSTRUCCIONES, registrarHerramientas } from './herramientas.js'

export interface Config {
  supabaseUrl: string
  anonKey: string
}

/** `process.env` sin depender de los tipos de Node (el proyecto no los trae). */
function entornoDelProceso(): Record<string, string | undefined> {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
  return g.process?.env ?? {}
}

/**
 * Las mismas variables que usa la aplicación al compilar. En Vercel están
 * disponibles también para las funciones, en tiempo de ejecución.
 */
export function leerConfig(env: Record<string, string | undefined> = entornoDelProceso()): Config | null {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  return supabaseUrl && anonKey ? { supabaseUrl, anonKey } : null
}

/** Ruta pública del MCP. */
export const RUTA_MCP = '/mcp'
/** RFC 9728 §3.1: el documento del recurso `/mcp` vive en esta ruta. */
export const RUTA_METADATOS = '/.well-known/oauth-protected-resource/mcp'

/**
 * Direcciones públicas, armadas con el host por el que llegó la petición. Así
 * el MCP responde bien en el dominio del producto y en una vista previa de
 * Vercel sin configuración aparte.
 */
export function direcciones(req: Request) {
  const u = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? u.host
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '')
  const origen = `${proto}://${host}`
  return { recurso: `${origen}${RUTA_MCP}`, metadatos: `${origen}${RUTA_METADATOS}` }
}

/** Emisor de los tokens: el servidor OAuth de Supabase Auth del proyecto. */
export function emisor(cfg: Config): string {
  return `${cfg.supabaseUrl}/auth/v1`
}

/** Metadatos del recurso protegido (RFC 9728). Dicen dónde autorizarse. */
export function metadatosDelRecurso(req: Request, cfg: Config) {
  return {
    resource: direcciones(req).recurso,
    authorization_servers: [emisor(cfg)],
    bearer_methods_supported: ['header'],
    resource_name: 'Andotek Planning',
  }
}

function json(cuerpo: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

/** 401 con la indicación de dónde están los metadatos de autorización. */
export function noAutorizado(req: Request, descripcion?: string): Response {
  const params = [`resource_metadata="${direcciones(req).metadatos}"`]
  // Sin token no va `error` (RFC 6750 §3.1); con un token malo, invalid_token.
  if (descripcion) params.unshift(`error="invalid_token"`, `error_description="${descripcion}"`)
  return json(
    { error: descripcion ? 'invalid_token' : 'unauthorized', error_description: descripcion ?? 'Falta el token de acceso.' },
    401,
    { 'www-authenticate': `Bearer ${params.join(', ')}` },
  )
}

/** Rechazo con texto claro (cuenta sin ficha, desactivada o no administradora). */
function prohibido(mensaje: string): Response {
  // Forma JSON-RPC para que el cliente MCP muestre el mensaje tal cual.
  return json({ jsonrpc: '2.0', error: { code: -32001, message: mensaje }, id: null }, 403)
}

function tokenDe(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : null
}

/** Cliente de Supabase que actúa COMO la persona del token (llave anon). */
function clienteDe(cfg: Config, token: string): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

type Identidad =
  | { ok: true; db: SupabaseClient; usuario: Usuario; clientId: string; scopes: string[]; exp?: number }
  | { ok: false; respuesta: Response }

/**
 * Verifica el token y encuentra la ficha de la persona.
 *
 * El token lo valida Supabase (`getClaims`: firma con las llaves del
 * proyecto, o el servidor de Auth si la firma es simétrica). Además se exige
 * `client_id`: solo lo traen los tokens emitidos por el servidor OAuth, así
 * que un token de una sesión normal de la aplicación no abre el MCP.
 *
 * Supabase no permite fijar la audiencia del token por recurso (todos dicen
 * `aud: "authenticated"`); el desvío respecto de la especificación MCP queda
 * documentado en `docs/SEGURIDAD.md`.
 */
export async function identificar(req: Request, cfg: Config): Promise<Identidad> {
  const token = tokenDe(req)
  if (!token) return { ok: false, respuesta: noAutorizado(req) }
  const db = clienteDe(cfg, token)
  const { data, error } = await db.auth.getClaims(token)
  const claims = data?.claims
  if (error || !claims?.sub) {
    return { ok: false, respuesta: noAutorizado(req, 'El token no es válido o ya venció.') }
  }
  const clientId = typeof claims.client_id === 'string' ? claims.client_id : ''
  if (!clientId) {
    return { ok: false, respuesta: noAutorizado(req, 'Este servicio solo acepta tokens emitidos para un conector.') }
  }
  // Seguridad §3: la vista, nunca la tabla `usuario`.
  const fila = await db.from('usuario_visible').select('*').eq('auth_id', claims.sub).maybeSingle()
  if (fila.error) {
    return { ok: false, respuesta: json({ error: 'No pude leer tu ficha de usuario.' }, 502) }
  }
  if (!fila.data) {
    return { ok: false, respuesta: prohibido('Tu cuenta no tiene una ficha activa en Andotek Planning.') }
  }
  const usuario = usuarioDesdeFila(fila.data)
  if (!usuario.activo || usuario.eliminado) {
    return { ok: false, respuesta: prohibido('Tu cuenta de Andotek Planning está desactivada.') }
  }
  // La misma regla que la pantalla de autorización (`src/lib/conector.ts`).
  if (!puedeUsarConector(usuario)) return { ok: false, respuesta: prohibido(MENSAJE_SOLO_ADMIN) }
  const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : []
  return { ok: true, db, usuario, clientId, scopes, exp: typeof claims.exp === 'number' ? claims.exp : undefined }
}

/** Atiende una petición al MCP de punta a punta. */
export async function atenderMcp(req: Request, cfg: Config | null): Promise<Response> {
  if (!cfg) return json({ error: 'El MCP no está configurado (faltan las variables de Supabase).' }, 500)
  const id = await identificar(req, cfg)
  if (!id.ok) return id.respuesta
  // Sin sesiones no hay stream que abrir (GET) ni sesión que cerrar (DELETE):
  // la especificación permite 405. Sin esto, un GET dejaría la función
  // esperando hasta su tiempo máximo.
  if (req.method !== 'POST') {
    return json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido.' }, id: null }, 405, { allow: 'POST' })
  }

  const server = new McpServer({ name: 'andotek-planning', version: '1.0.0' }, { instructions: INSTRUCCIONES })
  registrarHerramientas(server, { repo: new SupabaseRepo(id.db), usuario: id.usuario })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(req, {
    authInfo: {
      token: tokenDe(req)!,
      clientId: id.clientId,
      scopes: id.scopes,
      expiresAt: id.exp,
    },
  })
}

/** Atiende la petición de metadatos del recurso protegido. */
export function atenderMetadatos(req: Request, cfg: Config | null): Response {
  if (!cfg) return json({ error: 'El MCP no está configurado (faltan las variables de Supabase).' }, 500)
  return json(metadatosDelRecurso(req, cfg), 200, { 'cache-control': 'public, max-age=300' })
}
