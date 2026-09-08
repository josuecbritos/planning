// #352 — BUG: la vista principal se quedaba filtrando por un frente eliminado.
//
// EL OBJETIVO:
//
//   Al eliminar el frente que se estaba viendo, la vista principal pasa a
//   mostrar todas las tareas del proyecto, en vez de decir que el proyecto no
//   tiene frentes.
//
// En la barra lateral se elige un frente con un clic y la vista muestra solo
// ese. Si ese frente se ELIMINA, la selección se quedaba apuntando a un frente
// que ya no existe: la vista filtraba por él, no encontraba nada y caía en
// "Este proyecto aún no tiene frentes", aunque quedaran otros. La barra
// lateral, que no filtra por frente, sí los seguía mostrando — de ahí lo
// desconcertante.
//
// Es la observación que #297 dejó anotada sin solicitud, cuando cerró los dos
// caminos que conocía y quedó dicho que la vista no se protege sola de una
// selección imposible. Eliminar un frente es la vía real.
//
// La corrección protege la VISTA y no el momento de eliminar: cualquier camino
// que deje la selección apuntando a un frente que no está en el proyecto
// abierto queda cubierto. Por eso esta prueba comprueba también el caso que NO
// pasa por eliminar (cambiar de proyecto), que es el que #297 ya cubría.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-352-frente-eliminado.mjs
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

const entrarComo = async (nombre) => {
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await esperar(700)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1100)
}
const abrirProyecto = async (nombre = 'Plan PGP Arauco') => {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(450)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(1200)
}
const verVista = async (cual) => {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(1300)
}
const pulsarSiEsta = async (loc, ms = 350) => {
  try {
    await loc.first().click({ timeout: 2500 })
    await esperar(ms)
    return true
  } catch {
    return false
  }
}

/** Los NOMBRES de los frentes que lista la barra lateral, en orden. Se leen del
 *  `title` del nombre y no del texto de la fila, que arrastra el ⋯ del menú. */
const frentesEnBarra = () =>
  p.evaluate(() => [...document.querySelectorAll('.nav-frente-row .nav-frente span[title]')].map((x) => x.getAttribute('title')))
/** Qué se está viendo en la vista principal: frentes dibujados y si cayó en la
 *  pantalla de proyecto vacío. */
const vistaPrincipal = () =>
  p.evaluate(() => ({
    frentes: [...document.querySelectorAll('.frente-titulo')].map((x) => (x.firstChild?.textContent ?? '').trim()),
    rotulosGantt: [...document.querySelectorAll('.gantt td.fija--frente .fija-txt')].map((x) => x.textContent.trim()),
    vacio: /Este proyecto aún no tiene frentes/.test(document.querySelector('.content')?.textContent ?? ''),
    tareas: document.querySelectorAll('tr.fila-tarea, .gantt tbody tr.gfila-tarea').length,
  }))
/** La fila de un frente, localizada por el `title` de su nombre — exacto, para
 *  que "Levantamiento" no case también con otro que lo contenga. */
const filaFrente = (nombre) => p.locator(`.nav-frente-row:has(.nav-frente span[title="${nombre}"])`)
const elegirFrente = (nombre) => pulsarSiEsta(filaFrente(nombre).locator('.nav-frente'), 900)
/**
 * Eliminar un frente desde su menú ⋯ de la barra lateral.
 *
 * El ⋯ reserva su lugar pero está `visibility: hidden` hasta que el mouse pasa
 * por su fila (#222), así que hay que pasar el mouse ANTES: sin eso el clic no
 * llega y la prueba mediría que "no se pudo eliminar" en vez de lo que quiere.
 */
const eliminarFrente = async (nombre) => {
  try {
    await filaFrente(nombre).first().hover({ timeout: 2500 })
    await esperar(200)
  } catch {
    return false
  }
  if (!(await pulsarSiEsta(filaFrente(nombre).locator('.nav-frente__menu-btn'), 400))) return false
  return pulsarSiEsta(p.locator('.nav-proyecto__menu-op', { hasText: 'Eliminar frente' }), 1300)
}
/** Crear un proyecto desde la pantalla de administración. */
const crearProyecto = async (nombre) => {
  await pulsarSiEsta(p.locator('.nav-frente', { hasText: 'Proyectos' }).last(), 900)
  if (!(await pulsarSiEsta(p.locator('.btn--primary', { hasText: 'Proyecto' }), 600))) return false
  await p.locator('.modal-card input').first().fill(nombre)
  await esperar(150)
  return pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 1100)
}

