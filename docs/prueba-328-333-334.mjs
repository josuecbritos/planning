// #328 · #333 · #334 — El espacio de la fila de la Gantt, crear con filtro
// puesto, y renombrar desde el menú en la tabla de Mis Tareas.
//
// #328 — La celda de tarea de la Gantt reservaba 44px para dos botones que solo
// aparecen al pasar el mouse. **Lo que eso costaba no eran letras: eran filas**
// —el nombre no se corta, envuelve, así que cada nombre que no cabe sube el
// alto de su fila—. El ⓘ hacía lo mismo que el clic sobre el nombre, y esa
// función ya está en el menú del clic derecho, que llega a todos por igual: se
// va de la fila. El "+" se queda, y su gesto entra ADEMÁS al menú, que en la
// tabla es una capacidad nueva (ahí solo se podía agregar al final).
//
// #333 — Con la vista congelada, la foto solo tiene posición para lo que ya
// estaba cuando se la tomó, así que lo creado caía donde el render lo dejara.
// Entra en la foto justo después de aquello sobre lo que se creó, por el mismo
// camino que ya usa el arrastre al soltar. Los contenedores nacen VACÍOS, y con
// filtro puesto la vista los omite: se muestran por la misma razón que la tarea
// recién creada.
//
// #334 — La tabla de Mis Tareas gana Renombrar sin perder su clic al panel.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-328-333-334.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

// ── Terreno ────────────────────────────────────────────────────────────────
const entrarComo = async (nombre) => {
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await esperar(700)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1000)
}
const abrirProyecto = async (nombre = 'Plan PGP Arauco') => {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(450)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(900)
}
const verVista = async (cual) => {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(1200)
}
const opciones = () => p.locator('.menu-tarea__op').allInnerTexts()
/** Escribe en un campo y guarda con Enter. Devuelve false si el campo no está
 *  —el control negativo deja el terreno distinto—, para que la prueba siga y
 *  reporte TODO en vez de detenerse en el primer paso que depende de él. */
const escribirYGuardar = async (loc, texto, ms = 900) => {
  if ((await loc.count()) === 0) return false
  await loc.first().fill(texto)
  await p.keyboard.press('Enter')
  await esperar(ms)
  return true
}
const crearEnGantt = (nombre) => escribirYGuardar(p.locator('input.crear-inline'), nombre)
const crearEnFilaNueva = (nombre) => escribirYGuardar(p.locator('tr.fila-nueva input.inline-input'), nombre)
/** Pulsa un botón si existe. */
const pulsarSiEsta = async (loc, ms = 400) => {
  if ((await loc.count()) === 0) return false
  await loc.first().click()
  await esperar(ms)
  return true
}
/** Clic derecho sobre una fila; devuelve false si la fila no existe. */
const clicDerechoEn = async (fila) => {
  if ((await fila.count()) === 0) return false
  const celda = fila.locator('td.tarea-cell, td.fija--tarea').first()
  if ((await celda.count()) === 0) return false
  await celda.click({ button: 'right' })
  await esperar(450)
  return true
}
const elegir = async (texto, ms = 700) => {
  const op = p.locator('.menu-tarea__op', { hasText: texto }).first()
  if ((await op.count()) === 0) return false
  await op.click()
  await esperar(ms)
  return true
}
const cerrarMenu = async () => {
  await p.keyboard.press('Escape')
  await esperar(300)
}
/** Filtro de Estado: deja Pendientes y Atrasadas (congela la vista). */
const ponerFiltroEstado = async () => {
  await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
  await esperar(400)
  await p.locator('.filtro-op', { hasText: 'Estado' }).first().click()
  await esperar(400)
  await p.locator('.filtro-op', { hasText: 'Pendiente' }).first().click()
  await esperar(350)
  await p.locator('.filtro-op', { hasText: 'Atrasada' }).first().click()
  await esperar(350)
  await p.keyboard.press('Escape')
  await esperar(500)
}
const hayActualizarVista = async () =>
  (await p.locator('.controles-btn', { hasText: 'Actualizar vista' }).count()) > 0
const actualizarVista = async () => {
  await p.locator('.controles-btn', { hasText: 'Actualizar vista' }).first().click()
  await esperar(800)
}

