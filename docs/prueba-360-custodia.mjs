// #360 — La compuerta deja las cuentas reales como las encontró.
//
// La compuerta `scripts/validar-rls.mjs` corre contra PRODUCCIÓN y toca tres
// campos de tres cuentas que ya existen —organización, permisos de proyecto y
// resumen diario de Consultor A, Consultor B y Cliente—. El 12-sep-2026 el
// caso de #339 les borró la organización a A y B: cuando cortaba temprano
// ("A ya ve a B"), devolvía lo guardado… que todavía no había leído.
//
// Esta prueba corre los casos REALES de la compuerta contra una Supabase de
// mentira montada en memoria (se intercepta `fetch`: Auth para el login y
// PostgREST para las tablas), con las tres cuentas cargadas con valores que
// importan. No necesita red ni credenciales, y no toca producción.
//
// Lo que se comprueba —son los criterios 1 a 4 del pedido—:
//   A. Corrida normal, DOS VECES SEGUIDAS: las tres cuentas quedan exactamente
//      como estaban, en los tres campos, y la custodia no reporta nada.
//   B. Cuando el caso de #339 CORTA TEMPRANO (A y B ya se ven): no borra nada.
//   C. Cuando un caso NO restituye, o REVIENTA a medias, la custodia lo
//      devuelve y lo informa como FALLA nombrando caso, campo y cuenta.
//   D. El motivo de un #339 no concluyente nombra la causa MEDIDA —organización
//      compartida, proyecto compartido— o dice que no la midió. Nunca afirma
//      "(comparten proyecto)" de memoria.
//   E. Control negativo: la misma batería con el código ANTERIOR de los casos
//      (#339 leyendo tarde, #353 sin devolver un `null`) borra los datos, y la
//      custodia lo atrapa.
//
// Cómo correrla:  node docs/prueba-360-custodia.mjs
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = join(RAIZ, 'scripts/validar-rls.mjs')

