// #353 — Un consultor suma a un colega de su organización a un proyecto suyo.
//
// EL OBJETIVO, que es lo que esta prueba recorre de punta a punta:
//
//   Un consultor con el permiso correspondiente puede sumar a un colega de su
//   misma organización a un proyecto suyo, quitarlo, y configurar sus permisos
//   en ese proyecto — sin pasar por el administrador.
//
// Lo que NO se comprueba acá: que la BASE lo impida. El repo de memoria no
// tiene RLS, así que un límite que solo se viera en pantalla no probaría nada.
// Esos casos —el consultor de otra organización, el que no tiene, el cliente,
// y que verse no dé acceso— viven en `docs/prueba-353-agregar-colega-base.mjs`,
// contra un PostgreSQL real con las migraciones aplicadas, y en la compuerta
// cuando corre contra producción.
//
// Lo que SÍ se comprueba acá es que la pantalla llegue a hacerlo, que es la
// otra mitad: #339 abrió la visibilidad y no llegaba a ninguna pantalla útil.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-353-agregar-colega.mjs
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

/**
 * Cambiar de cuenta SIN perder lo construido. `localStorage.clear()` se llevaría
 * también el estado —y con él los dos consultores y su organización, que es
 * justo el terreno de esta prueba—, así que solo se suelta la SESIÓN. La clave
 * es la misma que usa `memoryAuth`.
 */
const entrarComo = async (nombre, desdeCero = false) => {
  await p.goto(URL_APP)
  await esperar(400)
  await p.evaluate((cero) => {
    if (cero) localStorage.clear()
    else localStorage.removeItem('planificador.sesion.v1')
  }, desdeCero)
  await p.reload()
  await esperar(800)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1200)
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
const guardarModal = () => pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 900)
const abrirEditar = async (nombre) => {
  const fila = p.locator('.usuarios-tabla tbody tr', { hasText: nombre }).first()
  const ok = await pulsarSiEsta(fila.locator('.icon-btn[data-tip="Editar"]'), 600)
  return ok && (await p.locator('.modal-card').count()) > 0
}
/** El campo Organización del formulario: se escribe y se elige de la lista. */
const escribirOrg = async (texto) => {
  try {
    const campo = p.locator('.modal-card .combo-org__campo')
    await campo.click({ timeout: 2500 })
    await campo.fill(texto)
    await esperar(350)
    return true
  } catch {
    return false
  }
}
const opcionesOrg = () =>
  p.evaluate(() => [...document.querySelectorAll('.selector-menu .selector-op')].map((x) => x.textContent.trim()))
const elegirOpcionOrg = (texto) => pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: texto }), 400)
const hayCampoOrg = () => p.locator('.modal-card .combo-org__campo').count()
/** El desplegable del producto, por su etiqueta. */
const abrirSelector = (etiqueta) => pulsarSiEsta(p.locator(`.selector-btn[aria-label="${etiqueta}"]`), 400)
const opcionesSelector = () =>
  p.evaluate(() => [...document.querySelectorAll('.selector-menu .selector-op')].map((x) => x.textContent.trim()))

// ═══════════════════════════════════════════════════════════════════════════
// Terreno · dos consultores de la misma organización, sin proyecto en común
// ═══════════════════════════════════════════════════════════════════════════
console.log('── Terreno ──')
await entrarComo('Daniela Vera', true)
await irAUsuarios()

// Carla Soto ya es consultora y dueña de un proyecto propio.
chk(await abrirEditar('Carla Soto'), 'terreno: se abre la ficha de la consultora')
chk((await hayCampoOrg()) === 1, '#353 · en una ficha de CONSULTOR el campo Organización aparece')
await escribirOrg('Andotek')
const ofrecidas = await opcionesOrg()
chk(
  ofrecidas.some((o) => /^Crear ["“]Andotek["”]$/.test(o)),
  '#353-12 · lo escrito no existe, y la última opción ofrece crearlo',
  ofrecidas.join(' | '),
)
await elegirOpcionOrg('Crear')
chk(await guardarModal(), 'terreno: se guarda la organización de la consultora')

