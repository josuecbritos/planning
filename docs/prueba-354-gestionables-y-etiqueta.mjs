// #354 — Corrección de #353. Dos cosas que aparecieron al usar #353 en
// producción.
//
// 1 · BUG · El dueño agregaba a un colega y después NO podía quitarlo ni
//   abrirle sus permisos: los dos iconos no se dibujaban. La base estaba bien
//   —las tres políticas ya contemplaban al colega—; fallaba la pantalla, y por
//   una razón que #353 dejó a medias: **para decidir si mostraba esos iconos,
//   comparaba la organización de quien mira con la del otro**, y desde #339 la
//   organización de otro solo la ve el administrador. A un consultor le llegaba
//   vacía, la condición nunca se cumplía y los iconos nunca aparecían.
//
//   POR QUÉ NO LO VIO LA PRUEBA DE #353: en el repo de MEMORIA no hay
//   enmascarado —todos ven todo—, así que ahí la comparación sí funcionaba. El
//   defecto solo existía contra Supabase.
//
//   Y por la MISMA razón tampoco se puede reproducir acá: en memoria el estado
//   local es la FUENTE, así que quitarle la organización se la quita a los dos
//   lados a la vez. Lo que esta prueba comprueba es que los dos iconos
//   aparezcan y funcionen de punta a punta; la garantía de fondo —que la fuente
//   sabe la respuesta aunque el cliente no pueda calcularla— se mide en
//   `docs/prueba-353-agregar-colega-base.mjs`, contra una base real.
//
// 2 · El campo Organización no mostraba que había quedado tomada: al elegir
//   `Crear "Andotek"` seguía viéndose como un texto a medio escribir. Ahora
//   muestra el valor como ETIQUETA, con su × para quitarlo.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-354-gestionables-y-etiqueta.mjs
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

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
const elegirOpcionOrg = (texto) => pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: texto }), 400)
const abrirSelector = (etiqueta) => pulsarSiEsta(p.locator(`.selector-btn[aria-label="${etiqueta}"]`), 400)
/** Cómo se ve hoy el campo Organización: etiqueta puesta o campo para escribir. */
const estadoCampoOrg = () =>
  p.evaluate(() => {
    const caja = document.querySelector('.modal-card .combo-org')
    if (!caja) return null
    const etiqueta = caja.querySelector('.combo-org__etiqueta')
    const campo = caja.querySelector('.combo-org__campo')
    const cs = etiqueta ? getComputedStyle(etiqueta) : null
    return {
      hayEtiqueta: !!etiqueta,
      texto: etiqueta?.querySelector('.asignacion__nombre')?.textContent.trim() ?? null,
      hayX: !!caja.querySelector('.combo-org__quitar'),
      hayCampo: !!campo,
      editable: !!campo && !campo.disabled && !campo.readOnly,
      placeholder: campo?.placeholder ?? null,
      estilo: cs ? { borde: cs.borderTopColor, radio: cs.borderTopLeftRadius, fondo: cs.backgroundColor } : null,
    }
  })

// ═══════════════════════════════════════════════════════════════════════════
// 2 · La etiqueta (criterios 9 a 14)
// ═══════════════════════════════════════════════════════════════════════════
console.log('── 2 · el campo muestra que quedó tomada ──')
await entrarComo('Daniela Vera', true)
await irAUsuarios()