/** Filas de tarea de la Gantt (las que tienen nombre), con su sub frente. */
const ganttFilas = () =>
  p.evaluate(() => {
    const out = []
    let sub = '?'
    document.querySelectorAll('.gantt tbody tr').forEach((r) => {
      const rot = [...r.querySelectorAll('td.fija--rotula')]
      if (rot.length) sub = rot[rot.length - 1].textContent.trim().replace(/\+$/, '')
      const t = r.querySelector('td.fija--tarea .con-mas .fija-txt')
      if (t) out.push({ sub, titulo: t.textContent.trim() })
    })
    return out
  })
const ganttDe = async (sub) => (await ganttFilas()).filter((x) => x.sub.startsWith(sub)).map((x) => x.titulo)
/** Rótulas de la Gantt (frentes y sub frentes) en el orden en que se dibujan. */
const ganttRotulas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.gantt tbody td.fija--rotula')].map(
      (td) => `${td.className.includes('fija--sf') ? 'S' : 'F'} ${td.textContent.trim().replace(/\+$/, '')}`,
    ),
  )
/** Títulos de la tabla de un sub frente, por su índice. */
const tablaTitulos = (i = 0) =>
  p.evaluate((idx) => {
    const t = document.querySelectorAll('table.tareas')[idx]
    if (!t) return []
    return [...t.querySelectorAll('tbody tr')]
      .map((r) => r.querySelector('.tarea-cell__link, .tarea-cell .inline-text'))
      .filter(Boolean)
      .map((n) => n.textContent.trim())
  }, i)

// ═══════════════════════════════════════════════════════════════════════════
// #328 · 1 · 2 · El ⓘ sale de la fila de la Gantt y el nombre gana ancho
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #328 · 1 y 2 · La celda de tarea de la Gantt ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await verVista('Gantt')

const celda = await p.evaluate(() => {
  const td = document.querySelector('.gantt td.fija--tarea')
  const conMas = td.querySelector('.con-mas')
  const acc = td.querySelector('.con-mas__acciones')
  const cs = getComputedStyle(td)
  const util =
    td.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const gap = parseFloat(getComputedStyle(conMas).gap)
  const accW = acc ? acc.getBoundingClientRect().width : 0
  const filas = [...document.querySelectorAll('.gantt tbody tr')].filter((r) =>
    r.querySelector('td.fija--tarea .con-mas'),
  )
  return {
    tdW: td.getBoundingClientRect().width,
    util,
    accW,
    reservado: acc ? accW + gap : 0,
    paraNombre: util - (acc ? accW + gap : 0),
    botones: acc ? [...acc.querySelectorAll('button')].map((x) => x.getAttribute('aria-label')) : [],
    nFilas: filas.length,
    altoTotal: Math.round(filas.reduce((a, r) => a + r.getBoundingClientRect().height, 0)),
    deDosLineas: filas.filter((r) => r.getBoundingClientRect().height > 36).length,
  }
})
chk(
  !celda.botones.includes('Información'),
  '#328·1 la fila de la Gantt ya no tiene el botón de información',
  celda.botones.join(' · ') || '(ninguno)',
)
chk(
  celda.botones.length === 1 && celda.botones[0] === 'Agregar tarea debajo',
  '#328·1 el "+" se queda, y es lo único que queda',
  celda.botones.join(' · '),
)
// Antes: 240 de columna, 208 útiles, 44 reservados (dos botones de 18 + su
// separación de 2 + los 6 que la separan del nombre) → 164 para el nombre.
chk(
  celda.reservado === 24 && Math.round(celda.paraNombre) === 184,
  '#328·1 el nombre pasa de 164 a 184 de ancho útil',
  `columna ${celda.tdW} · útil ${celda.util} · reservado ${celda.reservado} · nombre ${Math.round(celda.paraNombre)}`,
)
// Medido contra la misma pantalla en `main`: 27 filas, 1048px de alto total y
// 12 de ellas de más de una línea.
chk(
  celda.nFilas === 27 && celda.altoTotal < 1048,
  '#328·2 la grilla ocupa menos alto que antes con las mismas tareas',
  `${celda.nFilas} filas · ${celda.altoTotal}px (en main: 27 filas · 1048px)`,
)
chk(
  celda.deDosLineas < 21,
  '#328·2 hay nombres que pasan de dos líneas a una',
  `${celda.deDosLineas} filas de más de una línea (en main: 21)`,
)

// ═══════════════════════════════════════════════════════════════════════════
// #328 · 3 · 4 · 5 · El menú de la Gantt y el clic sobre el nombre
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #328 · 3 a 5 · El menú en la Gantt ──')
const filaGantt = (titulo) =>
  p.locator('.gantt tbody tr', { has: p.locator('td.fija--tarea .con-mas') }).filter({ hasText: titulo }).first()
