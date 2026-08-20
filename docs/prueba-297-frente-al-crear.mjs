// #297 — El primer frente de un proyecto recién creado aparece de inmediato.
//
// Camino que se comprueba (sección 1 del pedido de reapertura):
//   1. Estar dentro de un proyecto y elegir UN FRENTE CONCRETO en la lateral.
//   2. Crear un proyecto nuevo desde ahí. Se queda DENTRO del proyecto nuevo.
//   3. Crear el primer frente con el botón del centro (pantalla de vacío).
//   4. El frente aparece en la vista principal SIN CLICS EXTRA.
// En Tabla y en Gantt.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-297-frente-al-crear.mjs
//
// Corre en modo Local (repo de memoria): no toca la base ni la producción.
//
// Controles negativos comprobados (la prueba sabe fallar):
//   · Quitando `setFrenteSel('todos')` de `createProyecto` → fallan los dos
//     "paso 4" (el mensaje de vacío no desaparece, el frente no aparece).
//   · Quitando el `setState` previo a la navegación en `createProyecto` →
//     fallan los dos "paso 2" (la app termina en Resumen).
import { chromium } from 'playwright-core'

// #306: el título del frente lleva además, en gris y chico, cuántos sub
// frentes tiene. El NOMBRE es el primer nodo de texto del `h2`, no su
// `innerText` completo.
const nombresDeFrente = (pg) =>
  pg.evaluate(() =>
    [...document.querySelectorAll('h2.frente-titulo')].map((e) => e.firstChild?.textContent?.trim() ?? ''),
  )

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL = process.env.URL ?? 'http://localhost:4173/'
const PROYECTO_BASE = 'Plan PGP Arauco'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('dialog', (d) => d.accept())

const esperar = (ms) => p.waitForTimeout(ms)
const enResumen = async () => (await p.locator('.main').innerText()).includes('Resumen de proyectos')

async function entrarA(nombre) {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(400)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(700)
}

async function elegirPrimerFrente() {
  await p.locator('.nav-frente-row .nav-frente--flex').first().click()
  await esperar(600)
  return (await p.locator('.nav-frente-row .nav-frente--flex').first().innerText()).trim()
}

async function crearProyecto(nombre) {
  await p.locator('button[title="Nuevo proyecto"]').click()
  await esperar(400)
  await p.locator('form .campo input').first().fill(nombre)
  await p.locator('form button[type="submit"]').first().click()
  await esperar(900)
}

async function crearPrimerFrenteDesdeElCentro(nombre) {
  await p.locator('.vacio-frentes button').first().click()
  await esperar(300)
  await p.locator('.vacio-frentes__form input').fill(nombre)
  await p.keyboard.press('Enter')
  await esperar(900)
}

await p.goto(URL)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)

// ── C1 · Tabla: el camino completo de la sección 1 ──────────────────────────
await entrarA(PROYECTO_BASE)
const frenteElegido = await elegirPrimerFrente()
chk(
  (await p.locator('.nav-frente-row--activo').count()) === 1,
  'C5 elegir un frente concreto queda marcado en la lateral',
  `frente="${frenteElegido}"`,
)

await crearProyecto('P297 Tabla')
chk(!(await enResumen()), 'C1/Tabla paso 2: se queda DENTRO del proyecto nuevo, no en Resumen')
chk(
  (await p.locator('.nav-frente-row--activo').count()) === 0,
  'C3 al entrar al proyecto nuevo la selección de frente queda limpia ("todos")',
)
chk((await p.locator('.vacio-frentes').count()) === 1, 'C1/Tabla paso 2: muestra la pantalla de vacío')

await crearPrimerFrenteDesdeElCentro('Frente Tabla')
chk(
  (await p.locator('.vacio-frentes').count()) === 0,
  'C1/Tabla paso 4: el mensaje "aún no tiene frentes" desaparece',
)
chk(
  (await nombresDeFrente(p)).includes('Frente Tabla'),
  'C1/Tabla paso 4: el frente aparece en la vista principal SIN clics extra',
)
chk((await p.locator('.nav-frente-row').count()) === 1, 'C1/Tabla paso 4: el frente aparece en la lateral')

