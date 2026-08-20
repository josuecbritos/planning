// #305e — Guardar una vista apaga su asterisco y su ícono.
//
// El defecto: la comparación entre la vista guardada y lo que hay en pantalla
// se hacía con `JSON.stringify`, letra por letra. Eso solo da igual si las
// propiedades vienen en el MISMO orden, y el orden de las propiedades no es
// información: es un accidente de cómo se armó el objeto.
//
// El pedido lo atribuyó a la base —la columna `jsonb` reordena las claves y la
// vista en memoria se reemplaza con lo que devolvió la base— y dio por hecho
// que contra la base de mentira no se reproduce. **Se reproduce igual**, por un
// segundo camino que no necesita base real: el orden en que se ARMA el filtro.
// Elegir Estado y después "Sin fecha" produce `{estados, sinFecha}`; al revés
// produce `{sinFecha, estados}`. Mismo filtro, distinto texto.
//
// Por eso esta prueba puede ser un control negativo de verdad, sin tocar
// producción. Corrida contra `main` antes del arreglo, fallan tres:
//   · E5: rearmar el MISMO filtro en otro orden deja el asterisco encendido.
//   · E6: con las claves de la vista guardada reordenadas a mano —lo mismo que
//     hace la columna `jsonb` al devolverlas— el asterisco queda encendido
//     aunque el contenido sea idéntico.
//   · E7: destildar y volver a tildar un estado lo manda al final de la lista,
//     y eso encendía el asterisco.
//
// E1 a E4 —el camino literal del pedido— pasan en verde con y sin el arreglo:
// contra el repo en memoria la vista guardada y la de pantalla son el MISMO
// objeto, así que el texto siempre coincide. Ahí el defecto solo se ve contra
// la base real. Se conservan porque son los criterios del pedido y porque
// fijan el comportamiento correcto; los que muerden son E5, E6 y E7.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-305e-vista-modificada.mjs
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

const menu = (p) => p.locator('.filtro-menu--portal')
const abrir = async (p, n) => {
  await p.locator('.controles-btn', { hasText: n }).first().click()
  await p.waitForTimeout(350)
}
const cerrar = async (p) => {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
}
async function abrirProyecto(p) {
  await p.getByText('Resumen', { exact: true }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
  await p.waitForTimeout(900)
}

/** Las dos señales de "esta vista tiene cambios sin guardar", que son una. */
async function señas(p) {
  const asterisco = (await p.locator('.controles-ctrl--vistas .controles-btn').innerText()).includes('*')
  await abrir(p, 'Vistas')
  const filas = await p.evaluate(() =>
    [...document.querySelectorAll('.filtro-menu--portal .filtro-guardado')].map((f) => ({
      nombre: f.querySelector('.filtro-guardado__aplicar').textContent.replace(/[✓*]/g, '').trim(),
      activa: f.classList.contains('filtro-guardado--activa'),
      encendido: !f.querySelector('.icon-btn').disabled,
    })),
  )
  const guardarVistaOff = await menu(p).locator('.filtro-op--guardar').isDisabled()
  await cerrar(p)
  return { asterisco, filas, guardarVistaOff }
}

// -- Acciones sobre el filtro y el orden, cada una por su camino de la UI ----
async function toggleEstado(p, estado) {
  await abrir(p, 'Filtrar')
  await menu(p).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
  await p.waitForTimeout(300)
  await menu(p)
    .locator('.filtro-op--check')
    .filter({ has: p.locator(`span:text-is("${estado}")`) })
    .click()
  await p.waitForTimeout(300)
  await cerrar(p)
}
async function toggleSinFecha(p) {
  await abrir(p, 'Filtrar')
  await menu(p).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
  await p.waitForTimeout(300)
  await menu(p).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
  await p.waitForTimeout(300)
  await cerrar(p)
}
async function toggleResponsable(p, i = 0) {
  await abrir(p, 'Filtrar')
  await menu(p).locator('.filtro-op--campo', { hasText: 'Responsable' }).click()
  await p.waitForTimeout(300)
  await menu(p).locator('.filtro-op--check').nth(i).click()
  await p.waitForTimeout(300)
  await cerrar(p)
}
async function toggleOrden(p, i, dir = 0) {
  await abrir(p, 'Ordenar')
  await menu(p).locator('.orden-campo').nth(i).locator('.orden-campo__dir').nth(dir).click()
  await p.waitForTimeout(400)
  await cerrar(p)
}
async function guardarNueva(p, nombre) {
  await abrir(p, 'Vistas')
  await menu(p).locator('.filtro-op--guardar').click()
  await p.waitForTimeout(400)
  await p.locator('.modal-card input').first().fill(nombre)
  await p.getByRole('button', { name: 'Guardar', exact: true }).click()
  await p.waitForTimeout(800)
}
async function guardarActiva(p) {
  await abrir(p, 'Vistas')
  await menu(p).locator('.filtro-guardado--activa .icon-btn').first().click()
  await p.waitForTimeout(800)
  await cerrar(p)
}
async function salirDeVista(p) {
  await p.locator('.controles-ctrl--vistas .controles-x').click()
  await p.waitForTimeout(500)
}
async function limpiarFiltro(p) {
  const x = p.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x')
  if (await x.count()) {
    await x.click()
    await p.waitForTimeout(500)
  }
}
const vistaGuardada = (p) =>
  p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('planificador.state.v1') || 'null')
    const vs = s?.vistas ?? []
    return vs.length ? { filtro: vs[0].filtro, orden: vs[0].orden, claves: Object.keys(vs[0].filtro ?? {}) } : null
  })