let nOk = 0
let nFalla = 0
const chk = (bien, m, extra = '') => {
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${m}${extra && !bien ? ' — ' + extra : ''}`)
  if (bien) nOk++
  else {
    nFalla++
    process.exitCode = 1
  }
}

// ---------------------------------------------------------------------------
// La Supabase de mentira
// ---------------------------------------------------------------------------
const URL_FALSA = 'https://custodia.supabase.co'
process.env.SUPABASE_URL = URL_FALSA
process.env.SUPABASE_ANON_KEY = 'llave-anon-de-prueba'
Object.assign(process.env, {
  RLS_ADMIN_EMAIL: 'admin@prueba.cl', RLS_ADMIN_PASS: 'x',
  RLS_CONSULTOR_A_EMAIL: 'consultor.a@prueba.cl', RLS_CONSULTOR_A_PASS: 'x',
  RLS_CONSULTOR_B_EMAIL: 'Consultor.B@Prueba.cl', RLS_CONSULTOR_B_PASS: 'x', // mayúsculas a propósito
  RLS_CLIENTE_EMAIL: 'cliente@prueba.cl', RLS_CLIENTE_PASS: 'x',
})

const ORIGINAL = {
  'u-admin': { organizacion: null, permisos_proyecto: null, resumen_diario: false },
  'u-a': { organizacion: 'Andotek', permisos_proyecto: null, resumen_diario: true },
  'u-b': { organizacion: 'Consultora Sur', permisos_proyecto: { crearProyectos: true, invitarClientes: false }, resumen_diario: false },
  'u-c': { organizacion: null, permisos_proyecto: null, resumen_diario: true },
}
let db
/** Visibilidad de la vista para un no admin: él mismo, misma organización entre consultores, y pares forzados. */
let paresVisibles
function sembrar({ orgB, accesoCompartido = false, verseSinCausa = false } = {}) {
  const fila = (id, nombre, email, rol, auth) => ({ id, nombre, iniciales: nombre.slice(0, 2).toUpperCase(), email, rol, activo: true, auth_id: auth, ...structuredClone(ORIGINAL[id]) })
  db = {
    usuario: [
      fila('u-admin', 'Admin', 'admin@prueba.cl', 'admin', 'auth-admin'),
      fila('u-a', 'Consultor A', 'consultor.a@prueba.cl', 'consultor', 'auth-a'),
      fila('u-b', 'Consultor B', 'consultor.b@prueba.cl', 'consultor', 'auth-b'),
      fila('u-c', 'Cliente', 'cliente@prueba.cl', 'cliente', 'auth-c'),
    ],
    proyecto: [{ id: 'p-real', nombre: 'Proyecto Real', creado_por: 'u-admin', estado: 'activo' }],
    acceso_proyecto: accesoCompartido
      ? [{ usuario_id: 'u-a', proyecto_id: 'p-real' }, { usuario_id: 'u-b', proyecto_id: 'p-real' }]
      : [],
  }
  if (orgB !== undefined) db.usuario.find((u) => u.id === 'u-b').organizacion = orgB
  paresVisibles = new Set()
  if (accesoCompartido || verseSinCausa) paresVisibles.add('u-a|u-b').add('u-b|u-a')
}
const camposDe = (id) => {
  const u = db.usuario.find((x) => x.id === id)
  return { organizacion: u.organizacion, permisos_proyecto: u.permisos_proyecto, resumen_diario: u.resumen_diario }
}
const can = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x))

const jwt = (sub) =>
  ['{"alg":"HS256","typ":"JWT"}', JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })]
    .map((x) => Buffer.from(x).toString('base64url'))
    .join('.') + '.' + Buffer.from('firma').toString('base64url')
const subDe = (h) => {
  const t = (h.get('authorization') ?? '').replace(/^Bearer /, '')
  try {
    return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub
  } catch {
    return null
  }
}

function filtrar(filas, params) {
  let out = filas
  for (const [k, v] of params) {
    if (['select', 'limit', 'order', 'columns', 'offset'].includes(k)) continue
    const [op, ...resto] = v.split('.')
    const val = resto.join('.')
    if (op === 'eq') out = out.filter((r) => String(r[k]) === val)
    else if (op === 'neq') out = out.filter((r) => String(r[k]) !== val)
    else if (op === 'in') {
      const lista = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''))
      out = out.filter((r) => lista.includes(String(r[k])))
    } else if (op === 'is' && val === 'null') out = out.filter((r) => r[k] == null)
    else if (op === 'not' && val === 'is.null') out = out.filter((r) => r[k] != null)
    else if (op === 'like') {
      const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$')
      out = out.filter((r) => re.test(String(r[k] ?? '')))
    }
  }
  const lim = params.get('limit')
  return lim ? out.slice(0, Number(lim)) : out
}

function vistaPara(sub) {
  const yo = db.usuario.find((u) => u.auth_id === sub)
  if (!yo) return []
  if (yo.rol === 'admin') return db.usuario
  return db.usuario.filter(
    (u) =>
      u.id === yo.id ||
      paresVisibles.has(`${yo.id}|${u.id}`) ||
      (yo.rol === 'consultor' && u.rol === 'consultor' && yo.organizacion && yo.organizacion === u.organizacion),
  )
}

let idSeq = 0
globalThis.fetch = async (entrada, init = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url)
  const h = new Headers(init.headers ?? (typeof entrada === 'object' ? entrada.headers : undefined))
  const metodo = (init.method ?? (typeof entrada === 'object' ? entrada.method : 'GET') ?? 'GET').toUpperCase()
  const cuerpo = init.body ? JSON.parse(init.body) : null
  const json = (b, status = 200) => new Response(b === null ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  if (url.pathname === '/auth/v1/token') {
    const u = db.usuario.find((x) => x.email.toLowerCase() === String(cuerpo.email).toLowerCase())
    if (!u) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400)
    return json({ access_token: jwt(u.auth_id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: u.auth_id, email: u.email, aud: 'authenticated' } })
  }
  if (url.pathname === '/auth/v1/user') {
    const sub = subDe(h)
    return sub ? json({ id: sub, aud: 'authenticated', email: 'x' }) : json({ msg: 'no' }, 401)
  }
  if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
  const m = /^\/rest\/v1\/(.+)$/.exec(url.pathname)
  if (!m) return json({ message: 'no simulado' }, 404)
  const tabla = m[1]
  if (tabla.startsWith('rpc/')) return json({ code: 'PGRST202', message: 'función no simulada' }, 404)
  const sub = subDe(h)
  const objeto = (h.get('accept') ?? '').includes('vnd.pgrst.object')
  const responder = (filas, status = 200) => {
    if (!objeto) return json(filas, status)
    if (filas.length !== 1) return json({ code: 'PGRST116', message: `${filas.length} filas` }, 406)
    return json(filas[0], status)
  }
  const base = tabla === 'usuario_visible' ? vistaPara(sub) : db[tabla]
  if (!base) return metodo === 'GET' ? responder([]) : json({ code: '42P01', message: `tabla ${tabla} no simulada` }, 404)
  if (metodo === 'GET') return responder(filtrar(base, url.searchParams).map((r) => ({ ...r })))
  if (metodo === 'POST') {
    const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((r) => ({ id: `n-${++idSeq}`, creado_por: db.usuario.find((u) => u.auth_id === sub)?.id, ...r }))
    db[tabla].push(...nuevas)
    return responder(nuevas, 201)
  }
  if (metodo === 'PATCH') {
    const filas = filtrar(db[tabla], url.searchParams)
    for (const r of filas) Object.assign(r, structuredClone(cuerpo))
    return responder(filas.map((r) => ({ ...r })))
  }
  if (metodo === 'DELETE') {
    const filas = filtrar(db[tabla], url.searchParams)
    db[tabla] = db[tabla].filter((r) => !filas.includes(r))
    return responder(filas)
  }
  return json({ message: 'método no simulado' }, 405)
}

// ---------------------------------------------------------------------------
// Cargar la compuerta (una instancia fresca por bloque: `resultados` es del módulo)
// ---------------------------------------------------------------------------
let version = 0
const silenciar = async (fn) => {
  const log = console.log
  const lineas = []
  console.log = (...a) => lineas.push(a.join(' '))
  try {
    return await fn()
  } finally {
    console.log = log
  }
}
async function cargar(ruta = GATE) {
  return import(`${pathToFileURL(ruta).href}?v=${++version}`)
}
async function correrCasos(G, { conCustodia = true } = {}) {
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL_FALSA, 'llave-anon-de-prueba', { auth: { persistSession: false } })
  await admin.auth.signInWithPassword({ email: 'admin@prueba.cl', password: 'x' })
  const custodia = conCustodia ? await G.abrirCustodia(admin) : null
  await silenciar(async () => {
    for (const [nombre, fn] of [
      ['el caso de #339 (organización)', G.probarOrganizacion],
      ['el caso de #353 (agregar colega)', G.probarAgregarColega],
      ['el caso de #272 (resumen diario)', G.probarResumenDiario],
    ]) {
      if (custodia) await G.conCustodia(admin, custodia, nombre, () => fn(admin))
      else await fn(admin).catch(() => {})
    }
  })
  return { admin, custodia, resultados: G.resultados }
}
const intactas = () => ['u-a', 'u-b', 'u-c'].every((id) => can(camposDe(id)) === can(ORIGINAL[id]))
const diferencias = () =>
  ['u-a', 'u-b', 'u-c']
    .flatMap((id) => Object.keys(ORIGINAL[id]).filter((c) => can(camposDe(id)[c]) !== can(ORIGINAL[id][c])).map((c) => `${id}.${c}=${can(camposDe(id)[c])}`))
    .join(', ')
const fallasCustodia = (rs) => rs.filter((r) => r.rol === 'custodia' && !r.ok)

// ---------------------------------------------------------------------------
console.log('— A. Corrida normal, dos veces seguidas')
sembrar()
for (const vuelta of [1, 2]) {
  const G = await cargar()
  const { custodia, resultados } = await correrCasos(G)
  chk(custodia.cuentas.length === 3 && custodia.campos.length === 3, `vuelta ${vuelta}: la custodia fotografía 3 cuentas × 3 campos (también con el correo en otras mayúsculas)`, JSON.stringify(custodia.cuentas.map((c) => c.rotulo)))
  chk(intactas(), `vuelta ${vuelta}: las tres cuentas quedan exactamente como estaban`, diferencias())
  chk(fallasCustodia(resultados).length === 0, `vuelta ${vuelta}: la custodia no tuvo nada que devolver`, fallasCustodia(resultados).map((r) => r.prueba).join('; '))
  const corrio339 = resultados.some((r) => r.rol === 'organización' && r.ok && /misma organización se ven/.test(r.prueba))
  chk(corrio339, `vuelta ${vuelta}: el caso de #339 llegó a hacer su prueba (no cortó)`)
}