chk(await abrirEditar('Carla Soto'), 'terreno: se abre la ficha de una consultora')
const vacio = await estadoCampoOrg()
chk(
  !!vacio && !vacio.hayEtiqueta && vacio.hayCampo && vacio.placeholder === 'Buscar o crear…',
  '#354-11 · sin organización, el campo está vacío y dice "Buscar o crear…"',
  vacio ? `etiqueta=${vacio.hayEtiqueta} placeholder="${vacio.placeholder}"` : '',
)
await escribirOrg('Andotek')
await elegirOpcionOrg('Crear')
const trasCrear = await estadoCampoOrg()
chk(
  !!trasCrear && trasCrear.hayEtiqueta && trasCrear.texto === 'Andotek',
  '#354-9 · al elegir `Crear "Andotek"` el campo pasa a mostrar la organización como ETIQUETA',
  trasCrear ? `etiqueta=${trasCrear.hayEtiqueta} texto="${trasCrear.texto}"` : '',
)
chk(
  !!trasCrear && !trasCrear.hayCampo,
  '#354-12 · y con la etiqueta puesta ya no se puede escribir encima',
  trasCrear?.hayCampo ? 'el campo de texto sigue ahí' : 'no hay campo de texto',
)
chk(!!trasCrear && trasCrear.hayX, '#354-11 · la etiqueta lleva su ×')
chk(
  !!trasCrear && trasCrear.estilo?.radio === '14px',
  '#354-14 · y usa la etiqueta del producto, no una caja propia',
  trasCrear?.estilo ? `radio ${trasCrear.estilo.radio}, borde ${trasCrear.estilo.borde}` : '',
)
// La × la vacía y se puede escribir otra.
chk(await pulsarSiEsta(p.locator('.combo-org__quitar'), 400), '#354-11 · se puede tocar la ×')
const trasQuitar = await estadoCampoOrg()
chk(
  !!trasQuitar && !trasQuitar.hayEtiqueta && trasQuitar.editable && trasQuitar.placeholder === 'Buscar o crear…',
  '#354-11 · al quitarla el campo queda vacío, con "Buscar o crear…", y se puede escribir otra',
  trasQuitar ? `etiqueta=${trasQuitar.hayEtiqueta} editable=${trasQuitar.editable}` : '',
)
// Se vuelve a poner y se guarda.
await escribirOrg('Andotek')
await elegirOpcionOrg('Crear')
chk(await guardarModal(), 'terreno: se guarda con la organización puesta')
chk(await abrirEditar('Carla Soto'), 'terreno: se reabre la ficha')
const alReabrir = await estadoCampoOrg()
chk(
  !!alReabrir && alReabrir.hayEtiqueta && alReabrir.texto === 'Andotek' && !alReabrir.hayCampo,
  '#354-13 · al guardar y volver a abrir, la organización se ve como etiqueta y no como texto',
  alReabrir ? `etiqueta="${alReabrir.texto}"` : '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)

// Criterio 10: una organización que YA existe se ve exactamente igual.
chk(
  await pulsarSiEsta(p.locator('.usuarios-cabecera__acciones button.btn--primary'), 600),
  'terreno: se abre el alta de un segundo consultor',
)
await p.locator('.modal-card input').first().fill('Bruno Vega')
await esperar(150)
await p.locator('.modal-card input[type=email]').fill('bv@consultora.cl')
await esperar(150)
await abrirSelector('Perfil')
await pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: 'Consultor' }), 400)
await escribirOrg('Ando')
await elegirOpcionOrg('Andotek')
const existente = await estadoCampoOrg()
chk(
  !!existente && existente.hayEtiqueta && existente.texto === 'Andotek' && !existente.hayCampo,
  '#354-10 · una organización que YA existe se ve exactamente igual: etiqueta, sin campo de texto',
  existente ? `etiqueta="${existente.texto}"` : '',
)
chk(await guardarModal(), 'terreno: se crea el segundo consultor de la misma organización')

// Criterio 14, el otro tema.
console.log('\n── #354-14 · la etiqueta en modo oscuro ──')
const etiquetaEn = async (tema) => {
  await p.evaluate((t) => {
    if (t === 'claro') delete document.documentElement.dataset.tema
    else document.documentElement.dataset.tema = t
  }, tema)
  await esperar(300)
  await abrirEditar('Carla Soto')
  const e = await estadoCampoOrg()
  await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cancelar' }), 400)
  return e
}
const claro = await etiquetaEn('claro')
const oscuro = await etiquetaEn('oscuro')
chk(
  !!claro?.estilo && !!oscuro?.estilo && claro.estilo.fondo !== oscuro.estilo.fondo && oscuro.estilo.radio === '14px',
  '#354-14 · la etiqueta usa el estilo del producto en los dos temas',
  `claro ${claro?.estilo?.fondo} · oscuro ${oscuro?.estilo?.fondo}`,
)
await p.evaluate(() => delete document.documentElement.dataset.tema)

