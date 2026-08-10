// #300 / #301 — Cambiar el perfil de un usuario, y qué significan archivar
// y eliminar.
//
// Alcance: lo que se puede ejercitar en modo Local (repo de memoria), que es
// el espejo de las reglas de la base. Lo que NO se puede probar acá, porque
// vive en Supabase, va en la compuerta `scripts/validar-rls.mjs`:
//   · que la RPC rechace a un no-admin,
//   · que un UPDATE directo de `rol` sea rechazado por el trigger,
//   · que eliminar revoque la cuenta de Auth (Edge Function).
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-300-301-perfiles-y-ciclo-vida.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
const CLAVE_ESTADO = 'planificador.state.v1'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
// Los cambios de perfil y las bajas se confirman; se aceptan.
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

const estado = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), CLAVE_ESTADO)
const usuarioDe = async (nombre) => (await estado())?.usuarios.find((u) => u.nombre === nombre)

async function entrarComo(nombre) {
  await p.evaluate(() => localStorage.removeItem('planificador.sesion.v1'))
  await p.reload()
  await esperar(800)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(900)
}

async function irAUsuarios() {
  await p.getByText('Usuarios', { exact: true }).first().click()
  await esperar(800)
}

const filaDe = (nombre) => p.locator('.usuarios-tabla tbody tr', { hasText: nombre }).first()

// El repo de memoria solo escribe en `localStorage` cuando hay una mutación:
// recién cargado, la clave no existe. Se abre la ficha de alguien y se guarda
// sin cambiar nada — inocuo y determinista — para tener el estado en disco
// antes de medir el "antes".
async function forzarPersistencia(nombre) {
  await filaDe(nombre).locator('.icon-btn[data-tip="Editar"]').click()
  await esperar(400)
  await p.locator('form button[type="submit"]').first().click()
  await esperar(600)
}

/** Cambia el perfil desde el selector de la fila. */
async function cambiarPerfil(nombre, rol) {
  await filaDe(nombre).locator('select.select-rol').selectOption(rol)
  await esperar(700)
}

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await irAUsuarios()
await forzarPersistencia('Cliente Arauco')

// ── C1 · Cliente → consultor, conservando accesos y permisos ───────────────
const clienteAntes = await usuarioDe('Cliente Arauco')
const accesosAntes = (await estado()).accesos.filter((a) => a.usuarioId === clienteAntes.id)
chk(accesosAntes.length > 0, 'preparación: el cliente tiene al menos un acceso', `${accesosAntes.length}`)

await cambiarPerfil('Cliente Arauco', 'consultor')
const clienteAhora = await usuarioDe('Cliente Arauco')
chk(clienteAhora?.rol === 'consultor', 'C1 el perfil cambia a consultor', `rol=${clienteAhora?.rol}`)

const accesosDespues = (await estado()).accesos.filter((a) => a.usuarioId === clienteAntes.id)
chk(
  JSON.stringify(accesosDespues) === JSON.stringify(accesosAntes),
  'C1 conserva sus accesos a proyectos con los MISMOS permisos',
  JSON.stringify(accesosDespues.map((a) => a.permisos)),
)

// ── C4 · Ya como consultor, recibe los permisos por defecto ────────────────
chk(
  clienteAhora?.permisosProyecto?.crearProyectos === true,
  'C4 recibe los permisos por defecto de consultor (puede crear proyectos)',
  JSON.stringify(clienteAhora?.permisosProyecto),
)

// ── C2 · Entra y ve esos proyectos, sin más permisos de los que tenía ──────
await entrarComo('Cliente Arauco')
const proyectosVistos = await p.evaluate(() =>
  [...document.querySelectorAll('.nav-proyecto__nombre')].map((x) => x.textContent),
)
chk(proyectosVistos.includes('Plan PGP Arauco'), 'C2 sigue viendo el proyecto al que estaba invitado', JSON.stringify(proyectosVistos))
chk(
  (await p.locator('button[title="Nuevo proyecto"]').count()) === 1,
  'C4 ya convertido en consultor, puede crear un proyecto propio',
)