console.log('\n— B. El caso de #339 corta temprano: no borra nada')
sembrar({ orgB: 'Andotek' }) // A y B comparten organización: ya se ven
ORIGINAL['u-b'].organizacion = 'Andotek'
{
  const G = await cargar()
  const { resultados } = await correrCasos(G)
  const inconcl = resultados.find((r) => r.noConcluyente && r.rol === 'organización')
  chk(!!inconcl, 'el caso se declara NO CONCLUYENTE')
  chk(intactas(), 'y la organización de A y B sigue ahí (antes les escribía vacío)', diferencias())
  chk(fallasCustodia(resultados).length === 0, 'el propio caso devolvió todo: la custodia no tuvo que intervenir')
  chk(/comparten la organización «Andotek»/.test(inconcl?.detalle ?? ''), 'D · el motivo nombra la causa medida: comparten la organización', inconcl?.detalle)
  chk(!/comparten proyecto\)/.test(inconcl?.detalle ?? ''), 'D · y no afirma "(comparten proyecto)" de memoria', inconcl?.detalle)
}
ORIGINAL['u-b'].organizacion = 'Consultora Sur'

console.log('\n— D. Motivos medidos')
sembrar({ accesoCompartido: true })
{
  const G = await cargar()
  const { resultados } = await correrCasos(G)
  const d = resultados.find((r) => r.noConcluyente && r.rol === 'organización')?.detalle ?? ''
  chk(/comparten 1 proyecto\(s\): Proyecto Real/.test(d) && !/organización «/.test(d), 'con un proyecto en común, el motivo lo nombra (y no inventa organización)', d)
  chk(intactas(), 'y nada queda cambiado', diferencias())
}
sembrar({ verseSinCausa: true })
{
  const G = await cargar()
  const { resultados } = await correrCasos(G)
  const d = resultados.find((r) => r.noConcluyente && r.rol === 'organización')?.detalle ?? ''
  chk(/la causa no se midió/.test(d) && !/comparten (la|\d)/.test(d), 'si no consta ninguna causa, dice que se ven y que la causa no se midió', d)
}