/**
 * Entra a la vista si no está ya adentro. Hace falta porque EN QUÉ VISTA
 * ESTABAS se guarda por máquina (#289): al recargar se vuelve a entrar solo, y
 * tocarla otra vez SALDRÍA de ella.
 */
async function asegurarVistaActiva(p, nombre) {
  const dentro = (await p.locator('.controles-ctrl--vistas .controles-btn').innerText()).includes(nombre)
  if (dentro) return 'ya estaba'
  await abrir(p, 'Vistas')
  await menu(p).locator('.filtro-guardado__aplicar', { hasText: nombre }).click()
  await p.waitForTimeout(600)
  await cerrar(p)
  return 'entró'
}

// ═══════════════════════════════════════════════════════════════════════════
// E1 · El camino del pedido: guardar apaga el asterisco y el ícono
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── E1 · Guardar con el orden todavía puesto ──')
const p = await sesion()
await abrirProyecto(p)

await toggleEstado(p, 'Atrasada')
await guardarNueva(p, 'Vista A')
let s = await señas(p)
chk(!s.asterisco && !s.filas[0].encendido, 'E1 recién guardada: sin asterisco y con el ícono apagado')

// Paso 1 del pedido: agregar un criterio de orden.
await toggleOrden(p, 0)
s = await señas(p)
chk(s.asterisco && s.filas[0].encendido, 'E1 al agregar un orden aparecen el asterisco y el ícono')

// Paso 2: guardar. El orden SIGUE puesto — es justo el caso que fallaba.
await guardarActiva(p)
const ordenSigue = await p.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).count()
s = await señas(p)
chk(ordenSigue === 1, 'E1 terreno: el orden sigue puesto después de guardar')
chk(!s.asterisco, 'E1 el asterisco desaparece al guardar, con el orden todavía puesto')
chk(!s.filas[0].encendido, 'E1 y el ícono se apaga')

// Pasos 4 y 5: quitar el orden y volver a guardar.
await p.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).locator('.controles-x').click()
await p.waitForTimeout(500)
s = await señas(p)
chk(s.asterisco && s.filas[0].encendido, 'E1 al quitar el orden vuelven las dos señales')
await guardarActiva(p)
s = await señas(p)
chk(!s.asterisco && !s.filas[0].encendido, 'E1 y al guardar se apagan de nuevo')

