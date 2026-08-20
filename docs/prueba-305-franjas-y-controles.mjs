// #305 y #305b — Tres franjas sobre la grilla y una barra de cuatro controles.
//
// Lo que se comprueba de verdad, criterio por criterio del pedido: que sobre la
// grilla no queden cinco franjas sino tres, que la altura sobre el contenido no
// cambie ni al filtrar ni al ordenar ni al cambiar de vista, y que cada control
// haga exactamente lo que reemplazó.
//
// Controles negativos comprobados (con el código anterior a #305):
//   · C1/C2 fallan: existían `.leyenda` y `.gantt-toolbar` como filas propias.
//   · C3 falla: los contadores no cambiaban de muestra ni sumaban la sexta caja.
//   · C4 falla: cada campo era un botón suelto, sin contador total ni ×.
//   · C13 falla: "Guardar vista" era un botón permanente de la barra.
//   · C16 falla: con `flex-wrap: wrap` la barra se partía en dos líneas.
//
// Los criterios de #305b (los ajustes previos a fusionar) van al final, con
// prefijo B. Sus controles negativos, contra la rama antes del ajuste:
//   · B1 falla: los menús partían del mínimo de 244 y crecían con su contenido
//     (Filtrar 244, Rango 280).
//   · B2 falla: las filas de Ordenar medían 5 por 8 contra 8 por 10 del resto,
//     y el círculo de prioridad reservaba 18px aunque estuviera vacío.
//   · B7 falla: los tres iconos estaban en `opacity: 0` hasta pasar el mouse.
//   · B9 falla: "Actualizar vista" iba después de Vistas y lo empujaba.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-305-franjas-y-controles.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
const MARGEN = 8

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })

async function sesion(ancho = 1440, alto = 900) {
  const p = await (await b.newContext({ viewport: { width: ancho, height: alto } })).newPage()
  p.on('dialog', (d) => d.accept())
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await p.waitForTimeout(700)
  await p.getByText('Daniela Vera', { exact: true }).click()
  await p.waitForTimeout(900)
  return p
}

/** En mobile la barra lateral vive tras el botón flotante ☰. */
async function abrirBarra(p) {
  const menu = p.locator('button.movil-menu[aria-label="Abrir menú"]')
  if (await menu.isVisible().catch(() => false)) {
    await menu.click()
    await p.waitForTimeout(400)
  }
}

async function abrirProyecto(p) {
  await abrirBarra(p)
  await p.getByText('Resumen', { exact: true }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
  await p.waitForTimeout(900)
}

const ctrl = (p, nombre) => p.locator('.controles-btn', { hasText: nombre }).first()
const menu = (p) => p.locator('.filtro-menu--portal')

async function abrirCtrl(p, nombre) {
  await ctrl(p, nombre).click()
  await p.waitForTimeout(350)
}
async function cerrarMenu(p) {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(250)
}
// #305b: en Gantt las muestras del filtro de Estado son las marcas de la
// grilla, y el ✓ y la ✕ son texto. Por eso la fila NO se busca por el texto
// completo —"✓Hecha" no calza con /^Hecha$/— sino por su nombre exacto.
const opcion = (pg, nombre) =>
  menu(pg).locator('.filtro-op--check').filter({ has: pg.locator(`span:text-is("${nombre}")`) })

async function verVista(p, cual) {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await p.waitForTimeout(900)
}

/** Alto ocupado por todo lo que está SOBRE el contenido de la vista. */
const altoSobreGrilla = (p) =>
  p.evaluate(() => {
    const barra = document.querySelector('.controles-bar')
    const contenido = barra?.parentElement?.querySelector('.gantt-wrap, .tabla-wrap')
    if (!contenido) return null
    return Math.round(contenido.getBoundingClientRect().top + window.scrollY)
  })

// ── C1 · Tres franjas sobre la grilla, no cinco ────────────────────────────
console.log('\n── C1 · Gantt: tres franjas ──')
const p = await sesion()
await abrirProyecto(p)
await verVista(p, 'Gantt')

chk((await p.locator('.leyenda').count()) === 0, 'C1 la leyenda ya no es una fila propia')
chk((await p.locator('.gantt-toolbar, .horizonte').count()) === 0, 'C1 la Gantt no tiene barra propia sobre la grilla')
const franjas = await p.evaluate(() => {
  // Franjas 1 y 2 viven en el encabezado; la 3 es la barra de controles.
  const topbar = document.querySelector('.topbar')
  const barra = document.querySelector('.controles-bar')
  const grilla = document.querySelector('.gantt-wrap')
  if (!topbar || !barra || !grilla) return null
  // Todo lo que se interponga entre la barra y la grilla sería una franja más.
  // La grilla va dentro del contenedor de la vista, así que ese contenedor no
  // cuenta: lo que se busca son hermanos que NO la contengan.
  const entre = []
  let n = barra.nextElementSibling
  while (n) {
    if (n === grilla || n.contains(grilla)) break
    entre.push(n.className || n.tagName)
    n = n.nextElementSibling
  }
  return { titulo: !!topbar.querySelector('.topbar__title'), contadores: !!topbar.querySelector('.counters'), entre }
})
chk(!!franjas?.titulo && !!franjas?.contadores, 'C1 franja 1 (título) y franja 2 (contadores) están')
chk(franjas?.entre.length === 0, 'C1 entre la barra de controles y la grilla no hay nada más', `sobra: ${franjas?.entre.join(', ')}`)

// ── C2 · Los contadores hacen de leyenda en Gantt ──────────────────────────
console.log('\n── C2 · Seis cajas con las marcas de la grilla ──')
chk((await p.locator('.counters--gantt .counter').count()) === 6, 'C2 en Gantt la fila de contadores tiene seis cajas')
chk((await p.locator('.counter--rastro').innerText()).trim() === 'Fecha anterior', 'C2 la sexta caja es "Fecha anterior"')
chk(
  !/\d/.test(await p.locator('.counter--rastro').innerText()),
  'C2 la sexta caja no lleva número (no es un estado, es un rastro)',
)
const marcas = await p.evaluate(() => {
  const q = (s) => document.querySelector(s)
  const caja = (s) => {
    const e = q(s)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), texto: e.textContent.trim() }
  }
  return {
    hecha: caja('.counters--gantt .mark--hecha'),
    pendiente: caja('.counters--gantt .mark--pendiente'),
    ambar: caja('.counters--gantt .mark--ambar'),
    rojo: caja('.counters--gantt .mark--incumplida'),
    morado: caja('.counters--gantt .mark--incumplida-replan'),
    anterior: caja('.counters--gantt .mark--anterior'),
    swatches: document.querySelectorAll('.counters--gantt .counter__swatch').length,
  }
})
chk(marcas.hecha?.texto === '✓', 'C2 hecha muestra el check verde de la grilla')
chk(marcas.pendiente?.texto === '✕', 'C2 pendiente muestra la equis de la grilla')
chk(!!marcas.ambar && !!marcas.rojo && !!marcas.morado, 'C2 ámbar, rojo y morado son los cuadrados de la grilla')
chk(
  !!marcas.anterior && marcas.anterior.w < marcas.rojo.w,
  'C2 la de fecha anterior es más chica que las otras',
  `anterior=${marcas.anterior?.w}px otras=${marcas.rojo?.w}px`,
)
chk(marcas.swatches === 0, 'C2 en Gantt no quedan muestras de color, son marcas')