const PRIMERA_G = (await ganttFilas())[0].titulo

await clicDerechoEn(filaGantt(PRIMERA_G))
const opsGantt = await opciones()
chk(
  // #273 sumó "Duplicar" junto a "Agregar tarea debajo": el contrato crece, y la
  // línea separadora sigue sin moverse de sitio.
  JSON.stringify(opsGantt) ===
    JSON.stringify(['Información', 'Renombrar', 'Agregar tarea debajo', 'Duplicar', 'Archivar', 'Eliminar']),
  '#328·3 el menú de la Gantt abre con SEIS opciones, en su orden',
  opsGantt.join(' · '),
)
chk(
  (await p.locator('.menu-tarea__linea').count()) === 1,
  '#328·3 sigue habiendo UNA sola línea separadora, y "Agregar" queda arriba de ella',
)
await elegir('Información')
chk(
  (await p.locator('.task-panel, .panel-detalle').count()) > 0,
  '#328·3 Información sigue llevando al panel de detalle',
)
await p.keyboard.press('Escape')
await esperar(500)

// 4 · quien puede editar títulos: el clic sobre el nombre sigue editándolo.
// Dos cuidados acá. La fila de la PRIMERA tarea lleva también las celdas-rótula
// del frente y del sub frente, y esos nombres también son editables: hay que
// apuntar al nombre de la TAREA. Y la fila NO se puede volver a buscar por su
// texto después del clic: en edición el título vive en el `value` del input y
// deja de ser texto de la fila, así que el localizador ya no la encontraría.
const filaPrimera = p.locator('.gantt tbody tr', { has: p.locator('td.fija--tarea .con-mas') }).first()
await pulsarSiEsta(filaPrimera.locator('td.fija--tarea .inline-text'))
chk(
  (await filaPrimera.locator('td.fija--tarea input.inline-input').count()) > 0,
  '#328·4 con permiso de editar títulos, el clic sobre el nombre lo sigue editando',
)
await p.keyboard.press('Escape')
await esperar(400)

// ═══════════════════════════════════════════════════════════════════════════
// #328 · 7 · 8 · Crear desde el "+" y desde el menú, en la Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #328 · 7 y 8 · Crear en la Gantt ──')
const SUB_A = 'Procesos Comerciales'
const antesA = await ganttDe(SUB_A)
// 7 · el "+" de la fila.
const fila2 = filaGantt(antesA[1])
await fila2.locator('td.fija--tarea').hover()
await esperar(250)
await pulsarSiEsta(fila2.locator('button[aria-label="Agregar tarea debajo"]'))
await crearEnGantt('G-mas')
const trasMas = await ganttDe(SUB_A)
chk(
  trasMas[2] === 'G-mas',
  '#328·7 el "+" de la Gantt sigue creando la tarea justo debajo',
  trasMas.slice(0, 4).join(' · '),
)
// 8 · la misma posición desde el menú.
await clicDerechoEn(filaGantt(antesA[0]))
await elegir('Agregar tarea debajo', 400)
await crearEnGantt('G-menu')
const trasMenu = await ganttDe(SUB_A)
chk(
  trasMenu[1] === 'G-menu',
  '#328·8 "Agregar tarea debajo" del menú hace lo mismo que el "+"',
  trasMenu.slice(0, 4).join(' · '),
)

// ═══════════════════════════════════════════════════════════════════════════
// #328 · 9 · 10 · 11 · La tabla: insertar en el medio, "+ Tarea", acciones
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #328 · 9 a 11 · El menú en la tabla ──')
await verVista('Tabla')
const filaTabla = (titulo) => p.locator('table.tareas tbody tr', { hasText: titulo }).first()
const antesT = await tablaTitulos(0)

