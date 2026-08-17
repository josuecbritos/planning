// #311 — Un frente plegado ya no queda inalcanzable al entrar a ese frente.
//
// La regla: si el frente NO se puede plegar (en la vista de un frente no hay
// chevron), tampoco puede estar plegado. El recuerdo de lo plegado sigue
// siendo uno solo y momentáneo — no se guarda por vista ni sobrevive a
// recargar.
//
// Control negativo comprobado: devolviendo `colapsado={frentesCol.has(f.id)}`
// en TableView, C1 falla con el síntoma exacto del reporte — cero sub frentes,
// cero tareas y sin flecha para desplegar.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-311-frente-plegado.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

/** El bloque de un frente en la vista principal, por su título. */
const bloqueDe = (nombre) => p.locator('section', { has: p.locator('h2.frente-titulo', { hasText: nombre }) }).first()

async function irAlProyecto() {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(400)
  await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
  await esperar(900)
}
const irATodos = async () => {
  await p.locator('.nav-proyecto__title', { hasText: 'Plan PGP Arauco' }).first().click()
  await esperar(700)
}
const irAlFrente = async (nombre) => {
  await p.locator('.nav-frente-row .nav-frente--flex', { hasText: nombre }).first().click()
  await esperar(700)
}

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await irAlProyecto()

const FRENTE = (await p.locator('h2.frente-titulo').first().innerText()).trim()
console.log(`Frente de prueba: "${FRENTE}"\n`)

// ── Preparación · plegarlo en "todos los frentes" ──────────────────────────
await bloqueDe(FRENTE).locator('.frente-cabecera .colapso-btn').click()
await esperar(400)
chk(
  (await bloqueDe(FRENTE).locator('.frente-cabecera--colapsado').count()) === 1,
  'preparación: el frente queda plegado en "todos los frentes"',
)
chk(
  (await bloqueDe(FRENTE).locator('.subfrente__titulo').count()) === 0,
  'preparación: plegado, no muestra sus sub frentes',
)

// ── C1 · Al entrar a ese frente, se ve DESPLEGADO ──────────────────────────
await irAlFrente(FRENTE)
const subsDentro = await bloqueDe(FRENTE).locator('.subfrente__titulo').count()
chk(subsDentro > 0, 'C1 al entrar al frente se ve desplegado, con sus sub frentes', `${subsDentro} sub frentes`)
chk(
  (await bloqueDe(FRENTE).locator('tbody tr').count()) > 0,
  'C1 y con sus tareas',
)
chk(
  (await bloqueDe(FRENTE).locator('.frente-cabecera--colapsado').count()) === 0,
  'C1 su cabecera ya no está marcada como plegada',
)
// La flecha del frente sigue sin dibujarse acá, y eso es correcto: en la vista
// de un frente solo, plegar lo único que se mira no tiene sentido.
chk(
  (await bloqueDe(FRENTE).locator('.frente-cabecera .colapso-btn').count()) === 0,
  'C1 el frente sigue SIN flecha en su propia vista (se mantiene, es correcto)',
)

// ── C2 · Volver a "todos": sigue plegado, como estaba ──────────────────────
await irATodos()
chk(
  (await bloqueDe(FRENTE).locator('.frente-cabecera--colapsado').count()) === 1,
  'C2 al volver a "todos los frentes" el frente SIGUE plegado',
)
chk(
  (await bloqueDe(FRENTE).locator('.frente-cabecera .colapso-btn').count()) === 1,
  'C2 y con su flecha, para poder desplegarlo',
)

// ── C3 · Los sub frentes no cambian: siguen plegados y con su flecha ───────
await bloqueDe(FRENTE).locator('.frente-cabecera .colapso-btn').click() // desplegar el frente
await esperar(400)
const primerSub = bloqueDe(FRENTE).locator('.subfrente__titulo').first()
const nombreSub = (await primerSub.innerText()).trim().replace(/[▾▸]\s*$/, '')
await primerSub.locator('.colapso-btn').click()
await esperar(400)
chk(
  (await bloqueDe(FRENTE).locator('.subfrente__titulo--colapsado').count()) === 1,
  'preparación: el sub frente queda plegado',
  nombreSub,
)
await irAlFrente(FRENTE)
chk(
  (await bloqueDe(FRENTE).locator('.subfrente__titulo--colapsado').count()) === 1,
  'C3 al entrar al frente, el sub frente SIGUE plegado (no cambia)',
)
chk(
  (await bloqueDe(FRENTE).locator('.subfrente__titulo--colapsado .colapso-btn').count()) === 1,
  'C3 y conserva su flecha: siempre se puede reabrir',
)

// ── C4 · Recargar no deja nada plegado ─────────────────────────────────────
await irATodos()
await bloqueDe(FRENTE).locator('.frente-cabecera .colapso-btn').click()
await esperar(400)
chk(
  (await bloqueDe(FRENTE).locator('.frente-cabecera--colapsado').count()) === 1,
  'preparación: plegado otra vez antes de recargar',
)
await p.reload()
await esperar(1000)
chk(
  (await p.locator('.frente-cabecera--colapsado').count()) === 0 &&
    (await p.locator('.subfrente__titulo--colapsado').count()) === 0,
  'C4 tras recargar no queda nada plegado, igual que hoy',
)

// ── C5 · Llegar desde una notificación despliega el frente de la tarea ─────
// Se genera una notificación real: la admin asigna una tarea a Josue. Después
// se entra como él, se pliega ese frente y se toca el aviso.
// Tras recargar, la aplicación siempre parte en Resumen (#274): hay que volver
// a entrar al proyecto.
await irAlProyecto()
const tarea = p.locator('table.tareas tbody tr').first()
await tarea.locator('.resp-picker').first().click()
await esperar(500)
const opcionJosue = p.locator('.resp-menu__inner button', { hasText: 'Josue' }).first()
const hayPicker = await opcionJosue.count()
if (hayPicker) {
  await opcionJosue.click()
  await esperar(800)
  await p.evaluate(() => localStorage.removeItem('planificador.sesion.v1'))
  await p.reload()
  await esperar(900)
  await p.getByText('Josue Britos', { exact: true }).click()
  await esperar(900)
  await irAlProyecto()
  const conTarea = (await p.locator('h2.frente-titulo').first().innerText()).trim()
  await bloqueDe(conTarea).locator('.frente-cabecera .colapso-btn').click()
  await esperar(400)
  chk(
    (await bloqueDe(conTarea).locator('.frente-cabecera--colapsado').count()) === 1,
    'preparación: el frente de la tarea queda plegado',
  )
  await p.getByText('Notificaciones', { exact: true }).first().click()
  await esperar(700)
  const aviso = p.locator('.notif-item').first()
  if (await aviso.count()) {
    await aviso.click()
    await esperar(1000)
    chk(
      (await p.locator('.frente-cabecera--colapsado').count()) === 0,
      'C5 llegar desde una notificación despliega el frente de la tarea',
    )
    chk(
      (await p.locator('table.tareas tbody tr').count()) > 0,
      'C5 y la tarea se ve',
    )
  } else {
    console.log('SKIP  C5 no se encontró el aviso en la lista de notificaciones')
  }
} else {
  console.log('SKIP  C5 no se pudo asignar responsable para generar la notificación')
}

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #311 — el frente plegado ya no queda inalcanzable')