// Un segundo consultor, de la misma organización.
chk(
  await pulsarSiEsta(p.locator('.usuarios-cabecera__acciones button.btn--primary'), 600),
  'terreno: se abre el alta de usuario',
)
await p.locator('.modal-card input').first().fill('Bruno Vega')
await esperar(150)
await p.locator('.modal-card input[type=email]').fill('bv@consultora.cl')
await esperar(150)
chk(await abrirSelector('Perfil'), 'terreno: el perfil se elige con el desplegable del producto')
chk(await pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: 'Consultor' }), 400), 'terreno: se elige Consultor')
chk((await hayCampoOrg()) === 1, '#353-11b · al poner el perfil en consultor, el campo Organización aparece')
await escribirOrg('Andotek')
const yaEsta = await opcionesOrg()
chk(
  yaEsta.includes('Andotek') && !yaEsta.some((o) => /^Crear/.test(o)),
  '#353 · "Andotek" ya está en la lista y NO se ofrece crearla de nuevo',
  yaEsta.join(' | '),
)
await elegirOpcionOrg('Andotek')
chk(await guardarModal(), 'terreno: se crea el segundo consultor')

// ═══════════════════════════════════════════════════════════════════════════
// Criterio 11 · la columna Organización
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Criterio 11 · la columna ──')
const tabla = await p.evaluate(() => {
  const cabeceras = [...document.querySelectorAll('.usuarios-tabla thead th')].map((t) => t.textContent.trim())
  const filas = [...document.querySelectorAll('.usuarios-tabla tbody tr')].map((tr) => ({
    nombre: tr.querySelector('td')?.textContent.trim().slice(0, 20),
    org: tr.querySelector('td.col-org')?.textContent.trim(),
    vacio: !!tr.querySelector('td.col-org .usuarios-sin'),
  }))
  return { cabeceras, filas }
})
chk(
  tabla.cabeceras.includes('Organización') && tabla.cabeceras.indexOf('Organización') === tabla.cabeceras.indexOf('Rol') + 1,
  '#353-11 · hay una columna Organización, justo después de Rol',
  tabla.cabeceras.join(' · '),
)
chk(
  tabla.filas.some((f) => f.org === 'Andotek'),
  '#353-11 · y muestra la organización de quien la tiene',
  tabla.filas.map((f) => `${f.nombre}=${f.org}`).join(' | '),
)
chk(
  tabla.filas.some((f) => f.vacio && f.org === '—'),
  '#353-11 · los usuarios sin organización se ven con el vacío de siempre',
  tabla.filas.filter((f) => f.vacio).map((f) => f.nombre).join(', ') || 'ninguno',
)