// ── C1 · Gantt: el mismo camino con la vista Gantt activa ───────────────────
await entrarA(PROYECTO_BASE)
await p.locator('.toggle button', { hasText: 'Gantt' }).click()
await esperar(600)
await elegirPrimerFrente()
await crearProyecto('P297 Gantt')
chk(!(await enResumen()), 'C1/Gantt paso 2: se queda DENTRO del proyecto nuevo, no en Resumen')
const enGantt = (await p.locator('.toggle button.activo').innerText()).trim() === 'Gantt'
chk(enGantt, 'C1/Gantt: la vista Gantt sigue activa en el proyecto nuevo')
chk((await p.locator('.vacio-frentes').count()) === 1, 'C1/Gantt paso 2: muestra la pantalla de vacío')

await crearPrimerFrenteDesdeElCentro('Frente Gantt')
chk(
  (await p.locator('.vacio-frentes').count()) === 0,
  'C1/Gantt paso 4: el mensaje "aún no tiene frentes" desaparece SIN clics extra',
)
chk((await p.locator('.nav-frente-row').count()) === 1, 'C1/Gantt paso 4: el frente aparece en la lateral')

// ── C4 · Los otros caminos de entrada siguen entrando con "todos" ───────────
await p.locator('.toggle button', { hasText: 'Tabla' }).click()
await esperar(400)
await entrarA(PROYECTO_BASE)
await elegirPrimerFrente()
await entrarA(PROYECTO_BASE) // elegir un proyecto desde Resumen
chk(
  (await p.locator('.nav-frente-row--activo').count()) === 0,
  'C4 elegir un proyecto entra con la selección en "todos"',
)

await elegirPrimerFrente()
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(700)
const filaTarea = p.locator('.link-tarea, .tarea-cell__link, td.tarea-cell').first()
if (await filaTarea.count()) {
  await filaTarea.click()
  await esperar(700)
}
chk(!(await p.locator('.vacio-frentes').isVisible().catch(() => false)),
    'C4 saltar a una tarea desde Mis Tareas no deja la vista en falso vacío')

await p.evaluate(() => localStorage.removeItem('planificador.sesion.v1'))
await p.reload()
await esperar(900)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await entrarA(PROYECTO_BASE)
chk(
  (await p.locator('.nav-frente-row--activo').count()) === 0,
  'C4 iniciar sesión entra con la selección en "todos"',
)

// ── C5 · Elegir un frente concreto sigue funcionando ────────────────────────
const nombreFrente = await elegirPrimerFrente()
const titulos = await nombresDeFrente(p)
chk(
  titulos.length === 1 && titulos[0].trim() === nombreFrente,
  'C5 elegir un frente concreto muestra ESE frente y solo ese',
  `titulos=${JSON.stringify(titulos)}`,
)

// ── C6 · El filtro no se arrastra entre proyectos (#221) ────────────────────
// #305: los campos de filtro ya no son botones sueltos de la barra; se entra
// por el control "Filtrar" y desde ahí al campo.
await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
await esperar(300)
await p.locator('.filtro-menu--portal .filtro-op--campo', { hasText: 'Estado' }).click()
await esperar(300)
await p.locator('.filtro-op', { hasText: /^Atrasada$/ }).first().click()
await esperar(300)
await p.keyboard.press('Escape')
await esperar(300)
const conFiltro = await p.locator('.controles-btn--activo').count()
await entrarA('P297 Tabla')
const trasCambiar = await p.locator('.controles-btn--activo').count()
chk(trasCambiar === 0, 'C6 el filtro no se arrastra al cambiar de proyecto', `antes=${conFiltro} después=${trasCambiar}`)

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #297 — el camino de la sección 1 queda demostrado')
