// #272 — El interruptor del resumen diario, en las dos pantallas, y los dos
// enlaces del correo.
//
// EL OBJETIVO:
//
//   Cada persona puede apagar su resumen diario desde Mi cuenta, el
//   administrador puede encenderlo y apagarlo desde la ficha, y los dos
//   enlaces del correo abren la pantalla que nombran.
//
// Lo que esta prueba NO puede comprobar, y por qué: el correo en sí. Que llegue
// a las 8:00, que Resend lo entregue y cómo se ve en Outlook exigen la
// plataforma (criterios 5 a 14; se verifican contra la casilla del dueño). El
// CONTENIDO del correo sí se comprueba, sin plataforma, en
// `docs/prueba-272-correo.mjs`, y las reglas de quién recibe qué en
// `docs/prueba-272-resumen-diario-base.mjs`.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-272-resumen-diario.mjs
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

const pulsarSiEsta = async (loc, ms = 350) => {
  try {
    await loc.first().click({ timeout: 2500 })
    await esperar(ms)
    return true
  } catch {
    return false
  }
}

/** Entrada LIMPIA: borra el estado guardado y elige a alguien de la lista. */
const entrarComo = async (nombre, hash = '') => {
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.goto(URL_APP + hash)
  // Cambiar SOLO el fragmento no recarga la página, y la dirección del correo
  // se lee al montar: sin este `reload` la prueba mediría la aplicación ya
  // montada sin dirección, que es exactamente lo contrario del caso.
  await p.reload()
  await esperar(700)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1100)
}
/** Cambio de persona SIN borrar nada: es lo que hace falta para ver, con otra
 *  sesión, lo que la anterior dejó guardado. */
const cambiarA = async (nombre) => {
  await pulsarSiEsta(p.locator('.sesion__salir'), 900)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1100)
}
/** El texto de un elemento, o '' si no está. TOLERANTE a propósito: en el
 *  control negativo estas pantallas no existen, y un `innerText` que revienta
 *  mata el proceso y deja sin correr las comprobaciones que vienen después —
 *  la prueba informaría menos de lo que se rompió. */
const textoDe = async (selector) => {
  try {
    return await p.locator(selector).first().innerText({ timeout: 2500 })
  } catch {
    return ''
  }
}
const irAMiCuenta = async () => {
  await pulsarSiEsta(p.locator('.sesion__nombre, [title="Mi cuenta: nombre, iniciales y contraseña"]'), 900)
}

/** Los títulos de los bloques de Mi cuenta, en orden. */
const bloquesDeMiCuenta = () =>
  p.evaluate(() => [...document.querySelectorAll('.config h3')].map((x) => x.textContent.trim()))
/** El estado del interruptor visible: qué posición está marcada. */
const posicionDelInterruptor = () =>
  p.evaluate(() => {
    const fila = [...document.querySelectorAll('.permiso-item')].find((x) =>
      /Resumen diario/.test(x.textContent ?? ''),
    )
    if (!fila) return null
    const on = fila.querySelector('.seg__btn--on')
    return on ? on.textContent.trim() : '(ninguna)'
  })
const ponerInterruptor = async (posicion) =>
  pulsarSiEsta(
    p.locator('.permiso-item', { hasText: 'Resumen diario' }).locator('.seg__btn', { hasText: posicion }),
    900,
  )
/** Abre la ficha de un usuario desde Administración → Usuarios. */
const abrirFicha = async (nombre) => {
  await pulsarSiEsta(p.locator('.nav-frente', { hasText: 'Usuarios' }).last(), 900)
  return pulsarSiEsta(p.locator('tr', { hasText: nombre }).locator('.icon-btn[data-tip="Editar"]'), 900)
}

console.log('\n── Criterio 1 · el bloque en Mi cuenta ──')
await entrarComo('Daniela Vera')
await irAMiCuenta()
const bloques = await bloquesDeMiCuenta()
console.log(`  bloques: ${bloques.join(' | ')}`)
chk(bloques.includes('Notificaciones por correo'), '#272-1 · hay un bloque "Notificaciones por correo"')
chk(
  bloques.indexOf('Perfil') < bloques.indexOf('Notificaciones por correo') &&
    bloques.indexOf('Notificaciones por correo') < bloques.indexOf('Contraseña'),
  '#272-1 · y va ENTRE "Perfil" y "Contraseña"',
  bloques.join(' | '),
)
const fila = await p.evaluate(() => {
  const f = [...document.querySelectorAll('.permiso-item')].find((x) => /Resumen diario/.test(x.textContent ?? ''))
  return f ? { etiqueta: f.querySelector('.permiso-item__label')?.firstChild?.textContent?.trim(), nota: f.querySelector('small')?.textContent?.trim(), seg: Boolean(f.querySelector('.seg')) } : null
})
chk(fila?.etiqueta === 'Resumen diario', '#272-1 · el interruptor se llama "Resumen diario"', JSON.stringify(fila?.etiqueta))
chk(
  fila?.nota === 'Cada mañana, tus tareas atrasadas y las que vencen ese día.',
  '#272-1 · con su nota debajo',
  JSON.stringify(fila?.nota),
)
chk(fila?.seg === true, '#272-1 · dibujado con el control Sí/No que ya usa la pantalla de permisos')