// ── E2 · Con filtro por responsable, y con filtro y orden a la vez ─────────
console.log('\n── E2 · Otras combinaciones ──')
await toggleResponsable(p, 0)
s = await señas(p)
chk(s.asterisco && s.filas[0].encendido, 'E2 agregar un filtro por responsable enciende las dos señales')
await guardarActiva(p)
s = await señas(p)
chk(!s.asterisco && !s.filas[0].encendido, 'E2 y guardar las apaga, con el filtro puesto')

await toggleOrden(p, 1)
await toggleEstado(p, 'Hecha')
s = await señas(p)
chk(s.asterisco && s.filas[0].encendido, 'E2 filtro y orden a la vez encienden las dos señales')
await guardarActiva(p)
s = await señas(p)
chk(!s.asterisco && !s.filas[0].encendido, 'E2 y guardar las apaga, con los dos puestos')

// ── E3 · Recargar y volver a entrar ────────────────────────────────────────
console.log('\n── E3 · Después de recargar ──')
const antesDeRecargar = await vistaGuardada(p)
await p.reload()
await p.waitForTimeout(1200)
await abrirProyecto(p)
const comoQuedo = await asegurarVistaActiva(p, 'Vista A')
s = await señas(p)
chk(
  s.filas[0]?.activa,
  'E3 terreno: tras recargar se está dentro de la vista',
  `${comoQuedo}; ${antesDeRecargar ? JSON.stringify(antesDeRecargar.claves) : 'sin vista'}`,
)
chk(!s.asterisco && !s.filas[0]?.encendido, 'E3 al recargar y volver a entrar a la vista no aparece el asterisco')

// ── E4 · Cambiar un valor lo enciende de nuevo ─────────────────────────────
await toggleEstado(p, 'Pendiente')
s = await señas(p)
chk(s.asterisco && s.filas[0].encendido, 'E4 cambiar un valor del filtro reenciende las dos señales')
await guardarActiva(p)

// ═══════════════════════════════════════════════════════════════════════════
// E5 · El orden de las PROPIEDADES no es información (el defecto de fondo)
// ═══════════════════════════════════════════════════════════════════════════
// Dos caminos lo cambian sin que cambie nada real: la columna `jsonb`, que las
// reordena al devolverlas, y el orden en que se ARMA el filtro. El segundo no
// necesita base real, así que se puede comprobar acá.
console.log('\n── E5 · El mismo filtro armado en otro orden ──')
const q = await sesion()
await abrirProyecto(q)

// Se arma ESTADO → SIN FECHA y se guarda: `{estados, sinFecha}`.
await toggleEstado(q, 'Atrasada')
await toggleSinFecha(q)
await guardarNueva(q, 'Vista B')
const guardada = await vistaGuardada(q)
chk(
  guardada?.claves.join(',') === 'estados,sinFecha',
  'E5 terreno: la vista quedó guardada con las claves en el orden en que se armó',
  guardada?.claves.join(',') ?? 'sin vista',
)

// Dentro de la vista se limpia y se rearma AL REVÉS: `{sinFecha, estados}`.
// Mismo contenido, distinto texto.
await limpiarFiltro(q)
s = await señas(q)
chk(s.asterisco, 'E5 al limpiar aparece el asterisco, que es lo correcto')
await toggleSinFecha(q)
await toggleEstado(q, 'Atrasada')
s = await señas(q)
chk(
  !s.asterisco && !s.filas[0].encendido,
  'E5 rearmado en otro orden, el mismo filtro NO cuenta como modificado',
)

