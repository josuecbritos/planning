// #318 y #307 — La barra lateral (jerarquía y transición) y el panel de
// detalle (solo leer y comentar).
//
// #318 · Medido en `main` antes del arreglo, sobre el borde de la barra: el
// nombre del PROYECTO arrancaba a **48** (8 del contenedor de la lista + 12 de
// la fila + 10 del botón + el cuadradito de 10 + 8 de separación) y el del
// FRENTE a **30** (8 + 12 + 10). O sea el hijo quedaba **18 a la izquierda de
// su padre**. No era un descuido: #225 alineó los frentes con el cuadradito de
// color a propósito, para ganarle ancho al nombre; el efecto lateral fue esta
// inversión, y este pedido paga parte de ese ancho de vuelta.
//   *El pedido reportó 40 y 22. Son las mismas dos posiciones medidas desde el
//   contenido de `.nav-proyectos`, sin sus 8 de relleno lateral; la distancia
//   entre las dos —los 18 de la inversión, que es lo que importa— coincide.*
//
// Y los frentes solo se dibujaban dentro del proyecto abierto, apareciendo y
// desapareciendo **de golpe**: el ojo no veía nada moverse, solo encontraba la
// lista distinta.
//
// #307 · El panel terminaba con un bloque de acciones —marcar hecha,
// replanificar, archivar, restaurar— DESPUÉS del historial y del hilo de
// comentarios completo, así que con comentarios había que bajar hasta el fondo
// para llegar a ellas. Se saca entero: el panel se usa para leer una tarea y
// comentarla, y marcar hecha y replanificar ya se hacen desde la tabla y desde
// la Gantt.
//
// Consecuencia declarada y aceptada por el dueño: archivar y restaurar existían
// solo en la tabla y en el panel, así que **la Gantt queda sin forma de
// archivar**. Se comprueba que en la tabla sigan estando.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-318-307-sidebar-y-panel.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

// Dónde arrancaban los nombres antes de #318, medidos sobre el borde de la
// barra. La comprobación no exige números nuevos: exige que la relación se
// haya dado vuelta.
const PROY_ANTES = 48
const FRENTE_ANTES = 30

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

const irAResumen = async () => {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(400)
}
const abrirProyecto = async (nombre = 'Plan PGP Arauco') => {
  await irAResumen()
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(900)
}
const verVista = async (cual) => {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(900)
}
/** Abre el ⋯ de un proyecto de la barra y elige una opción. */
const opcionDeProyecto = async (proyecto, opcion) => {
  await p.locator('.nav-proyecto', { hasText: proyecto }).first().locator('.nav-proyecto__menu-btn').click()
  await esperar(300)
  await p.locator('.nav-proyecto__menu-op', { hasText: opcion }).first().click()
  await esperar(400)
}

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// #318 · 1 a 3 · El frente se lee como hijo de su proyecto
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1 · El frente empieza a la derecha de su proyecto ──')

const sangria = () =>
  p.evaluate(() => {
    const r = (x) => x.getBoundingClientRect()
    const barra = document.querySelector('.sidebar')
    const proy = document.querySelector('.nav-proyecto--activo .nav-proyecto__nombre')
    const frente = document.querySelector('.nav-frentes .nav-frente--flex > span')
    const base = r(barra).left
    return {
      proyecto: Math.round(r(proy).left - base),
      frente: frente ? Math.round(r(frente).left - base) : null,
      anchoBoton: frente ? Math.round(r(frente.parentElement).width) : null,
    }
  })

const s = await sangria()
chk(
  s.frente !== null && s.frente > s.proyecto,
  '1 el nombre del frente empieza a la DERECHA del nombre de su proyecto',
  `proyecto ${s.proyecto} · frente ${s.frente} (antes ${PROY_ANTES} contra ${FRENTE_ANTES}: el hijo 18 a la izquierda)`,
)
chk(
  s.frente > FRENTE_ANTES,
  '1 y se corrió a la derecha respecto de donde estaba',
  `${FRENTE_ANTES} → ${s.frente}`,
)
// El costo declarado por el pedido: el nombre dispone de menos ancho. Se
// comprueba que el costo exista y esté acotado, no que valga un número.
chk(
  s.anchoBoton > 150,
  '1 y el nombre conserva ancho de sobra para leerse',
  `${s.anchoBoton} de ancho útil`,
)

