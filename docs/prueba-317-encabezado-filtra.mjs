// #317 — Filtrar la Gantt tocando las fechas.
//
// Las dos bandas del encabezado eran solo texto. Ahora un clic —o un
// arrastre— sobre un día o sobre el rótulo de una semana PONE EL FILTRO DE
// FECHA que ya existe: el mismo rango fijo que se escribe a mano en
// Filtrar → Fecha Objetivo. De ahí que la mitad de esta prueba sea comparar
// los dos caminos: si dan resultados distintos, el gesto se convirtió en una
// función aparte y eso es justo lo que el pedido no quería.
//
// El calendario de la aplicación en modo Local es fijo —hoy es el miércoles
// 30-oct-2024—, así que las fechas de acá abajo son literales y no cambian
// entre corridas. El horizonte por defecto ("Alrededor de hoy", días hábiles)
// va del lunes 14-oct al viernes 15-nov: 25 días en 5 semanas.
//
// Control negativo comprobado contra `origin/main`: **11 en verde y 33 en
// rojo**. Fallan todas las que tocan el encabezado, porque ahí los `th` no
// llevan ni `data-dia` ni manejador y el clic no hace nada. Las 11 que
// aguantan son justo las que miden lo que el pedido dice que NO cambia: el
// clic de la grilla sigue planificando, las columnas congeladas siguen fuera
// del gesto, la × sigue limpiando, la tabla sigue reflejando a la Gantt y
// Mis Tareas sigue en su sitio.
//
// Varias comprobaciones comparan DOS listas, y sin cuidado una corrida donde
// el gesto no filtró nada saldría verde comparando el proyecto entero contra
// sí mismo. Por eso las de ese tipo exigen además que el filtro haya acotado
// algo (`TODAS`, el largo del rango, la ficha no nula): salieron de apretar
// este control negativo, donde tres de ellas pasaban comparando dos vacíos.
//
// Lo que esta prueba NO cubre: el teléfono, donde no hay Gantt y por lo tanto
// no hay gesto (el pedido lo excluye).
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-317-encabezado-filtra.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

let ok = 0
let falla = 0
const chk = (bien, m, extra = '') => {
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (bien) ok++
  else {
    falla++
    process.exitCode = 1
  }
}

const b = await chromium.launch({ executablePath: EXE })

async function sesion() {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  p.on('dialog', (d) => d.accept())
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await p.waitForTimeout(700)
  await p.getByText('Daniela Vera', { exact: true }).click()
  await p.waitForTimeout(900)
  return p
}
async function abrirProyecto(p, nombre = 'Plan PGP Arauco') {
  await p.getByText('Resumen', { exact: true }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await p.waitForTimeout(900)
}
async function verVista(p, cual) {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await p.waitForTimeout(900)
}
async function abrirCtrl(p, nombre) {
  await p.locator('.controles-btn', { hasText: nombre }).first().click()
  await p.waitForTimeout(500)
}
async function cerrarMenu(p) {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
}

// ── Lo que se mide ─────────────────────────────────────────────────────────
/** Los días del encabezado, en orden. Es lo que la grilla está mostrando. */
const dias = (p) => p.locator('.gantt th.dia').evaluateAll((es) => es.map((e) => e.dataset.dia))
/** Los nombres de las tareas visibles, en orden (sirve igual en Gantt y tabla). */
const tareasGantt = (p) => p.locator('.gantt td.fija--tarea .fija-txt').allInnerTexts()
const tareasTabla = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('table.tareas tbody .tarea-cell__link, table.tareas tbody .tarea-cell .inline-text')]
      .map((x) => x.innerText.trim())
      .filter(Boolean),
  )
/** El primer día del horizonte donde una tarea tiene su fecha VIGENTE. Se lee
 *  de la grilla —la columna de la celda que dibuja la marca— en vez de
 *  escribirlo a mano, porque en Mis Tareas las tareas dependen de quién entró.
 *  Las marcas de fecha ANTERIOR no valen: son historial de una replanificación
 *  y el filtro no mira esa fecha, así que filtrar por ese día dejaría la
 *  grilla vacía. */