await entrarComo('Daniela Vera')
await abrirProyecto()

// ── Terreno ────────────────────────────────────────────────────────────────
console.log('── Terreno ──')
const alEntrar = await frentesEnBarra()
chk(alEntrar.length >= 2, 'el proyecto tiene al menos dos frentes', alEntrar.join(' | '))
const [primero] = alEntrar

// ── Criterio 4 · eliminar OTRO frente no cambia lo que se está viendo ──────
console.log('\n── Criterio 4 · eliminar un frente distinto del elegido ──')
chk(await elegirFrente(primero), `terreno: se elige "${primero}" en la barra lateral`)
const soloPrimero = await vistaPrincipal()
chk(
  soloPrimero.frentes.length === 1 && soloPrimero.frentes[0] === primero,
  'terreno: la vista muestra solo ese frente',
  soloPrimero.frentes.join(' | '),
)
// Se crea un tercer frente para poder borrar uno que NO se está viendo sin
// quedarse sin material para el resto de la prueba.
await pulsarSiEsta(p.locator('.nav-proyecto', { hasText: 'Plan PGP Arauco' }).first().locator('.nav-proyecto__menu-btn'), 300)
await pulsarSiEsta(p.locator('.nav-proyecto__menu-op', { hasText: 'Agregar frente' }), 400)
await p.locator('.modal-card input').first().fill('Frente de paso')
await pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 900)
chk((await frentesEnBarra()).includes('Frente de paso'), 'terreno: se agrega un tercer frente')
// Al crear un frente se entra a él (#297), así que se vuelve a elegir el primero.
await elegirFrente(primero)
chk(await eliminarFrente('Frente de paso'), 'terreno: se elimina un frente DISTINTO del elegido')
const trasBorrarOtro = await vistaPrincipal()
chk(
  trasBorrarOtro.frentes.length === 1 && trasBorrarOtro.frentes[0] === primero && !trasBorrarOtro.vacio,
  '#352-4 · la vista sigue mostrando el frente elegido, sin cambios',
  trasBorrarOtro.frentes.join(' | ') || '(ninguno)',
)

// ── Criterios 1 y 2 · eliminar el frente que se está viendo ───────────────
console.log('\n── Criterios 1 y 2 · eliminar el frente que se está viendo ──')
const antesDeBorrar = await vistaPrincipal()
chk(
  antesDeBorrar.frentes.length === 1 && antesDeBorrar.frentes[0] === primero,
  `terreno: se está viendo solo "${primero}"`,
  antesDeBorrar.frentes.join(' | '),
)
chk(await eliminarFrente(primero), `terreno: se elimina "${primero}", que es el que se está viendo`)
const trasBorrar = await vistaPrincipal()
chk(
  !trasBorrar.vacio,
  '#352-2 · NO aparece "Este proyecto aún no tiene frentes"',
  trasBorrar.vacio ? 'apareció' : 'no apareció',
)
chk(
  trasBorrar.frentes.length >= 1 && !trasBorrar.frentes.includes(primero),
  '#352-1 · la vista pasa a mostrar todas las tareas de los frentes que quedan',
  trasBorrar.frentes.join(' | ') || '(ninguno)',
)
chk(trasBorrar.tareas > 0, '#352-1 · y hay tareas a la vista', `${trasBorrar.tareas} filas`)
const barraTrasBorrar = await frentesEnBarra()
chk(
  !barraTrasBorrar.includes(primero),
  '#352-1 · y la barra lateral deja de listarlo',
  barraTrasBorrar.join(' | ') || '(ninguno)',
)

// ── Criterio 5 · lo mismo en la Gantt ──────────────────────────────────────
console.log('\n── Criterio 5 · lo mismo en la Gantt ──')
// Hacen falta DOS frentes: si al borrar el que se ve el proyecto se queda sin
// ninguno, la pantalla vacía es lo CORRECTO y el caso no probaría nada.
await pulsarSiEsta(p.locator('.nav-proyecto', { hasText: 'Plan PGP Arauco' }).first().locator('.nav-proyecto__menu-btn'), 300)
await pulsarSiEsta(p.locator('.nav-proyecto__menu-op', { hasText: 'Agregar frente' }), 400)
await p.locator('.modal-card input').first().fill('Frente testigo')
await pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 900)
const quedan = (await frentesEnBarra()).filter((n) => n !== 'Frente testigo')
chk(quedan.length >= 1 && (await frentesEnBarra()).includes('Frente testigo'),
    'terreno: quedan dos frentes, uno para ver y otro de testigo',
    (await frentesEnBarra()).join(' | '))