console.log('\n── 2 · La línea vertical abarca el grupo ──')
const linea = await p.evaluate(() => {
  const r = (x) => x.getBoundingClientRect()
  const grupo = document.querySelector('.nav-frentes')
  if (!grupo) return null
  const filas = [...grupo.querySelectorAll('.nav-frente-row')]
  const cs = getComputedStyle(grupo)
  return {
    ancho: Math.round(parseFloat(cs.borderLeftWidth)),
    color: cs.borderLeftColor,
    x: Math.round(r(grupo).left - r(document.querySelector('.sidebar')).left),
    sobraArriba: Math.round(r(filas[0]).top - r(grupo).top),
    sobraAbajo: Math.round(r(grupo).bottom - r(filas[filas.length - 1]).bottom),
    nFilas: filas.length,
  }
})
chk(linea !== null && linea.ancho > 0, '2 hay una línea vertical a la izquierda del grupo de frentes', `${linea?.ancho}px`)
chk(
  linea.sobraArriba === 0 && linea.sobraAbajo === 0,
  '2 y empieza con el primer frente y termina con el último',
  `sobra ${linea.sobraArriba} arriba y ${linea.sobraAbajo} abajo`,
)
// La línea cuesta 2 más un aire chico, UNA vez; un punto de color por frente
// costaría unos 18 en cada fila. Ese es el argumento del pedido.
chk(linea.ancho <= 3, '2 y cuesta poco ancho: son 2, no un punto por fila', `${linea.ancho}px`)