const primerDiaConMarca = (p) =>
  p.evaluate(() => {
    const dias = [...document.querySelectorAll('.gantt th.dia')].map((e) => e.dataset.dia)
    for (const tr of document.querySelectorAll('.gantt tbody tr')) {
      const celdas = [...tr.querySelectorAll('td.celda')]
      const i = celdas.findIndex((td) => td.querySelector('.mark:not(.mark--anterior)'))
      if (i >= 0) return dias[i] ?? null
    }
    return null
  })
/** El texto de la ficha del filtro, que vive dentro del menú "Filtrar". */
async function fichas(p) {
  await abrirCtrl(p, 'Filtrar')
  const f = await p.evaluate(() =>
    [...document.querySelectorAll('.filtro-ficha__ir')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
  )
  await cerrarMenu(p)
  return f
}
const fichaFecha = async (p) => (await fichas(p)).find((t) => t.startsWith('Fecha:')) ?? null
/** La × de la ficha de Fecha: limpia el filtro por el camino del producto. */
async function limpiarFecha(p) {
  await abrirCtrl(p, 'Filtrar')
  const x = p.locator('.filtro-ficha__x')
  if (await x.count()) {
    await x.first().click()
    await p.waitForTimeout(400)
  }
  await cerrarMenu(p)
}

const D = (d) => `.gantt th.dia[data-dia="${d}"]`
const S = (l) => `.gantt th.semana-lbl[data-lunes="${l}"]`
/** El lunes de la semana de una fecha — la misma regla que usa la aplicación. */
function lunesDe(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  const dow = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  return d.toISOString().slice(0, 10)
}

// Los gestos NO revientan cuando la celda no existe: devuelven `false` y
// siguen. Contra un árbol sin #317 el encabezado no lleva `data-dia`, y una
// excepción acá mataría el proceso en la primera comprobación — el control
// negativo informaría "1 verde, 1 roja" y eso es indistinguible de no haberlo
// corrido. Es el defecto de arnés que apareció en #357; acá ya no se repite.
async function caja(p, sel) {
  const loc = p.locator(sel)
  return (await loc.count()) > 0 ? await loc.first().boundingBox() : null
}
async function tocar(p, sel) {
  const loc = p.locator(sel)
  if ((await loc.count()) === 0) return false
  await loc.first().click()
  await p.waitForTimeout(600)
  return true
}
/** Arrastre de una celda a otra. `steps` hace que el puntero pase de verdad
 *  por las del medio, que es como se usa. */
async function arrastrar(p, selA, selB) {
  const a = await caja(p, selA)
  const c = await caja(p, selB)
  if (!a || !c) return false
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 8 })
  await p.mouse.up()
  await p.waitForTimeout(600)
  return true
}
/** Escribe el rango a mano en Filtrar → Fecha Objetivo: el OTRO camino. */
async function rangoAMano(p, desde, hasta) {
  await abrirCtrl(p, 'Filtrar')
  await p.locator('.filtro-menu--portal .filtro-op--campo', { hasText: 'Fecha' }).click()
  await p.waitForTimeout(350)
  const campos = p.locator('.filtro-menu--portal input[type=date]')
  await campos.nth(0).fill(desde)
  await p.waitForTimeout(350)
  await campos.nth(1).fill(hasta)
  await p.waitForTimeout(500)
  await cerrarMenu(p)
}
/** Elige una opción del control "Rango" (días o horizonte). */
async function elegirRango(p, opcion) {
  await abrirCtrl(p, 'Rango')
  await p.locator('.filtro-menu--portal .filtro-op', { hasText: opcion }).click()
  await p.waitForTimeout(600)
  await cerrarMenu(p)
}

const HOY = '2024-10-30' // miércoles; el calendario de modo Local es fijo

const p = await sesion()
await abrirProyecto(p)
await verVista(p, 'Gantt')