// ═══════════════════════════════════════════════════════════════════════════
// #339-10 · una organización que se queda sin nadie deja de aparecer
// ═══════════════════════════════════════════════════════════════════════════
// Se comprueba acá y no en la suite de #339: allá pasaba por el desplegable con
// "Escribir una nueva…", que este pedido reemplazó. La regla no cambió —la
// lista se llena sola y se vacía sola—, cambió el control con el que se toca.
console.log('\n── #339-10 · la organización sin nadie desaparece ──')
chk(await abrirEditar('Bruno Vega'), 'terreno: se le pone una organización propia a un consultor')
await escribirOrg('Solo Suya')
await elegirOpcionOrg('Crear')
await guardarModal()
chk(await abrirEditar('Carla Soto'), 'terreno: se mira desde otro consultor')
await escribirOrg('')
const conSolo = await opcionesOrg()
chk(
  conSolo.includes('Solo Suya'),
  '#339-10 · está en la lista mientras alguien la tiene',
  conSolo.join(' | '),
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
chk(await abrirEditar('Bruno Vega'), 'terreno: se le quita al único que la tenía')
await escribirOrg('')
await elegirOpcionOrg('Sin organización')
await guardarModal()
chk(await abrirEditar('Carla Soto'), 'terreno: se vuelve a mirar')
await escribirOrg('')
const sinSolo = await opcionesOrg()
chk(
  !sinSolo.includes('Solo Suya'),
  '#339-10 · al quitársela al último que la tenía, deja de aparecer en la lista',
  sinSolo.join(' | '),
)
chk(
  sinSolo.includes('Andotek'),
  '#339-10 · control de vida: la que sí tiene gente sigue apareciendo',
  sinSolo.join(' | '),
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
// Y a Bruno se le devuelve la suya, que es el terreno del objetivo.
chk(await abrirEditar('Bruno Vega'), 'terreno: se le devuelve Andotek')
await escribirOrg('Andotek')
await elegirOpcionOrg('Andotek')
await guardarModal()

// ═══════════════════════════════════════════════════════════════════════════
// Criterio 11b · el cliente no tiene campo Organización
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Criterio 11b · solo para consultores ──')
chk(await abrirEditar('Cliente Arauco'), 'terreno: se abre la ficha de un cliente')
chk((await hayCampoOrg()) === 0, '#353-11b · en una ficha de CLIENTE el campo Organización no aparece')
// Y al cambiarle el perfil a consultor, aparece.
chk(await abrirSelector('Perfil'), 'terreno: se abre el perfil')
await pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: 'Consultor' }), 400)
chk((await hayCampoOrg()) === 1, '#353-11b · y al cambiar el perfil a consultor, aparece')
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// ═══════════════════════════════════════════════════════════════════════════
// Criterio 14 · los nombres de los dos permisos
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Criterio 14 · los permisos ──')
const filaCarla = p.locator('.usuarios-tabla tbody tr', { hasText: 'Carla Soto' }).first()
chk(await pulsarSiEsta(filaCarla.locator('.icon-btn[data-tip*="ermisos"]'), 600), 'terreno: se abren los permisos de proyecto')
const etiquetas = await p.evaluate(() =>
  [...document.querySelectorAll('.permiso-item__label')].map((x) => x.textContent.trim()),
)
chk(
  etiquetas.some((x) => /Agregar usuarios a sus proyectos/.test(x)),
  '#353-14 · dice "Agregar usuarios a sus proyectos"',
  etiquetas.find((x) => /Agregar usuarios/.test(x)) ?? etiquetas.join(' | ').slice(0, 160),
)
chk(
  etiquetas.some((x) => /Configurar permisos de los usuarios de sus proyectos/.test(x)),
  '#353-14 · y "Configurar permisos de los usuarios de sus proyectos"',
  etiquetas.find((x) => /Configurar permisos de los usuarios/.test(x)) ?? '',
)
// Terreno para el criterio 4: un consultor NACE con "agregar" pero SIN
// "configurar permisos" (el default de la migración 12, que este pedido no
// toca). El criterio 4 habla de un consultor que sí lo tiene, así que se le da.
chk(
  await pulsarSiEsta(p.locator('.seg[aria-label="Configurar permisos de los usuarios de sus proyectos"] .seg__btn', { hasText: 'Sí' }), 300),
  'terreno: se le da el permiso de configurar (nace sin él, y este pedido no cambia ese default)',
)
await guardarModal()

// ═══════════════════════════════════════════════════════════════════════════
// EL OBJETIVO · criterios 1 a 5, con la cuenta de la consultora
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── El objetivo, de punta a punta ──')
await entrarComo('Carla Soto')
// Su proyecto propio.
await pulsarSiEsta(p.getByText('Resumen', { exact: true }).first(), 450)
const suyo = await p.evaluate(() => document.querySelector('.resumen-card')?.textContent.trim().slice(0, 40) ?? null)
chk(!!suyo, 'terreno: la consultora tiene un proyecto propio', suyo ?? '')
await pulsarSiEsta(p.locator('.resumen-card').first(), 1100)