console.log('\n— C. Un caso que no restituye, o que revienta a medias')
sembrar()
{
  const G = await cargar()
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL_FALSA, 'llave-anon-de-prueba', { auth: { persistSession: false } })
  await admin.auth.signInWithPassword({ email: 'admin@prueba.cl', password: 'x' })
  const custodia = await G.abrirCustodia(admin)
  await silenciar(() =>
    G.conCustodia(admin, custodia, 'un caso descuidado', async () => {
      await admin.from('usuario').update({ organizacion: '__prueba_rls_dejada' }).eq('id', 'u-b')
      await admin.from('usuario').update({ permisos_proyecto: { invitarClientes: true } }).eq('id', 'u-a')
    }),
  )
  let reventó = false
  await silenciar(() =>
    G.conCustodia(admin, custodia, 'un caso que revienta', async () => {
      await admin.from('usuario').update({ resumen_diario: false }).eq('id', 'u-c')
      throw new Error('explotó a mitad de camino')
    }),
  ).catch(() => (reventó = true))
  const f = fallasCustodia(G.resultados).map((r) => r.prueba)
  chk(intactas(), 'la custodia devolvió los tres campos tocados', diferencias())
  chk(f.includes('un caso descuidado no restituyó `organizacion` de Consultor B'), 'informa caso, campo y cuenta: organización de Consultor B', f.join(' | '))
  chk(f.includes('un caso descuidado no restituyó `permisos_proyecto` de Consultor A'), 'informa caso, campo y cuenta: permisos de Consultor A')
  chk(reventó && f.includes('un caso que revienta no restituyó `resumen_diario` de Cliente'), 'también cuando el caso revienta: lo devuelve y lo informa', f.join(' | '))
  chk(G.resultados.filter((r) => r.rol === 'custodia').every((r) => /la custodia lo devolvió/.test(r.detalle)), 'cada informe dice que lo devolvió')
  chk(custodia.incidentes.length === 3 && custodia.incidentes.every((i) => i.devuelto), 'y lo deja registrado para el resumen de la corrida')
  // Veredicto: una FALLA de custodia hace que la compuerta no pase.
  const salida = []
  const exit = process.exit
  const log = console.log
  let codigo = null
  process.exit = (c) => { codigo = c; throw new Error('__salida__') }
  console.log = (...a) => salida.push(a.join(' '))
  try { G.resumen() } catch (e) { if (e.message !== '__salida__') throw e } finally { process.exit = exit; console.log = log }
  chk(codigo === 1 && salida.join('\n').includes('LA COMPUERTA NO PASA') && salida.join('\n').includes('[custodia]'), 'la compuerta NO pasa y lo dice en su resumen (decisión del dueño)', `exit=${codigo}`)
}

