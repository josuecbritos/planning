// Desbordes mobile (nov-2026) — nada se sale de su celda, de su tabla ni de
// la pantalla.
//
// Lo reportado: en el teléfono, al agregar una tarea, los símbolos de la
// columna de la derecha se salían de la tabla; y en tablas de administración
// "cuando hay muchas opciones". El diagnóstico recorrió TODAS las pantallas y
// modales a 360, 390 y 768 px (más escritorio) y encontró tres fallas:
//   1. Fila de nueva tarea: la ✓ y la ✕ necesitan 42px y la columna mide 26
//      → la ✕ 17px fuera de la tabla y la tabla 5px más ancha que la pantalla.
//   2. Usuarios: el máximo de una fila son CINCO íconos (un consultor activo
//      que todavía no entra suma la invitación, que solo existe con la base
//      real) = 150px en una columna de 132 → el quinto fuera de la tabla.
//   3. Usuarios: el círculo de iniciales se aplastaba junto a un nombre largo.
//
// El plan de prueba se carga con "muchas opciones": seis proyectos más con
// nombres largos, una consultora y un cliente con nombre y correo largos y
// acceso a todo, un usuario desactivado y una tarea de título largo.
//
// Qué mide, en cada pantalla y en cada ancho: (1) elementos que se salen de su
// celda; (2) elementos que pasan el borde de la pantalla sin un contenedor con
// scroll que los aloje; (3) círculos de iniciales deformados; (4) columnas de
// acciones cuyos íconos no caben; y que la página no tenga scroll horizontal.
// Las tablas de administración SÍ se desplazan en horizontal dentro de su
// envoltura —decisión de #197—: eso no es falla, y se miden también
// desplazadas hasta el final.
//
// El quinto ícono de Usuarios no existe en modo Local: la prueba clona uno de
// la fila hasta llegar a cinco, que es el máximo real con la base.
//
// Control negativo contra `main` (sin la corrección): ver CHANGELOG.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-desbordes-mobile.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'

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

