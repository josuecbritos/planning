// #298 — La columna de acciones de la tabla del proyecto se titula "Acciones",
// igual que en administración de usuarios y de proyectos.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-298-columna-acciones.mjs
//
// Corre en modo Local (repo de memoria): no toca la base ni la producción.
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL = process.env.URL ?? 'http://localhost:4173/'

// Anchos de las cabeceras de la tabla del proyecto medidos ANTES del cambio,
// en 1440×900 con el proyecto de ejemplo. Ninguno debe moverse (criterio 4).
const ANCHOS_ESPERADOS = {
  'col-check': 49.5,
  '': 570.5,
  'col-resp': 96,
  'col-estado': 125,
  'col-fecha': 118,
  'col-desv': 104,
  'col-acc': 92,
}

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())

const esperar = (ms) => p.waitForTimeout(ms)

async function entrarComo(nombre) {
  await p.goto(URL)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await esperar(700)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(900)
}

async function abrirProyecto(nombre) {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(400)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(900)
}

// Estilo efectivo de una cabecera, para comparar tablas entre sí.
const estiloTh = (sel) =>
  p.evaluate((s) => {
    const th = document.querySelector(s)
    if (!th) return null
    const c = getComputedStyle(th)
    return {
      texto: th.textContent.trim(),
      alineacion: c.textAlign,
      mayusculas: th.innerText.trim(),
      transformacion: c.textTransform,
      peso: c.fontWeight,
      familia: c.fontFamily,
    }
  }, sel)

// ── C1 · Como administrador, la última columna dice "Acciones" ──────────────
await entrarComo('Daniela Vera')
await abrirProyecto('Plan PGP Arauco')

// La pantalla tiene una tabla por sub frente: se mide la primera para las
// cabeceras, y TODAS para comprobar que ninguna columna cambió de ancho.
const cabeceras = await p.evaluate(() =>
  [...document.querySelector('table.tareas').querySelectorAll('thead th')].map((th) => ({
    clase: th.className,
    // `textContent` es la palabra escrita; `innerText` la devuelve ya en
    // mayúsculas, porque el estilo compartido de las cabeceras las transforma.
    texto: th.textContent.trim(),
    ancho: +th.getBoundingClientRect().width.toFixed(1),
    desborda: th.scrollWidth > th.clientWidth + 1,
  })),
)
const anchosTodos = await p.evaluate(() =>
  [...document.querySelectorAll('table.tareas thead th')].map((th) => ({
    clase: th.className,
    ancho: +th.getBoundingClientRect().width.toFixed(1),
  })),
)
const acc = cabeceras.at(-1)
chk(acc?.clase === 'col-acc', 'C1 la última columna de la tabla del proyecto es la de acciones', `clase="${acc?.clase}"`)
chk(acc?.texto === 'Acciones', 'C1 la última columna dice "Acciones"', `texto="${acc?.texto}"`)
chk(!acc?.desborda, 'C1 el título entra en la columna, sin desbordarla')

// ── C2 · Mismo título y mismo estilo que en las tablas de administración ────
const estiloProyecto = await estiloTh('table.tareas thead th.col-acc')

await p.getByText('Usuarios', { exact: true }).first().click()
await esperar(900)
const estiloUsuarios = await estiloTh('.usuarios-tabla thead th.col-acc')

await p.getByText('Admin Proyectos', { exact: true }).first().click().catch(async () => {
  await p.locator('.nav-frente', { hasText: /Proyectos/ }).last().click()
})
await esperar(900)
const estiloAdminProy = await estiloTh('.usuarios-tabla thead th.col-acc')

const mismo = (a, b2) =>
  !!a && !!b2 && a.texto === b2.texto && a.mayusculas === b2.mayusculas &&
  a.alineacion === b2.alineacion && a.transformacion === b2.transformacion &&
  a.peso === b2.peso && a.familia === b2.familia

chk(estiloProyecto?.texto === 'Acciones' && estiloUsuarios?.texto === 'Acciones',
    'C2 misma palabra que administración de usuarios',
    `proyecto="${estiloProyecto?.texto}" usuarios="${estiloUsuarios?.texto}"`)
chk(mismo(estiloProyecto, estiloUsuarios),
    'C2 mismo estilo y alineación que administración de usuarios',
    JSON.stringify({ proyecto: estiloProyecto, usuarios: estiloUsuarios }))
