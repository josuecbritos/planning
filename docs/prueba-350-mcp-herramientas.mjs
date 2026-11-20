// #350 — El MCP de planificación, herramienta por herramienta.
//
// Un cliente MCP de verdad (el del SDK) habla con el servidor por un
// transporte en memoria. Detrás está el repo de MEMORIA de la aplicación con
// su plan de ejemplo (hoy = 30-oct-2024) y la sesión de Daniela Vera
// (administradora, dueña de "Plan PGP Arauco", NO miembro de "Diagnóstico
// Pyme Andina"). El repo de memoria imita las reglas que en Supabase viven en
// la base (replanificación, fecha de cierre, notificación de asignación), así
// que lo que se prueba acá es el MCP: alcance, nombres, validaciones, relectura
// y respuestas. La parte de Supabase (token, RLS) la cubren
// `prueba-350-mcp-carga-en-node.mjs` y la verificación manual de DEPLOY.md.
//
// Sección G: la carga del MCP contra la carga que DIBUJA la Gantt, número por
// número, con el plan de ejemplo y con el plan tal como lo dejaron las
// escrituras de esta prueba. Necesita la app servida:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-350-mcp-herramientas.mjs
// Sin la app, la sección G sale como SKIP y el resto corre igual.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(RAIZ, '.prueba-350-node')
const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
const HOY = '2024-10-30'