const HORIZONTE = await dias(p)
/** Cuántas tareas se ven SIN filtro. Varias comprobaciones de abajo comparan
 *  dos listas, y sin este número una corrida donde el gesto no filtró nada
 *  saldría verde comparando el proyecto entero contra sí mismo. */
const TODAS = (await tareasGantt(p)).length
chk((await p.locator('.gantt th.dia').count()) === 25, 'preparación: el horizonte por defecto trae 25 días hábiles', String(await p.locator('.gantt th.dia').count()))
chk(HORIZONTE[0] === '2024-10-14' && HORIZONTE.at(-1) === '2024-11-15', 'preparación: y va del 14-oct al 15-nov', `${HORIZONTE[0]} → ${HORIZONTE.at(-1)}`)
// La puerta de entrada de todo el pedido: si el encabezado no dice qué día es
// cada celda, no hay gesto que medir y todo lo de abajo va a salir en rojo.
chk(
  (await p.locator('.gantt th.dia[data-dia]').count()) === 25 &&
    (await p.locator('.gantt th.semana-lbl[data-lunes]').count()) === 5,
  'preparación: las dos bandas del encabezado dicen a qué fecha corresponden',
  `${await p.locator('.gantt th.dia[data-dia]').count()} días · ${await p.locator('.gantt th.semana-lbl[data-lunes]').count()} semanas`,
)

// ── 1 · Tocar un día ───────────────────────────────────────────────────────
console.log('\n── 1 · Tocar un día ──')
await tocar(p, D('2024-10-23'))
let d = await dias(p)
chk(d.length === 1 && d[0] === '2024-10-23', '1 tocar un día deja la grilla con ese día y nada más', d.join(','))
chk(
  (await tareasGantt(p)).join(' · ') === 'Definición de reglas de integridad',
  '1 y con sus tareas',
  (await tareasGantt(p)).join(' · '),
)
chk(
  (await fichaFecha(p)) === 'Fecha: 2024-10-23 → 2024-10-23',
  '1 arriba aparece la ficha del filtro de fecha',
  String(await fichaFecha(p)),
)

// ── 2 · Tocar el rótulo de una semana ──────────────────────────────────────
console.log('\n── 2 · Tocar el rótulo de una semana ──')
await limpiarFecha(p)
await tocar(p, S('2024-10-28'))
d = await dias(p)
chk(
  d.join(',') === '2024-10-28,2024-10-29,2024-10-30,2024-10-31,2024-11-01',
  '2 tocar el rótulo deja la grilla con esa semana',
  d.join(','),
)
chk(
  (await fichaFecha(p)) === 'Fecha: 2024-10-28 → 2024-11-03',
  '2 y el rango es la SEMANA ENTERA, de lunes a domingo — que se dibuje el fin de semana lo decide Rango',
  String(await fichaFecha(p)),
)

// ── 3 · Arrastrar sobre los días, en las dos direcciones ───────────────────
console.log('\n── 3 · Arrastrar sobre los días ──')
await limpiarFecha(p)
await arrastrar(p, D('2024-10-29'), D('2024-10-31'))
const ida = await dias(p)
const fichaIda = await fichaFecha(p)
chk(ida.join(',') === '2024-10-29,2024-10-30,2024-10-31', '3 arrastrar del martes al jueves deja esos tres días', ida.join(','))
await limpiarFecha(p)
await arrastrar(p, D('2024-10-31'), D('2024-10-29'))
const vuelta = await dias(p)
chk(vuelta.length === 3 && vuelta.join(',') === ida.join(','), '3 y al revés, del jueves al martes, da lo mismo', vuelta.join(','))
chk(
  fichaIda !== null && (await fichaFecha(p)) === fichaIda,
  '3 el rango que queda es el mismo en las dos direcciones',
  `${fichaIda} / ${await fichaFecha(p)}`,
)

