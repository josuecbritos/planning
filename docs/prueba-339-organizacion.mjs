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
// Lo que SÍ se comprueba acá:
//   1  el campo Organización aparece al crear y al editar, con el desplegable
//      vacío la primera vez y la opción de escribir una nueva;
//   2  escribir "Andotek" en un usuario y editar otro: "Andotek" ya está en la
//      lista;
//   9  un no administrador no ve el campo (la barrera de verdad es el trigger
//      de la base, que la prueba de base comprueba);
//  10  quitarle la organización al último que la tenía: deja de aparecer.
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
/** Lo que el formulario ofrece hoy en el campo Organización. */
const campoOrg = () =>
  p.evaluate(() => {
    const sel = document.querySelector('.modal-card select[aria-label="Organización"]')
    if (!sel) return null
    return {
      opciones: [...sel.options].map((o) => o.textContent.trim()),
      valor: sel.value,
      hayTexto: !!document.querySelector('.modal-card input[aria-label="Nueva organización"]'),
      ayuda: [...document.querySelectorAll('.modal-card .ayuda')].map((x) => x.textContent.trim()),
    }
  })
const abrirEditar = async (nombre) => {
  const fila = p.locator('.usuarios-tabla tbody tr', { hasText: nombre }).first()
  // El lápiz de la fila. Se busca por etiqueta para no depender del orden.
  const ok = await pulsarSiEsta(fila.locator('.icon-btn[data-tip="Editar"]'), 600)
  return ok && (await p.locator('.modal-card').count()) > 0
}
const guardar = () => pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 900)
/** Tolerantes a propósito, como el resto de los ayudantes del repo: sin el
 *  campo —el control negativo— tienen que devolver `false` en vez de reventar,
 *  para que la corrida informe TODO lo que falta y no solo lo primero. */
const elegirOrg = async (opcion) => {
  try {
    await p.locator('.modal-card select[aria-label="Organización"]').selectOption(opcion, { timeout: 2500 })
    await esperar(300)
    return true
  } catch {
    return false
  }
}
const escribirNueva = async (texto) => {
  try {
    await p.locator('.modal-card input[aria-label="Nueva organización"]').fill(texto, { timeout: 2500 })
    await esperar(250)
    return true
  } catch {
    return false
  }
}

await entrarComo('Daniela Vera')
await irAUsuarios()