await clicDerechoEn(filaTabla(antesT[1]))
const opsTabla = await opciones()
chk(
  JSON.stringify(opsTabla) ===
    JSON.stringify(['Información', 'Renombrar', 'Agregar tarea debajo', 'Duplicar', 'Archivar', 'Eliminar']),
  '#328·9 el menú de la tabla muestra las mismas seis opciones',
  opsTabla.join(' · '),
)
await elegir('Agregar tarea debajo', 500)
const posFila = await p.evaluate(() => {
  const t = document.querySelector('table.tareas')
  return [...t.querySelectorAll('tbody tr')].findIndex((r) => r.className.includes('fila-nueva'))
})
chk(
  posFila === 2,
  '#328·9 la fila de carga se abre JUSTO debajo de esa tarea, no al final',
  `índice ${posFila} (la tarea elegida es la 1)`,
)
await crearEnFilaNueva('T-insertada')
const trasInsertar = await tablaTitulos(0)
chk(
  trasInsertar[2] === 'T-insertada',
  '#328·9 al guardarla, la tarea queda en esa posición',
  trasInsertar.slice(0, 4).join(' · '),
)
chk(
  (await p.locator('tr.fila-nueva').count()) === 0,
  '#328·9 insertando NO se encadena: la fila se cierra al guardar',
)
// 10 · la línea "+ Tarea" del final sigue igual.
await pulsarSiEsta(p.locator('table.tareas').first().locator('.fila-add button', { hasText: '+ Tarea' }))
await crearEnFilaNueva('T-alfinal')
const trasFinal = await tablaTitulos(0)
chk(
  trasFinal[trasFinal.length - 1] === 'T-alfinal',
  '#328·10 la línea "+ Tarea" sigue dejando la tarea al final del sub frente',
  trasFinal.slice(-3).join(' · '),
)
chk(
  (await p.locator('tr.fila-nueva').count()) > 0,
  '#328·10 y desde "+ Tarea" sí se encadena, como siempre',
)
await p.keyboard.press('Escape')
await esperar(400)
// 11 · la columna de acciones no se toca.
const acciones = await p.evaluate(() => {
  const td = document.querySelector('table.tareas tbody tr td.col-acc')
  return td ? [...td.querySelectorAll('button')].map((x) => x.textContent.trim()) : []
})
chk(
  acciones.length === 3 && acciones.includes('ⓘ'),
  '#328·11 la columna de acciones de la tabla sigue con sus tres botones, ⓘ incluido',
  acciones.join(' '),
)

// ═══════════════════════════════════════════════════════════════════════════
// #328 · 12 · Mis Tareas no ofrece "Agregar tarea debajo"
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #328 · 12 · Mis Tareas ──')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(1200)
await clicDerechoEn(p.locator('table.tareas tbody tr').first())
const opsMT = await opciones()
chk(
  !opsMT.includes('Agregar tarea debajo'),
  '#328·12 la tabla de Mis Tareas NO muestra "Agregar tarea debajo"',
  opsMT.join(' · '),
)
await cerrarMenu()
await verVista('Gantt')
await clicDerechoEn(p.locator('.gantt tbody tr', { has: p.locator('td.fija--tarea .con-mas') }).first())
const opsMTG = await opciones()
chk(
  !opsMTG.includes('Agregar tarea debajo') && opsMTG.includes('Renombrar'),
  '#328·12 la Gantt de Mis Tareas tampoco, y el resto se comporta igual',
  opsMTG.join(' · '),
)
await cerrarMenu()

// ═══════════════════════════════════════════════════════════════════════════
// #334 · Renombrar en la tabla de Mis Tareas
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #334 · Renombrar en la tabla de Mis Tareas ──')
await verVista('Tabla')
const filaMT = p.locator('table.tareas tbody tr').first()
const nombreMT = (await filaMT.locator('.tarea-cell__link').innerText()).trim()
await clicDerechoEn(filaMT)
chk((await opciones()).includes('Renombrar'), '#334·1 el menú de la tabla de Mis Tareas muestra Renombrar')
chk(
  (await p.locator('.menu-tarea__linea').count()) === 1,
  '#334·8 y la línea separadora sigue quedando solo entre Renombrar y Archivar',
)
await elegir('Renombrar', 500)
chk(
  (await filaMT.locator('input.inline-input').count()) > 0,
  '#334·2 elegirlo deja el nombre en modo edición EN SU CELDA',
)
// Escape cancela.
if ((await filaMT.locator('input.inline-input').count()) > 0) {
  await filaMT.locator('input.inline-input').fill('NO-DEBE-QUEDAR')
}
await p.keyboard.press('Escape')
await esperar(500)
chk(
  (await filaMT.locator('.tarea-cell__link').innerText()).trim() === nombreMT,
  '#334·2 Escape cancela y el nombre vuelve al anterior',
  nombreMT,
)
// Enter guarda.
await clicDerechoEn(filaMT)
await elegir('Renombrar', 500)
await escribirYGuardar(filaMT.locator('input.inline-input'), 'MT renombrada', 800)
chk(
  (await filaMT.locator('.tarea-cell__link').innerText()).trim() === 'MT renombrada',
  '#334·2 Enter guarda y el nuevo nombre queda',
)
// 4 · el clic sobre el nombre sigue abriendo el panel, no la edición.
await pulsarSiEsta(filaMT.locator('.tarea-cell__link'), 700)
const panelAbierto = (await p.locator('.task-panel, .panel-detalle').count()) > 0
const editando = (await filaMT.locator('input.inline-input').count()) > 0
chk(
  panelAbierto && !editando,
  '#334·4 el clic sobre el nombre sigue abriendo el panel, no la edición',
  `panel ${panelAbierto ? 'sí' : 'no'} · edición ${editando ? 'sí' : 'no'}`,
)
await p.keyboard.press('Escape')
await esperar(500)
// 3 · el nombre cambiado se ve igual en el proyecto de esa tarea.
await abrirProyecto()
chk(
  (await p.locator('table.tareas .tarea-cell__link, table.tareas .inline-text', { hasText: 'MT renombrada' }).count()) > 0,
  '#334·3 el nombre cambiado se ve igual en el proyecto de esa tarea',
)
await verVista('Gantt')
chk(
  (await p.locator('.gantt td.fija--tarea', { hasText: 'MT renombrada' }).count()) > 0,
  '#334·3 y también en su Gantt',
)