// ── C3 · Al pasar a tabla: cinco cajas, sin Rango, misma altura ────────────
console.log('\n── C3 · Tabla: cinco cajas, sin Rango, misma altura ──')
const altoGantt = await altoSobreGrilla(p)
await verVista(p, 'Tabla')
const altoTabla = await altoSobreGrilla(p)
chk((await p.locator('.counter').count()) === 5, 'C3 en tabla la fila de contadores vuelve a cinco cajas')
chk((await p.locator('.counter__swatch').count()) === 5, 'C3 y sus muestras vuelven a ser de color')
chk((await ctrl(p, 'Rango').count()) === 0, 'C3 en tabla la barra pierde el control Rango')
chk(
  Math.abs(altoGantt - altoTabla) <= 1,
  'C3 la altura sobre el contenido no cambia entre las dos vistas',
  `gantt=${altoGantt} tabla=${altoTabla}`,
)
const controlesTabla = await p.locator('.controles-bar .controles-btn').allInnerTexts()
chk(controlesTabla.length === 3, 'C3 en tabla la barra tiene tres controles', controlesTabla.map((t) => t.split('\n')[0]).join(' · '))

// ── C4 · Filtrar: contador, ×, una ficha por campo ─────────────────────────
console.log('\n── C4 · Filtrar ──')
const altoBarra = () => p.locator('.controles-bar').evaluate((e) => Math.round(e.getBoundingClientRect().height))
const altoLimpio = await altoBarra()

await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await p.waitForTimeout(300)
for (const est of ['Atrasada', 'Atrasada replanificada']) {
  await opcion(p, est).click()
  await p.waitForTimeout(200)
}
await menu(p).locator('.filtro-volver').click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op--campo', { hasText: 'Responsable' }).click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op--check').first().click()
await p.waitForTimeout(250)
await menu(p).locator('.filtro-volver').click()
await p.waitForTimeout(350)

const fichas = await menu(p).locator('.filtro-ficha').allInnerTexts()
chk(fichas.length === 2, 'C4 el panel muestra UNA ficha por campo, no por valor', fichas.join(' | '))
chk(
  fichas.some((f) => f.replace(/\s+/g, ' ').includes('Estado: 2')),
  'C4 dos estados elegidos son una sola ficha "Estado: 2"',
  fichas.join(' | '),
)
chk((await ctrl(p, 'Filtrar').locator('.controles-btn__n').innerText()) === '3', 'C4 el botón suma los valores de todos los campos')
await cerrarMenu(p)
const altoConFiltro = await altoBarra()
chk(altoConFiltro === altoLimpio, 'C4 la barra no crece ni cambia de alto al filtrar', `${altoLimpio} → ${altoConFiltro}`)
chk((await p.locator('.controles-ctrl--conx .controles-x').count()) >= 1, 'C4 con filtro puesto aparece la × del control')

// La × de UNA ficha limpia ese campo entero y deja el otro.
await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-ficha', { hasText: 'Estado' }).locator('.filtro-ficha__x').click()
await p.waitForTimeout(350)
const trasFicha = await menu(p).locator('.filtro-ficha').allInnerTexts()
chk(
  trasFicha.length === 1 && trasFicha[0].includes('Responsable'),
  'C4 la × de una ficha limpia ese campo entero y deja el otro',
  trasFicha.join(' | '),
)
await cerrarMenu(p)
await p.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x').click()
await p.waitForTimeout(400)
chk((await ctrl(p, 'Filtrar').locator('.controles-btn__n').count()) === 0, 'C4 la × del botón limpia todos los filtros')

// ── C5 · Seleccionar todos sigue; "Limpiar filtro" ya no ───────────────────
console.log('\n── C5 · Seleccionar todos / sin "Limpiar filtro" ──')
for (const campo of ['Responsable', 'Estado']) {
  await abrirCtrl(p, 'Filtrar')
  await menu(p).locator('.filtro-op--campo', { hasText: campo }).click()
  await p.waitForTimeout(300)
  const txt = await menu(p).innerText()
  chk(txt.includes('Seleccionar todos'), `C5 ${campo} conserva "Seleccionar todos"`)
  chk(!txt.includes('Limpiar filtro'), `C5 ${campo} ya no tiene "Limpiar filtro" adentro`)
  await menu(p).locator('.filtro-op--todos').click()
  await p.waitForTimeout(300)
  chk(
    (await menu(p).innerText()).includes('Deseleccionar todos'),
    `C5 ${campo} alterna a "Deseleccionar todos" con todo marcado`,
  )
  await menu(p).locator('.filtro-op--todos').click()
  await p.waitForTimeout(250)
  await cerrarMenu(p)
}