console.log('\n── 3 · El frente se ve más chico y más tenue ──')
const pesos = await p.evaluate(() => {
  const cs = (sel) => {
    const e = document.querySelector(sel)
    const s = getComputedStyle(e)
    return { px: parseFloat(s.fontSize), peso: Number(s.fontWeight), color: s.color }
  }
  return { proyecto: cs('.nav-proyecto--activo .nav-proyecto__title'), frente: cs('.nav-frentes .nav-frente') }
})
const luz = (c) => c.match(/\d+/g).slice(0, 3).reduce((a, n) => a + Number(n), 0)
chk(
  pesos.frente.px < pesos.proyecto.px,
  '3 el frente se ve más chico que el nombre del proyecto',
  `frente ${pesos.frente.px} · proyecto ${pesos.proyecto.px} (antes el frente era 13.5, MÁS grande)`,
)
chk(
  luz(pesos.frente.color) < luz(pesos.proyecto.color) && pesos.frente.peso < pesos.proyecto.peso,
  '3 y más tenue: menos peso y menos claro',
  `frente ${pesos.frente.peso}/${pesos.frente.color} · proyecto ${pesos.proyecto.peso}/${pesos.proyecto.color}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// #318 · 4 a 6 · Los frentes se despliegan, no aparecen
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 4 a 6 · La transición ──')

/** Muestrea el alto de la caja de frentes mientras corre la transición. */
const muestrear = async (accion) => {
  await accion()
  return p.evaluate(async () => {
    const alturas = []
    for (let i = 0; i < 14; i++) {
      const caja = document.querySelector('.nav-frentes-caja')
      alturas.push(caja ? Math.round(caja.getBoundingClientRect().height) : 0)
      await new Promise((r) => setTimeout(r, 20))
    }
    return alturas
  })
}
/** Una transición de verdad pasa por alturas INTERMEDIAS; una aparición de
 *  golpe salta de 0 al total en una sola muestra. */
const hayTransicion = (alturas) => {
  const max = Math.max(...alturas)
  return max > 0 && alturas.some((h) => h > 0 && h < max * 0.9)
}

// Ojo: la acción NO puede llevar espera adentro. Con un `esperar(400)` la
// transición ya terminó antes de la primera muestra y el repliegue se leía
// como 0 en todas — que es exactamente el síntoma que este pedido corrige, así
// que la prueba habría dado por bueno el defecto.
const replegando = await muestrear(async () => {
  await p.getByText('Resumen', { exact: true }).first().click()
})
chk(
  hayTransicion(replegando),
  '5 al cerrar el proyecto, los frentes se REPLIEGAN en vez de desaparecer de golpe',
  replegando.join(' '),
)
chk(
  replegando[replegando.length - 1] === 0,
  '5 y terminan replegados del todo',
  `${replegando[replegando.length - 1]}`,
)
await esperar(500)

const desplegando = await muestrear(async () => {
  await p.locator('.nav-proyecto__title', { hasText: 'Plan PGP Arauco' }).first().click()
})
chk(
  hayTransicion(desplegando),
  '4 al abrirlo, se DESPLIEGAN hacia abajo en vez de aparecer de golpe',
  desplegando.join(' '),
)
await esperar(500)

// 6 · Un proyecto de un frente y uno de seis: la transición se ve bien en los
// dos. El alto es distinto, pero el TIEMPO no: lo que se exige es que los dos
// pasen por alturas intermedias y lleguen a su total.
console.log('\n── 6 · Con uno y con seis frentes ──')
for (let i = 3; i <= 6; i++) {
  await opcionDeProyecto('Plan PGP Arauco', 'Agregar frente')
  await p.locator('.modal-card input').first().fill(`Frente ${i}`)
  await p.locator('.modal-acciones .btn--primary').click()
  await esperar(500)
}
const nSeis = await p.locator('.nav-frentes .nav-frente-row').count()
const conSeis = await muestrear(async () => {
  await p.getByText('Resumen', { exact: true }).first().click()
})
chk(nSeis === 6, '6 terreno: el proyecto quedó con seis frentes', `${nSeis}`)
chk(
  hayTransicion(conSeis),
  '6 con seis frentes la transición se sigue viendo',
  conSeis.join(' '),
)
await esperar(500)

// 5 · "cerrarlo o abrir OTRO": el caso A → B es el que de verdad prueba que la
// caja del saliente sobrevive al cambio, porque en el mismo commit una se
// repliega y la otra se despliega.
console.log('\n── 5 · Pasar de un proyecto a otro ──')
await p.locator('.sidebar__section .icon-btn', { hasText: '+' }).first().click()
await esperar(400)
await p.locator('.modal-card input').first().fill('Proyecto vecino')
await p.locator('.modal-acciones .btn--primary').click()
await esperar(900)
await opcionDeProyecto('Proyecto vecino', 'Agregar frente')
await p.locator('.modal-card input').first().fill('Frente del vecino')
await p.locator('.modal-acciones .btn--primary').click()
await esperar(500)
await p.locator('.nav-proyecto__title', { hasText: 'Plan PGP Arauco' }).first().click()
await esperar(700)
const alCambiar = await muestrear(async () => {
  await p.locator('.nav-proyecto__title', { hasText: 'Proyecto vecino' }).first().click()
})
chk(
  hayTransicion(alCambiar),
  '5 al abrir otro proyecto, el que se cierra también se repliega con transición',
  alCambiar.join(' '),
)
await esperar(500)

// ═══════════════════════════════════════════════════════════════════════════
// #318 · 7 a 11 · Lo que no se toca
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 7 a 11 · Lo que no cambia ──')
await abrirProyecto()

const corte = await p.evaluate(() => {
  const s = document.querySelector('.nav-frentes .nav-frente--flex > span')
  const cs = getComputedStyle(s)
  return { textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, title: s.getAttribute('title') }
})
chk(
  corte.textOverflow === 'ellipsis' && corte.whiteSpace === 'nowrap',
  '7 los nombres largos se siguen cortando con puntos suspensivos',
  `${corte.whiteSpace} / ${corte.textOverflow}`,
)
chk(!!corte.title, '7 y el nombre completo sigue en el globo', corte.title ?? '')

// 8 · el ⋯ del proyecto y el del frente siguen funcionando.
await p.locator('.nav-frente-row').first().hover()
await esperar(200)
await p.locator('.nav-frente-row').first().locator('.nav-frente__menu-btn').click()
await esperar(400)
const opsFrente = await p.locator('.nav-proyecto__menu-op').count()
chk(opsFrente > 0, '8 el ⋯ de un frente sigue abriendo sus opciones', `${opsFrente} opciones`)
await p.keyboard.press('Escape')
await p.locator('.topbar__title').click({ position: { x: 5, y: 5 } })
await esperar(300)
await p.locator('.nav-proyecto', { hasText: 'Plan PGP Arauco' }).first().locator('.nav-proyecto__menu-btn').click()
await esperar(400)
const opsProy = await p.locator('.nav-proyecto__menu-op').count()
chk(opsProy > 0, '8 y el ⋯ del proyecto también', `${opsProy} opciones`)
await p.locator('.topbar__title').click({ position: { x: 5, y: 5 } })
await esperar(300)

// 9 · seleccionar un frente lo sigue marcando.
const nombreFrente = await p.locator('.nav-frentes .nav-frente--flex > span').first().innerText()
await p.locator('.nav-frentes .nav-frente--flex').first().click()
await esperar(700)
const marcado = await p.evaluate(() => {
  const fila = document.querySelector('.nav-frente-row--activo')
  if (!fila) return null
  const s = getComputedStyle(fila)
  const txt = getComputedStyle(fila.querySelector('.nav-frente'))
  return { fondo: s.backgroundColor, color: txt.color, nombre: fila.innerText.trim() }
})
chk(marcado !== null, '9 el frente elegido queda marcado como activo', marcado?.nombre ?? 'ninguno')
chk(
  marcado && !marcado.fondo.endsWith(', 0)') && marcado.fondo !== 'transparent',
  '9 y su fila lleva fondo propio',
  marcado?.fondo ?? '',
)
chk(
  marcado && marcado.color === 'rgb(255, 255, 255)',
  '9 y su texto recupera el blanco: no se queda tenue',
  `${marcado?.color} · ${nombreFrente}`,
)

// 10 · plegar la barra a la tira de íconos sigue funcionando.
await p.locator('.sidebar__plegar').first().click()
await esperar(600)
const plegada = await p.evaluate(() => ({
  clase: document.querySelector('.app')?.className ?? '',
  hayTira: !!document.querySelector('.sidebar-mini'),
}))
chk(
  plegada.hayTira && /sidebar-escondida/.test(plegada.clase),
  '10 plegar la barra a la tira de íconos sigue funcionando',
  plegada.clase,
)
await p.locator('.sidebar-zona').hover()
await esperar(600)
await p.locator('.sidebar__plegar').first().click()
await esperar(600)

// 11 · un proyecto sin frentes no muestra línea vertical.
console.log('\n── 11 · Un proyecto sin frentes ──')
await p.locator('.sidebar__section .icon-btn', { hasText: '+' }).first().click()
await esperar(400)
await p.locator('.modal-card input').first().fill('Proyecto sin frentes')
await p.locator('.modal-acciones .btn--primary').click()
await esperar(900)
await p.locator('.nav-proyecto__title', { hasText: 'Proyecto sin frentes' }).first().click()
await esperar(900)
const sinFrentes = await p.evaluate(() => ({
  hayCaja: !!document.querySelector('.nav-frentes-caja'),
  hayGrupo: !!document.querySelector('.nav-frentes'),
}))
chk(
  !sinFrentes.hayCaja && !sinFrentes.hayGrupo,
  '11 en un proyecto sin frentes no aparece la línea vertical',
  `caja=${sinFrentes.hayCaja} grupo=${sinFrentes.hayGrupo}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// #307 · El panel: solo leer y comentar
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #307 · 1 a 4 · Debajo de los comentarios no queda nada ──')
await abrirProyecto()

/** Abre el panel de la primera tarea de la tabla. */
const abrirPanel = async () => {
  await p.locator('table.tareas tbody .col-acc .icon-btn[aria-label="Información"]').first().click()
  await esperar(600)
}
const loQueHayEnElPanel = () =>
  p.evaluate(() => {
    const panel = document.querySelector('.panel-detalle')
    if (!panel) return null
    const coment = panel.querySelector('.panel-detalle__comentarios')
    const texto = panel.innerText
    return {
      acciones: !!panel.querySelector('.panel-detalle__acciones'),
      casillaHecha: !!panel.querySelector('input[type=checkbox]'),
      controlFecha: !!panel.querySelector('.fecha-editable, .panel-accion'),
      archivar: /Archivar tarea/.test(texto),
      restaurar: /Restaurar al plan/.test(texto),
      motivoFecha: /Desmárcala para corregirla/.test(texto),
      // Nada después del hilo de comentarios.
      despuesDeComentarios: coment
        ? [...panel.children].indexOf(coment.closest('.panel-detalle > *')) === panel.children.length - 1
        : null,
      hayHistorial: !!panel.querySelector('.panel-detalle__cadena'),
      hayComentarios: !!coment,
      estados: (texto.match(/Hecha/g) ?? []).length,
    }
  })

await abrirPanel()
const panel = await loQueHayEnElPanel()
chk(panel !== null, '#307 terreno: el panel abre desde la tabla')
chk(!panel.acciones, '1 debajo de los comentarios no hay bloque de acciones')
chk(!panel.casillaHecha, '1 no está la casilla "Hecha"')
chk(!panel.controlFecha, '1 ni el control de replanificar')
chk(!panel.archivar, '1 ni "Archivar tarea"')
chk(
  panel.despuesDeComentarios === true,
  '1 y el hilo de comentarios es lo último del panel',
  `${panel.despuesDeComentarios}`,
)
chk(panel.hayHistorial && panel.hayComentarios, '9 el historial y los comentarios siguen ahí')

// 3 · el estado se dice una sola vez.
const estadoUnaVez = await p.evaluate(() => {
  const panel = document.querySelector('.panel-detalle')
  return {
    etiquetas: panel.querySelectorAll('.hovercard__estado').length,
    etiqueta: panel.querySelector('.hovercard__estado')?.textContent.trim() ?? '',
  }
})
chk(
  estadoUnaVez.etiquetas === 1,
  '3 el estado se ve una sola vez, en la etiqueta junto al título',
  `${estadoUnaVez.etiquetas} etiqueta(s): "${estadoUnaVez.etiqueta}"`,
)

// 4 · una tarea HECHA no muestra el texto sobre su fecha.
await p.keyboard.press('Escape')
await esperar(300)
// La casilla de la tabla es un botón con `role=checkbox` (CheckHecha), no un
// `input`: se busca por su estado marcado.
const filaHecha = p.locator('table.tareas tbody tr', { has: p.locator('.check-hecha--on') }).first()
await filaHecha.locator('.col-acc .icon-btn[aria-label="Información"]').click()
await esperar(600)
const enHecha = await loQueHayEnElPanel()
chk(
  !enHecha.motivoFecha,
  '4 en una tarea hecha no aparece el texto sobre que su fecha no se edita',
)
chk(!enHecha.acciones && !enHecha.casillaHecha, '4 y tampoco el bloque de acciones')
await p.keyboard.press('Escape')
await esperar(300)

// 2 · una tarea ARCHIVADA tampoco ofrece "Restaurar al plan".
console.log('\n── #307 · 2 · Una tarea archivada ──')
const titulosAntes = await p.locator('table.tareas tbody .tarea-cell__link, table.tareas tbody .link-tarea').count()
await p.locator('table.tareas tbody .col-acc .icon-btn[aria-label="Archivar"]').first().click()
await esperar(700)
const bloque = p.locator('details.archivadas').first()
chk((await bloque.count()) > 0, '2 terreno: la tarea archivada aparece en su bloque', `${titulosAntes} antes`)
await bloque.locator('summary').click()
await esperar(300)
await bloque.locator('.link-tarea').first().click()
await esperar(700)
const enArchivada = await loQueHayEnElPanel()
chk(
  enArchivada !== null && !enArchivada.restaurar,
  '2 al abrir una tarea archivada no aparece "Restaurar al plan"',
)
chk(enArchivada && !enArchivada.acciones, '2 y tampoco el resto del bloque de acciones')
await p.keyboard.press('Escape')
await esperar(300)
// 8 · restaurar desde el bloque de archivadas sigue funcionando.
await bloque.locator('.link-btn', { hasText: 'Restaurar' }).first().click()
await esperar(700)
chk(
  (await p.locator('details.archivadas').count()) === 0,
  '8 restaurar desde el bloque de tareas archivadas sigue funcionando',
)

// 5 · ese texto SIGUE como globo en la tabla.
console.log('\n── #307 · 5 a 8 · Lo que sigue funcionando ──')
const globo = await filaHecha.locator('td.col-fecha').first().getAttribute('title')
chk(
  globo !== null && /Desmárcala para corregirla/.test(globo),
  '5 en la tabla, la fecha de una tarea hecha sigue explicando por qué no se edita',
  globo ?? 'sin globo',
)

// 6 y 7 · marcar hecha y replanificar siguen en la tabla y en la Gantt.
const contarEnTabla = () =>
  p.evaluate(() => ({
    casillas: document.querySelectorAll('table.tareas tbody .check-hecha').length,
    fechas: document.querySelectorAll('table.tareas tbody .fecha-btn').length,
    archivar: document.querySelectorAll('table.tareas tbody .col-acc button').length,
  }))
const enTabla = await contarEnTabla()
chk(enTabla.casillas > 0, '6 marcar hecha sigue estando en la tabla', `${enTabla.casillas} casillas`)
chk(enTabla.fechas > 0, '7 y replanificar también', `${enTabla.fechas} fechas editables`)
chk(enTabla.archivar > 0, '8 archivar sigue en la columna de acciones de la tabla', `${enTabla.archivar} botones`)

await verVista('Gantt')
const enGantt = await p.evaluate(() => ({
  marcas: document.querySelectorAll('.gantt .mark').length,
}))
chk(enGantt.marcas > 0, '6 y 7 la Gantt conserva sus marcas para operar sobre la tarea', `${enGantt.marcas}`)

// 11 · el panel se comporta igual desde la Gantt.
await p.locator('.gantt td .mark').first().click()
await esperar(700)
const desdeGantt = await loQueHayEnElPanel()
chk(
  desdeGantt !== null && !desdeGantt.acciones && !desdeGantt.casillaHecha,
  '11 abierto desde la Gantt, el panel se comporta igual: sin acciones',
)
await p.keyboard.press('Escape')
await esperar(300)

// 11 · y desde Mis Tareas.
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(900)
await p.locator('table.tareas tbody .tarea-cell__link').first().click()
await esperar(700)
const desdeMisTareas = await loQueHayEnElPanel()
chk(
  desdeMisTareas !== null && !desdeMisTareas.acciones && !desdeMisTareas.casillaHecha,
  '11 y desde Mis Tareas también',
)

// 10 · el ancho del panel no cambia, y sigue sin atenuar lo de atrás.
const forma = await p.evaluate(() => {
  const panel = document.querySelector('.panel-detalle')
  return {
    ancho: Math.round(panel.getBoundingClientRect().width),
    hayVelo: !!document.querySelector('.modal-overlay'),
  }
})
chk(forma.ancho >= 320 && forma.ancho <= 460, '10 el ancho del panel no cambió', `${forma.ancho}`)
chk(!forma.hayVelo, '10 y sigue sin atenuar lo que hay detrás')

await b.close()
console.log(
  process.exitCode
    ? '\n⛔ HAY FALLAS'
    : '\n✅ #318 y #307 — el frente cuelga de su proyecto y se despliega, y el panel solo lee y comenta',
)