// El caso de la base, simulado: se reordenan a mano las claves de la vista
// guardada, que es exactamente lo que hace `jsonb` al devolverlas.
console.log('\n── E6 · Las claves reordenadas, como las devuelve la base ──')
const reordenadas = await q.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('planificador.state.v1'))
  const v = s.vistas[0]
  // Se reconstruye el objeto con las claves al revés y las listas al revés.
  const f = {}
  for (const k of Object.keys(v.filtro).reverse()) {
    f[k] = Array.isArray(v.filtro[k]) ? [...v.filtro[k]].reverse() : v.filtro[k]
  }
  v.filtro = f
  localStorage.setItem('planificador.state.v1', JSON.stringify(s))
  return Object.keys(f)
})
chk(reordenadas.join(',') === 'sinFecha,estados', 'E6 terreno: la vista guardada quedó con las claves al revés', reordenadas.join(','))
await q.reload()
await q.waitForTimeout(1200)
await abrirProyecto(q)
await asegurarVistaActiva(q, 'Vista B')
// Se rearma el filtro por la UI, que lo produce en SU orden.
await limpiarFiltro(q)
await toggleEstado(q, 'Atrasada')
await toggleSinFecha(q)
s = await señas(q)
chk(
  !s.asterisco && !s.filas[0].encendido,
  'E6 con las claves de la vista reordenadas, el mismo filtro sigue sin contar como modificado',
)

// ── E7 · Las listas de valores son conjuntos ───────────────────────────────
console.log('\n── E7 · Destildar y volver a tildar ──')
await toggleEstado(q, 'Hecha')
await guardarActiva(q)
s = await señas(q)
chk(!s.asterisco, 'E7 terreno: dos estados elegidos, vista al día')
// Se destilda el primero y se vuelve a tildar: queda al final de la lista.
await toggleEstado(q, 'Atrasada')
await toggleEstado(q, 'Atrasada')
s = await señas(q)
chk(
  !s.asterisco && !s.filas[0].encendido,
  'E7 destildar y volver a tildar un estado no cuenta como modificar: la lista es un conjunto',
)

// ── E8 · El ORDEN sí es una secuencia ──────────────────────────────────────
console.log('\n── E8 · Dos criterios en distinta secuencia son órdenes distintos ──')
const r = await sesion()
await abrirProyecto(r)
await toggleOrden(r, 0)
await toggleOrden(r, 1)
await guardarNueva(r, 'Vista C')
s = await señas(r)
chk(!s.asterisco, 'E8 terreno: dos criterios de orden guardados')
// Tocar la dirección del segundo lo manda al frente: misma pareja, otra
// secuencia. Eso SÍ es otro orden.
await toggleOrden(r, 0)
await toggleOrden(r, 0)
s = await señas(r)
chk(
  s.asterisco && s.filas[0].encendido,
  'E8 cambiar la prioridad enciende el asterisco: la secuencia sí importa',
)

// ── E9 · Solo la vista activa, y "Guardar vista" sin tocar ─────────────────
console.log('\n── E9 · Varias vistas y "Guardar vista" ──')
await salirDeVista(r)
await toggleEstado(r, 'Atrasada')
await guardarNueva(r, 'Vista D')
await toggleOrden(r, 0)
s = await señas(r)
chk(
  s.filas.length === 2 && s.filas.filter((f) => f.encendido).length === 1 && s.filas.find((f) => f.activa)?.encendido,
  'E9 con dos vistas guardadas solo se enciende el ícono de la activa',
  s.filas.map((f) => `${f.nombre}:${f.encendido ? 'ON' : 'off'}`).join(' '),
)
chk(!s.guardarVistaOff, 'E9 "Guardar vista" sigue habilitado con filtro u orden puesto')
await salirDeVista(r)
s = await señas(r)
chk(
  s.filas.every((f) => !f.encendido),
  'E9 sin vista activa no hay ningún ícono encendido',
)
chk(s.guardarVistaOff, 'E9 y "Guardar vista" queda apagado cuando no hay nada que guardar')
await toggleEstado(r, 'Hecha')
s = await señas(r)
chk(!s.guardarVistaOff, 'E9 se habilita de nuevo con un filtro puesto, sin vista activa')

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #305e — guardar una vista apaga su asterisco y su ícono')