// ── C6 · El menú de Fecha conserva todo, dos niveles abajo ─────────────────
console.log('\n── C6 · Campo Fecha ──')
await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await p.waitForTimeout(350)
const fecha = await menu(p).innerText()
for (const op of ['Hoy', 'Próximo día hábil', 'Esta semana', 'Próxima semana', 'Este mes', 'Con fecha', 'Sin fecha', 'En horizonte visible']) {
  chk(fecha.includes(op), `C6 el campo Fecha conserva "${op}"`)
}
chk((await menu(p).locator('input[type="date"]').count()) === 2, 'C6 el rango fijo conserva sus dos calendarios')

// Exclusiones: "Con fecha" apaga lo demás y elegir una relativa apaga "Con fecha".
await menu(p).locator('.filtro-op', { hasText: /^Con fecha$/ }).click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
await p.waitForTimeout(300)
let encendidas = await menu(p).locator('.filtro-op--on').allInnerTexts()
chk(
  encendidas.length === 1 && encendidas[0].trim() === 'Sin fecha',
  'C6 "Con fecha" y "Sin fecha" siguen siendo excluyentes',
  encendidas.join(' | '),
)
await menu(p).locator('.filtro-op', { hasText: /^Con fecha$/ }).click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op', { hasText: /^Esta semana$/ }).click()
await p.waitForTimeout(300)
encendidas = await menu(p).locator('.filtro-op--on').allInnerTexts()
chk(
  encendidas.length === 1 && encendidas[0].trim() === 'Esta semana',
  'C6 elegir una relativa apaga "Con fecha"',
  encendidas.join(' | '),
)

// ── C7 · "En horizonte visible" según la vista ─────────────────────────────
console.log('\n── C7 · En horizonte visible ──')
const horizonteOp = () => menu(p).locator('.filtro-op', { hasText: 'En horizonte visible' })
chk(await horizonteOp().isDisabled(), 'C7 desde la tabla aparece apagado')
chk(
  ((await horizonteOp().getAttribute('title')) ?? '').includes('Se activa desde la Gantt'),
  'C7 y con su aviso de por qué',
)
await cerrarMenu(p)
await p.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x').click()
await p.waitForTimeout(350)
await verVista(p, 'Gantt')
await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await p.waitForTimeout(350)
chk(!(await horizonteOp().isDisabled()), 'C7 desde la Gantt se puede activar')

// ── C11 · Con "En horizonte visible" el grupo Horizonte sigue elegible ─────
console.log('\n── C10 y C11 · el tercer estado del grupo Horizonte ──')
await horizonteOp().click()
await p.waitForTimeout(600)
await cerrarMenu(p)
await abrirCtrl(p, 'Rango')
let rangoTxt = await menu(p).innerText()
chk(!rangoTxt.includes('Horizonte definido por el filtro'), 'C11 con "En horizonte visible" el grupo Horizonte sigue elegible')
chk(
  !(await menu(p).locator('.filtro-op', { hasText: 'Alrededor de hoy' }).isDisabled()),
  'C11 y sus dos opciones se pueden tocar',
)
await cerrarMenu(p)

// ── C10 · Con otro filtro de fecha, el grupo queda apagado ─────────────────
await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await p.waitForTimeout(350)
await menu(p).locator('.filtro-op', { hasText: /^Este mes$/ }).click()
await p.waitForTimeout(500)
await cerrarMenu(p)
await abrirCtrl(p, 'Rango')
rangoTxt = await menu(p).innerText()
chk(rangoTxt.includes('Horizonte definido por el filtro de fecha'), 'C10 con filtro de fecha el grupo Horizonte muestra su aviso')
chk(
  (await menu(p).locator('.filtro-op', { hasText: 'Alrededor de hoy' }).isDisabled()) &&
    (await menu(p).locator('.filtro-op', { hasText: 'Todo el proyecto' }).isDisabled()),
  'C10 y sus dos opciones quedan apagadas',
)
chk(
  !(await menu(p).locator('.filtro-op', { hasText: 'Días hábiles' }).isDisabled()),
  'C10 el grupo Días sigue funcionando normal',
)
await cerrarMenu(p)
await p.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x').click()
await p.waitForTimeout(500)
await abrirCtrl(p, 'Rango')
chk(
  !(await menu(p).locator('.filtro-op', { hasText: 'Alrededor de hoy' }).isDisabled()),
  'C10 quitando el filtro vuelve a ser elegible',
)
await cerrarMenu(p)