// ── Criterio 1 · el campo existe y arranca vacío ───────────────────────────
console.log('\n── Criterio 1 · el campo Organización ──')
const abrioNuevo = await pulsarSiEsta(p.locator('.usuarios-cabecera__acciones button.btn--primary'), 600)
chk(abrioNuevo, 'terreno: se abre el formulario de usuario nuevo')
const nuevo = await campoOrg()
chk(!!nuevo, '#339-1 · al crear un usuario aparece el campo Organización')
chk(
  !!nuevo && nuevo.opciones.length === 2 && nuevo.opciones[0] === 'Sin organización' && /nueva/i.test(nuevo.opciones[1]),
  '#339-1 · el desplegable arranca VACÍO la primera vez, con la opción de escribir una nueva',
  nuevo ? nuevo.opciones.join(' | ') : '',
)
chk(!!nuevo && nuevo.valor === '' && !nuevo.hayTexto, '#339-1 · y sin organización elegida ni campo de texto abierto')
chk(
  !!nuevo && nuevo.ayuda.some((a) => /consultores con la misma organización/i.test(a)),
  '#339 · y dice para qué sirve, que es lo único que no se deduce mirando',
  nuevo?.ayuda.join(' / ') ?? '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// ── Criterio 2 · escribir una nueva la deja disponible ─────────────────────
console.log('\n── Criterio 2 · la lista se llena sola ──')
chk(await abrirEditar('Josue Britos'), 'terreno: se abre el formulario de editar')
await elegirOrg({ label: 'Escribir una nueva…' })
const conTexto = await campoOrg()
chk(!!conTexto && conTexto.hayTexto, '#339-2 · elegir "Escribir una nueva…" abre el campo de texto')
await escribirNueva('Andotek')
chk(await guardar(), '#339-2 · y se guarda')

chk(await abrirEditar('Carla Soto'), 'terreno: se abre el formulario de OTRO usuario')
const conAndotek = await campoOrg()
chk(
  !!conAndotek && conAndotek.opciones.includes('Andotek'),
  '#339-2 · "Andotek" ya aparece en la lista al editar a otro usuario',
  conAndotek ? conAndotek.opciones.join(' | ') : '',
)
// Se la asignamos también: hacen falta DOS para el criterio 10.
await elegirOrg('Andotek')
await guardar()

chk(await abrirEditar('Josue Britos'), 'terreno: se vuelve a abrir el primero')
const guardada = await campoOrg()
chk(
  !!guardada && guardada.valor === 'Andotek',
  '#339 · la organización guardada vuelve elegida al reabrir el formulario',
  guardada?.valor ?? '',
)
// Y no se duplica por venir además de la lista.
chk(
  !!guardada && guardada.opciones.filter((o) => o === 'Andotek').length === 1,
  '#339 · y aparece una sola vez en la lista',
  guardada?.opciones.join(' | ') ?? '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// La normalización: "Andotek " no puede convertirse en una segunda entrada.
console.log('\n── La normalización ──')
chk(await abrirEditar('Cliente Arauco'), 'terreno: un tercer usuario')
await elegirOrg({ label: 'Escribir una nueva…' })
await escribirNueva('  Andotek  ')
await guardar()
chk(await abrirEditar('Cliente Arauco'), 'terreno: se reabre')
const trasEspacios = await campoOrg()
chk(
  !!trasEspacios &&
    trasEspacios.valor === 'Andotek' &&
    trasEspacios.opciones.filter((o) => /Andotek/.test(o)).length === 1,
  '#339 · "  Andotek  " no crea una segunda organización: queda en la misma',
  trasEspacios ? `valor "${trasEspacios.valor}" · ${trasEspacios.opciones.join(' | ')}` : '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// ── Criterio 10 · la que se queda sin nadie deja de aparecer ───────────────
console.log('\n── Criterio 10 · la organización sin nadie desaparece ──')
// Primero una organización que va a tener UN solo usuario.
chk(await abrirEditar('Cliente Arauco'), 'terreno: se le pone una organización propia')
await elegirOrg({ label: 'Escribir una nueva…' })
await escribirNueva('Arauco SA')
await guardar()
chk(await abrirEditar('Josue Britos'), 'terreno: se mira desde otro usuario')
const conArauco = await campoOrg()
chk(
  !!conArauco && conArauco.opciones.includes('Arauco SA'),
  '#339 · "Arauco SA" está en la lista mientras alguien la tiene',
  conArauco?.opciones.join(' | ') ?? '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
// Se la quitamos al único que la tenía.
chk(await abrirEditar('Cliente Arauco'), 'terreno: se le quita')
await elegirOrg('')
await guardar()
chk(await abrirEditar('Josue Britos'), 'terreno: se vuelve a mirar')
const sinArauco = await campoOrg()
chk(
  !!sinArauco && !sinArauco.opciones.includes('Arauco SA'),
  '#339-10 · al quitársela al último que la tenía, deja de aparecer en la lista',
  sinArauco?.opciones.join(' | ') ?? '',
)
chk(
  !!sinArauco && sinArauco.opciones.includes('Andotek'),
  '#339 · control de vida: la que sí tiene gente sigue apareciendo',
  sinArauco?.opciones.join(' | ') ?? '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// ── Criterio 9 · quien no configura usuarios no ve el campo ────────────────
console.log('\n── Criterio 9 · solo quien configura usuarios ──')
await entrarComo('Carla Soto') // consultor
await irAUsuarios()
const abrioComoConsultor = await pulsarSiEsta(
  p.locator('.usuarios-cabecera__acciones button.btn--primary'),
  600,
)
const comoConsultor = abrioComoConsultor ? await campoOrg() : null
chk(
  abrioComoConsultor,
  'terreno: el consultor puede abrir el alta (crea CLIENTES)',
  abrioComoConsultor ? '' : 'no pudo abrirla: el criterio se comprueba igual por la ausencia del campo',
)
chk(
  comoConsultor === null,
  '#339-9 · un no administrador NO ve el campo Organización',
  comoConsultor ? `lo vio: ${comoConsultor.opciones.join(' | ')}` : 'ausente',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// ── Criterio 8 · el correo no cambió ───────────────────────────────────────
await entrarComo('Daniela Vera')
await irAUsuarios()
const correos = await p.evaluate(() =>
  [...document.querySelectorAll('.usuarios-tabla tbody tr')].map((tr) => tr.textContent.includes('@')).filter(Boolean).length,
)
chk(correos > 0, '#339-8 · la pantalla de usuarios sigue mostrando los correos como hoy', `${correos} filas con correo`)

await b.close()