// ═══════════════════════════════════════════════════════════════════════════
// #333 · Crear con la vista congelada — la Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #333 · 1 a 4 · Crear una tarea con filtro puesto (Gantt) ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await verVista('Gantt')
await ponerFiltroEstado()
chk(!(await hayActualizarVista()), '#333 terreno: con el filtro recién puesto, "Actualizar vista" está apagado')

// Un sub frente con al menos cuatro visibles.
const conFiltro = await ganttFilas()
const cuentas = {}
for (const f of conFiltro) cuentas[f.sub] = (cuentas[f.sub] ?? 0) + 1
const SUB_4 = Object.keys(cuentas).find((s) => cuentas[s] >= 4)
const visibles4 = await ganttDe(SUB_4)
chk(!!SUB_4 && visibles4.length >= 4, '#333 terreno: hay un sub frente con cuatro o más tareas visibles', `${SUB_4}: ${visibles4.length}`)

const filaG2 = filaGantt(visibles4[1])
await filaG2.locator('td.fija--tarea').hover()
await esperar(250)
await pulsarSiEsta(filaG2.locator('button[aria-label="Agregar tarea debajo"]'))
await crearEnGantt('F-entremedio')
const trasFiltro = await ganttDe(SUB_4)
chk(
  trasFiltro[2] === 'F-entremedio',
  '#333·1 con filtro puesto, la tarea nueva aparece ENTRE la segunda y la tercera',
  trasFiltro.join(' · '),
)
chk(await hayActualizarVista(), '#333·2 "Actualizar vista" queda encendido')
await actualizarVista()
const trasActualizar = await ganttDe(SUB_4)
chk(
  trasActualizar[2] === 'F-entremedio',
  '#333·3 al tocar "Actualizar vista" la tarea sigue en la misma posición',
  trasActualizar.join(' · '),
)
// 4 · quitar el filtro.
await p.locator('.controles-x[aria-label="Limpiar todos los filtros"]').click()
await esperar(800)
const sinFiltro = await ganttDe(SUB_4)
const iNueva = sinFiltro.indexOf('F-entremedio')
const iHermana = sinFiltro.indexOf(visibles4[1])
chk(
  iNueva === iHermana + 1,
  '#333·4 sin el filtro, la tarea está justo después de su hermana',
  `${visibles4[1]} → ${sinFiltro[iHermana + 1]}`,
)

// 6 · el "+" de la ÚLTIMA visible deja la nueva al final.
console.log('\n── #333 · 5 y 6 · La última, el sub frente y el frente ──')
await ponerFiltroEstado()
const ult = (await ganttDe(SUB_4)).slice(-1)[0]
const filaUlt = filaGantt(ult)
await filaUlt.locator('td.fija--tarea').hover()
await esperar(250)
await pulsarSiEsta(filaUlt.locator('button[aria-label="Agregar tarea debajo"]'))
await crearEnGantt('F-alfinal')
const trasUlt = await ganttDe(SUB_4)
chk(
  trasUlt[trasUlt.length - 1] === 'F-alfinal',
  '#333·6 creando sobre la ÚLTIMA visible, la nueva queda al final',
  trasUlt.slice(-3).join(' · '),
)