// ── C9 · El círculo de tareas escondidas ───────────────────────────────────
console.log('\n── C9 · Rango: los grupos y el círculo ──')
await abrirCtrl(p, 'Rango')
const grupos = await menu(p).locator('.filtro-menu__grupo').allInnerTexts()
chk(
  grupos.map((g) => g.trim().toLowerCase()).join('|') === 'días|horizonte',
  'C9 el menú de Rango tiene dos grupos con título: Días y Horizonte',
  grupos.join(' | '),
)
chk((await ctrl(p, 'Rango').locator('.controles-btn__n').count()) === 0, 'C9 Rango no lleva contador')
chk(
  (await p.locator('.controles-ctrl', { hasText: 'Rango' }).locator('.controles-x').count()) === 0,
  'C9 Rango no lleva ×',
)
// Terreno: se planifica una tarea en sábado con la semana completa a la vista.
await menu(p).locator('.filtro-op', { hasText: 'Semana completa' }).click()
await p.waitForTimeout(700)
await cerrarMenu(p)
chk((await p.locator('.controles-punto').count()) === 0, 'C9 con la semana completa no hay nada escondido: sin círculo')
const celda = p.locator('td.celda.finde.celda--planificable').first()
await celda.scrollIntoViewIfNeeded()
await celda.click()
await p.waitForTimeout(800)
await abrirCtrl(p, 'Rango')
await menu(p).locator('.filtro-op', { hasText: 'Días hábiles' }).click()
await p.waitForTimeout(700)
const avisoTxt = await menu(p).innerText()
chk(
  /tarea.* con fecha de fin de semana no se/.test(avisoTxt),
  'C9 el detalle con el número vive al final del grupo Días',
  avisoTxt.split('\n').find((l) => l.includes('fin de semana')) ?? '',
)
const ordenGrupos = await menu(p).evaluate((m) => {
  const hijos = [...m.children].map((e) => e.className)
  return {
    avisoAntesDeHorizonte:
      hijos.findIndex((c) => c.includes('nota--aviso')) < hijos.findIndex((c) => c.includes('__grupo') && false) || true,
    orden: hijos,
  }
})
chk(
  ordenGrupos.orden.findIndex((c) => c.includes('nota--aviso')) <
    ordenGrupos.orden.lastIndexOf(ordenGrupos.orden.filter((c) => c.includes('filtro-menu__grupo')).pop()),
  'C9 el aviso va después de las dos opciones de Días y antes del grupo Horizonte',
)
await cerrarMenu(p)
chk((await p.locator('.controles-btn .controles-punto').count()) === 1, 'C9 con tareas escondidas Rango muestra el círculo')
// Volver a semana completa: el círculo desaparece y las tareas aparecen.
await abrirCtrl(p, 'Rango')
await menu(p).locator('.filtro-op', { hasText: 'Semana completa' }).click()
await p.waitForTimeout(700)
await cerrarMenu(p)
chk((await p.locator('.controles-punto').count()) === 0, 'C9 con semana completa el círculo desaparece')

// ── C8 · Ordenar: contador, × y sumar criterios ────────────────────────────
console.log('\n── C8 · Ordenar ──')
await abrirCtrl(p, 'Ordenar')
const campos = menu(p).locator('.orden-campo')
await campos.nth(0).locator('.orden-campo__dir').first().click()
await p.waitForTimeout(250)
await campos.nth(1).locator('.orden-campo__dir').first().click()
await p.waitForTimeout(250)
await cerrarMenu(p)
chk((await ctrl(p, 'Ordenar').locator('.controles-btn__n').innerText()) === '2', 'C8 con dos criterios el botón muestra 2')
chk(
  (await p.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).locator('.controles-x').count()) === 1,
  'C8 y aparece su ×',
)
await abrirCtrl(p, 'Ordenar')
await campos.nth(2).locator('.orden-campo__dir').first().click()
await p.waitForTimeout(300)
const prios = (await menu(p).locator('.orden-campo--activo .orden-campo__prio').allInnerTexts()).map((s) => s.trim()).sort()
chk(prios.join(',') === '1,2,3', 'C8 se agrega un tercero sin borrar los anteriores y se renumeran', prios.join(','))
await cerrarMenu(p)
await p.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).locator('.controles-x').click()
await p.waitForTimeout(350)
chk((await ctrl(p, 'Ordenar').locator('.controles-btn__n').count()) === 0, 'C8 la × limpia el orden entero')

// ── C13 · Guardar vista vive dentro del menú ───────────────────────────────
console.log('\n── C12 y C13 · Vistas ──')
chk(
  (await p.locator('.controles-bar').getByText('Guardar vista').count()) === 0,
  'C13 no queda ningún botón de guardar en la barra',
)
await abrirCtrl(p, 'Vistas')
chk(await menu(p).locator('.filtro-op--guardar').isDisabled(), 'C13 sin filtro ni orden, "Guardar vista" está apagado')
chk(
  ((await menu(p).locator('.filtro-op--guardar').getAttribute('title')) ?? '').includes('Arma un filtro'),
  'C13 y con el aviso que explica por qué',
)
await cerrarMenu(p)

await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await p.waitForTimeout(300)
await opcion(p, 'Atrasada').click()
await p.waitForTimeout(300)
await cerrarMenu(p)
await abrirCtrl(p, 'Vistas')
chk(!(await menu(p).locator('.filtro-op--guardar').isDisabled()), 'C13 con filtro puesto se habilita')
await menu(p).locator('.filtro-op--guardar').click()
await p.waitForTimeout(400)
await p.locator('.modal-card input').first().fill('Solo atrasadas')
await p.getByRole('button', { name: 'Guardar', exact: true }).click()
await p.waitForTimeout(700)

chk(
  (await ctrl(p, 'Vistas').innerText()).includes('Solo atrasadas'),
  'C12 con una vista activa el botón muestra su nombre',
  (await ctrl(p, 'Vistas').innerText()).replace('\n', ' '),
)
chk(
  (await p.locator('.controles-ctrl--vistas .controles-x').count()) === 1,
  'C12 y aparece su × solo cuando hay vista activa',
)
// Modificarla: aparece el asterisco y la × sigue.
await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await p.waitForTimeout(300)
await opcion(p, 'Hecha').click()
await p.waitForTimeout(350)
await cerrarMenu(p)
chk((await ctrl(p, 'Vistas').innerText()).includes('*'), 'C12 al modificarla aparece el asterisco')
chk((await p.locator('.controles-ctrl--vistas .controles-x').count()) === 1, 'C12 y la × sigue ahí')
// La × sale de la vista y deja todo limpio, sin confirmación.
await p.locator('.controles-ctrl--vistas .controles-x').click()
await p.waitForTimeout(500)
const trasSalir = await ctrl(p, 'Vistas').innerText()
chk(trasSalir.includes('(1)') && !trasSalir.includes('Solo atrasadas'), 'C12 la × sale de la vista', trasSalir.replace('\n', ' '))
chk((await ctrl(p, 'Filtrar').locator('.controles-btn__n').count()) === 0, 'C12 y deja todo limpio')
chk((await p.locator('.controles-ctrl--vistas .controles-x').count()) === 0, 'C12 sin vista activa no hay ×')

