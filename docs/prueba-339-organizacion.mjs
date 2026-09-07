// #339 — Organización del usuario: la parte que se ve en la PANTALLA.
//
// Los criterios que hablan de quién ve a quién (3 a 7) y el de que la regla
// diga lo mismo en los dos lugares (12) **no viven acá**: viven en la base, y
// se comprueban en `docs/prueba-339-organizacion-base.mjs` —contra un
// PostgreSQL real con las migraciones aplicadas— y en la compuerta
// `scripts/validar-rls.mjs` cuando corre contra producción. El repo de memoria
// que usa la demo devuelve TODOS los usuarios a todo el mundo, así que pedirle
// a esta prueba que compruebe la visibilidad sería comprobar nada.
//
// **#353 cambió el contrato de esta pantalla**, y por eso esta prueba se
// recortó en vez de arreglarse:
//   · el campo Organización ya NO se ofrece para cualquier perfil, solo para
//     CONSULTORES (punto 3b), así que los criterios 1 y 2 no se pueden probar
//     sobre un administrador ni sobre un cliente;
//   · ya NO existe "Escribir una nueva…": se escribe directo y la lista se
//     filtra (punto 5).
// Los criterios 1, 2 y 10 de #339 siguen comprobados, con el control nuevo y
// sobre consultores, en `docs/prueba-353-agregar-colega.mjs`. Acá se queda lo
// que #353 no movió y que sigue siendo exclusivo de #339.
//
// Lo que SÍ se comprueba acá:
//   9  un no administrador no ve el campo (la barrera de verdad es el trigger
//      de la base, que la prueba de base comprueba);
//   8  el correo se sigue mostrando igual que antes de #339.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-339-organizacion.mjs
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
  await esperar(1000)
}
const irAUsuarios = async () => {
  await p.getByText('Usuarios', { exact: true }).first().click()
  await esperar(900)
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
/** #353: el campo pasó a ser un combo propio; lo que se pregunta es si ESTÁ. */
const hayCampoOrg = () => p.locator('.modal-card .combo-org__campo').count()

await entrarComo('Daniela Vera')
await irAUsuarios()

// ── Criterio 9 · quien no configura usuarios no ve el campo ────────────────
console.log('\n── Criterio 9 · solo quien configura usuarios ──')
await entrarComo('Carla Soto') // consultor
await irAUsuarios()
const abrioComoConsultor = await pulsarSiEsta(
  p.locator('.usuarios-cabecera__acciones button.btn--primary'),
  600,
)
const comoConsultor = abrioComoConsultor ? await hayCampoOrg() : 0
chk(
  abrioComoConsultor,
  'terreno: el consultor puede abrir el alta (crea CLIENTES)',
  abrioComoConsultor ? '' : 'no pudo abrirla: el criterio se comprueba igual por la ausencia del campo',
)
chk(
  comoConsultor === 0,
  '#339-9 · un no administrador NO ve el campo Organización',
  comoConsultor ? 'lo vio' : 'ausente',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// ── Criterio 8 · el correo no cambió ───────────────────────────────────────
await entrarComo('Daniela Vera')
await irAUsuarios()
const correos = await p.evaluate(
  () => [...document.querySelectorAll('.usuarios-tabla tbody tr')].filter((tr) => tr.textContent.includes('@')).length,
)
chk(correos > 0, '#339-8 · la pantalla de usuarios sigue mostrando los correos como hoy', `${correos} filas con correo`)

await b.close()