// ── 3b · Arrastrar sobre dos rótulos de semana ─────────────────────────────
console.log('\n── 3b · Arrastrar sobre dos rótulos de semana ──')
await limpiarFecha(p)
await arrastrar(p, S('2024-10-21'), S('2024-10-28'))
d = await dias(p)
chk(d.length === 10 && d[0] === '2024-10-21' && d.at(-1) === '2024-11-01', '3b dos rótulos seguidos dejan esas dos semanas completas', `${d.length} días: ${d[0]} → ${d.at(-1)}`)
chk(
  (await fichaFecha(p)) === 'Fecha: 2024-10-21 → 2024-11-03',
  '3b del lunes de la primera al domingo de la segunda',
  String(await fichaFecha(p)),
)

// ── Las dos bandas no se mezclan ───────────────────────────────────────────
console.log('\n── Las dos bandas no se mezclan ──')
await limpiarFecha(p)
// Se arrastra en VERTICAL, del día al rótulo que tiene justo encima: el
// puntero no pasa por ningún otro día, así que lo único que puede cambiar el
// resultado es que la banda de semanas se sume — y no debe.
const celdaVie = await caja(p, D('2024-11-01'))
const rotuloArriba = await caja(p, S('2024-10-28'))
if (celdaVie && rotuloArriba) {
  await p.mouse.move(celdaVie.x + celdaVie.width / 2, celdaVie.y + celdaVie.height / 2)
  await p.mouse.down()
  await p.mouse.move(celdaVie.x + celdaVie.width / 2, rotuloArriba.y + rotuloArriba.height / 2, { steps: 6 })
  await p.mouse.up()
  await p.waitForTimeout(600)
}
d = await dias(p)
chk(d.join(',') === '2024-11-01', 'un arrastre que empieza en un día NO termina en un rótulo de semana', d.join(','))

// ── 4 · Con el filtro puesto, el gesto sigue activo ────────────────────────
console.log('\n── 4 · El gesto sigue activo con un filtro puesto ──')
await limpiarFecha(p)
await tocar(p, S('2024-10-28'))
chk((await dias(p)).length === 5, '4 preparación: una semana puesta', String((await dias(p)).length))
await tocar(p, D('2024-10-29'))
d = await dias(p)
chk(d.join(',') === '2024-10-29', '4 tocar uno de los días que quedan vuelve a filtrar, sin limpiar antes', d.join(','))
chk((await fichaFecha(p)) === 'Fecha: 2024-10-29 → 2024-10-29', '4 y el filtro se REEMPLAZA, no se suma', String(await fichaFecha(p)))
chk((await fichas(p)).length === 1, '4 sigue habiendo una sola ficha de filtro', String((await fichas(p)).length))

// ── 11 · El selector de horizonte queda apagado ────────────────────────────
console.log('\n── 11 · El selector de horizonte ──')
await abrirCtrl(p, 'Rango')
const apagados = await p.evaluate(() =>
  [...document.querySelectorAll('.filtro-menu--portal .filtro-op')]
    .filter((e) => ['Alrededor de hoy', 'Todo el proyecto'].includes(e.innerText.trim()))
    .map((e) => `${e.innerText.trim()}:${e.disabled}`),
)
await cerrarMenu(p)
chk(
  apagados.join(' ') === 'Alrededor de hoy:true Todo el proyecto:true',
  '11 con el filtro del gesto puesto, "Alrededor de hoy / Todo el proyecto" quedan apagados',
  apagados.join(' '),
)

// ── 5 · La × de la ficha limpia ────────────────────────────────────────────
console.log('\n── 5 · La × de la ficha ──')
await limpiarFecha(p)
d = await dias(p)
chk(d.join(',') === HORIZONTE.join(','), '5 la × limpia el filtro y la grilla vuelve a su horizonte', `${d.length} días`)
chk((await fichas(p)).length === 0, '5 y no queda ninguna ficha', JSON.stringify(await fichas(p)))
await abrirCtrl(p, 'Rango')
const vueltos = await p.evaluate(() =>
  [...document.querySelectorAll('.filtro-menu--portal .filtro-op')]
    .filter((e) => e.innerText.trim() === 'Alrededor de hoy')
    .map((e) => e.disabled),
)
await cerrarMenu(p)
chk(vueltos.join('') === 'false', '5 y el selector de horizonte vuelve a elegirse', vueltos.join(''))