// Miembros vive en el encabezado del proyecto, no en el menú del sidebar.
const abrirMiembros = async () => {
  const ok = await pulsarSiEsta(p.locator('.topbar button[title="Personas con acceso a este proyecto"]'), 800)
  return ok && (await p.locator('.miembros').count()) > 0
}
chk(await abrirMiembros(), 'terreno: la consultora abre Miembros de su proyecto')
const disparador = await p.evaluate(() => {
  const b = document.querySelector('.miembros-agregar .selector-btn')
  return b ? b.textContent.trim() : null
})
chk(
  !!disparador && /Agregar usuario/.test(disparador),
  '#353-1 · el botón dice "+ Agregar usuario…" (ya no "Invitar cliente…")',
  disparador ?? 'no hay disparador',
)
chk(await pulsarSiEsta(p.locator('.miembros-agregar .selector-btn'), 400), 'terreno: se abre la lista')
const lista = await opcionesSelector()
chk(
  lista.some((x) => /Bruno Vega/.test(x)),
  '#353-1 · y en la lista aparece el colega de su misma organización',
  lista.join(' | ') || '(vacía)',
)
chk(
  !lista.some((x) => /Daniela|Josue/.test(x)),
  '#353-6 · y NO aparecen los administradores ni nadie fuera de la regla',
  lista.join(' | '),
)
chk(await pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: 'Bruno Vega' }), 900), '#353-2 · lo agrega')
const miembros = await p.evaluate(() =>
  [...document.querySelectorAll('.miembros li')].map((x) => x.textContent.trim().slice(0, 30)),
)
chk(
  miembros.some((x) => /Bruno Vega/.test(x)),
  '#353-2 · Bruno queda como miembro del proyecto',
  miembros.join(' | '),
)
// Criterio 4: puede configurar sus permisos.
// La llave de la fila: sin el permiso de configurar, ni siquiera aparece.
const llaveDeBruno = p.locator('.miembros li', { hasText: 'Bruno Vega' }).locator('button[aria-label="Permisos de Bruno Vega"]')
chk(
  (await llaveDeBruno.count()) === 1,
  '#353-4 · la consultora ve el botón de permisos de su colega',
  `${await llaveDeBruno.count()} botón(es)`,
)
chk(await pulsarSiEsta(llaveDeBruno, 700), '#353-4 · y puede abrirlo')
const permisosDeTarea = await p.evaluate(
  () => [...document.querySelectorAll('.permisos-tareas, .modal-card')].some((x) => /Permisos de/.test(x.textContent ?? '')),
)
chk(permisosDeTarea, '#353-4 · se abre la configuración de permisos de ese acceso')
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cerrar' }), 300)

// Criterio 2 (la otra mitad): Bruno ve el proyecto en su barra.
await entrarComo('Bruno Vega')
const suProyecto = await p.evaluate(() =>
  [...document.querySelectorAll('.nav-proyecto__title')].map((x) => x.textContent.trim()),
)
chk(
  suProyecto.length > 0,
  '#353-2 · desde su propia cuenta, Bruno ve el proyecto en su barra lateral',
  suProyecto.join(' | ') || '(ninguno)',
)