chk(mismo(estiloProyecto, estiloAdminProy),
    'C2 mismo estilo y alineación que administración de proyectos',
    JSON.stringify({ adminProyectos: estiloAdminProy }))

// ── C4 · Ninguna cabecera cambió de texto ni de ancho ───────────────────────
const textosEsperados = ['Hecha', 'Tarea', 'Resp.', 'Estado', 'Fecha Objetivo', 'Atraso', 'Acciones']
chk(
  JSON.stringify(cabeceras.map((c) => c.texto)) === JSON.stringify(textosEsperados),
  'C4 las demás cabeceras quedan intactas',
  JSON.stringify(cabeceras.map((c) => c.texto)),
)
const desviaciones = anchosTodos
  .map((c) => ({ clase: c.clase, ancho: c.ancho, esperado: ANCHOS_ESPERADOS[c.clase] }))
  .filter((c) => c.esperado === undefined || Math.abs(c.ancho - c.esperado) > 0.5)
chk(desviaciones.length === 0, 'C4 ninguna columna cambió de ancho', JSON.stringify(desviaciones))

// ── C3 · El cliente sin permisos sobre tareas no ve la columna ──────────────
await entrarComo('Cliente Arauco')
await abrirProyecto('Plan PGP Arauco')
const delCliente = await p.evaluate(() =>
  [...document.querySelector('table.tareas').querySelectorAll('thead th')].map((th) => th.className),
)
chk(!delCliente.includes('col-acc'), 'C3 el cliente sin permisos no ve la columna de acciones', JSON.stringify(delCliente))
chk(
  !(await p.locator('table.tareas thead th', { hasText: 'Acciones' }).count()),
  'C3 el cliente sin permisos tampoco ve el título',
)

// ── Mobile · el título es de escritorio; en 390px la columna sigue sin él ───
// En mobile la columna mide 26px y solo lleva el ⓘ: "Acciones" no cabe y se
// cortaba contra el borde de la tabla. Decisión del dueño: sin encabezado ahí,
// como estaba. Lo que se comprueba es que nada desborde y que el ancho y el
// alto de la fila de cabeceras sigan siendo los de antes del cambio.
const movil = await b.newContext({ viewport: { width: 390, height: 844 } })
const pm = await movil.newPage()
pm.on('dialog', (d) => d.accept())
await pm.goto(URL)
await pm.evaluate(() => localStorage.clear())
await pm.reload()
await pm.waitForTimeout(700)
await pm.getByText('Daniela Vera', { exact: true }).click()
await pm.waitForTimeout(900)
const btMenu = pm.locator('.topbar__menu, .btn-menu, button[aria-label*="men"]').first()
if (await btMenu.count()) {
  await btMenu.click()
  await pm.waitForTimeout(400)
}
await pm.getByText('Resumen', { exact: true }).first().click()
await pm.waitForTimeout(400)
await pm.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
await pm.waitForTimeout(900)

const enMovil = await pm.evaluate(() => {
  const t = document.querySelector('table.tareas')
  const th = t.querySelector('thead th.col-acc')
  return {
    ancho: +th.getBoundingClientRect().width.toFixed(1),
    desborda: th.scrollWidth > th.clientWidth + 1,
    // Ancho REAL que ocupa el texto en pantalla: 0 = no se ve. Se mide con un
    // rango sobre el nodo de texto, así da igual cómo se oculte.
    anchoTexto: (() => {
      const r = document.createRange()
      r.selectNodeContents(th)
      return +r.getBoundingClientRect().width.toFixed(1)
    })(),
    altoCabeceras: +t.querySelector('thead tr').getBoundingClientRect().height.toFixed(1),
  }
})
chk(!enMovil.desborda, 'Mobile: el encabezado de acciones no desborda su celda', JSON.stringify(enMovil))
chk(enMovil.anchoTexto === 0, 'Mobile: la columna de acciones sigue sin encabezado visible, como antes', `anchoTexto=${enMovil.anchoTexto}`)
chk(enMovil.ancho === 26, 'Mobile: la columna conserva sus 26px', `ancho=${enMovil.ancho}`)
chk(enMovil.altoCabeceras === 25.8, 'Mobile: la fila de cabeceras conserva su alto', `alto=${enMovil.altoCabeceras}`)

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #298 — la columna de acciones tiene título')