// 5 · un sub frente y un frente nuevos, con filtro puesto.
const rotulasAntes = await ganttRotulas()
const primerSub = p.locator('.gantt tbody td.fija--sf').first()
const nomSub = (await primerSub.evaluate((td) => td.textContent.trim().replace(/\+$/, ''))).trim()
await primerSub.hover()
await esperar(250)
await pulsarSiEsta(primerSub.locator('.mas-btn'))
await crearEnGantt('F-sub-nuevo')
const rotulasSub = await ganttRotulas()
chk(
  rotulasSub.indexOf('S F-sub-nuevo') === rotulasSub.indexOf(`S ${nomSub}`) + 1,
  '#333·5 el sub frente nuevo aparece justo debajo de aquel sobre el que se creó',
  rotulasSub.join(' | '),
)
chk(
  rotulasAntes.length + 1 === rotulasSub.length,
  '#333·5 terreno: y aparece — en main no se dibujaba en ninguna parte con filtro puesto',
)
// 7 · crear en un sub frente SIN filas visibles. El único que se puede tener
// delante es justo el que se acaba de crear: un sub frente con tareas que el
// filtro deja todas fuera se omite entero, así que desde la pantalla no hay
// forma de llegar a su fila. Con el recién creado, sí.
const filaVacia = p.locator('.gantt tbody tr', { hasText: 'F-sub-nuevo' }).first()
await pulsarSiEsta(filaVacia.locator('button', { hasText: 'agregar tarea' }))
await crearEnGantt('F-en-sub-vacio')
const enSubVacio = await ganttDe('F-sub-nuevo')
chk(
  enSubVacio.length === 1 && enSubVacio[0] === 'F-en-sub-vacio',
  '#333·7 crear en un sub frente sin filas visibles deja la tarea dentro de ese sub frente',
  enSubVacio.join(' · '),
)
chk(
  (await ganttRotulas()).filter((x) => x.startsWith('S ')).length ===
    rotulasSub.filter((x) => x.startsWith('S ')).length,
  '#333·7 y no rompe la vista: los mismos sub frentes que antes',
)

const primerFrente = p.locator('.gantt tbody td.fija--frente').first()
const nomFrente = (await primerFrente.evaluate((td) => td.textContent.trim().replace(/\+$/, ''))).trim()
await primerFrente.hover()
await esperar(250)
await pulsarSiEsta(primerFrente.locator('.mas-btn'))
await crearEnGantt('F-frente-nuevo')
const rotulasFr = await ganttRotulas()
chk(
  rotulasFr.indexOf('F F-frente-nuevo') > rotulasFr.indexOf(`F ${nomFrente}`),
  '#333·5 el frente nuevo aparece después de aquel sobre el que se creó',
  rotulasFr.join(' | '),
)
chk(await hayActualizarVista(), '#333·5 y "Actualizar vista" queda encendido también con los contenedores')

