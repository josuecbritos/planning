// #350 — El MCP carga en Node tal como lo corre Vercel.
//
// Vercel compila cada archivo .ts de `api/` y lo que importa POR SEPARADO
// (sin empaquetar) y lo ejecuta con Node, que no adivina extensiones: una
// importación relativa sin `.js` en ese recorrido compila bien, pasa el build
// de la app y revienta recién en producción (ERR_MODULE_NOT_FOUND). Esta
// prueba reproduce eso: transpila archivo por archivo a una carpeta temporal,
// importa las funciones y las llama sin red.
//
// Uso: node docs/prueba-350-mcp-carga-en-node.mjs   (no necesita la app corriendo)

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Dentro del repo, para que los paquetes se resuelvan desde node_modules.
const SALIDA = join(RAIZ, '.prueba-350-node')
const ENTRADAS = ['api/mcp.ts', 'api/oauth-protected-resource.ts']

let fallas = 0
const ok = (m) => console.log(`OK    ${m}`)
const falla = (m) => {
  fallas++
  console.log(`FALLA ${m}`)
}

/**
 * Especificadores que SOBREVIVEN a la compilación. Las importaciones solo de
 * tipos (`import type …`, o `import { type A, type B }`) desaparecen y no
 * cuentan. Se lee el árbol de TypeScript: con expresiones regulares, un
 * `import type` de una línea se confunde con la importación siguiente.
 */
function importacionesEnEjecucion(archivo) {
  const sf = ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.ES2022, true)
  const out = []
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const c = st.importClause
      if (c?.isTypeOnly) continue
      const nb = c?.namedBindings
      const soloTiposNombrados =
        c && !c.name && nb && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly)
      if (soloTiposNombrados) continue
      out.push(st.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
      out.push(st.moduleSpecifier.text)
    }
  }
  return out
}

// Recorre las importaciones relativas desde las entradas, como Vercel.
function recorrido() {
  const vistos = new Set()
  const sinExtension = []
  const pila = ENTRADAS.map((e) => join(RAIZ, e))
  while (pila.length) {
    const archivo = pila.pop()
    if (vistos.has(archivo)) continue
    vistos.add(archivo)
    for (const esp of importacionesEnEjecucion(archivo)) {
      if (!esp.startsWith('.')) continue
      if (!esp.endsWith('.js')) {
        sinExtension.push(`${relative(RAIZ, archivo)} → ${esp}`)
        continue
      }
      const destino = resolve(dirname(archivo), esp.replace(/\.js$/, '.ts'))
      const destinoTsx = destino.replace(/\.ts$/, '.tsx')
      if (existsSync(destino)) pila.push(destino)
      else if (existsSync(destinoTsx)) pila.push(destinoTsx)
      else sinExtension.push(`${relative(RAIZ, archivo)} → ${esp} (no existe)`)
    }
  }
  return { archivos: [...vistos], sinExtension }
}

const { archivos, sinExtension } = recorrido()
if (sinExtension.length) falla(`importaciones relativas sin .js en el recorrido del MCP: ${sinExtension.join('; ')}`)
else ok(`las ${archivos.length} piezas del recorrido importan con .js`)

rmSync(SALIDA, { recursive: true, force: true })
for (const archivo of archivos) {
  const js = ts.transpileModule(readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: archivo,
  }).outputText
  const destino = join(SALIDA, relative(RAIZ, archivo)).replace(/\.tsx?$/, '.js')
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, js)
}
writeFileSync(join(SALIDA, 'package.json'), '{"type":"module"}')

process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'llave-publica-de-prueba'

