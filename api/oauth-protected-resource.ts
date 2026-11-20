// #350 — Metadatos del recurso protegido (RFC 9728): le dicen a Claude dónde
// está el servidor de autorización (Supabase Auth). Llegan acá
// `/.well-known/oauth-protected-resource` y `/.well-known/oauth-protected-resource/mcp`
// por reescrituras de `vercel.json`.
import { atenderMetadatos, leerConfig } from '../mcp/servidor.js'

export const GET = (req: Request) => atenderMetadatos(req, leerConfig())