// Renombrar y eliminar siguen funcionando desde el mismo menú.
await abrirCtrl(p, 'Vistas')
chk((await menu(p).locator('.filtro-guardado .icon-btn').count()) === 3, 'C13 cada vista conserva actualizar, renombrar y eliminar')
await menu(p).locator('.filtro-guardado .icon-btn').nth(2).click()
await p.waitForTimeout(600)
chk((await p.locator('.filtro-guardado').count()) === 0, 'C13 eliminar (con confirmación) sigue funcionando')

// ── C14 · "Actualizar vista" pegado a la derecha ───────────────────────────
console.log('\n── C14 · Actualizar vista ──')
await verVista(p, 'Tabla')
await abrirCtrl(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await p.waitForTimeout(300)
await opcion(p, 'Pendiente').click()
await p.waitForTimeout(350)
await cerrarMenu(p)
// Una edición que saca la tarea del filtro deja la foto vieja.
const check = p.locator('table.tareas tbody .check-hecha, table.tareas tbody input[type="checkbox"]').first()
await check.click()
await p.waitForTimeout(900)
const actualizar = p.locator('.controles-btn--actualizar')
if (await actualizar.count()) {
  // #305b: pasó a la IZQUIERDA de Vistas, para que Vistas no se mueva al
  // aparecer. Sigue siendo el único elemento que aparece y desaparece.
  const pegado = await p.evaluate(() => {
    const barra = document.querySelector('.controles-bar')
    const btn = document.querySelector('.controles-btn--actualizar')
    const vistas = document.querySelector('.controles-ctrl--vistas')
    const rb = barra.getBoundingClientRect()
    return {
      hueco: Math.round(rb.right - vistas.getBoundingClientRect().right),
      antesDeVistas: Math.round(btn.getBoundingClientRect().right) <= Math.round(vistas.getBoundingClientRect().left),
    }
  })
  chk(pegado.antesDeVistas, 'C14 "Actualizar vista" va justo a la izquierda de Vistas')
  chk(pegado.hueco <= 24, 'C14 y Vistas queda pegado al extremo derecho', `hueco=${pegado.hueco}px`)
  chk(
    (await p.locator('.controles-ctrl--vistas .controles-x').count()) === 0,
    'C14 aparece sin ninguna vista guardada activa: basta un filtro puesto',
  )
  await actualizar.click()
  await p.waitForTimeout(700)
  chk((await p.locator('.controles-btn--actualizar').count()) === 0, 'C14 tocarlo recalcula y desaparece')
} else {
  chk(false, 'C14 la edición no dejó la foto desactualizada: no se pudo comprobar')
}

// ── C16 · Ventana angosta, con todo aplicado: una sola línea ───────────────
console.log('\n── C16 · La barra no se parte en dos líneas ──')
for (const W of [320, 360, 390, 768, 1024]) {
  const q = await sesion(W, 844)
  await abrirProyecto(q)
  if (W >= 769) await verVista(q, 'Gantt')
  // Todo aplicado: filtros, orden y una vista guardada activa.
  await abrirCtrl(q, 'Filtrar')
  await menu(q).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
  await q.waitForTimeout(300)
  await menu(q).locator('.filtro-op--todos').click()
  await q.waitForTimeout(300)
  await cerrarMenu(q)
  await abrirCtrl(q, 'Ordenar')
  await menu(q).locator('.orden-campo').nth(0).locator('.orden-campo__dir').first().click()
  await q.waitForTimeout(250)
  await menu(q).locator('.orden-campo').nth(1).locator('.orden-campo__dir').first().click()
  await q.waitForTimeout(250)
  await cerrarMenu(q)
  const linea = await q.evaluate(() => {
    const barra = document.querySelector('.controles-bar')
    const hijos = [...barra.children].filter((e) => e.getBoundingClientRect().width > 0)
    // Los controles se centran verticalmente, así que el borde superior de dos
    // cajas de distinto alto no coincide aunque estén en la misma línea: lo que
    // identifica una línea es el CENTRO.
    const tops = hijos.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2) })
    const der = Math.round(barra.getBoundingClientRect().right)
    const desbordes = hijos.filter((e) => Math.round(e.getBoundingClientRect().right) > der + 1).length
    // El separador es un hueco elástico sin alto: no es un control.
    const altos = hijos
      .filter((e) => !e.classList.contains('controles-bar__sep'))
      .map((e) => Math.round(e.getBoundingClientRect().height))
    return { lineas: new Set(tops).size, n: hijos.length, desbordes, altos: [...new Set(altos)], alto: Math.round(barra.getBoundingClientRect().height) }
  })
  chk(linea.lineas === 1, `C16 ${W}px · la barra queda en una sola línea`, `${linea.n} elementos en ${linea.lineas} línea(s), alto=${linea.alto}`)
  chk(linea.desbordes === 0, `C16 ${W}px · ningún control se sale de la barra`)
  chk(linea.altos.length === 1, `C16 ${W}px · todos los controles miden lo mismo de alto`, `altos=${linea.altos.join(', ')}`)
  if (W === 320) {
    // C17 · los menús siguen dentro de la pantalla, como quedó en #310.
    for (const nombre of ['Filtrar', 'Ordenar', 'Vistas']) {
      await abrirCtrl(q, nombre)
      const caja = await q.evaluate(() => {
        const m = document.querySelector('.filtro-menu--portal')
        if (!m) return null
        const r = m.getBoundingClientRect()
        return { izq: +r.left.toFixed(1), der: +r.right.toFixed(1), arriba: +r.top.toFixed(1), abajo: +r.bottom.toFixed(1), w: window.innerWidth, h: window.innerHeight }
      })
      chk(
        caja && caja.izq >= MARGEN - 0.5 && caja.der <= caja.w - MARGEN + 0.5 && caja.arriba >= -0.5 && caja.abajo <= caja.h + 0.5,
        `C17 320px · el menú "${nombre}" no se sale de la pantalla`,
        caja ? `izq=${caja.izq} der=${caja.der}/${caja.w}` : 'sin menú',
      )
      // Y el segundo nivel de Filtrar tampoco, que es contenido nuevo.
      if (nombre === 'Filtrar') {
        await menu(q).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
        await q.waitForTimeout(400)
        const c2 = await q.evaluate(() => {
          const m = document.querySelector('.filtro-menu--portal')
          const r = m.getBoundingClientRect()
          return { izq: +r.left.toFixed(1), der: +r.right.toFixed(1), w: window.innerWidth }
        })
        chk(
          c2.izq >= MARGEN - 0.5 && c2.der <= c2.w - MARGEN + 0.5,
          'C17 320px · el segundo nivel de Filtrar tampoco se sale',
          `izq=${c2.izq} der=${c2.der}/${c2.w}`,
        )
      }
      await cerrarMenu(q)
    }
  }
  await q.context().close()
}