// ── 6 · La tabla muestra las mismas tareas ─────────────────────────────────
console.log('\n── 6 · La tabla ──')
await arrastrar(p, D('2024-10-21'), D('2024-10-25'))
const enGantt = (await tareasGantt(p)).map((t) => t.trim()).sort()
await verVista(p, 'Tabla')
const enTabla = (await tareasTabla(p)).map((t) => t.trim()).sort()
chk(enGantt.length > 0 && enGantt.length < TODAS, '6 preparación: el rango elegido deja tareas a la vista, y menos que sin filtro', `${enGantt.length} de ${TODAS}`)
chk(enTabla.join(' · ') === enGantt.join(' · '), '6 la tabla con ese filtro muestra las MISMAS tareas', `gantt=${enGantt.length} tabla=${enTabla.length}`)
await verVista(p, 'Gantt')

// ── 7 · Los dos caminos dan lo mismo ───────────────────────────────────────
console.log('\n── 7 · El gesto y el menú ──')
const porGesto = { dias: await dias(p), tareas: await tareasGantt(p), ficha: await fichaFecha(p) }
await limpiarFecha(p)
await rangoAMano(p, '2024-10-21', '2024-10-25')
const aMano = { dias: await dias(p), tareas: await tareasGantt(p), ficha: await fichaFecha(p) }
chk(aMano.dias.join(',') === porGesto.dias.join(','), '7 el mismo rango escrito a mano deja los mismos días', `${aMano.dias.length} vs ${porGesto.dias.length}`)
chk(aMano.tareas.join(' · ') === porGesto.tareas.join(' · '), '7 y las mismas tareas, en el mismo orden', `${aMano.tareas.length} vs ${porGesto.tareas.length}`)
chk(aMano.ficha === porGesto.ficha, '7 y la misma ficha', `${aMano.ficha} vs ${porGesto.ficha}`)

// ── 8 · Los fines de semana los decide Rango ───────────────────────────────
console.log('\n── 8 · Los fines de semana ──')
await limpiarFecha(p)
await arrastrar(p, D('2024-11-01'), D('2024-11-04'))
d = await dias(p)
chk(d.join(',') === '2024-11-01,2024-11-04', '8 con los fines de semana apagados, un rango viernes→lunes muestra viernes y lunes', d.join(','))
const antesDeEncender = await fichaFecha(p)
await elegirRango(p, 'Semana completa')
d = await dias(p)
chk(
  d.join(',') === '2024-11-01,2024-11-02,2024-11-03,2024-11-04',
  '8 al encenderlos en Rango aparecen el sábado y el domingo DENTRO del mismo rango',
  d.join(','),
)
chk(
  antesDeEncender === 'Fecha: 2024-11-01 → 2024-11-04' && (await fichaFecha(p)) === antesDeEncender,
  '8 y el filtro no se tocó: un control no cambia otro',
  `${antesDeEncender} → ${await fichaFecha(p)}`,
)
await elegirRango(p, 'Días hábiles')

// ── 9 · Un día sin tareas ──────────────────────────────────────────────────
console.log('\n── 9 · Un día sin tareas ──')
await limpiarFecha(p)
await tocar(p, D(HOY))
const vacioGesto = await p.evaluate(() => ({
  filas: document.querySelectorAll('.gantt td.fija--tarea .fija-txt').length,
  texto: document.querySelector('.gantt-wrap')?.innerText.trim() ?? '',
}))
chk(vacioGesto.filas === 0, '9 tocar un día sin tareas no deja ninguna fila', `${vacioGesto.filas}`)
await limpiarFecha(p)
await rangoAMano(p, HOY, HOY)
const vacioMenu = await p.evaluate(() => ({
  filas: document.querySelectorAll('.gantt td.fija--tarea .fija-txt').length,
  texto: document.querySelector('.gantt-wrap')?.innerText.trim() ?? '',
}))
chk(
  vacioMenu.texto === vacioGesto.texto,
  '9 y el vacío es el MISMO por los dos caminos — el gesto no inventa un mensaje propio',
  // Recortado: cuando esto falla, lo que hay del otro lado es la grilla
  // entera y volcarla tapa el resto del informe.
  `${vacioGesto.texto.slice(0, 60)}… / ${vacioMenu.texto.slice(0, 60)}…`,
)