// ── C3 · El admin puede retirarle uno de esos accesos ──────────────────────
// (En Supabase esto lo permite `es_admin()`, primer disyuntor de las tres
// políticas de `acceso_proyecto`: no hizo falta relajar ninguna.)
await entrarComo('Daniela Vera')
await p.getByText('Resumen', { exact: true }).first().click()
await esperar(400)
await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
await esperar(800)
const antesDeRetirar = (await estado()).accesos.filter((a) => a.usuarioId === clienteAntes.id).length
chk(antesDeRetirar === 1, 'preparación: el ahora-consultor sigue con su acceso', `${antesDeRetirar}`)
await p.locator('button[title="Personas con acceso a este proyecto"]').click()
await esperar(600)
await p.locator('li.miembro', { hasText: 'Cliente Arauco' }).first().locator('[aria-label^="Quitar"]').click()
await esperar(800)
await p.keyboard.press('Escape')
await esperar(300)
chk(
  (await estado()).accesos.filter((a) => a.usuarioId === clienteAntes.id).length === 0,
  'C3 un administrador puede retirar el acceso de un consultor (no quedaron congelados)',
)

// ── C5 · Consultor SIN proyectos propios → cliente, y pierde los permisos ──
await irAUsuarios()
await cambiarPerfil('Cliente Arauco', 'cliente')
const vueltaACliente = await usuarioDe('Cliente Arauco')
chk(vueltaACliente?.rol === 'cliente', 'C5 un consultor sin proyectos propios pasa a cliente', `rol=${vueltaACliente?.rol}`)
chk(
  !vueltaACliente?.permisosProyecto?.crearProyectos,
  'C5 pierde los permisos de consultor',
  JSON.stringify(vueltaACliente?.permisosProyecto),
)
await entrarComo('Cliente Arauco')
chk((await p.locator('button[title="Nuevo proyecto"]').count()) === 0, 'C5 ya no puede crear proyectos')

// ── C6 · Consultor CON proyectos propios → cliente: se bloquea, con conteo ─
await entrarComo('Daniela Vera')
await irAUsuarios()
const carla = await usuarioDe('Carla Soto')
const propios = (await estado()).proyectos.filter((x) => x.duenoId === carla.id).length
chk(propios > 0, 'preparación: la consultora tiene proyectos propios', `${propios}`)
await cambiarPerfil('Carla Soto', 'cliente')
const carlaDespues = await usuarioDe('Carla Soto')
chk(carlaDespues?.rol === 'consultor', 'C6 el cambio se BLOQUEA: sigue siendo consultora', `rol=${carlaDespues?.rol}`)
const textoError = await p.locator('.error-banner, .banner-error, .error').first().innerText().catch(() => '')
chk(
  textoError.includes(String(propios)) && /due/i.test(textoError),
  'C6 el mensaje dice cuántos proyectos propios tiene',
  JSON.stringify(textoError),
)
await p.locator('.error-banner button, .banner-error button, .error button').first().click().catch(() => {})
await esperar(300)

// ── C7 · Un administrador no puede cambiar su PROPIO perfil ────────────────
chk(
  (await filaDe('Daniela Vera').locator('select.select-rol').count()) === 0,
  'C7 en la fila propia no hay selector de perfil',
)

// ── C9 · Administrador queda fuera en los dos sentidos ─────────────────────
chk(
  (await filaDe('Josue Britos').locator('select.select-rol').count()) === 0,
  'C9 sobre un administrador no se ofrece cambiar el perfil',
)
const opciones = await filaDe('Cliente Arauco').locator('select.select-rol option').allInnerTexts()
chk(
  opciones.length === 2 && !opciones.join().toLowerCase().includes('admin'),
  'C9 el selector solo ofrece consultor y cliente',
  JSON.stringify(opciones),
)

// ── C8 · Un consultor no ve la opción ──────────────────────────────────────
await entrarComo('Carla Soto')
await irAUsuarios()
chk(
  (await p.locator('.usuarios-tabla select.select-rol').count()) === 0,
  'C8 un consultor no ve ningún selector de perfil',
)

// ── C10 · Archivar (desactivar) conserva y apaga ───────────────────────────
// Se parte de un estado LIMPIO: el bloque anterior le retiró el acceso al
// cliente (C3), y acá hace falta que tenga uno para poder comprobar que
// archivar lo conserva y eliminar lo suelta.
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(800)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await irAUsuarios()
await forzarPersistencia('Cliente Arauco')
// Preparación: se le asigna una tarea, si no la comprobación de que las
// tareas sobreviven a la eliminación no mediría nada.
await p.evaluate((k) => {
  const e = JSON.parse(localStorage.getItem(k))
  const u = e.usuarios.find((x) => x.nombre === 'Cliente Arauco')
  e.tareas[0].responsableId = u.id
  localStorage.setItem(k, JSON.stringify(e))
}, CLAVE_ESTADO)
await p.reload()
await esperar(900)
await irAUsuarios()
const antesDeArchivar = await usuarioDe('Cliente Arauco')
const accesosArchivado = (await estado()).accesos.filter((a) => a.usuarioId === antesDeArchivar.id).length
await filaDe('Cliente Arauco').locator('.icon-btn[data-tip="Desactivar"]').click()
await esperar(700)
const archivado = await usuarioDe('Cliente Arauco')
chk(archivado?.activo === false && archivado?.eliminado !== true, 'C10 queda archivado, no eliminado')
// #170: la lista muestra activos por defecto; la casilla SUMA los apagados.
await p.getByText('Ver desactivados').click()
await esperar(500)
chk(
  (await filaDe('Cliente Arauco').count()) === 1 &&
    (await filaDe('Cliente Arauco').getAttribute('class'))?.includes('usuario-inactivo'),
  'C10 sigue visible en la lista, apagado',
)
chk(
  (await estado()).accesos.filter((a) => a.usuarioId === antesDeArchivar.id).length === accesosArchivado,
  'C10 archivar CONSERVA sus accesos a proyectos',
)