// ── C15 · Mis Tareas se comporta igual ─────────────────────────────────────
console.log('\n── C15 · Mis Tareas ──')
const mt = await sesion()
await abrirBarra(mt)
await mt.getByText('Mis Tareas', { exact: true }).first().click()
await mt.waitForTimeout(900)
const ctrlsMT = (await mt.locator('.controles-bar .controles-btn').allInnerTexts()).map((t) => t.split('\n')[0].trim())
chk(ctrlsMT.join(' · ') === 'Filtrar · Ordenar · Vistas', 'C15 en la tabla de Mis Tareas hay tres controles', ctrlsMT.join(' · '))
await abrirCtrl(mt, 'Filtrar')
const camposMT = (await menu(mt).locator('.filtro-op--campo .filtro-op__nombre').allInnerTexts()).map((t) => t.trim())
chk(camposMT.join(' · ') === 'Fecha · Proyecto · Estado', 'C15 con Proyecto entre los campos de Filtrar', camposMT.join(' · '))
await menu(mt).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await mt.waitForTimeout(350)
chk(
  !(await menu(mt).innerText()).includes('En horizonte visible'),
  'C7 en Mis Tareas "En horizonte visible" no aparece',
)
await cerrarMenu(mt)
await verVista(mt, 'Gantt')
const ctrlsMTG = (await mt.locator('.controles-bar .controles-btn').allInnerTexts()).map((t) => t.split('\n')[0].trim())
chk(ctrlsMTG.join(' · ') === 'Filtrar · Ordenar · Rango · Vistas', 'C15 en su Gantt aparece Rango', ctrlsMTG.join(' · '))
await abrirCtrl(mt, 'Rango')
chk(
  (await menu(mt).innerText()).includes('Todas mis tareas'),
  'C15 y el horizonte de su Gantt dice "Todas mis tareas"',
)
await cerrarMenu(mt)

// ═══════════════════════════════════════════════════════════════════════════
// #305b — Ajustes previos a fusionar
// ═══════════════════════════════════════════════════════════════════════════

const q = await sesion()
await abrirProyecto(q)
await verVista(q, 'Gantt')

// ── B1 · Los menús no cambian de ancho entre sí ────────────────────────────
console.log('\n── B1 · Ancho fijo de los menús de la barra ──')
const anchos = {}
for (const nombre of ['Filtrar', 'Ordenar', 'Rango']) {
  await abrirCtrl(q, nombre)
  anchos[nombre] = await menu(q).evaluate((e) => Math.round(e.getBoundingClientRect().width))
  await cerrarMenu(q)
}
const distintos = [...new Set(Object.values(anchos))]
chk(
  distintos.length === 1 && distintos[0] === 280,
  'B1 Filtrar, Ordenar y Rango abren con la MISMA caja, de 280',
  Object.entries(anchos).map(([k, v]) => `${k}=${v}`).join(' '),
)
// El segundo nivel de Filtrar tampoco cambia el ancho.
await abrirCtrl(q, 'Filtrar')
await menu(q).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await q.waitForTimeout(400)
const anchoNivel2 = await menu(q).evaluate((e) => Math.round(e.getBoundingClientRect().width))
chk(anchoNivel2 === 280, 'B1 el segundo nivel de Filtrar mantiene el ancho', `${anchoNivel2}`)

// ── B4 · "Relativas", en una sola línea ────────────────────────────────────
// El primer título del segundo nivel es el nombre del campo ("Fecha"); el de
// las relativas viene después.
const relativas = await menu(q).evaluate((m) => {
  const titulos = [...m.querySelectorAll('.filtro-menu__grupo')].map((e) => ({
    texto: e.textContent.trim(),
    alto: Math.round(e.getBoundingClientRect().height),
  }))
  return { titulos, hayRecalculan: m.innerText.includes('se recalculan') }
})
// #305b acortó este título a "Relativas" porque "Relativas (se recalculan)" se
// partía en dos líneas. #305c lo eliminó del todo: quedaba pegado al título del
// campo ("FECHA"), dos títulos seguidos. Lo que se comprueba acá es lo que
// sobrevive de #305b —que el paréntesis no volvió— y que ningún título del menú
// se parte en dos líneas. El detalle de #305c va en su propia prueba.
chk(!relativas.hayRecalculan, 'B4 el título ya no lleva el paréntesis "(se recalculan)"')
chk(
  relativas.titulos.every((t) => t.alto <= 26),
  'B4 y ningún título del menú ocupa dos líneas',
  relativas.titulos.map((t) => `${t.texto}=${t.alto}px`).join(' | '),
)
await cerrarMenu(q)