let nOk = 0
let nFalla = 0
let nSkip = 0
const chk = (bien, m, extra = '') => {
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${m}${extra && !bien ? ' — ' + extra : ''}`)
  if (bien) nOk++
  else {
    nFalla++
    process.exitCode = 1
  }
}
const skip = (m) => {
  nSkip++
  console.log(`SKIP  ${m}`)
}

// ---- localStorage para el repo de memoria ----------------------------------
const almacen = new Map()
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
  clear: () => almacen.clear(),
}

// ---- Empaquetar las piezas de la app y del MCP ------------------------------
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const salida = await build({
  stdin: {
    contents: `
      export { MemoryRepo } from './src/data/memoryRepo.ts'
      export { registrarHerramientas, traducirRechazo, INSTRUCCIONES } from './mcp/herramientas.ts'
      export * as plan from './mcp/plan.ts'
      export { contar } from './src/lib/derive.ts'
    `,
    resolveDir: RAIZ,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  write: false,
})
const archivo = join(TMP, 'piezas.mjs')
writeFileSync(archivo, salida.outputFiles[0].text)
const P = await import(pathToFileURL(archivo).href)
const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')

const repo = new P.MemoryRepo()
const s0 = await repo.loadState()
const DV = s0.usuarios.find((u) => u.nombre === 'Daniela Vera')

const server = new McpServer({ name: 'andotek-planning', version: '1.0.0' }, { instructions: P.INSTRUCCIONES })
P.registrarHerramientas(server, { repo, usuario: DV, hoy: () => HOY })
const [tc, ts] = InMemoryTransport.createLinkedPair()
await server.connect(ts)
const cliente = new Client({ name: 'prueba', version: '0' })
await cliente.connect(tc)

async function usar(nombre, args = {}) {
  const r = await cliente.callTool({ name: nombre, arguments: args })
  const texto = r.content?.[0]?.text ?? ''
  let datos = null
  try {
    datos = JSON.parse(texto)
  } catch {
    /* texto plano: mensajes sin cambios */
  }
  return { error: !!r.isError, texto, datos }
}
const estado = () => repo.loadState()
const tareaPorTitulo = (s, t) => s.tareas.find((x) => x.titulo === t)

try {
  // ==== A. Las herramientas que existen ======================================
  console.log('\n— A. Herramientas')
  const { tools } = await cliente.listTools()
  const nombres = tools.map((t) => t.name).sort()
  const LECTURAS = ['listar_proyectos', 'ver_carga_persona', 'ver_carga_proyecto', 'ver_historial', 'ver_plan', 'ver_tareas_de_persona']
  const ESCRITURAS = ['asignar_responsable', 'cambiar_fecha', 'crear_frente', 'crear_sub_frente', 'crear_tarea', 'marcar_lista']
  chk(JSON.stringify(nombres) === JSON.stringify([...LECTURAS, ...ESCRITURAS].sort()), 'exactamente seis lecturas y seis escrituras', nombres.join(','))
  chk(!nombres.some((n) => /elimin|borr|archiv|usuario|permis|acceso|organiz/.test(n)), 'ninguna herramienta borra, archiva ni administra')
  chk(
    tools.filter((t) => LECTURAS.includes(t.name)).every((t) => t.annotations?.readOnlyHint === true),
    'las lecturas se declaran de solo lectura',
  )
  chk(
    tools.filter((t) => ESCRITURAS.includes(t.name)).every((t) => t.annotations?.readOnlyHint === false && /MODIFICA DATOS REALES/.test(t.description)),
    'cada escritura declara en su descripción que modifica datos reales',
  )

  // ==== B. Lecturas ===========================================================
  console.log('\n— B. Lecturas')
  const lp = await usar('listar_proyectos')
  const proyectos = lp.datos?.proyectos ?? []
  chk(lp.datos?.hoy === HOY, 'informa la fecha de hoy')
  chk(proyectos.length === 1 && proyectos[0].proyecto === 'Plan PGP Arauco', 'solo los proyectos de los que es miembro', JSON.stringify(proyectos.map((p) => p.proyecto)))
  const miembros = (proyectos[0]?.miembros ?? []).map((m) => m.nombre).join(',')
  chk(miembros === 'Cliente Arauco,Daniela Vera,Josue Britos', 'con sus miembros', miembros)
  chk(proyectos[0]?.miembros.find((m) => m.nombre === 'Daniela Vera')?.dueno === true, 'marca al dueño')

  const fuera = await usar('ver_plan', { proyecto: 'Diagnóstico Pyme Andina' })
  chk(fuera.error && /No encontré/.test(fuera.texto), 'un proyecto del que no es miembro no existe para el MCP')

  const vp = await usar('ver_plan', { proyecto: 'arauco' })
  const tareasPlan = (vp.datos?.frentes ?? []).flatMap((f) => f.sub_frentes.flatMap((sf) => sf.tareas))
  const arauco = s0.proyectos.find((p) => p.nombre === 'Plan PGP Arauco')
  const sfsArauco = new Set(s0.subFrentes.filter((sf) => s0.frentes.some((f) => f.id === sf.frenteId && f.proyectoId === arauco.id)).map((sf) => sf.id))
  const reales = s0.tareas.filter((t) => sfsArauco.has(t.subFrenteId) && !t.archivada)
  chk(tareasPlan.length === reales.length && reales.length > 20, 'el plan trae TODAS las tareas del proyecto, no solo las propias', `${tareasPlan.length} vs ${reales.length}`)
  chk(new Set(tareasPlan.map((t) => t.responsable)).size >= 2, 'con distintos responsables')
  const c = P.contar(s0, reales, HOY)
  chk(
    vp.datos?.contadores.total === c.total && vp.datos.contadores.atrasadas_replanificadas === c.atrasadasReplan && vp.datos.contadores.hechas === c.hechas,
    'los contadores son los de la aplicación (`contar`)',
  )
  const acc = tareasPlan.find((t) => t.titulo === 'Análisis de cuentas por cobrar')
  chk(
    acc?.estado === 'Atrasada replanificada' && acc.fecha_objetivo === '2024-10-29' && acc.fecha_original === '2024-10-21' && acc.replanificaciones === 1 && acc.atraso_dias_habiles === 6,
    'cada tarea trae estado, fechas, atraso y replanificaciones',
    JSON.stringify(acc),
  )
  const ordenFrentes = (vp.datos?.frentes ?? []).map((f) => f.frente).join(',')
  chk(ordenFrentes === 'Levantamiento,Diseño', 'frentes en el orden del proyecto', ordenFrentes)

  const tp = await usar('ver_tareas_de_persona', { persona: 'josue' })
  const tj = tp.datos?.tareas ?? []
  chk(tp.datos?.persona === 'Josue Britos' && tj.length > 0 && tj.every((t) => t.responsable === 'Josue Britos'), 'tareas de una persona por su nombre')
  const GRAV = { 'Hecha': 0, 'Pendiente': 1, 'Pendiente replanificada': 2, 'Atrasada': 3, 'Atrasada replanificada': 4 }
  chk(tj.every((t, i) => i === 0 || GRAV[tj[i - 1].estado] >= GRAV[t.estado]), 'ordenadas como Mis Tareas: lo más crítico primero')
  const propias = await usar('ver_tareas_de_persona')
  chk(propias.datos?.persona === 'Daniela Vera', 'sin persona, las del propio usuario')

  const vh = await usar('ver_historial', { tarea: 'Inventario de equipos críticos' })
  const regs = vh.datos?.replanificaciones ?? []
  chk(
    regs.length === 2 && regs[0].fecha_anterior === '2024-10-18' && regs[0].fecha_nueva === '2024-10-25' && regs[1].fecha_nueva === '2024-11-01' && regs.every((r) => r.quien && r.cuando),
    'historial: fecha anterior, nueva, quién y cuándo',
    JSON.stringify(regs),
  )

  // ==== C. Nombres: ambigüedad y no encontrados ===============================
  console.log('\n— C. Nombres')
  const amb = await usar('ver_historial', { tarea: 'Revisión' })
  chk(amb.error && /Hay 2 coincidencias/.test(amb.texto), 'un nombre que coincide con dos tareas es ambiguo')
  chk(amb.texto.includes('Plan PGP Arauco › Levantamiento › Procesos Comerciales › Revisión de política de precios') && amb.texto.includes('Procesos Financieros › Revisión de reportes contables'), 'y devuelve los candidatos con su ruta completa')
  const desamb = await usar('ver_historial', { sub_frente: 'Financieros', tarea: 'Revisión' })
  chk(!desamb.error && desamb.datos?.tarea?.titulo === 'Revisión de reportes contables', 'la ruta desempata')
  const antesAmb = JSON.stringify(await estado())
  const ambW = await usar('marcar_lista', { tarea: 'Revisión', lista: true })
  chk(ambW.error && JSON.stringify(await estado()) === antesAmb, 'una escritura ambigua no toca nada')
  const personaAmb = await usar('ver_tareas_de_persona', { persona: 'a' })
  chk(personaAmb.error && /personas que coinciden/.test(personaAmb.texto), 'una persona ambigua: pregunta cuál')
  const noHay = await usar('ver_historial', { proyecto: 'Arauco', frente: 'Inexistente', tarea: 'X' })
  chk(noHay.error && /el frente "Inexistente"/.test(noHay.texto), 'dice qué parte de la ruta no encontró')

  // ==== D. Escrituras ===========================================================
  console.log('\n— D. Escrituras')
  let r = await usar('crear_frente', { proyecto: 'Plan PGP Arauco', nombre: 'Implementación' })
  let s = await estado()
  chk(!r.error && s.frentes.some((f) => f.nombre === 'Implementación' && f.proyectoId === arauco.id), 'crea un frente', r.texto)
  r = await usar('crear_sub_frente', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', nombre: 'Puesta en marcha' })
  s = await estado()
  chk(!r.error && s.subFrentes.some((sf) => sf.nombre === 'Puesta en marcha'), 'crea un sub frente', r.texto)

  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'Capacitación usuarios' })
  chk(!r.error && r.datos?.tarea?.fecha_objetivo === null && r.datos.tarea.responsable === null && r.datos.tarea.estado === 'Pendiente', 'crea una tarea sin fecha ni responsable', r.texto)
  chk(r.datos?.tarea?.ruta === 'Plan PGP Arauco › Implementación › Puesta en marcha › Capacitación usuarios', 'y responde con lo que quedó guardado, con su ruta')

  const nTareas = (await estado()).tareas.length
  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'X', responsable: 'Carla Soto' })
  chk(r.error && /no es miembro/.test(r.texto) && (await estado()).tareas.length === nTareas, 'un responsable que no es miembro se rechaza antes de escribir', r.texto)
  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'X', fecha_objetivo: '2024-02-30' })
  chk(r.error && /no existe/.test(r.texto) && (await estado()).tareas.length === nTareas, 'una fecha inexistente se rechaza')
  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'X', fecha_objetivo: '04/11/2024' })
  chk(r.error && /AAAA-MM-DD/.test(r.texto) && (await estado()).tareas.length === nTareas, 'una fecha ambigua (04/11) se rechaza')
  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'Manual de usuario', responsable: 'Cliente Arauco', fecha_objetivo: '2024-11-12' })
  chk(!r.error && r.datos?.tarea?.responsable === 'Cliente Arauco' && r.datos.tarea.fecha_objetivo === '2024-11-12' && r.datos.tarea.fecha_original === '2024-11-12', 'crea una tarea con responsable miembro y fecha', r.texto)

  // Para la sección G: una sin responsable dentro del horizonte de la Gantt, y
  // una sin fecha marcada hecha (su fecha vigente pasa a ser hoy).
  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'Prueba piloto', fecha_objetivo: '2024-11-07' })
  chk(!r.error && r.datos?.tarea?.responsable === null, 'crea una tarea con fecha y sin responsable')
  r = await usar('crear_tarea', { proyecto: 'Plan PGP Arauco', frente: 'Implementación', sub_frente: 'Puesta en marcha', titulo: 'Kickoff', responsable: 'Daniela' })
  r = await usar('marcar_lista', { tarea: 'Kickoff', lista: true })
  chk(!r.error && r.datos?.tarea?.fecha_cierre === HOY, 'una tarea sin fecha marcada hecha queda en hoy')

  // Fecha futura: planificación, sin historial; la original acompaña.
  r = await usar('cambiar_fecha', { tarea: 'Taller de priorización con sponsor', fecha: '2024-11-08' })
  s = await estado()
  let t = tareaPorTitulo(s, 'Taller de priorización con sponsor')
  chk(!r.error && t.fechaObjetivo === '2024-11-08' && t.fechaOriginal === '2024-11-08' && !s.historial.some((h) => h.tareaId === t.id), 'mover una fecha futura no es replanificación', r.texto)
  chk(/no replanificación/.test(r.datos?.nota ?? ''), 'y la respuesta lo dice')

  // Fecha vencida: replanificación con historial; la original queda.
  r = await usar('cambiar_fecha', { tarea: 'Documento de requerimientos comerciales', fecha: '2024-11-04' })
  s = await estado()
  t = tareaPorTitulo(s, 'Documento de requerimientos comerciales')
  const hist = s.historial.filter((h) => h.tareaId === t.id)
  chk(!r.error && t.fechaObjetivo === '2024-11-04' && t.fechaOriginal === '2024-10-28' && hist.length === 1 && hist[0].fechaAnterior === '2024-10-28' && hist[0].cambiadoPor === DV.id, 'mover una fecha vencida queda en el historial, con quién la movió', r.texto)
  chk(r.datos?.tarea?.estado === 'Pendiente replanificada' && /replanificación/.test(r.datos?.nota ?? ''), 'y responde el estado nuevo')

  const antesVacio = JSON.stringify(await estado())
  r = await usar('cambiar_fecha', { tarea: 'Validación de layout propuesto', fecha: '' })
  chk(r.error && JSON.stringify(await estado()) === antesVacio, 'una fecha vacía es un error, no "quitar la fecha"')

  // Vencida sin fecha: no.
  const antesQuitar = JSON.stringify(await estado())
  r = await usar('cambiar_fecha', { tarea: 'Análisis de tiempos de ciclo', fecha: null })
  chk(r.error && /no puede quedar sin fecha/.test(r.texto) && JSON.stringify(await estado()) === antesQuitar, 'una tarea vencida no puede quedar sin fecha')
  r = await usar('cambiar_fecha', { tarea: 'Modelo de flujo de caja', fecha: null })
  s = await estado()
  chk(!r.error && !tareaPorTitulo(s, 'Modelo de flujo de caja').fechaObjetivo, 'una tarea futura sí puede quedar sin fecha')

  // Asignar: notificación a la persona.
  const nNotif = (await estado()).notificaciones.filter((n) => n.usuarioId === 'u-jb' && n.tipo === 'asignacion').length
  r = await usar('asignar_responsable', { tarea: 'Capacitación usuarios', persona: 'Josue' })
  s = await estado()
  t = tareaPorTitulo(s, 'Capacitación usuarios')
  chk(!r.error && t.responsableId === 'u-jb' && r.datos?.tarea?.responsable === 'Josue Britos', 'asigna un responsable por nombre', r.texto)
  chk(s.notificaciones.filter((n) => n.usuarioId === 'u-jb' && n.tipo === 'asignacion').length === nNotif + 1, 'y la persona recibe la notificación de asignación')
  r = await usar('asignar_responsable', { tarea: 'Capacitación usuarios', persona: 'Carla Soto' })
  chk(r.error && tareaPorTitulo(await estado(), 'Capacitación usuarios').responsableId === 'u-jb', 'no asigna a quien no es miembro')

  // Marcar lista: con fecha cierra en la fecha planificada; sin fecha, hoy.
  r = await usar('marcar_lista', { tarea: 'Validación de canales de venta', lista: true })
  chk(!r.error && r.datos?.tarea?.estado === 'Hecha' && r.datos.tarea.fecha_cierre === '2024-11-05', 'marcar lista cierra en la última fecha planificada', r.texto)
  r = await usar('marcar_lista', { tarea: 'Capacitación usuarios', lista: true })
  chk(!r.error && r.datos?.tarea?.fecha_objetivo === HOY && r.datos.tarea.fecha_cierre === HOY, 'una sin fecha queda cerrada hoy', r.texto)
  r = await usar('marcar_lista', { tarea: 'Capacitación usuarios', lista: false })
  chk(!r.error && r.datos?.tarea?.hecha === false && r.datos.tarea.fecha_objetivo === null, 'desmarcar devuelve la tarea a sin fecha')
  r = await usar('marcar_lista', { tarea: 'Capacitación usuarios', lista: false })
  chk(r.error && /ya está abierta/.test(r.texto), 'lo que ya está así no se reescribe')

  // Archivadas: ni se leen ni se tocan.
  const arch = tareaPorTitulo(await estado(), 'Estrategia de migración')
  await repo.updateTarea(arch.id, { archivada: true })
  const antesArch = JSON.stringify(await estado())
  r = await usar('cambiar_fecha', { tarea: 'Estrategia de migración', fecha: '2024-12-01' })
  chk(r.error && /está archivada/.test(r.texto) && JSON.stringify(await estado()) === antesArch, 'una tarea archivada no se modifica, y se dice por qué', r.texto)
  r = await usar('ver_plan', { proyecto: 'Arauco' })
  chk(!r.texto.includes('Estrategia de migración'), 'las archivadas no aparecen en el plan')

  // Rechazos de la base traducidos.
  chk(/vence hoy o ya venció/.test(P.traducirRechazo(new Error('No puedes eliminar tareas que ya pasaron'))), 'el rechazo de la base por fecha vencida se explica')
  chk(/permisos/.test(P.traducirRechazo(new Error('new row violates row-level security policy for table "tarea"'))), 'un rechazo de RLS se explica como permisos')

  // Carga del MCP contra un cálculo directo sobre el estado (la Gantt va en G).
  const cp = await usar('ver_carga_proyecto', { proyecto: 'Arauco', desde: '2024-10-14', hasta: '2024-11-29' })
  const sumaTotal = Object.values(cp.datos?.total ?? {}).reduce((a, b) => a + b, 0)
  const sumaPartes =
    (cp.datos?.personas ?? []).reduce((a, p) => a + Object.values(p.por_dia).reduce((x, y) => x + y, 0), 0) +
    Object.values(cp.datos?.sin_responsable ?? {}).reduce((a, b) => a + b, 0)
  chk(sumaTotal > 0 && sumaTotal === sumaPartes, 'carga: el total del día es la suma de personas y sin responsable')
  const rangoMalo = await usar('ver_carga_proyecto', { proyecto: 'Arauco', desde: '2024-11-10', hasta: '2024-11-01' })
  chk(rangoMalo.error, 'un rango al revés se rechaza')
  const cpe = await usar('ver_carga_persona', { persona: 'Josue Britos', desde: '2024-10-14', hasta: '2024-11-29' })
  chk(Object.keys(cpe.datos?.total ?? {}).length > 0 && cpe.datos.por_proyecto.length === 1, 'carga de una persona, con el desglose por proyecto')

  // ==== G. Carga del MCP = carga de la Gantt ===================================
  console.log('\n— G. Carga contra la Gantt')
  let chromium
  try {
    ;({ chromium } = await import('playwright-core'))
  } catch {
    chromium = null
  }
  let disponible = false
  try {
    disponible = (await fetch(URL_APP)).ok
  } catch {
    disponible = false
  }
  if (!chromium || !disponible) {
    skip(`la app no está servida en ${URL_APP}: no se compara contra la Gantt`)
  } else {
    const b = await chromium.launch({ executablePath: EXE })
    try {
      const repoSemilla = await (async () => {
        const guardado = almacen.get('planificador.state.v1')
        almacen.clear()
        const r0 = new P.MemoryRepo()
        const s = await r0.loadState()
        almacen.set('planificador.state.v1', guardado)
        return s
      })()
      const escenarios = [
        { nombre: 'plan de ejemplo', estado: repoSemilla },
        { nombre: 'plan después de las escrituras', estado: await estado(), exige: ['Cliente Arauco', 'Sin', 'Total'] },
      ]
      for (const esc of escenarios) {
        const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
        const p = await ctx.newPage()
        await p.goto(URL_APP)
        await p.evaluate((json) => localStorage.setItem('planificador.state.v1', json), JSON.stringify(esc.estado))
        await p.reload()
        await p.waitForTimeout(700)
        await p.getByText('Daniela Vera', { exact: true }).click()
        await p.waitForTimeout(900)
        await p.getByText('Resumen', { exact: true }).first().click()
        await p.waitForTimeout(400)
        await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
        await p.waitForTimeout(900)
        await p.getByRole('button', { name: 'Gantt', exact: true }).first().click()
        await p.waitForTimeout(900)
        const gantt = await p.evaluate(() => {
          const dias = [...document.querySelectorAll('th[data-dia]')].map((th) => th.getAttribute('data-dia'))
          const filas = [...document.querySelectorAll('tr.carga-fila')].map((tr) => ({
            nombre: tr.querySelector('.carga-fila__nombre')?.textContent?.trim() ?? '',
            celdas: [...tr.querySelectorAll('td.carga-celda')].map((td) => td.textContent.trim()),
          }))
          return { dias, filas }
        })
        await ctx.close()

        const dias = [...new Set(gantt.dias)]
        if (!dias.length || !gantt.filas.length) {
          chk(false, `${esc.nombre}: la Gantt muestra días y filas de carga`, JSON.stringify({ d: dias.length, f: gantt.filas.length }))
          continue
        }
        const est = esc.estado
        const proy = est.proyectos.find((x) => x.nombre === 'Plan PGP Arauco')
        const mcp = P.plan.cargaDeProyecto(est, proy, dias[0], dias[dias.length - 1])
        const filaMcp = (nombre) => {
          if (nombre === 'Total') return mcp.total
          const pe = mcp.personas.find((x) => x.persona === nombre)
          return pe ? pe.por_dia : nombre.toLowerCase().includes('sin') ? mcp.sin_responsable : undefined
        }
        let comparadas = 0
        let distintas = []
        for (const f of gantt.filas) {
          const m = filaMcp(f.nombre)
          if (!m) {
            distintas.push(`fila "${f.nombre}" no está en el MCP`)
            continue
          }
          dias.forEach((d, i) => {
            const g = Number(f.celdas[i] || 0)
            const v = m[d] ?? 0
            comparadas++
            if (g !== v) distintas.push(`${f.nombre} ${d}: Gantt ${g}, MCP ${v}`)
          })
        }
        const personasGantt = gantt.filas.map((f) => f.nombre).filter((n) => n !== 'Total' && !/sin/i.test(n))
        const personasMcp = mcp.personas.filter((x) => dias.some((d) => x.por_dia[d])).map((x) => x.persona)
        chk(JSON.stringify(personasGantt) === JSON.stringify(personasMcp), `${esc.nombre}: mismas personas y en el mismo orden`, `${personasGantt} / ${personasMcp}`)
        if (esc.exige) {
          const nombresG = gantt.filas.map((f) => f.nombre)
          chk(esc.exige.every((n) => nombresG.some((g) => g.toLowerCase().includes(n.toLowerCase()))), `${esc.nombre}: la Gantt muestra las filas ${esc.exige.join(', ')}`, nombresG.join(','))
        }
        const conValor = gantt.filas.some((f) => f.celdas.some((x) => Number(x) > 0))
        chk(conValor && comparadas > 50 && distintas.length === 0, `${esc.nombre}: ${comparadas} celdas, todas iguales a la Gantt`, distintas.slice(0, 6).join('; '))
      }

      // ==== H. La pantalla de autorización ====================================
      // En modo Local no hay servidor OAuth: la pantalla tiene que llegar igual
      // —después del login de siempre— y decir que necesita la base real.
      console.log('\n— H. Pantalla de autorización')
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
      const p = await ctx.newPage()
      await p.goto(new URL('oauth/consent?authorization_id=abc', URL_APP).href)
      await p.evaluate(() => localStorage.clear())
      await p.reload()
      await p.waitForTimeout(700)
      chk((await p.locator('.login').count()) === 1 && (await p.locator('.autorizar').count()) === 0, 'sin sesión, primero el login de siempre')
      await p.getByText('Daniela Vera', { exact: true }).click()
      await p.waitForTimeout(900)
      chk(new URL(p.url()).pathname === '/oauth/consent', 'después de entrar sigue en la ruta de autorización')
      chk((await p.locator('.autorizar').count()) === 1, 'y muestra la tarjeta de autorización')
      chk((await p.locator('nav.sidebar').count()) === 0, 'no la aplicación')
      chk(/base de datos real/.test((await p.locator('.autorizar').allInnerTexts()).join(' ')), 'en modo Local explica que necesita la base real')
      await p.goto(URL_APP)
      await p.waitForTimeout(900)
      chk((await p.locator('.autorizar').count()) === 0 && (await p.locator('nav.sidebar').count()) === 1, 'la raíz sigue abriendo la aplicación (la misma comprobación de "no la aplicación", al revés)')
      await ctx.close()
    } finally {
      await b.close()
    }
  }
} catch (e) {
  chk(false, 'la prueba corrió hasta el final', e?.stack ?? String(e))
} finally {
  await cliente.close().catch(() => {})
  rmSync(TMP, { recursive: true, force: true })
}

console.log(`\nFIN: ${nOk} OK, ${nFalla} FALLA, ${nSkip} SKIP`)