console.log('\n— E. Control negativo: el código anterior de los casos')
{
  // Se reconstruye la compuerta con los casos de #339 y #353 como estaban en
  // `main` antes de #360, conservando la custodia. Sin la custodia, borran;
  // con ella, se atrapa y se devuelve.
  let src = readFileSync(GATE, 'utf8')
  const inicio = src.indexOf('    // #360: lo guardado se lee ANTES de cualquier salida temprana.')
  const fin = src.indexOf('    // Misma organización → se ven.')
  src =
    src.slice(0, inicio) +
    `    idA = yoA.id
    idB = yoB.id
    const { data: antes } = await a.from('usuario_visible').select('id').eq('id', idB)
    if ((antes ?? []).length > 0) {
      marcaNoConcluyente(rotulo, '#339 dos consultores de la misma organización se ven', 'A ya ve a B sin organización (comparten proyecto): el caso no demostraría nada')
      return
    }
    const { data: filas } = await admin.from('usuario_visible').select('id, organizacion').in('id', [idA, idB])
    previoA = (filas ?? []).find((f) => f.id === idA)?.organizacion ?? null
    previoB = (filas ?? []).find((f) => f.id === idB)?.organizacion ?? null

` +
    src.slice(fin)
  src = src
    .replace(/    if \(!leido\) return\n    await admin\.from\('usuario'\)\.update\(\{ organizacion: previoA, permisos_proyecto: permisosA \}\)\.eq\('id', idA\)\n    await admin\.from\('usuario'\)\.update\(\{ organizacion: previoB \}\)\.eq\('id', idB\)/,
      `    if (idA) await admin.from('usuario').update({ organizacion: previoA }).eq('id', idA)
    if (idB) await admin.from('usuario').update({ organizacion: previoB }).eq('id', idB)
    if (idA && permisosA) await admin.from('usuario').update({ permisos_proyecto: permisosA }).eq('id', idA)`)
  const ANTERIOR = join(RAIZ, 'scripts', '.prueba-360-anterior.mjs')
  writeFileSync(ANTERIOR, src)
  try {
    // E1 — #339 corta temprano, SIN custodia: es el incidente del 12-sep.
    sembrar({ orgB: 'Andotek' })
    ORIGINAL['u-b'].organizacion = 'Andotek'
    const G1 = await cargar(ANTERIOR)
    await correrCasos(G1, { conCustodia: false })
    const orgs = [camposDe('u-a').organizacion, camposDe('u-b').organizacion]
    chk(orgs[0] === null && orgs[1] === null, 'E · el código anterior, sin custodia, BORRA la organización de A y B (reproduce el 12-sep)', JSON.stringify(orgs))
    const d = G1.resultados.find((r) => r.noConcluyente && r.rol === 'organización')?.detalle ?? ''
    chk(/comparten proyecto\)/.test(d), 'E · y su motivo afirmaba un proyecto compartido que no existe', d)
    // E2 — el mismo código, CON custodia: se atrapa y se devuelve.
    sembrar({ orgB: 'Andotek' })
    const G2 = await cargar(ANTERIOR)
    const { resultados } = await correrCasos(G2)
    const f = fallasCustodia(resultados).map((r) => r.prueba)
    chk(intactas(), 'E · con la custodia, aun con el código anterior, las cuentas quedan como estaban', diferencias())
    chk(f.includes('el caso de #339 (organización) no restituyó `organizacion` de Consultor A') && f.includes('el caso de #339 (organización) no restituyó `organizacion` de Consultor B'), 'E · y nombra al caso de #339 y las dos cuentas', f.join(' | '))
    ORIGINAL['u-b'].organizacion = 'Consultora Sur'
    // E3 — #353 con permisos originales en null: el código anterior deja invitarClientes puesto.
    sembrar()
    const G3 = await cargar(ANTERIOR)
    const r3 = await correrCasos(G3)
    const f3 = fallasCustodia(r3.resultados).map((r) => r.prueba)
    chk(f3.includes('el caso de #353 (agregar colega) no restituyó `permisos_proyecto` de Consultor A'), 'E · el #353 anterior no devolvía un `null`: la custodia lo atrapa', f3.join(' | '))
    chk(intactas(), 'E · y lo devuelve', diferencias())
  } finally {
    rmSync(ANTERIOR, { force: true })
  }
}

console.log(`\nFIN: ${nOk} OK, ${nFalla} FALLA`)