// 8 · sin filtro ni orden, todo igual.
console.log('\n── #333 · 8 · Sin filtro ni orden ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await verVista('Gantt')
const SUB_S = 'Procesos Financieros'
const limpiasAntes = await ganttDe(SUB_S)
const filaS = filaGantt(limpiasAntes[1])
await filaS.locator('td.fija--tarea').hover()
await esperar(250)
await pulsarSiEsta(filaS.locator('button[aria-label="Agregar tarea debajo"]'))
await crearEnGantt('S-normal')
const limpias = await ganttDe(SUB_S)
chk(
  limpias[2] === 'S-normal' && limpias.length === limpiasAntes.length + 1,
  '#333·8 sin filtro ni orden, crear debajo sigue funcionando exactamente igual',
  limpias.join(' · '),
)
chk(!(await hayActualizarVista()), '#333·8 y sin vista congelada no se enciende "Actualizar vista"')

// 10 · arrastrar con la vista congelada sigue igual.
console.log('\n── #333 · 10 · El arrastre no cambia ──')
await verVista('Tabla')
await ponerFiltroEstado()
const arrastrables = await p.evaluate(() => {
  const t = document.querySelectorAll('table.tareas')[0]
  return [...t.querySelectorAll('tbody tr')]
    .map((r) => r.querySelector('.tarea-cell__link, .tarea-cell .inline-text'))
    .filter(Boolean)
    .map((n) => n.textContent.trim())
})
if (arrastrables.length >= 2) {
  const origen = p.locator('table.tareas tbody tr', { hasText: arrastrables[arrastrables.length - 1] }).first().locator('.drag-asa')
  const destino = p.locator('table.tareas tbody tr', { hasText: arrastrables[0] }).first()
  await origen.dragTo(destino)
  await esperar(800)
  const trasArrastre = await tablaTitulos(0)
  chk(
    trasArrastre[0] === arrastrables[arrastrables.length - 1] && (await hayActualizarVista()),
    '#333·10 arrastrar con la vista congelada se sigue comportando igual',
    trasArrastre.join(' · '),
  )
} else {
  chk(false, '#333·10 terreno: no hubo dos filas visibles para arrastrar')
}

// 11 y 12 · la tabla, con "Agregar tarea debajo" y filtro puesto.
console.log('\n── #333 · 11 y 12 · La tabla con filtro puesto ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await ponerFiltroEstado()
const tablas = await p.evaluate(() =>
  [...document.querySelectorAll('table.tareas')].map(
    (t) =>
      [...t.querySelectorAll('tbody tr')].filter((r) =>
        r.querySelector('.tarea-cell__link, .tarea-cell .inline-text'),
      ).length,
  ),
)
const iTabla = tablas.findIndex((n) => n >= 3)
chk(iTabla >= 0, '#333 terreno: hay una tabla con tres o más tareas visibles', tablas.join(' · '))
const visiblesT = await tablaTitulos(iTabla)
await clicDerechoEn(p.locator('table.tareas').nth(iTabla).locator('tbody tr', { hasText: visiblesT[1] }).first())
await elegir('Agregar tarea debajo', 500)
await crearEnFilaNueva('T-entremedio')
const trasT = await tablaTitulos(iTabla)
chk(
  trasT[2] === 'T-entremedio',
  '#333·11 en la tabla con filtro, la tarea nueva queda entre la segunda y la tercera',
  trasT.join(' · '),
)
chk(await hayActualizarVista(), '#333·11 y "Actualizar vista" queda encendido')
// 12 · "+ Tarea" con filtro puesto sigue dejando al final.
await pulsarSiEsta(p.locator('table.tareas').nth(iTabla).locator('.fila-add button', { hasText: '+ Tarea' }))
await crearEnFilaNueva('T-final-filtro')
const trasT2 = await tablaTitulos(iTabla)
chk(
  trasT2[trasT2.length - 1] === 'T-final-filtro',
  '#333·12 con filtro puesto, "+ Tarea" sigue dejando la tarea al final',
  trasT2.slice(-3).join(' · '),
)
await p.keyboard.press('Escape')
await esperar(400)

// ═══════════════════════════════════════════════════════════════════════════
// #328 · 5 · 6 · 13 y #333 · 9 · Según los permisos
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #328 · 5 y 6 · Un usuario sin permisos ──')
await entrarComo('Cliente Arauco')
await abrirProyecto()
await verVista('Gantt')
const celdaCliente = await p.evaluate(() => {
  const td = document.querySelector('.gantt td.fija--tarea')
  const cs = getComputedStyle(td)
  const util = td.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const conMas = td.querySelector('.con-mas')
  return {
    util,
    acciones: td.querySelectorAll('.con-mas__acciones').length,
    botones: td.querySelectorAll('.mas-btn').length,
    nombreW: Math.round(conMas.querySelector('.fija-tip').getBoundingClientRect().width),
    hijos: conMas.children.length,
  }
})
chk(
  celdaCliente.acciones === 0 && celdaCliente.botones === 0,
  '#328·6 sin permiso de crear tareas no se dibuja ningún botón en la fila',
)
chk(
  celdaCliente.hijos === 1,
  '#328·6 y el envoltorio no se dibuja: el nombre ocupa la celda entera, sin pagar su separación',
  `${celdaCliente.nombreW} de ${celdaCliente.util} útiles`,
)
// 5 · sin permiso de editar títulos, el clic sobre el nombre abre el panel.
await pulsarSiEsta(p.locator('.gantt td.fija--tarea .tarea-cell__link'), 700)
chk(
  (await p.locator('.task-panel, .panel-detalle').count()) > 0,
  '#328·5 sin permiso de editar títulos, el clic sobre el nombre sigue abriendo el panel',
)
await p.keyboard.press('Escape')
await esperar(500)
await clicDerechoEn(p.locator('.gantt tbody tr', { has: p.locator('td.fija--tarea .con-mas') }).first())
chk(
  !(await opciones()).includes('Agregar tarea debajo'),
  '#328 terreno: y su menú tampoco ofrece crear',
  (await opciones()).join(' · '),
)
await cerrarMenu()

// #333 · 9 — con permiso de crear tareas pero SIN control total, se crea al
// final del contenedor, con filtro y sin filtro (insertar en el medio obliga a
// editar tareas ajenas).
console.log('\n── #333 · 9 · Crear sin control total ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await p.getByRole('button', { name: 'Miembros' }).first().click()
await esperar(600)
await p.locator('.miembro', { hasText: 'Cliente Arauco' }).locator('button[aria-label^="Permisos"]').click()
await esperar(600)
await p.locator('.permiso-item', { hasText: 'Crear tareas' }).locator('button', { hasText: 'Sí' }).first().click()
await esperar(400)
await p.locator('.modal-acciones button', { hasText: 'Guardar permisos' }).click()
await esperar(700)
await p.keyboard.press('Escape')
await esperar(500)
// Se cambia de usuario SIN limpiar el almacenamiento: el permiso vive ahí.
await p.locator('.sesion__salir').first().click()
await esperar(900)
await p.getByText('Cliente Arauco', { exact: true }).click()
await esperar(1100)
await abrirProyecto()
await verVista('Gantt')
const SUB_C = 'Procesos Comerciales'
const antesC = await ganttDe(SUB_C)
const filaC = filaGantt(antesC[1])
await filaC.locator('td.fija--tarea').hover()
await esperar(250)
chk(
  (await filaC.locator('button[aria-label="Agregar tarea debajo"]').count()) > 0,
  '#333·9 terreno: con permiso de crear tareas el "+" sí aparece',
)
await pulsarSiEsta(filaC.locator('button[aria-label="Agregar tarea debajo"]'))
await crearEnGantt('C-sin-total')
const trasC = await ganttDe(SUB_C)
chk(
  trasC[trasC.length - 1] === 'C-sin-total',
  '#333·9 sin control total, crear sigue dejando la tarea AL FINAL del contenedor',
  trasC.join(' · '),
)
await ponerFiltroEstado()
const antesCF = await ganttDe(SUB_C)
if (antesCF.length >= 2) {
  const filaCF = filaGantt(antesCF[0])
  await filaCF.locator('td.fija--tarea').hover()
  await esperar(250)
  await pulsarSiEsta(filaCF.locator('button[aria-label="Agregar tarea debajo"]'))
  await crearEnGantt('C-filtro-final')
  const trasCF = await ganttDe(SUB_C)
  chk(
    trasCF[trasCF.length - 1] === 'C-filtro-final',
    '#333·9 y con filtro puesto, igual: al final',
    trasCF.join(' · '),
  )
} else {
  chk(false, '#333·9 terreno: no quedaron dos tareas visibles tras el filtro')
}

// #334 · 5 — una tarea que no puede editar: Renombrar no aparece.
console.log('\n── #334 · 5 · Sin permiso de editar ──')
await verVista('Tabla')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(1200)
if (await clicDerechoEn(p.locator('table.tareas tbody tr').first())) {
  chk(
    !(await opciones()).includes('Renombrar'),
    '#334·5 sin permiso de editar esa tarea, Renombrar no aparece en el menú',
    (await opciones()).join(' · '),
  )
  await cerrarMenu()
} else {
  // Sin tareas propias, el caso se comprueba en el proyecto.
  await abrirProyecto()
  await clicDerechoEn(p.locator('table.tareas tbody tr').first())
  chk(
    !(await opciones()).includes('Renombrar'),
    '#334·5 sin permiso de editar esa tarea, Renombrar no aparece en el menú',
    (await opciones()).join(' · '),
  )
  await cerrarMenu()
}

// #328 · 13 — el asa de arrastre sigue en su sitio.
console.log('\n── #328 · 13 · El asa de arrastre ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await verVista('Gantt')
const asa = await p.evaluate(() => {
  const td = document.querySelector('.gantt td.fija--tarea')
  const a = td.querySelector('.drag-asa')
  if (!a) return null
  const r = a.getBoundingClientRect()
  const t = td.getBoundingClientRect()
  return { draggable: a.draggable, izquierda: Math.round(r.left - t.left) }
})
chk(
  !!asa && asa.draggable,
  '#328·13 el asa de arrastre sigue apareciendo y sigue siendo arrastrable',
  asa ? `a ${asa.izquierda}px del borde izquierdo` : '(no está)',
)

await b.close()