// ---- Estado con "muchas opciones" ------------------------------------------
const almacen = new Map()
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
  clear: () => almacen.clear(),
}
const TMP = join(RAIZ, '.prueba-desbordes-tmp')
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const out = await build({
  stdin: { contents: `export { MemoryRepo } from './src/data/memoryRepo.ts'`, resolveDir: RAIZ, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
})
writeFileSync(join(TMP, 'r.mjs'), out.outputFiles[0].text)
const { MemoryRepo } = await import(pathToFileURL(join(TMP, 'r.mjs')).href)
rmSync(TMP, { recursive: true, force: true })

const repo = new MemoryRepo()
repo.setActor('u-dv')
const nombres = [
  'Transformación Digital Servicios Compartidos Región del Biobío',
  'Implementación ERP Forestal',
  'Rediseño de Procesos Logísticos Puerto Coronel',
  'Gobierno de Datos',
  'PMO Corporativa 2027',
  'Auditoría de Controles Internos',
]
const proys = []
for (const n of nombres) proys.push(await repo.createProyecto({ nombre: n, creadoPor: 'u-dv' }))
const larga = await repo.createUsuario({ nombre: 'María Fernanda González Rivera de la Fuente', email: 'maria.fernanda.gonzalez.rivera@consultora-andina-sur.cl', rol: 'consultor', organizacion: 'Consultora Andina Sur Limitada' })
const cli = await repo.createUsuario({ nombre: 'Juan Pablo Errázuriz Montalva', email: 'juanpablo.errazuriz@cliente-forestal-muy-largo.cl', rol: 'cliente' })
const baja = await repo.createUsuario({ nombre: 'Persona Dada de Baja', email: 'baja@consultora.cl', rol: 'consultor' })
await repo.updateUsuario(baja.id, { activo: false })
for (const p of proys) {
  await repo.asignarAcceso(larga.id, p.id)
  await repo.asignarAcceso(cli.id, p.id)
}
await repo.asignarAcceso(larga.id, 'p-arauco')
await repo.asignarAcceso(cli.id, 'p-arauco')
// Una tarea con título largo y responsable de nombre largo.
await repo.createTarea({ subFrenteId: 'sf-com', titulo: 'Levantamiento detallado de la cadena de aprobación comercial y sus excepciones regionales', responsableId: larga.id, fechaObjetivo: '2024-11-04' })
const ESTADO = JSON.stringify(await repo.loadState())

// ---- Detector -----------------------------------------------------------------
function medir() {
  const W = document.documentElement.clientWidth
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
  }
  const desc = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
    const t = (el.getAttribute('aria-label') || el.getAttribute('data-tip') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${t ? ` «${t}»` : ''}`
  }
  const hallazgos = []
  const todos = [...document.body.querySelectorAll('*')].filter(vis)
  for (const el of todos) {
    const r = el.getBoundingClientRect()
    // (1) se sale de su celda
    const td = el.parentElement?.closest('td, th')
    if (td && td !== el) {
      const rc = td.getBoundingClientRect()
      const fueraCelda = r.right > rc.right + 1 || r.left < rc.left - 1
      // Solo el elemento más externo que se sale (su padre está dentro).
      const padre = el.parentElement
      const rp = padre.getBoundingClientRect()
      const padreDentro = padre === td || (rp.right <= rc.right + 1 && rp.left >= rc.left - 1)
      if (fueraCelda && padreDentro) {
        const csTd = getComputedStyle(td)
        hallazgos.push({
          tipo: csTd.overflow === 'hidden' || csTd.overflowX === 'hidden' ? 'cortado por su celda' : 'se sale de su celda',
          el: desc(el),
          celda: desc(td).slice(0, 60),
          px: Math.round(Math.max(r.right - rc.right, rc.left - r.left)),
        })
      }
    }
    // (2) pasa el borde de la pantalla, sin un contenedor con scroll que lo aloje.
    // Un panel ENTERO fuera de la ventana es un cajón cerrado, no un desborde.
    const enteroFuera = r.right <= 0 || r.left >= W
    if (!enteroFuera && (r.right > W + 1 || r.left < -1)) {
      let a = el.parentElement
      let scroller = null
      while (a && a !== document.documentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll') { scroller = a; break }
        a = a.parentElement
      }
      const padre = el.parentElement
      const rp = padre?.getBoundingClientRect()
      const padreDentro = !rp || (rp.right <= W + 1 && rp.left >= -1)
      if (!scroller && padreDentro) {
        hallazgos.push({ tipo: 'fuera de la pantalla', el: desc(el), px: Math.round(Math.max(r.right - W, -r.left)) })
      }
    }
  }
  // (2b) círculos de iniciales deformados
  for (const el of document.querySelectorAll('.resp-badge')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (Math.abs(r.width - r.height) > 1.5) hallazgos.push({ tipo: 'círculo deformado', el: desc(el), px: Math.round(r.height - r.width) })
  }
  // (2c) columna de acciones: ¿caben sus íconos?
  for (const td of document.querySelectorAll('td.col-acc')) {
    if (!vis(td)) continue
    const btns = [...td.querySelectorAll(':scope > button, :scope > .icon-btn, :scope > * > button')].filter(vis)
    if (!btns.length) continue
    const cs = getComputedStyle(td)
    const util = td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const anchos = btns.map((b) => b.getBoundingClientRect().width + parseFloat(getComputedStyle(b).marginLeft) + parseFloat(getComputedStyle(b).marginRight))
    // Extensión horizontal real: en fila suman; apilados, manda el más ancho.
    const rects = btns.map((b) => b.getBoundingClientRect())
    const enFila = rects.every((r) => Math.abs(r.top - rects[0].top) < 2)
    const total = enFila ? anchos.reduce((a, b) => a + b, 0) : Math.max(...anchos)
    if (total > util + 1) hallazgos.push({ tipo: 'acciones: no caben', el: `${btns.length} íconos = ${Math.round(total)}px`, celda: desc(td.closest('tr')).slice(0, 50), px: Math.round(total - util) })
  }
  // (3) scroll horizontal
  const scrollPagina = document.documentElement.scrollWidth - W
  if (scrollPagina > 1) hallazgos.push({ tipo: 'la página tiene scroll horizontal', el: 'html', px: scrollPagina })
  const scrollers = todos
    .filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
    .map((el) => ({ el: desc(el).slice(0, 60), visible: el.clientWidth, contenido: el.scrollWidth }))
  return { W, hallazgos, scrollers }
}

// ---- Recorrido -----------------------------------------------------------------
const resumir = (hs) => [...new Set(hs.map((h) => `${h.tipo}: ${h.el}${h.celda ? ' en ' + h.celda : ''} (${h.px}px)`))].slice(0, 4).join('; ')
const b = await chromium.launch({ executablePath: EXE })

async function sesion(ancho) {
  const movil = ancho <= 768
  const ctx = await b.newContext(
    movil ? { viewport: { width: ancho, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: ancho, height: 900 } },
  )
  const p = await ctx.newPage()
  p.on('dialog', (d) => d.accept())
  await p.goto(URL_APP)
  await p.evaluate((json) => localStorage.setItem('planificador.state.v1', json), ESTADO)
  await p.reload()
  await p.waitForTimeout(700)
  await p.getByText('Daniela Vera', { exact: true }).click()
  await p.waitForTimeout(900)
  return { p, ctx, movil }
}

async function recorrer(ancho) {
  console.log(`\n— ${ancho}px`)
  const { p, ctx, movil } = await sesion(ancho)
  const limpio = async (nombre) => {
    await p.waitForTimeout(400)
    const m = await p.evaluate(medir)
    chk(m.hallazgos.length === 0, `${ancho}px · ${nombre}: nada se sale`, resumir(m.hallazgos))
    return m
  }
  const ir = async (texto) => {
    if (movil) {
      await p.locator('button.movil-menu').click()
      await p.waitForTimeout(400)
    }
    await p.locator('nav.sidebar button', { hasText: texto }).last().click()
    await p.waitForTimeout(800)
  }
  const escape = async () => {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)
  }
  const paso = async (nombre, fn) => {
    try {
      await fn()
    } catch (e) {
      chk(false, `${ancho}px · ${nombre}: se pudo recorrer`, e.message.split('\n')[0])
    }
  }

  await paso('resumen', () => limpio('Resumen'))
  await paso('proyecto', async () => {
    await ir('Plan PGP Arauco')
    await limpio('tabla del proyecto')
  })
  await paso('nueva tarea', async () => {
    await p.getByRole('button', { name: '+ Tarea' }).first().click()
    await p.waitForTimeout(300)
    const m = await limpio('fila de nueva tarea abierta')
    // Lo reportado, medido directo: ✓ y ✕ dentro de la tabla.
    const geo = await p.evaluate(() => {
      const tr = document.querySelector('tr.fila-nueva')
      const tabla = tr.closest('table').getBoundingClientRect()
      const btns = [...tr.querySelectorAll('td.col-acc .icon-btn')].map((x) => x.getBoundingClientRect())
      // El sobrante no aparece en la página: vive en el contenedor con scroll
      // `.content`. Se miden los dos (en `main` la página daba 0 y el
      // contenedor 5px: la comprobación pasaba por accidente).
      const c = document.querySelector('.content')
      const sobra = Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, c ? c.scrollWidth - c.clientWidth : 0)
      return { n: btns.length, dentro: btns.every((r) => r.left >= tabla.left - 0.5 && r.right <= tabla.right + 0.5), tabla: tabla.right, sobra }
    })
    chk(geo.n === 2 && geo.dentro, `${ancho}px · la ✓ y la ✕ de la fila nueva quedan dentro de la tabla`, JSON.stringify(geo))
    chk(geo.sobra <= 0, `${ancho}px · con la fila nueva abierta, ni la página ni el contenido se desplazan en horizontal`, `sobran ${geo.sobra}px`)
    void m
    await p.keyboard.type('Tarea creada desde la prueba')
    await p.keyboard.press('Enter')
    await limpio('fila nueva tras crear (encadena)')
    await escape()
    await limpio('tabla con la tarea creada')
  })
  await paso('panel', async () => {
    await p.getByText('Validación de canales de venta').first().click()
    await limpio('panel de tarea')
    await escape()
  })
  await paso('mis tareas', async () => {
    await ir('Mis Tareas')
    await limpio('Mis Tareas')
  })
  await paso('usuarios', async () => {
    await ir('Usuarios')
    await limpio('Usuarios')
    // Círculos: redondos aunque el nombre sea largo.
    const badges = await p.evaluate(() =>
      [...document.querySelectorAll('.usuarios-tabla .resp-badge')].map((e) => {
        const r = e.getBoundingClientRect()
        return { t: e.textContent, w: r.width, h: r.height }
      }),
    )
    const mf = badges.find((x) => x.t === 'MF')
    chk(!!mf && Math.abs(mf.w - mf.h) <= 1, `${ancho}px · el círculo de una persona con nombre largo sigue redondo`, JSON.stringify(mf))
    // Cinco íconos: el máximo real (la invitación solo existe con la base).
    const cinco = await p.evaluate(() => {
      const tr = [...document.querySelectorAll('.usuarios-tabla tbody tr')].find((x) => x.textContent.includes('María Fernanda'))
      const td = tr.querySelector('td.col-acc')
      const antes = td.querySelectorAll('.icon-btn').length
      while (td.querySelectorAll('.icon-btn').length < 5) td.appendChild(td.querySelector('.icon-btn').cloneNode(true))
      const c = td.getBoundingClientRect()
      const tabla = td.closest('table').getBoundingClientRect()
      const rs = [...td.querySelectorAll('.icon-btn')].map((x) => x.getBoundingClientRect())
      return { antes, dentro: rs.every((r) => r.right <= c.right + 0.5 && r.right <= tabla.right + 0.5), fila: rs.every((r) => Math.abs(r.top - rs[0].top) < 2) }
    })
    chk(cinco.antes === 4, `${ancho}px · la consultora muestra sus cuatro acciones de modo Local`, JSON.stringify(cinco))
    chk(cinco.dentro && cinco.fila, `${ancho}px · con cinco acciones (máximo con la base) caben en una línea dentro de la tabla`, JSON.stringify(cinco))
    await p.evaluate(() => document.querySelectorAll('.usuarios-wrap').forEach((w) => (w.scrollLeft = w.scrollWidth)))
    await limpio('Usuarios, desplazada hasta Acciones')
    await p.evaluate(() => document.querySelectorAll('.usuarios-wrap').forEach((w) => (w.scrollLeft = 0)))
    await p.getByRole('button', { name: /\+ (Usuario|Cliente)/ }).first().click()
    await limpio('modal de nuevo usuario')
    await escape()
    await p.locator('tr', { hasText: 'María Fernanda' }).locator('[data-tip="Editar"]').first().click()
    await limpio('modal de editar usuario')
    await escape()
    await p.locator('tr', { hasText: 'María Fernanda' }).locator('[data-tip="Permisos de proyecto"]').first().click()
    await limpio('modal de permisos de proyecto')
    await escape()
  })
  await paso('admin proyectos', async () => {
    await ir('Proyectos')
    await limpio('Administración → Proyectos')
    await p.evaluate(() => document.querySelectorAll('.usuarios-wrap').forEach((w) => (w.scrollLeft = w.scrollWidth)))
    await limpio('Proyectos, desplazada hasta Acciones')
    await p.locator('tr', { hasText: 'Plan PGP Arauco' }).locator('[data-tip="Miembros"]').click()
    await limpio('modal de miembros')
    await p.locator('[data-tip="Permisos en este proyecto"]').first().click()
    await limpio('modal de permisos del acceso')
    await escape()
    await escape()
    await p.locator('tr', { hasText: 'Plan PGP Arauco' }).locator('[data-tip="Editar proyecto"]').click()
    await limpio('modal de editar proyecto')
    await escape()
  })
  if (movil) {
    await paso('cuenta', async () => {
      await p.locator('button.movil-menu').click()
      await p.waitForTimeout(400)
      await p.locator('nav.sidebar .sesion--boton').click()
      await p.waitForTimeout(800)
      await limpio('Mi cuenta')
    })
    await paso('notificaciones', async () => {
      await p.locator('button.movil-campana').click()
      await limpio('Notificaciones')
    })
  }
  await ctx.close()
}

try {
  for (const ancho of [360, 390, 768, 1440]) await recorrer(ancho)
} catch (e) {
  chk(false, 'la prueba corrió hasta el final', e?.stack ?? String(e))
} finally {
  await b.close()
}
console.log(`\nFIN: ${nOk} OK, ${nFalla} FALLA`)