// ═══════════════════════════════════════════════════════════════════════════
// 1 · Quitar y configurar a un colega (criterios 1 a 8)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1 · los dos iconos sobre un colega ──')
// Terreno: la consultora necesita también el permiso de configurar, que su rol
// no trae por defecto (migración 12; #353 no cambió ese default).
await irAUsuarios()
const filaCarla = p.locator('.usuarios-tabla tbody tr', { hasText: 'Carla Soto' }).first()
await pulsarSiEsta(filaCarla.locator('.icon-btn[data-tip*="ermisos"]'), 600)
chk(
  await pulsarSiEsta(
    p.locator('.seg[aria-label="Configurar permisos de los usuarios de sus proyectos"] .seg__btn', { hasText: 'Sí' }),
    300,
  ),
  'terreno: se le da el permiso de configurar',
)
await guardarModal()

await entrarComo('Carla Soto')
await pulsarSiEsta(p.getByText('Resumen', { exact: true }).first(), 450)
await pulsarSiEsta(p.locator('.resumen-card').first(), 1100)
const abrirMiembros = async () => {
  const ok = await pulsarSiEsta(p.locator('.topbar button[title="Personas con acceso a este proyecto"]'), 900)
  return ok && (await p.locator('.miembros').count()) > 0
}
chk(await abrirMiembros(), 'terreno: la consultora abre Miembros de su proyecto')
chk(await pulsarSiEsta(p.locator('.miembros-agregar .selector-btn'), 400), 'terreno: abre la lista de agregables')
chk(
  await pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: 'Bruno Vega' }), 1100),
  'terreno: agrega a su colega',
)

/** Los dos iconos sobre la fila de alguien, en el modal de Miembros. */
const iconosDe = (nombre) =>
  p.evaluate((n) => {
    const li = [...document.querySelectorAll('.miembros li')].find((x) => x.textContent.includes(n))
    if (!li) return null
    return {
      permisos: !!li.querySelector(`button[aria-label="Permisos de ${n}"]`),
      quitar: [...li.querySelectorAll('button')].some((x) => x.textContent.trim() === '✕'),
    }
  }, nombre)

const sobreBruno = await iconosDe('Bruno Vega')
chk(
  !!sobreBruno && sobreBruno.permisos && sobreBruno.quitar,
  '#354-1 · sobre la fila del colega aparecen los DOS iconos: quitar y permisos',
  sobreBruno ? `permisos=${sobreBruno.permisos} quitar=${sobreBruno.quitar}` : 'no está en la lista',
)
// Criterio 2: los permisos se abren y se guardan.
chk(
  await pulsarSiEsta(p.locator('.miembros li', { hasText: 'Bruno Vega' }).locator('button[aria-label="Permisos de Bruno Vega"]'), 700),
  '#354-2 · se abren los permisos del colega',
)
const hayPermisos = await p.evaluate(() => document.querySelectorAll('.seg').length > 0)
chk(hayPermisos, '#354-2 · y muestran el set de permisos de ese acceso')
chk(await pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 700), '#354-2 · y se guardan')

// Criterio 4: sobre un cliente, los dos iconos siguen estando.
await pulsarSiEsta(p.locator('.miembros-agregar .selector-btn'), 400)
const hayCliente = await pulsarSiEsta(p.locator('.selector-menu .selector-op', { hasText: 'Cliente Arauco' }), 1100)
if (hayCliente) {
  const sobreCliente = await iconosDe('Cliente Arauco')
  chk(
    !!sobreCliente && sobreCliente.permisos && sobreCliente.quitar,
    '#354-4 · sobre un CLIENTE del proyecto siguen apareciendo los dos iconos',
    sobreCliente ? `permisos=${sobreCliente.permisos} quitar=${sobreCliente.quitar}` : '',
  )
} else {
  chk(false, '#354-4 · terreno: no se pudo agregar un cliente para comprobarlo')
}