try {
  const mcp = await import(pathToFileURL(join(SALIDA, 'api/mcp.js')).href)
  const meta = await import(pathToFileURL(join(SALIDA, 'api/oauth-protected-resource.js')).href)
  ok('las dos funciones se importan en Node sin error')

  for (const m of ['GET', 'POST', 'DELETE']) {
    if (typeof mcp[m] === 'function') ok(`api/mcp exporta ${m}`)
    else falla(`api/mcp no exporta ${m}`)
  }

  // Sin token: 401 que dice dónde están los metadatos.
  const r = await mcp.POST(
    new Request('https://planning.andotek.cl/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-host': 'planning.andotek.cl', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }),
  )
  const www = r.headers.get('www-authenticate') ?? ''
  if (r.status === 401) ok('POST /mcp sin token responde 401')
  else falla(`POST /mcp sin token respondió ${r.status}`)
  if (www.includes('resource_metadata="https://planning.andotek.cl/.well-known/oauth-protected-resource/mcp"'))
    ok('el 401 indica dónde están los metadatos de autorización')
  else falla(`WWW-Authenticate inesperado: ${www}`)

  // Token con forma incorrecta: 401 invalid_token (getClaims lo rechaza sin red).
  const r2 = await mcp.POST(
    new Request('https://planning.andotek.cl/api/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer esto-no-es-un-jwt', 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  if (r2.status === 401 && (r2.headers.get('www-authenticate') ?? '').includes('invalid_token'))
    ok('un token inválido responde 401 invalid_token')
  else falla(`token inválido respondió ${r2.status} ${r2.headers.get('www-authenticate')}`)

  // GET sin token: también 401 (la autenticación va primero).
  const r4 = await mcp.GET(new Request('https://planning.andotek.cl/api/mcp', { headers: { accept: 'text/event-stream' } }))
  if (r4.status === 401) ok('GET sin token responde 401')
  else falla(`GET sin token respondió ${r4.status}`)

  // Metadatos del recurso protegido.
  const r3 = await meta.GET(
    new Request('https://planning.andotek.cl/api/oauth-protected-resource', {
      headers: { 'x-forwarded-host': 'planning.andotek.cl', 'x-forwarded-proto': 'https' },
    }),
  )
  const doc = await r3.json()
  if (r3.status === 200 && doc.resource === 'https://planning.andotek.cl/mcp') ok('los metadatos nombran el recurso /mcp exacto')
  else falla(`metadatos: ${r3.status} ${JSON.stringify(doc)}`)
  if (JSON.stringify(doc.authorization_servers) === JSON.stringify(['https://ejemplo.supabase.co/auth/v1']))
    ok('el servidor de autorización es Supabase Auth del proyecto')
  else falla(`authorization_servers: ${JSON.stringify(doc.authorization_servers)}`)

  // ---- Con token: Supabase simulado ---------------------------------------
  // Se intercepta `fetch`: el servidor de Auth confirma el token y la API de
  // datos devuelve la ficha de la persona. Así se recorre el camino completo
  // —token → identidad → servidor MCP → herramientas— sin red, y se comprueba
  // que las consultas a la base viajan con EL TOKEN DE LA PERSONA y la llave
  // anon (de eso depende que la RLS aplique).
  const fichas = {
    'auth-admin': { id: 'u-1', nombre: 'Ada Admin', iniciales: 'AA', rol: 'admin', activo: true, auth_id: 'auth-admin' },
    'auth-consultor': { id: 'u-2', nombre: 'Coni Consultora', iniciales: 'CC', rol: 'consultor', activo: true, auth_id: 'auth-consultor' },
    'auth-inactivo': { id: 'u-3', nombre: 'Ina Activa', iniciales: 'IA', rol: 'admin', activo: false, auth_id: 'auth-inactivo' },
  }
  const llamadas = []
  const fetchReal = globalThis.fetch
  globalThis.fetch = async (entrada, init = {}) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url
    const h = new Headers(init.headers ?? (typeof entrada === 'object' ? entrada.headers : undefined))
    llamadas.push({ url, auth: h.get('authorization'), apikey: h.get('apikey') })
    const token = (h.get('authorization') ?? '').replace(/^Bearer /, '')
    const sub = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}').sub
    const resp = (cuerpo, status = 200) =>
      new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
    if (url.includes('/auth/v1/user')) return resp({ id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@y.cl' })
    if (url.includes('/rest/v1/usuario_visible') && url.includes('auth_id=eq.')) {
      const f = fichas[sub]
      const objeto = (h.get('accept') ?? '').includes('vnd.pgrst.object')
      return objeto ? (f ? resp(f) : resp({ code: 'PGRST116', message: '0 rows' }, 406)) : resp(f ? [f] : [])
    }
    if (url.includes('/rest/v1/')) return resp([])
    return resp({ error: 'no simulado' }, 404)
  }
  const jwt = (claims) =>
    ['{"alg":"HS256","typ":"JWT"}', JSON.stringify({ aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })]
      .map((x) => Buffer.from(x).toString('base64url'))
      .join('.') + '.' + Buffer.from('firma de prueba').toString('base64url')
  const rpc = (token, cuerpo, metodo = 'POST') =>
    mcp[metodo](
      new Request('https://planning.andotek.cl/api/mcp', {
        method: metodo,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
        },
        body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined,
      }),
    )
  try {
    const tAdmin = jwt({ sub: 'auth-admin', client_id: 'cliente-claude', scope: '' })
    const ini = await rpc(tAdmin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '0' } },
    })
    const iniJson = ini.status === 200 ? await ini.json() : null
    if (iniJson?.result?.serverInfo?.name === 'andotek-planning') ok('un administrador con token del conector inicia la sesión MCP')
    else falla(`initialize respondió ${ini.status} ${JSON.stringify(iniJson)}`)
    if (/AAAA-MM-DD/.test(iniJson?.result?.instructions ?? '')) ok('el MCP entrega sus instrucciones al conectarse')
    else falla('sin instrucciones en initialize')

    const lista = await rpc(tAdmin, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const listaJson = lista.status === 200 ? await lista.json() : null
    if (listaJson?.result?.tools?.length === 12) ok('lista las 12 herramientas')
    else falla(`tools/list respondió ${lista.status} ${JSON.stringify(listaJson)?.slice(0, 200)}`)

    llamadas.length = 0
    const uso = await rpc(tAdmin, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'listar_proyectos', arguments: {} } })
    const usoJson = uso.status === 200 ? await uso.json() : null
    const texto = usoJson?.result?.content?.[0]?.text ?? ''
    if (/"usuario": "Ada Admin"/.test(texto)) ok('una herramienta corre con la identidad del token')
    else falla(`tools/call respondió ${uso.status} ${JSON.stringify(usoJson)?.slice(0, 300)}`)
    const aDatos = llamadas.filter((l) => l.url.includes('/rest/v1/'))
    if (aDatos.length > 0 && aDatos.every((l) => l.auth === `Bearer ${tAdmin}` && l.apikey === 'llave-publica-de-prueba'))
      ok(`las ${aDatos.length} consultas a la base llevan el token de la persona y la llave anon`)
    else falla(`consultas con otra identidad: ${JSON.stringify(aDatos.slice(0, 3))}`)

    const get = await rpc(tAdmin, null, 'GET')
    if (get.status === 405) ok('GET con token responde 405 (sin sesiones no hay stream)')
    else falla(`GET con token respondió ${get.status}`)

    const sinCliente = await rpc(jwt({ sub: 'auth-admin' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    if (sinCliente.status === 401 && (sinCliente.headers.get('www-authenticate') ?? '').includes('invalid_token'))
      ok('un token de sesión normal (sin client_id) no abre el MCP')
    else falla(`token sin client_id respondió ${sinCliente.status}`)

    const consultor = await rpc(jwt({ sub: 'auth-consultor', client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const cj = await consultor.json().catch(() => null)
    if (consultor.status === 403 && /solo para administradores/.test(cj?.error?.message ?? ''))
      ok('quien no es administrador recibe 403 con el motivo')
    else falla(`consultor respondió ${consultor.status} ${JSON.stringify(cj)?.slice(0, 200)}`)

    const inactivo = await rpc(jwt({ sub: 'auth-inactivo', client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    if (inactivo.status === 403) ok('una cuenta desactivada recibe 403')
    else falla(`cuenta desactivada respondió ${inactivo.status}`)

    const sinFicha = await rpc(jwt({ sub: 'auth-nadie', client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    if (sinFicha.status === 403) ok('una cuenta sin ficha recibe 403')
    else falla(`cuenta sin ficha respondió ${sinFicha.status}`)

    if (!llamadas.some((l) => /service_role/i.test(`${l.auth} ${l.apikey}`))) ok('ninguna llamada usa la llave de servicio')
    else falla('alguna llamada usó service_role')
  } finally {
    globalThis.fetch = fetchReal
  }
} catch (e) {
  falla(`no carga en Node: ${e?.code ?? ''} ${e?.message ?? e}`)
} finally {
  rmSync(SALIDA, { recursive: true, force: true })
}

console.log(fallas ? `FIN: ${fallas} falla(s)` : 'FIN: todo OK')
process.exit(fallas ? 1 : 0)
