// #322 y #320 — El campo Fecha sin excepciones, y crear tareas con filtro.
//
// Dos pedidos que van juntos porque los dos son sobre lo mismo: qué se puede
// hacer con un filtro puesto. Prefijos: F = #322, T = #320.
//
// #322 — En el campo Fecha todas las opciones se excluían entre sí MENOS una
// pareja: "Sin fecha" y las fechas (relativa o rango fijo) podían convivir, y
// entonces el filtro SUMABA —las tareas sin fecha más las del rango—. El
// cálculo no estaba mal: hacía lo que decía. Lo que estaba mal es que esa
// combinación pudiera existir, y se llegaba a ella desde los dos lados.
//
// #320 — La tabla escondía la fila de "+ Tarea" con cualquier filtro puesto,
// mientras que la Gantt sí dejaba crear: mismo proyecto, mismo filtro, dos
// comportamientos opuestos. El remedio de la Gantt —dejar a la vista la tarea
// recién creada aunque el filtro la deje fuera, y encender "Actualizar
// vista"— ya vivía en la tabla para el caso de la foto congelada; solo había
// que dejar de esconder la fila.
//
// Control negativo comprobado: contra `main` antes del arreglo fallan **19**
// comprobaciones —F1, F2 y F7 en las cinco relativas, F4 y F5 en el rango fijo,
// y T1—. Concretamente:
//   · F1/F2: con una relativa puesta, activar "Sin fecha" dejaba las DOS
//     encendidas ("Hoy,Sin fecha"), y al revés igual.
//   · F7: por lo mismo, apagar la relativa dejaba "Sin fecha" prendida y la
//     comprobación de que cada opción se apaga sola no se podía hacer.
//   · F4/F5: el rango fijo y "Sin fecha" tampoco se apagaban entre sí.
//   · T1: con un filtro puesto no había ninguna fila de "+ Tarea" — medido,
//     0 filas en 4 sub frentes visibles.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-322-320-fecha-y-crear-filtrado.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
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
async function abrirProyecto(p) {
  await p.getByText('Resumen', { exact: true }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
  await p.waitForTimeout(900)
}
const menu = (p) => p.locator('.filtro-menu--portal')
const abrir = async (p, n) => {
  await p.locator('.controles-btn', { hasText: n }).first().click()
  await p.waitForTimeout(350)
}
const cerrar = async (p) => {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
}

/** Abre Filtrar → Fecha y deja el menú abierto para operar dentro. */
async function abrirFecha(p) {
  await abrir(p, 'Filtrar')
  await menu(p).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
  await p.waitForTimeout(350)
}
/** Las opciones ENCENDIDAS del campo Fecha, en orden de aparición. */
const encendidas = async (p) =>
  (await menu(p).locator('.filtro-op--on').allInnerTexts()).map((t) => t.trim())
/** Qué trae el filtro de fecha en el estado real, no en la pantalla. */
const campoFecha = (p) =>
  p.evaluate(() => {
    const b = document.querySelector('.controles-ctrl .controles-btn__n')
    const ficha = [...document.querySelectorAll('.filtro-ficha')]
      .map((f) => f.innerText.replace(/\s+/g, ' ').trim())
      .find((t) => t.startsWith('Fecha'))
    return { contador: b ? Number(b.textContent) : 0, ficha: ficha ?? null }
  })
async function limpiarFiltro(p) {
  const x = p.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x')
  if (await x.count()) {
    await x.click()
    await p.waitForTimeout(500)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// #322 — Las cinco opciones del campo Fecha se excluyen entre sí
// ═══════════════════════════════════════════════════════════════════════════
const p = await sesion()
await abrirProyecto(p)

// ── F1 a F3 · Las relativas y "Sin fecha", desde los dos lados ─────────────
console.log('\n── F1 a F3 · Relativas contra "Sin fecha" ──')
const RELATIVAS = ['Hoy', 'Próximo día hábil', 'Esta semana', 'Próxima semana', 'Este mes']
for (const rel of RELATIVAS) {
  // Primero la relativa, después "Sin fecha": debe quedar solo "Sin fecha".
  await abrirFecha(p)
  await menu(p).locator('.filtro-op', { hasText: new RegExp(`^${rel}$`) }).click()
  await p.waitForTimeout(300)
  await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
  await p.waitForTimeout(300)
  let on = await encendidas(p)
  chk(on.join(',') === 'Sin fecha', `F1 poner "${rel}" y luego "Sin fecha": queda solo "Sin fecha"`, on.join(','))

  // Al revés: "Sin fecha" ya está puesta; ahora la relativa.
  await menu(p).locator('.filtro-op', { hasText: new RegExp(`^${rel}$`) }).click()
  await p.waitForTimeout(300)
  on = await encendidas(p)
  chk(on.join(',') === rel, `F2 y luego "${rel}": queda solo "${rel}"`, on.join(','))

  // F7: tocarla de nuevo la apaga.
  await menu(p).locator('.filtro-op', { hasText: new RegExp(`^${rel}$`) }).click()
  await p.waitForTimeout(300)
  on = await encendidas(p)
  chk(on.length === 0, `F7 "${rel}" sigue apagándose al tocarla de nuevo`, on.join(','))
  await cerrar(p)
  await limpiarFiltro(p)
}

// ── F4 y F5 · El rango fijo y "Sin fecha" ──────────────────────────────────
console.log('\n── F4 y F5 · El rango fijo contra "Sin fecha" ──')
await abrirFecha(p)
await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
await p.waitForTimeout(300)
await menu(p).locator('input[type=date]').first().fill('2024-10-28')
await p.waitForTimeout(400)
let on = await encendidas(p)
let fechas = await menu(p).locator('input[type=date]').evaluateAll((es) => es.map((e) => e.value))
chk(on.length === 0, 'F4 escribir un rango fijo con "Sin fecha" puesto la apaga', on.join(','))
chk(fechas[0] === '2024-10-28', 'F4 y el rango queda escrito', fechas.join(' – '))

await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
await p.waitForTimeout(400)
on = await encendidas(p)
fechas = await menu(p).locator('input[type=date]').evaluateAll((es) => es.map((e) => e.value))
chk(on.join(',') === 'Sin fecha', 'F5 poner "Sin fecha" con un rango escrito la enciende', on.join(','))
chk(fechas.every((v) => !v), 'F5 y el rango se limpia', JSON.stringify(fechas))
await cerrar(p)
await limpiarFiltro(p)

// ── F6 · "Con fecha" y "En horizonte visible" no cambian ───────────────────
console.log('\n── F6 · "Con fecha" y "En horizonte visible" ──')
await abrirFecha(p)
await menu(p).locator('.filtro-op', { hasText: /^Esta semana$/ }).click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op', { hasText: /^Con fecha$/ }).click()
await p.waitForTimeout(300)
on = await encendidas(p)
chk(on.join(',') === 'Con fecha', 'F6 "Con fecha" sigue apagando la relativa', on.join(','))
await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
await p.waitForTimeout(300)
on = await encendidas(p)
chk(on.join(',') === 'Sin fecha', 'F6 y sigue siendo excluyente con "Sin fecha"', on.join(','))
chk(
  await menu(p).locator('.filtro-op', { hasText: 'En horizonte visible' }).isDisabled(),
  'F6 "En horizonte visible" sigue apagado desde la tabla',
)

// ── F8 y F9 · El contador y la ficha del campo Fecha ───────────────────────
console.log('\n── F8 y F9 · El contador y la ficha ──')
await menu(p).locator('.filtro-volver').click()
await p.waitForTimeout(350)
let cf = await campoFecha(p)
chk(cf.contador === 1, 'F8 con una opción de fecha puesta, el contador del botón dice 1', String(cf.contador))
chk(
  cf.ficha !== null && !cf.ficha.includes('+'),
  'F8 y la ficha nunca muestra más de una opción a la vez',
  cf.ficha ?? 'sin ficha',
)
await menu(p).locator('.filtro-ficha', { hasText: 'Fecha' }).locator('.filtro-ficha__x').click()
await p.waitForTimeout(400)
cf = await campoFecha(p)
chk(cf.ficha === null && cf.contador === 0, 'F9 la × de la ficha sigue limpiando el campo entero')
await cerrar(p)

// ── F10 · Los otros campos siguen aceptando varios valores ─────────────────
console.log('\n── F10 · Responsable y Estado no cambian ──')
await abrir(p, 'Filtrar')
await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op--check').nth(0).click()
await p.waitForTimeout(250)
await menu(p).locator('.filtro-op--check').nth(1).click()
await p.waitForTimeout(300)
let marcados = await menu(p).locator('input[type=checkbox]:checked').count()
chk(marcados === 2, 'F10 en Estado se siguen pudiendo elegir varios a la vez', `${marcados} marcados`)
await menu(p).locator('.filtro-volver').click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op--campo', { hasText: 'Responsable' }).click()
await p.waitForTimeout(300)
await menu(p).locator('.filtro-op--check').nth(0).click()
await p.waitForTimeout(250)
await menu(p).locator('.filtro-op--check').nth(1).click()
await p.waitForTimeout(300)
marcados = await menu(p).locator('input[type=checkbox]:checked').count()
chk(marcados === 2, 'F10 y en Responsable también', `${marcados} marcados`)
await cerrar(p)
await limpiarFiltro(p)

// ═══════════════════════════════════════════════════════════════════════════
// #320 — Crear tareas en la tabla con el filtro puesto
// ═══════════════════════════════════════════════════════════════════════════

const filasAdd = (p) => p.locator('.tabla-wrap .fila-add').count()
const subsVisibles = (p) => p.locator('.tabla-wrap .subfrente').count()
const hayActualizar = (p) => p.locator('.controles-btn--actualizar').count()

async function filtrarPorEstado(p, i) {
  await abrir(p, 'Filtrar')
  await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
  await p.waitForTimeout(300)
  await menu(p).locator('.filtro-op--check').nth(i).click()
  await p.waitForTimeout(400)
  await cerrar(p)
}

// ── T7 · Sin filtro, como hoy ──────────────────────────────────────────────
console.log('\n── T1 y T7 · La fila de "+ Tarea" ──')
const sinFiltro = { add: await filasAdd(p), subs: await subsVisibles(p) }
chk(sinFiltro.add === sinFiltro.subs && sinFiltro.add > 0, 'T7 sin filtro, cada sub frente muestra su "+ Tarea"',
    `${sinFiltro.add} filas en ${sinFiltro.subs} sub frentes`)

// ── T1, T5 y T6 · Con filtro puesto ────────────────────────────────────────
// Se filtra por "Hecha" (la primera del menú) y NO por "Pendiente": una tarea
// recién creada nace sin fecha y sin marcar, así que su categoría ES
// "pendiente" — con ese filtro cumpliría, y no serviría para comprobar que la
// forzada se queda a la vista. Además "Hecha" deja fuera un sub frente, que es
// lo que hace falta para T5.
await filtrarPorEstado(p, 0)
const conFiltro = { add: await filasAdd(p), subs: await subsVisibles(p) }
chk(conFiltro.subs > 0, 'T1 terreno: el filtro deja sub frentes visibles', `${conFiltro.subs} sub frentes`)
chk(
  conFiltro.add === conFiltro.subs,
  'T1 con el filtro puesto, cada sub frente visible muestra su fila de "+ Tarea"',
  `${conFiltro.add} filas en ${conFiltro.subs} sub frentes`,
)
chk(conFiltro.subs < sinFiltro.subs, 'T5 y los sub frentes sin coincidencias siguen sin aparecer',
    `${conFiltro.subs} de ${sinFiltro.subs}`)
chk(
  (await p.locator('.tabla-wrap').getByText('+ Sub Frente').count()) === 0,
  'T6 "+ Sub Frente" sigue escondido con filtro puesto',
)
chk((await p.locator('.tabla-wrap .archivadas').count()) === 0, 'T6 y el bloque de archivadas también')

// ── T2 · La tarea recién creada se queda visible ───────────────────────────
console.log('\n── T2 a T4 · Crear con el filtro puesto ──')
chk((await hayActualizar(p)) === 0, 'T2 terreno: antes de crear, "Actualizar vista" está apagado')

/** Crea una tarea desde la primera fila de "+ Tarea" que haya a la vista. */
async function crearTarea(p, titulo) {
  await p.locator('.tabla-wrap .fila-add button').first().click()
  await p.waitForTimeout(400)
  await p.locator('.fila-nueva input.inline-input').first().fill(titulo)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(900)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(500)
}

const TITULO = 'Tarea creada con filtro puesto'
await crearTarea(p, TITULO)

const visible = await p.getByText(TITULO, { exact: true }).count()
chk(visible > 0, 'T2 la tarea recién creada se queda visible aunque no cumpla el filtro')
chk((await hayActualizar(p)) === 1, 'T2 y se enciende "Actualizar vista"')

// ── T4 · Quedó bien guardada, en el sub frente correcto ────────────────────
const guardada = await p.evaluate((titulo) => {
  const s = JSON.parse(localStorage.getItem('planificador.state.v1') || 'null')
  const t = s?.tareas?.find((x) => x.titulo === titulo)
  if (!t) return null
  const sf = s.subFrentes.find((x) => x.id === t.subFrenteId)
  const fr = sf && s.frentes.find((x) => x.id === sf.frenteId)
  return {
    sub: sf?.nombre ?? null,
    frente: fr?.nombre ?? null,
    responsable: t.responsableId ?? null,
    fecha: t.fechaObjetivo ?? null,
    hecha: !!t.fechaReal,
  }
}, TITULO)
chk(!!guardada && !!guardada.sub, 'T4 la tarea quedó guardada en un sub frente real', JSON.stringify(guardada))
// La fila del DOM en la que aparece tiene que ser la de ese mismo sub frente.
const enSuSub = await p.evaluate((titulo) => {
  const fila = [...document.querySelectorAll('.tabla-wrap .subfrente')].find((s) => s.innerText.includes(titulo))
  return fila ? fila.querySelector('.subfrente__titulo').innerText.replace(/\s+/g, ' ').trim() : null
}, TITULO)
chk(
  !!enSuSub && !!guardada && enSuSub.includes(guardada.sub),
  'T4 y se ve dentro de ese sub frente, no en otro',
  `DOM="${enSuSub}" estado="${guardada?.sub}"`,
)

// ── T3 · "Actualizar vista", los dos casos ─────────────────────────────────
// La nueva nace sin fecha y sin marcar: su categoría es "pendiente", así que
// con el filtro "Hecha" NO cumple y debe desaparecer al recalcular.
await p.locator('.controles-btn--actualizar').click()
await p.waitForTimeout(900)
chk(
  (await p.getByText(TITULO, { exact: true }).count()) === 0,
  'T3 al recalcular, la tarea desaparece porque no cumple el filtro',
)
chk((await hayActualizar(p)) === 0, 'T3 y el botón se apaga')
// Y sigue existiendo: al limpiar el filtro vuelve a verse.
await limpiarFiltro(p)
chk((await p.getByText(TITULO, { exact: true }).count()) > 0, 'T3 la tarea sigue existiendo: al limpiar el filtro vuelve')

// El otro caso del criterio: con un filtro que SÍ cumple, recalcular la DEJA.
// "Actualizar vista" aparece igual, y es correcto: con filtro puesto la vista
// está congelada (#253) y una tarea recién creada nunca está en esa foto, así
// que queda forzada aunque cumpla el filtro. Lo que distingue los dos casos no
// es si el botón aparece, sino qué pasa al tocarlo.
await filtrarPorEstado(p, 1)
const TITULO2 = 'Tarea que sí cumple el filtro'
await crearTarea(p, TITULO2)
chk((await hayActualizar(p)) === 1, 'T3 creada bajo un filtro que cumple, "Actualizar vista" aparece igual')
chk((await p.getByText(TITULO2, { exact: true }).count()) > 0, 'T3 y se queda a la vista')
await p.locator('.controles-btn--actualizar').click()
await p.waitForTimeout(900)
chk(
  (await p.getByText(TITULO2, { exact: true }).count()) > 0,
  'T3 al recalcular se QUEDA, porque sí cumple el filtro',
)
await limpiarFiltro(p)

// ── T9 · Lo mismo con un filtro de fecha y con uno de responsable ──────────
console.log('\n── T9 · Con filtro de fecha y de responsable ──')
for (const [etiqueta, poner] of [
  [
    'fecha',
    async () => {
      await abrirFecha(p)
      await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
      await p.waitForTimeout(400)
      await cerrar(p)
    },
  ],
  [
    'responsable',
    async () => {
      await abrir(p, 'Filtrar')
      await menu(p).locator('.filtro-op--campo', { hasText: 'Responsable' }).click()
      await p.waitForTimeout(300)
      await menu(p).locator('.filtro-op--check').nth(0).click()
      await p.waitForTimeout(400)
      await cerrar(p)
    },
  ],
]) {
  await poner()
  const n = { add: await filasAdd(p), subs: await subsVisibles(p) }
  chk(
    n.subs > 0 && n.add === n.subs,
    `T9 con filtro de ${etiqueta}, cada sub frente visible muestra su "+ Tarea"`,
    `${n.add} filas en ${n.subs} sub frentes`,
  )
  await limpiarFiltro(p)
}

// ── T8 · La Gantt sigue igual ──────────────────────────────────────────────
console.log('\n── T8 · La Gantt no cambia ──')
await filtrarPorEstado(p, 1)
await p.getByRole('button', { name: 'Gantt', exact: true }).first().click()
await p.waitForTimeout(1000)
chk(
  (await p.locator('.gantt .gantt-vacio, .gantt .mas-btn').count()) > 0,
  'T8 la Gantt sigue dejando crear con filtro puesto, como antes',
)
chk((await p.locator('.tabla-wrap').count()) === 0, 'T8 terreno: se está viendo la Gantt, no la tabla')

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #322 y #320 — el campo Fecha sin excepciones, y se puede crear con filtro puesto')