// Criterio 3: quitar al colega funciona.
chk(
  await pulsarSiEsta(p.locator('.miembros li', { hasText: 'Bruno Vega' }).locator('button', { hasText: '✕' }), 1100),
  '#354-3 · se puede quitar al colega',
)
const trasSacar = await iconosDe('Bruno Vega')
chk(trasSacar === null, '#354-3 · y sale de la lista de miembros')
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cerrar' }), 400)
await entrarComo('Bruno Vega')
const veProyecto = await p.evaluate(() => document.querySelectorAll('.nav-proyecto__title').length)
chk(veProyecto === 0, '#354-3 · y deja de ver el proyecto', `${veProyecto} proyecto(s)`)

// Criterio 8 — que un consultor siga sin ver la organización de otro NO se
// puede comprobar acá: el repo de memoria no enmascara nada, así que en esta
// pantalla la ve siempre y el resultado no diría nada de producción. Vive en
// `docs/prueba-353-agregar-colega-base.mjs` (#353-15b), contra una base real.
// Lo que sí es propio de esta pantalla: el modal de Miembros no muestra
// organizaciones de nadie, ni las necesita.
await entrarComo('Carla Soto')
await pulsarSiEsta(p.getByText('Resumen', { exact: true }).first(), 450)
await pulsarSiEsta(p.locator('.resumen-card').first(), 1100)
await abrirMiembros()
const enMiembros = await p.evaluate(() => document.querySelector('.miembros')?.textContent ?? '')
chk(
  !/Andotek/.test(enMiembros),
  '#354-8 · el modal de Miembros no muestra la organización de nadie (ni la necesita)',
  /Andotek/.test(enMiembros) ? 'la muestra' : '',
)
await pulsarSiEsta(p.locator('.modal-acciones .btn', { hasText: 'Cerrar' }), 400)

// ═══════════════════════════════════════════════════════════════════════════
// Lo que de verdad no puede volver a pasar, y dónde se comprueba
// ═══════════════════════════════════════════════════════════════════════════
//
// El defecto era que la PANTALLA calculaba la regla con un dato que en
// producción le llega vacío. La prueba de #353 no lo vio porque en memoria ese
// dato SÍ llega, y por la misma razón tampoco se puede reproducir acá: en el
// repo de memoria el estado local es la FUENTE, así que borrarle la
// organización se la quita a los dos lados a la vez y el resultado no
// distingue una implementación de la otra. Intentarlo daría una prueba que
// parece fuerte y no lo es.
//
// La garantía —que la fuente SÍ sabe la respuesta aunque el cliente no pueda
// calcularla— se comprueba donde se puede observar: en
// `docs/prueba-353-agregar-colega-base.mjs`, contra una base real, midiendo las
// dos cosas a la vez sobre el mismo consultor.
//
// Y queda una comprobación más, que es ESTRUCTURAL y no de comportamiento. Se
// escribe a propósito, sabiendo que mirar el código fuente no es lo habitual
// acá: es el ÚNICO guardián que puede atrapar la reaparición de este defecto.
// Medido: corriendo esta misma prueba contra `main` —con el bug puesto—, los
// criterios 1 a 4 pasan igual, porque en memoria la comparación funciona. Una
// prueba de pantalla no puede distinguir las dos implementaciones; lo que sí se
// puede afirmar es que el archivo no vuelva a mirar ese dato.
console.log('\n── El guardián estructural ──')
const fuenteMiembros = readFileSync('src/components/MiembrosModal.tsx', 'utf8')
const lineasConOrg = fuenteMiembros
  .split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /\borganizacion\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l))
chk(
  lineasConOrg.length === 0,
  '#354-1 · el modal de Miembros NO vuelve a mirar la organización de nadie para decidir',
  lineasConOrg.length ? lineasConOrg.map(([n, l]) => `${n}: ${l.trim().slice(0, 60)}`).join(' | ') : 'ninguna línea la menciona',
)
chk(
  /alcanzadosPorLaRegla/.test(fuenteMiembros),
  '#354-1 · y en su lugar le pregunta a la fuente que autoriza la operación',
)

await b.close()