await verVista('Gantt')
chk(await elegirFrente(quedan[0]), `terreno: en la Gantt se elige "${quedan[0]}"`)
const ganttAntes = await vistaPrincipal()
chk(
  ganttAntes.rotulosGantt.length >= 1 && !ganttAntes.vacio,
  'terreno: la Gantt muestra ese frente',
  ganttAntes.rotulosGantt.join(' | ') || '(ninguno)',
)
chk(await eliminarFrente(quedan[0]), 'terreno: se elimina ese frente desde la Gantt')
const ganttTras = await vistaPrincipal()
chk(
  !ganttTras.vacio,
  '#352-5 · en la Gantt tampoco aparece "Este proyecto aún no tiene frentes"',
  ganttTras.vacio ? 'apareció' : 'no apareció',
)
chk(
  ganttTras.rotulosGantt.length >= 1 && !ganttTras.rotulosGantt.includes(quedan[0]),
  '#352-5 · y pasa a mostrar los frentes que quedan',
  ganttTras.rotulosGantt.join(' | ') || '(ninguno)',
)

// ── Criterio 3 · eliminar el ÚNICO frente sí muestra la pantalla vacía ────
console.log('\n── Criterio 3 · el proyecto que de verdad se queda sin frentes ──')
await verVista('Tabla')
const restantes = await frentesEnBarra()
const borrados = []
for (const f of restantes) borrados.push(`${f}=${(await eliminarFrente(f)) ? 'ok' : 'NO'}`)
chk(borrados.every((x) => x.endsWith('=ok')), 'terreno: se eliminan los frentes que quedaban', borrados.join(' | '))
const sinNinguno = await vistaPrincipal()
chk(
  (await frentesEnBarra()).length === 0,
  'terreno: el proyecto quedó sin ningún frente',
  (await frentesEnBarra()).join(' | ') || '(ninguno)',
)
chk(
  sinNinguno.vacio,
  '#352-3 · ahí SÍ aparece "Este proyecto aún no tiene frentes", porque es verdad',
  sinNinguno.vacio ? 'apareció' : 'no apareció',
)

// ── Criterio 6 · cambiar de proyecto con un frente elegido ────────────────
console.log('\n── Criterio 6 · cambiar de proyecto ──')
// Es el caso que #297 ya cubría limpiando la selección AL ENTRAR. La corrección
// de #352 lo cubre además desde el otro extremo, así que tiene que seguir
// funcionando igual: con un frente elegido en un proyecto, el OTRO no puede
// quedar filtrando por él.
chk(await crearProyecto('Segundo proyecto'), 'terreno: se crea un segundo proyecto')
await abrirProyecto('Segundo proyecto')
await pulsarSiEsta(p.locator('.nav-proyecto', { hasText: 'Segundo proyecto' }).first().locator('.nav-proyecto__menu-btn'), 300)
await pulsarSiEsta(p.locator('.nav-proyecto__menu-op', { hasText: 'Agregar frente' }), 400)
await p.locator('.modal-card input').first().fill('Frente del segundo')
await pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 900)
const enSegundo = await frentesEnBarra()
chk(enSegundo.includes('Frente del segundo'), 'terreno: el segundo proyecto tiene un frente', enSegundo.join(' | '))
chk(await elegirFrente('Frente del segundo'), 'terreno: se elige ese frente')
const conFrente = await vistaPrincipal()
chk(
  conFrente.frentes.length === 1 && !conFrente.vacio,
  'terreno: se está viendo un solo frente',
  conFrente.frentes.join(' | '),
)
// El primero quedó SIN frentes, así que al cambiar tiene que decirlo — y no
// filtrar por el frente del otro proyecto, que es lo que #297 cerró.
await abrirProyecto('Plan PGP Arauco')
const alVolver = await vistaPrincipal()
chk(
  alVolver.vacio,
  '#352-6 · al cambiar de proyecto con un frente elegido, el otro no queda filtrando por un frente ajeno',
  `vacío=${alVolver.vacio} frentes=${alVolver.frentes.join(' | ') || '(ninguno)'}`,
)
await abrirProyecto('Segundo proyecto')
const deVuelta = await vistaPrincipal()
chk(
  deVuelta.frentes.length >= 1 && !deVuelta.vacio,
  '#352-6 · y al volver, el proyecto con frentes los sigue mostrando',
  deVuelta.frentes.join(' | ') || '(ninguno)',
)

await b.close()