// ── B2 · Ordenar: título, mismo alto de fila y misma sangría ───────────────
console.log('\n── B2 y B3 · El menú Ordenar ──')
await abrirCtrl(q, 'Filtrar')
const refFiltrar = await menu(q).evaluate((m) => {
  const fila = m.querySelector('.filtro-op--campo')
  const nombre = fila.querySelector('.filtro-op__nombre')
  return {
    alto: Math.round(fila.getBoundingClientRect().height),
    sangria: Math.round(nombre.getBoundingClientRect().left - m.getBoundingClientRect().left),
  }
})
await cerrarMenu(q)
await abrirCtrl(q, 'Ordenar')
// #305b le agregó un título a Ordenar porque era el único sin uno; #305d lo
// quitó, junto con el "Campos" de Filtrar: los dos repetían el botón que
// acabas de apretar. Queda parejo igual, por el otro lado. Lo que se comprueba
// acá es lo que de B2 sobrevive —el alto y la sangría de sus filas—; el
// detalle de #305d va en su propia prueba.
const titulosOrden = (await menu(q).locator('.filtro-menu__grupo').allInnerTexts()).map((t) => t.trim())
chk(titulosOrden.length === 0, 'B2 el menú Ordenar no lleva título que repita su botón', titulosOrden.join(' | '))
const refOrden = await menu(q).evaluate((m) => {
  const fila = m.querySelector('.orden-campo')
  const label = fila.querySelector('.orden-campo__label')
  return {
    alto: Math.round(fila.getBoundingClientRect().height),
    sangria: Math.round(label.getBoundingClientRect().left - m.getBoundingClientRect().left),
  }
})
chk(
  refOrden.alto === refFiltrar.alto,
  'B2 sus filas tienen el mismo alto que las de Filtrar',
  `ordenar=${refOrden.alto} filtrar=${refFiltrar.alto}`,
)
chk(
  refOrden.sangria === refFiltrar.sangria,
  'B2 y la misma sangría: el círculo ya no empuja el nombre',
  `ordenar=${refOrden.sangria} filtrar=${refFiltrar.sangria}`,
)

// ── B3 · Las prioridades siguen apareciendo y renumerándose ────────────────
const filasOrden = menu(q).locator('.orden-campo')
await filasOrden.nth(0).locator('.orden-campo__dir').first().click()
await q.waitForTimeout(250)
await filasOrden.nth(1).locator('.orden-campo__dir').first().click()
await q.waitForTimeout(350)
const priosB = await menu(q).locator('.orden-campo__prio').allInnerTexts()
chk(priosB.length === 2, 'B3 con dos criterios hay dos números de prioridad', priosB.join(','))
chk(
  priosB.map((t) => t.trim()).sort().join(',') === '1,2',
  'B3 y el último activado manda: las prioridades se renumeran',
  priosB.join(','),
)
// El nombre no se movió al activar el criterio.
const sangriaTrasActivar = await menu(q).evaluate((m) => {
  const label = m.querySelector('.orden-campo__label')
  return Math.round(label.getBoundingClientRect().left - m.getBoundingClientRect().left)
})
chk(
  sangriaTrasActivar === refOrden.sangria,
  'B3 activar un criterio no corre el nombre de sitio',
  `antes=${refOrden.sangria} después=${sangriaTrasActivar}`,
)
await cerrarMenu(q)
await q.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).locator('.controles-x').click()
await q.waitForTimeout(350)

// ── B5 y B6 · Los dos textos de Rango ──────────────────────────────────────
console.log('\n── B5 y B6 · Los textos de Rango ──')
await abrirCtrl(q, 'Filtrar')
await menu(q).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await q.waitForTimeout(300)
await menu(q).locator('.filtro-op', { hasText: /^Este mes$/ }).click()
await q.waitForTimeout(500)
await cerrarMenu(q)
await abrirCtrl(q, 'Rango')
const nota = (await menu(q).locator('.filtro-menu__nota').innerText()).trim()
chk(nota === 'Horizonte definido por el filtro de fecha', 'B5 la nota del horizonte impuesto es la corta', nota)
await cerrarMenu(q)
await q.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x').click()
await q.waitForTimeout(500)

// Terreno para el aviso: una tarea en sábado, y de vuelta a días hábiles.
await abrirCtrl(q, 'Rango')
await menu(q).locator('.filtro-op', { hasText: 'Semana completa' }).click()
await q.waitForTimeout(700)
await cerrarMenu(q)
const celdaB = q.locator('td.celda.finde.celda--planificable').first()
await celdaB.scrollIntoViewIfNeeded()
await celdaB.click()
await q.waitForTimeout(800)
await abrirCtrl(q, 'Rango')
await menu(q).locator('.filtro-op', { hasText: 'Días hábiles' }).click()
await q.waitForTimeout(700)
const aviso = (await menu(q).locator('.filtro-menu__nota--aviso').innerText()).trim()
chk(!aviso.endsWith('.'), 'B6 el aviso de fin de semana no termina en punto', JSON.stringify(aviso))
await cerrarMenu(q)

// ── B8 · El filtro de Estado sigue la regla de los contadores ──────────────
console.log('\n── B8 · Las dos representaciones del estado ──')
const leerEstado = async (pg) => {
  await abrirCtrl(pg, 'Filtrar')
  await menu(pg).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
  await pg.waitForTimeout(400)
  const r = await menu(pg).evaluate((m) => ({
    marcas: m.querySelectorAll('.mark').length,
    puntos: m.querySelectorAll('.filtro-dot').length,
    nombres: [...m.querySelectorAll('.filtro-op--check span:last-child')].map((e) => e.textContent.trim()),
    altoFila: Math.round(m.querySelector('.filtro-op--check').getBoundingClientRect().height),
  }))
  await cerrarMenu(pg)
  return r
}
const ORDEN_ESTADOS = 'Hecha,Pendiente,Pendiente replanificada,Atrasada,Atrasada replanificada'
const enGantt = await leerEstado(q)
chk(enGantt.marcas === 5 && enGantt.puntos === 0, 'B8 en Gantt el filtro de Estado muestra las marcas de la grilla',
    `${enGantt.marcas} marcas, ${enGantt.puntos} puntos`)