// Criterio 5: la consultora lo quita y deja de verlo.
await entrarComo('Carla Soto')
await pulsarSiEsta(p.getByText('Resumen', { exact: true }).first(), 450)
await pulsarSiEsta(p.locator('.resumen-card').first(), 1000)
chk(await abrirMiembros(), 'terreno: vuelve a Miembros')
chk(
  await pulsarSiEsta(p.locator('.miembros li', { hasText: 'Bruno Vega' }).locator('button', { hasText: '✕' }), 900),
  '#353-5 · puede quitar a su colega del proyecto',
)
const trasQuitar = await p.evaluate(() =>
  [...document.querySelectorAll('.miembros li')].map((x) => x.textContent.trim().slice(0, 30)),
)
chk(
  !trasQuitar.some((x) => /Bruno Vega/.test(x)),
  '#353-5 · y deja de ser miembro',
  trasQuitar.join(' | ') || '(sin miembros)',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cerrar' }), 300)
await entrarComo('Bruno Vega')
const sinProyecto = await p.evaluate(() =>
  [...document.querySelectorAll('.nav-proyecto__title')].map((x) => x.textContent.trim()),
)
chk(sinProyecto.length === 0, '#353-5 · y Bruno deja de ver el proyecto', sinProyecto.join(' | ') || '(ninguno)')

// ═══════════════════════════════════════════════════════════════════════════
// Criterio 13 · los tres desplegables se ven como el producto
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Criterio 13 · el estilo de los desplegables ──')
await entrarComo('Daniela Vera')
await irAUsuarios()
const nativosEnFicha = async () => {
  await abrirEditar('Carla Soto')
  const n = await p.evaluate(() => document.querySelectorAll('.modal-card select').length)
  const propios = await p.evaluate(
    () => document.querySelectorAll('.modal-card .selector-btn, .modal-card .combo-org__campo').length,
  )
  await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
  return { n, propios }
}
const ficha = await nativosEnFicha()
chk(
  ficha.n === 0 && ficha.propios === 2,
  '#353-13 · en la ficha del usuario no queda ningún desplegable del navegador',
  `nativos ${ficha.n}, propios ${ficha.propios}`,
)
const nativosEnTodoElProducto = await p.evaluate(() => document.querySelectorAll('select').length)
chk(
  nativosEnTodoElProducto === 0,
  '#353-13 · y en la pantalla no queda ninguno',
  `${nativosEnTodoElProducto} <select> nativos`,
)
// El menú tiene el mismo aspecto que los del producto, en los dos temas.
const aspecto = async (tema) => {
  await p.evaluate((t) => {
    if (t === 'claro') delete document.documentElement.dataset.tema
    else document.documentElement.dataset.tema = t
  }, tema)
  await esperar(300)
  await abrirEditar('Carla Soto')
  await abrirSelector('Perfil')
  const r = await p.evaluate(() => {
    const m = document.querySelector('.selector-menu')
    if (!m) return null
    const cs = getComputedStyle(m)
    return { fondo: cs.backgroundColor, borde: cs.borderTopColor, radio: cs.borderTopLeftRadius }
  })
  await p.keyboard.press('Escape')
  await esperar(200)
  await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
  return r
}
const claro = await aspecto('claro')
const oscuro = await aspecto('oscuro')
chk(
  !!claro && !!oscuro && claro.fondo !== oscuro.fondo && claro.radio === '8px' && oscuro.radio === '8px',
  '#353-13 · el menú lleva el fondo, el borde y el redondeo del producto, y cambia con el tema',
  `claro ${claro?.fondo} · oscuro ${oscuro?.fondo} · radio ${claro?.radio}`,
)
await p.evaluate(() => delete document.documentElement.dataset.tema)

// ═══════════════════════════════════════════════════════════════════════════
// Criterio 7 · sin el permiso, no hay botón
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Criterio 7 · sin el permiso ──')
await irAUsuarios()
chk(
  await pulsarSiEsta(filaCarla.locator('.icon-btn[data-tip*="ermisos"]'), 600),
  'terreno: se abren los permisos de proyecto de la consultora',
)
// Se le quita el permiso de agregar.
const quito = await pulsarSiEsta(
  p.locator('.seg[aria-label="Agregar usuarios a sus proyectos"] .seg__btn', { hasText: 'No' }),
  300,
)
chk(quito, 'terreno: se destilda "Agregar usuarios a sus proyectos"')
await guardarModal()
await entrarComo('Carla Soto')
await pulsarSiEsta(p.getByText('Resumen', { exact: true }).first(), 450)
await pulsarSiEsta(p.locator('.resumen-card').first(), 1000)
await abrirMiembros()
const sinBoton = await p.evaluate(() => document.querySelectorAll('.miembros-agregar').length)
chk(sinBoton === 0, '#353-7 · sin el permiso no aparece el botón de agregar, ni siquiera para clientes', `${sinBoton}`)

await b.close()
