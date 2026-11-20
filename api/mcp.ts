// #350 — Función de Vercel del MCP. `/mcp` llega acá por una reescritura de
// `vercel.json`. Toda la lógica vive en `mcp/servidor.ts`.
//
// `.js` en la importación a propósito: Vercel compila cada archivo por
// separado y Node no adivina extensiones (`docs/prueba-350-mcp-carga-en-node.mjs`).
import { atenderMcp, leerConfig } from '../mcp/servidor.js'

const atender = (req: Request) => atenderMcp(req, leerConfig())

export const GET = atender
export const POST = atender
export const DELETE = atender