// ── C12 · Reactivar lo devuelve con todo ───────────────────────────────────
await filaDe('Cliente Arauco').locator('.icon-btn[data-tip="Reactivar"]').click()
await esperar(700)
const reactivado = await usuarioDe('Cliente Arauco')
chk(reactivado?.activo === true, 'C12 se reactiva')
chk(reactivado?.rol === antesDeArchivar.rol, 'C12 vuelve con su MISMO perfil', `rol=${reactivado?.rol}`)
chk(
  (await estado()).accesos.filter((a) => a.usuarioId === antesDeArchivar.id).length === accesosArchivado,
  'C12 vuelve con sus MISMOS proyectos',
)

// ── C13 · Eliminar corta: suelta accesos, conserva tareas ──────────────────
const victima = await usuarioDe('Cliente Arauco')
const tareasSuyas = (await estado()).tareas.filter((t) => t.responsableId === victima.id).length
await filaDe('Cliente Arauco').locator('.icon-btn[data-tip="Eliminar usuario"]').click()
await esperar(800)
chk((await filaDe('Cliente Arauco').count()) === 0, 'C13 desaparece de la lista')
const tras = await estado()
chk(
  tras.accesos.filter((a) => a.usuarioId === victima.id).length === 0,
  'C13 eliminar RETIRA sus accesos a proyectos',
)
chk(
  tras.tareas.filter((t) => t.responsableId === victima.id).length === tareasSuyas,
  'C13 sus tareas conservan al responsable (iniciales apagadas, regla #229)',
  `${tareasSuyas} tareas`,
)

// ── C15 · Su nombre sigue en comentarios e historial ───────────────────────
const filaEliminada = tras.usuarios.find((u) => u.id === victima.id)
chk(
  filaEliminada?.eliminado === true && filaEliminada?.activo === false,
  'C13 la FILA se conserva marcada como eliminada — es lo que sostiene el registro',
)
chk(!filaEliminada?.authId, 'C14 se suelta el vínculo con su cuenta de acceso')
chk(
  !filaEliminada?.permisosProyecto || Object.keys(filaEliminada.permisosProyecto).length === 0,
  'C13 pierde el perfil: se vacían sus permisos de consultor',
  JSON.stringify(filaEliminada?.permisosProyecto),
)
const registro = { comentarios: tras.comentarios.length, historial: tras.historial.length }
chk(
  registro.comentarios > 0 || registro.historial > 0,
  'C15 comentarios e historial siguen intactos (no se borra registro)',
  JSON.stringify(registro),
)

// ── C16 · Dar de alta el mismo correo es un ALTA NUEVA ─────────────────────
await p.locator('.usuarios-head button, button', { hasText: /Nuevo usuario|\+ Usuario/ }).first().click()
await esperar(500)
await p.locator('form .campo input').first().fill('Cliente Arauco Segundo')
await p.locator('form input[type="email"], form .campo input').nth(2).fill(victima.email)
await p.locator('form select').first().selectOption('consultor')
await p.locator('form button[type="submit"]').first().click()
await esperar(900)
const revivido = (await estado()).usuarios.find((u) => u.email === victima.email)
chk(revivido?.id === victima.id, 'C16 reutiliza la misma fila (mismo correo)', `id=${revivido?.id}`)
chk(revivido?.rol === 'consultor', 'C16 se crea con el perfil ELEGIDO, no con el anterior', `rol=${revivido?.rol}`)
chk(
  (await estado()).accesos.filter((a) => a.usuarioId === victima.id).length === 0,
  'C16 vuelve SIN proyectos heredados',
)
chk(!revivido?.authId, 'C16 vuelve sin cuenta de acceso — por eso el alta puede invitarlo')

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #300/#301 — perfiles y ciclo de vida')