console.log('\n── El interruptor guarda al tocarlo ──')
chk(
  (await posicionDelInterruptor()) === 'No',
  '#272-1b · un usuario del seed —de los que ya existían— arranca apagado',
  String(await posicionDelInterruptor()),
)
await ponerInterruptor('Sí')
chk((await posicionDelInterruptor()) === 'Sí', '#272 · se puede encender')
chk(
  /Listo, se guardó\./.test(await p.locator('.config').innerText()),
  '#272 · y avisa que guardó, sin ningún botón de por medio',
)
// La prueba de que guardó DE VERDAD: se sale y se vuelve a entrar.
await cambiarA('Daniela Vera')
await irAMiCuenta()
chk((await posicionDelInterruptor()) === 'Sí', '#272 · y sigue encendido al volver a entrar')

console.log('\n── Criterio 2 · el mismo interruptor en la ficha del usuario ──')
chk(await abrirFicha('Carla Soto'), '#272-2 · el administrador abre la ficha de otra persona')
const enFicha = await p.evaluate(() => {
  const campos = [...document.querySelectorAll('.modal-card .campo')].map((c) => c.textContent.trim())
  const f = [...document.querySelectorAll('.modal-card .permiso-item')].find((x) => /Resumen diario/.test(x.textContent ?? ''))
  return {
    campos,
    nota: f?.querySelector('small')?.textContent?.trim(),
    ultimo: /Resumen diario/.test(campos.at(-1) ?? ''),
    perfilAntes: campos.findIndex((c) => /^Perfil/.test(c)) < campos.length - 1,
  }
})
console.log(`  campos de la ficha: ${enFicha.campos.map((c) => c.split('\n')[0]).join(' | ')}`)
chk(Boolean(enFicha.nota), '#272-2 · la ficha trae el mismo interruptor')
chk(
  enFicha.nota === 'Cada mañana, tus tareas atrasadas y las que vencen ese día.',
  '#272-2 · CON su misma nota, porque el administrador decide por otra persona',
  JSON.stringify(enFicha.nota),
)
chk(enFicha.ultimo, '#272-2 · y va AL FINAL del formulario')
chk(enFicha.perfilAntes, '#272-2 · después de Perfil')

console.log('\n── Criterio 3 · el administrador enciende, la persona apaga ──')
chk((await posicionDelInterruptor()) === 'No', '#272 · Carla arranca apagada')
await ponerInterruptor('Sí')
chk(await pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 1100), '#272-2 · el administrador lo enciende y guarda')
chk(await abrirFicha('Carla Soto'), '#272 · se vuelve a abrir la ficha')
chk((await posicionDelInterruptor()) === 'Sí', '#272-2 · quedó encendido')
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 600)

await cambiarA('Carla Soto')
await irAMiCuenta()
chk(
  (await posicionDelInterruptor()) === 'Sí',
  '#272-3 · Carla lo ve encendido en SU Mi cuenta',
  String(await posicionDelInterruptor()),
)
await ponerInterruptor('No')
chk((await posicionDelInterruptor()) === 'No', '#272-3 · y puede apagarlo ella misma')
await cambiarA('Daniela Vera')
chk(await abrirFicha('Carla Soto'), '#272 · el administrador vuelve a la ficha de Carla')
chk((await posicionDelInterruptor()) === 'No', '#272-3 · y la ve apagada: la persona siempre puede apagar el suyo')
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 600)

console.log('\n── Al crear, no ──')
chk(
  await pulsarSiEsta(p.locator('.btn--primary', { hasText: 'Usuario' }), 900),
  '#272 · se abre el formulario de alta',
)
const enAlta = await p.evaluate(() =>
  [...document.querySelectorAll('.modal-card')].some((m) => /Resumen diario/.test(m.textContent ?? '')),
)
chk(!enAlta, '#272 · el formulario de ALTA no ofrece el interruptor: el usuario nuevo nace encendido')
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 600)

console.log('\n── Criterio 13c · los dos enlaces del correo ──')
await entrarComo('Daniela Vera', '#mi-cuenta')
chk(
  (await bloquesDeMiCuenta()).includes('Notificaciones por correo'),
  '#272-13c · "Gestionar correos" (#mi-cuenta) abre Mi cuenta',
  await textoDe('h2'),
)
await entrarComo('Daniela Vera', '#mis-tareas')
// Mis Tareas no tiene `h2`: su título es el `topbar__title` del mismo
// encabezado que usa la pantalla de un proyecto.
const tituloMisTareas = await textoDe('.topbar__title')
chk(
  /Mis Tareas/.test(tituloMisTareas),
  '#272 · "Ver mis tareas" (#mis-tareas) abre Mis Tareas',
  tituloMisTareas.split('\n')[0],
)
chk(
  !/#mis-tareas/.test(await p.evaluate(() => window.location.hash)),
  '#272 · y la dirección se limpia, para que recargar no vuelva a llevar ahí',
  await p.evaluate(() => window.location.hash),
)
// #274 sigue en pie: entrar SIN dirección parte en Resumen.
await entrarComo('Daniela Vera')
chk(
  /Resumen/.test(await textoDe('h2')),
  '#272/#274 · entrar sin dirección sigue partiendo en Resumen',
  await textoDe('h2'),
)

await b.close()