// ── 10 · El clic sobre la grilla sigue planificando ────────────────────────
console.log('\n── 10 · La grilla no cambió ──')
await limpiarFecha(p)
const antes = await p.evaluate(() => document.querySelectorAll('.gantt tbody .marca-wrap').length)
// Una celda futura de una tarea cualquiera: el clic planifica (pone la marca).
const celda = p.locator('.gantt td.celda--planificable').first()
const hayPlanificable = (await celda.count()) > 0
if (hayPlanificable) {
  await celda.click()
  await p.waitForTimeout(700)
}
const despues = await p.evaluate(() => document.querySelectorAll('.gantt tbody .marca-wrap').length)
chk(hayPlanificable, '10 preparación: hay una celda planificable en la grilla')
chk(despues === antes + 1, '10 el clic sobre la grilla sigue planificando', `${antes} → ${despues}`)
chk((await fichas(p)).length === 0, '10 y no puso ningún filtro: el gesto vive solo en el encabezado', JSON.stringify(await fichas(p)))

// Las columnas congeladas comparten fila con los rótulos y NO son el gesto.
const fijasTocables = await p.evaluate(
  () => [...document.querySelectorAll('.gantt thead th.fija')].filter((e) => e.dataset.dia || e.dataset.lunes).length,
)
chk(fijasTocables === 0, '10 las columnas congeladas del encabezado siguen sin ser parte del gesto', `${fijasTocables}`)

// ── 12 · Lo mismo en Mis Tareas ────────────────────────────────────────────
console.log('\n── 12 · Mis Tareas ──')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await p.waitForTimeout(900)
await verVista(p, 'Gantt')
const mtHorizonte = await dias(p)
chk(mtHorizonte.length > 1, '12 preparación: la Gantt de Mis Tareas está a la vista', `${mtHorizonte.length} días`)
// Un día que TIENE tarea de esta persona: filtrar a uno vacío dejaría la
// grilla en su mensaje de vacío y la comprobación no mediría nada.
const unDiaMT = await primerDiaConMarca(p)
const lunesMT = await p.locator('.gantt th.semana-lbl').evaluateAll((es) => es.map((e) => e.dataset.lunes))
chk(!!unDiaMT, '12 preparación: hay un día con tareas propias a la vista', String(unDiaMT))
await tocar(p, D(unDiaMT))
d = await dias(p)
chk(d.join(',') === unDiaMT, '12 tocar un día en Mis Tareas filtra igual', d.join(','))
chk((await fichaFecha(p)) === `Fecha: ${unDiaMT} → ${unDiaMT}`, '12 y deja la misma ficha', String(await fichaFecha(p)))
chk(
  (await tareasGantt(p)).length > 0 && (await dias(p)).length === 1,
  '12 y la tarea de ese día se sigue viendo, con la grilla ya acotada a ese día',
  `${(await tareasGantt(p)).length} tarea(s) en ${(await dias(p)).length} día(s)`,
)
await limpiarFecha(p)
const semanaMT = lunesDe(unDiaMT)
chk(lunesMT.includes(semanaMT), '12 preparación: ese día vive en una semana del encabezado', `${semanaMT} ∈ ${lunesMT.join(',')}`)
await tocar(p, S(semanaMT))
d = await dias(p)
chk(d.length >= 1 && d[0] === semanaMT, '12 y el rótulo de semana también', `${d.length} días desde ${d[0]}`)
await limpiarFecha(p)
chk((await dias(p)).join(',') === mtHorizonte.join(','), '12 la × devuelve Mis Tareas a su horizonte', String((await dias(p)).length))

console.log(`\n${falla === 0 ? '✅' : '❌'} #317 — ${ok} en verde, ${falla} en rojo`)
await b.close()