chk(enGantt.nombres.join(',') === ORDEN_ESTADOS, 'B8 con los cinco estados en el orden de siempre', enGantt.nombres.join(','))
await verVista(q, 'Tabla')
const enTabla = await leerEstado(q)
chk(enTabla.puntos === 5 && enTabla.marcas === 0, 'B8 en tabla vuelven los puntos de color',
    `${enTabla.marcas} marcas, ${enTabla.puntos} puntos`)
chk(enTabla.nombres.join(',') === ORDEN_ESTADOS, 'B8 y los cinco estados en el mismo orden', enTabla.nombres.join(','))
chk(
  Math.abs(enGantt.altoFila - enTabla.altoFila) <= 1,
  'B8 las marcas no hacen más alta la fila que los puntos',
  `gantt=${enGantt.altoFila} tabla=${enTabla.altoFila}`,
)

// ── B7 · Los tres iconos de cada vista guardada, siempre visibles ──────────
console.log('\n── B7 · Los iconos de las vistas guardadas ──')
await abrirCtrl(q, 'Filtrar')
await menu(q).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await q.waitForTimeout(300)
await opcion(q, 'Atrasada').click()
await q.waitForTimeout(300)
await cerrarMenu(q)
await abrirCtrl(q, 'Vistas')
await menu(q).locator('.filtro-op--guardar').click()
await q.waitForTimeout(400)
await q.locator('.modal-card input').first().fill('Vista B7')
await q.getByRole('button', { name: 'Guardar', exact: true }).click()
await q.waitForTimeout(800)
// Sin cambios que guardar: se sale de la vista para dejar filtro y orden limpios.
await q.locator('.controles-ctrl--vistas .controles-x').click()
await q.waitForTimeout(500)
await abrirCtrl(q, 'Vistas')
const iconos = await menu(q).evaluate((m) => {
  const fila = m.querySelector('.filtro-guardado')
  return [...fila.querySelectorAll('.icon-btn')].map((e) => ({
    etiqueta: e.getAttribute('aria-label'),
    opacidad: +getComputedStyle(e).opacity,
    apagado: e.disabled,
    aviso: e.getAttribute('data-tip'),
  }))
})
chk(iconos.length === 3, 'B7 la fila tiene los tres iconos', iconos.map((i) => i.etiqueta).join(' · '))
chk(
  iconos.every((i) => i.opacidad > 0),
  'B7 los tres se ven SIN pasar el mouse',
  iconos.map((i) => i.opacidad).join(' '),
)
const actualizarIcono = iconos[0]
chk(actualizarIcono.apagado, 'B7 sin nada que guardar, el de actualizar no responde')
chk(
  Math.abs(actualizarIcono.opacidad - 0.35) < 0.01,
  'B7 y se ve en el tono apagado estándar del producto (.35)',
  `opacidad=${actualizarIcono.opacidad}`,
)
chk(!!actualizarIcono.aviso, 'B7 conservando su aviso al pasar el mouse', actualizarIcono.aviso ?? '')
chk(
  iconos.slice(1).every((i) => Math.abs(i.opacidad - 1) < 0.01 && !i.apagado),
  'B7 renombrar y eliminar se ven enteros y responden',
  iconos.slice(1).map((i) => i.opacidad).join(' '),
)
await cerrarMenu(q)

// ── B9 · "Actualizar vista" a la izquierda de Vistas, que no se mueve ──────
console.log('\n── B9 · Actualizar vista no mueve a Vistas ──')
const izqVistas = () =>
  q.locator('.controles-ctrl--vistas').evaluate((e) => Math.round(e.getBoundingClientRect().left))
await abrirCtrl(q, 'Filtrar')
await menu(q).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await q.waitForTimeout(300)
await opcion(q, 'Pendiente').click()
await q.waitForTimeout(350)
await cerrarMenu(q)
const vistasAntes = await izqVistas()
const checkB = q.locator('table.tareas tbody .check-hecha, table.tareas tbody input[type="checkbox"]').first()
await checkB.click()
await q.waitForTimeout(900)
if (await q.locator('.controles-btn--actualizar').count()) {
  const pos = await q.evaluate(() => {
    const barra = document.querySelector('.controles-bar')
    const btn = document.querySelector('.controles-btn--actualizar')
    const vistas = document.querySelector('.controles-ctrl--vistas')
    return {
      actualizarDer: Math.round(btn.getBoundingClientRect().right),
      vistasIzq: Math.round(vistas.getBoundingClientRect().left),
      vistasDer: Math.round(vistas.getBoundingClientRect().right),
      barraDer: Math.round(barra.getBoundingClientRect().right),
      ultimo: barra.lastElementChild === vistas || barra.lastElementChild.contains(vistas),
    }
  })
  chk(pos.actualizarDer <= pos.vistasIzq, 'B9 "Actualizar vista" queda a la IZQUIERDA de Vistas',
      `actualizar acaba en ${pos.actualizarDer}, Vistas empieza en ${pos.vistasIzq}`)
  chk(pos.ultimo && pos.barraDer - pos.vistasDer <= 24, 'B9 Vistas queda fijo en el extremo derecho',
      `hueco=${pos.barraDer - pos.vistasDer}px`)
  chk(pos.vistasIzq === vistasAntes, 'B9 y Vistas no se movió al aparecer el botón',
      `antes=${vistasAntes} después=${pos.vistasIzq}`)
} else {
  chk(false, 'B9 la edición no dejó la foto desactualizada: no se pudo comprobar')
}

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #305 y #305b — tres franjas, cuatro controles y menús parejos')

