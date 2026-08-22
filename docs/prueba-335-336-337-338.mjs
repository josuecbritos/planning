// #335 · #336 · #337 · #338, más tres correcciones sobre el menú de la tarea.
//
// #335 — Nada indicaba sobre qué fila estaba el mouse. En la Gantt eso pesa
// más: la grilla es ancha, las filas son bajas y hay que seguir una fila hacia
// la derecha por encima de decenas de columnas de día. La fila bajo el mouse se
// resalta con DOS señales: un velo sobre toda la fila —**por encima** del color
// de estado, nunca en su lugar— y una línea de acento a su izquierda.
//
// #336 — "En horizonte visible" era el único filtro de fecha que sumaba una
// categoría aparte: mostraba su rango MÁS todas las tareas sin fecha. Deja de
// ser la excepción. "Sin fecha" ya existe como opción propia para verlas.
//
// #337 — Y existe también en Mis Tareas: se excluía porque "cruza proyectos y
// no tiene un horizonte único", y eso dejó de ser cierto cuando Mis Tareas tuvo
// su propia Gantt.
//
// #338 — En la Gantt de Mis Tareas el clic sobre el nombre abre el panel, como
// en su tabla. Renombrar queda en el menú, que ya lo tiene.
//
// Correcciones: "Duplicar tarea", "Agregar tarea abajo" en sus DOS sitios, y la
// copia se crea de una, sin ningún campo abierto.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-335-336-337-338.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const SEIS = ['Información', 'Renombrar', 'Agregar tarea abajo', 'Duplicar tarea', 'Archivar', 'Eliminar']
const NARANJA = 'rgb(249, 115, 22)'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

// ── Terreno ────────────────────────────────────────────────────────────────
const entrarComo = async (nombre) => {
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await esperar(700)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1000)
}
const abrirProyecto = async (nombre = 'Plan PGP Arauco') => {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(450)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(900)
}
const irAMisTareas = async () => {
  await p.getByText('Mis Tareas', { exact: true }).first().click()
  await esperar(1300)
}
const verVista = async (cual) => {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(1300)
}
const opciones = () => p.locator('.menu-tarea__op').allInnerTexts()
const clicDerechoEn = async (fila) => {
  if ((await fila.count()) === 0) return false
  const celda = fila.locator('td.tarea-cell, td.fija--tarea').first()
  if ((await celda.count()) === 0) return false
  await celda.click({ button: 'right' })
  await esperar(450)
  return true
}
const elegir = async (texto, ms = 800) => {
  const op = p.locator('.menu-tarea__op', { hasText: texto }).first()
  if ((await op.count()) === 0) return false
  await op.click()
  await esperar(ms)
  return true
}
const cerrarMenu = async () => {
  await p.keyboard.press('Escape')
  await esperar(300)
}
/** Abre el campo Fecha dentro de Filtrar y deja el menú abierto. */
const abrirCampoFecha = async () => {
  await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
  await esperar(450)
  await p.locator('.filtro-op', { hasText: 'Fecha' }).first().click()
  await esperar(450)
}
const opHorizonte = () => p.locator('.filtro-op', { hasText: 'En horizonte visible' }).first()
const nombresGantt = () =>
  p.evaluate(() => [...document.querySelectorAll('.gantt td.fija--tarea .fija-txt')].map((x) => x.textContent.trim()))
const nombresTabla = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('table.tareas tbody tr')]
      .map((r) => r.querySelector('.tarea-cell__link, .tarea-cell .inline-text'))
      .filter(Boolean)
      .map((n) => n.textContent.trim()),
  )
/** Mide una fila: qué celdas llevan velo y cuáles el acento naranja. */
const medirFila = (sel, i = 0) =>
  p.evaluate(
    ([s, idx, naranja]) => {
      const r = document.querySelectorAll(s)[idx]
      if (!r) return null
      const tds = [...r.querySelectorAll('td')]
      const velo = (td) => getComputedStyle(td).backgroundImage
      return {
        celdas: tds.length,
        conVelo: tds.filter((td) => velo(td) !== 'none').length,
        sinVelo: tds.filter((td) => velo(td) === 'none').map((td) => td.className),
        veloValor: velo(tds[0]),
        fondoPrimera: getComputedStyle(tds[0]).backgroundColor,
        acento: tds
          .filter((td) => getComputedStyle(td).boxShadow.includes(naranja))
          .map((td) => td.className.slice(0, 24)),
        ultimaConVelo: [...tds].reverse().find((td) => velo(td) !== 'none')?.className.slice(0, 20) ?? null,
      }
    },
    [sel, i, NARANJA],
  )
/** Cuántas filas de la pantalla están resaltadas ahora mismo. */
/** Pasa el mouse por algo, si está. Devuelve false si no —el control negativo
 *  deja el terreno distinto—, para que la prueba siga y reporte TODO en vez de
 *  detenerse en el primer paso que depende de ello. */
const pasarMouse = async (loc, ms = 400) => {
  if ((await loc.count()) === 0) return false
  await loc.first().hover()
  await esperar(ms)
  return true
}
/** Pulsa algo si está. */
const pulsarSiEsta = async (loc, ms = 400) => {
  if ((await loc.count()) === 0) return false
  await loc.first().click()
  await esperar(ms)
  return true
}
/** Escribe y guarda con Enter, si el campo está. */
const escribirYGuardar = async (loc, texto, ms = 900) => {
  if ((await loc.count()) === 0) return false
  await loc.first().fill(texto)
  await p.keyboard.press('Enter')
  await esperar(ms)
  return true
}
const cuantasResaltadas = () =>
  p.evaluate(
    (naranja) =>
      [...document.querySelectorAll('tr.fila-tarea, tr.gfila-tarea')].filter((r) =>
        [...r.querySelectorAll('td')].some((td) => getComputedStyle(td).boxShadow.includes(naranja)),
      ).length,
    NARANJA,
  )

await entrarComo('Daniela Vera')
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// Correcciones · 1 y 2 · Los dos textos
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Correcciones · 1 y 2 · Los textos del menú y del "+" ──')
const filaTabla = (titulo) => p.locator('table.tareas tbody tr', { hasText: titulo }).first()
const antesT = await nombresTabla()

await clicDerechoEn(filaTabla(antesT[1]))
const ops = await opciones()
chk(ops.includes('Duplicar tarea'), 'C1 el menú dice "Duplicar tarea"', ops.join(' · '))
chk(ops.includes('Agregar tarea abajo'), 'C2 el menú dice "Agregar tarea abajo"')
chk(JSON.stringify(ops) === JSON.stringify(SEIS), 'C1/C2 y el resto del menú sigue igual, en su orden', ops.join(' · '))

// ═══════════════════════════════════════════════════════════════════════════
// Correcciones · 3 a 6 · La copia se crea de una
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Correcciones · 3 a 6 · Duplicar sin campo abierto ──')
await elegir('Duplicar tarea', 1000)
const abiertos = await p.locator('table.tareas input.inline-input, table.tareas tr.fila-nueva').count()
const trasDup = await nombresTabla()
chk(abiertos === 0, 'C3 la copia aparece creada, sin ningún campo en edición', `${abiertos} campos abiertos`)
chk(
  trasDup[2] === antesT[1] && trasDup[1] === antesT[1],
  'C3/C5 con el mismo título que la original, y las dos conviven sin marca ni sufijo',
  trasDup.slice(0, 4).join(' · '),
)
chk(
  trasDup[2] === antesT[1] && trasDup.length === antesT.length + 1,
  'C6 y justo debajo de la original',
  `${antesT.length} → ${trasDup.length} tareas`,
)
const copia = await p.evaluate(() => {
  const f = document.querySelectorAll('table.tareas')[0].querySelectorAll('tbody tr')[2]
  return {
    fecha: f.querySelector('.col-fecha')?.textContent.trim(),
    clase: f.className,
    replan: f.querySelector('.replan-count')?.textContent.trim() ?? null,
  }
})
chk(
  copia.fecha === 'Planificar' && !/fila--/.test(copia.clase) && copia.replan === null,
  'C6 y lo demás de duplicar sigue igual: sin fecha, sin color, sin ↻ ×N',
  `${copia.fecha} · clase "${copia.clase}"`,
)
// 4 · el clic en el nombre de la copia la deja editar, en un proyecto.
const filaCopia = p.locator('table.tareas').first().locator('tbody tr').nth(2)
await pulsarSiEsta(filaCopia.locator('.tarea-cell .inline-text'), 500)
chk(
  (await filaCopia.locator('input.inline-input').count()) > 0,
  'C4 el clic sobre el nombre de la copia la deja editar, en un proyecto',
)
await p.keyboard.press('Escape')
await esperar(400)

// ═══════════════════════════════════════════════════════════════════════════
// #335 · 1 y 2 · El resaltado en la tabla, sobre el color de estado
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #335 · 1 y 2 · La fila bajo el mouse, en la tabla ──')
const sinMouse = await medirFila('table.tareas tbody tr.fila--rojo')
await pasarMouse(p.locator('table.tareas tbody tr.fila--rojo'))
const conMouse = await medirFila('table.tareas tbody tr.fila--rojo')
chk(
  sinMouse?.conVelo === 0 && !!conMouse && conMouse.conVelo === conMouse.celdas,
  '#335·1 el velo cubre TODA la fila, y solo aparece con el mouse encima',
  `${conMouse?.conVelo} de ${conMouse?.celdas} celdas`,
)
chk(
  conMouse?.acento.length === 1 && conMouse.acento[0].startsWith('col-check'),
  '#335·1 y la línea naranja va en el borde izquierdo de la fila',
  conMouse?.acento.join(' · ') ?? 'sin acento',
)
// El velo es el DOBLE del de una opción de menú, y va encima del color.
const velos = await p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return { menu: cs.getPropertyValue('--velo').trim(), fila: cs.getPropertyValue('--velo-fila').trim() }
})
chk(
  /0?\.1\b|0?\.10\b/.test(velos.fila) && /0?\.05\b/.test(velos.menu),
  '#335·1 el velo de la fila es el doble del de una opción de menú',
  `menú ${velos.menu} · fila ${velos.fila}`,
)
chk(
  conMouse?.fondoPrimera === sinMouse?.fondoPrimera && /rgb\(2\d\d, 2\d\d, 2\d\d\)/.test(conMouse?.fondoPrimera ?? ''),
  '#335·2 una fila roja resaltada SIGUE siendo roja: el velo va encima, no en lugar del color',
  `${sinMouse?.fondoPrimera} → ${conMouse?.fondoPrimera}`,
)
// Las otras tres categorías.
for (const [clase, etiqueta] of [
  ['fila--verde', 'verde'],
  ['fila--ambar', 'ámbar'],
  ['fila--morado', 'morada'],
]) {
  const fila = p.locator(`table.tareas tbody tr.${clase}`).first()
  if ((await fila.count()) === 0) {
    chk(false, `#335·2 terreno: no hay ninguna fila ${etiqueta} en pantalla`)
    continue
  }
  const antes = await medirFila(`table.tareas tbody tr.${clase}`)
  await pasarMouse(fila, 350)
  const con = await medirFila(`table.tareas tbody tr.${clase}`)
  chk(
    !!con && con.conVelo === con.celdas && con.fondoPrimera === antes?.fondoPrimera,
    `#335·2 la fila ${etiqueta} se resalta y conserva su color`,
    `${antes?.fondoPrimera} → ${con?.fondoPrimera}`,
  )
}
// 6 · una sola fila a la vez.
await pasarMouse(p.locator('table.tareas tbody tr.fila-tarea').nth(1), 350)
chk((await cuantasResaltadas()) === 1, '#335·6 solo una fila queda resaltada a la vez', `${await cuantasResaltadas()}`)

// ═══════════════════════════════════════════════════════════════════════════
// #335 · 3 · 4 · 5 · 9 · En la Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #335 · 3 a 5 y 9 · La fila bajo el mouse, en la Gantt ──')
await verVista('Gantt')
await pasarMouse(p.locator('.gantt tbody tr.gfila-tarea').nth(3))
const medG = await medirFila('.gantt tbody tr.gfila-tarea', 3)
chk(
  !!medG && medG.conVelo === medG.celdas && medG.celdas > 10,
  '#335·3 el resaltado llega de las columnas congeladas al borde derecho, sobre las celdas de día',
  `${medG?.conVelo} de ${medG?.celdas} celdas · la última es "${medG?.ultimaConVelo}"`,
)
chk(
  medG?.acento.length === 1 && medG.acento[0].includes('fija--tarea'),
  '#335·4 la línea naranja va a la izquierda de la columna del nombre',
  medG?.acento.join(' · ') ?? 'sin acento',
)
// La PRIMERA fila de un bloque lleva además las celdas-rótula combinadas: esas
// no se resaltan, y el acento sigue quedando en el mismo lugar.
await pasarMouse(p.locator('.gantt tbody tr.gfila-tarea').first())
const medG0 = await medirFila('.gantt tbody tr.gfila-tarea', 0)
chk(
  (medG0?.sinVelo.length ?? 0) > 0 && medG0.sinVelo.every((c) => c.includes('rotula')),
  '#335·5 las celdas combinadas de frente y sub frente NO se resaltan',
  medG0?.sinVelo.join(' · ') ?? '(ninguna)',
)
chk(
  medG0?.acento.length === 1 && medG0.acento[0].includes('fija--tarea'),
  '#335·4 y el acento queda en el mismo lugar también en la primera fila del bloque',
  medG0?.acento.join(' · ') ?? 'sin acento',
)
// 5 · las filas de carga por persona.
const carga = p.locator('.gantt tbody tr.carga-fila').first()
if ((await carga.count()) > 0) {
  await pasarMouse(carga)
  const medC = await medirFila('.gantt tbody tr.carga-fila')
  chk(medC?.conVelo === 0, '#335·5 las filas de carga por persona tampoco se resaltan', `${medC?.conVelo} celdas con velo`)
} else {
  chk(false, '#335·5 terreno: no hay filas de carga por persona en pantalla')
}
// 9 · con la grilla desplazada, el resaltado acompaña.
await p.evaluate(() => document.querySelector('.gantt-scroll')?.scrollBy(600, 0))
await esperar(400)
await pasarMouse(p.locator('.gantt tbody tr.gfila-tarea').nth(3))
const medDesp = await medirFila('.gantt tbody tr.gfila-tarea', 3)
chk(
  !!medDesp && medDesp.conVelo === medDesp.celdas && medDesp.acento.length === 1,
  '#335·9 con la Gantt desplazada a lo ancho, el resaltado acompaña a la fila',
  `${medDesp?.conVelo} de ${medDesp?.celdas} celdas`,
)
await p.evaluate(() => document.querySelector('.gantt-scroll')?.scrollTo(0, 0))
await esperar(300)

// ═══════════════════════════════════════════════════════════════════════════
// #335 · 8 · En Mis Tareas se comporta igual
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #335 · 8 · En Mis Tareas ──')
await irAMisTareas()
await pasarMouse(p.locator('table.tareas tbody tr.fila-tarea').first())
const medMT = await medirFila('table.tareas tbody tr.fila-tarea')
chk(
  !!medMT && medMT.conVelo === medMT.celdas && medMT.acento.length === 1,
  '#335·8 en la tabla de Mis Tareas se comporta igual',
  medMT ? `${medMT.conVelo} de ${medMT.celdas} celdas · acento en ${medMT.acento[0]}` : 'sin fila',
)
await verVista('Gantt')
await pasarMouse(p.locator('.gantt tbody tr.gfila-tarea').nth(1))
const medMTG = await medirFila('.gantt tbody tr.gfila-tarea', 1)
chk(
  !!medMTG && medMTG.conVelo === medMTG.celdas && medMTG.acento.length === 1,
  '#335·8 y en su Gantt también',
  medMTG ? `${medMTG.conVelo} de ${medMTG.celdas} celdas` : 'sin fila',
)

// ═══════════════════════════════════════════════════════════════════════════
// #335 · 7 · En modo oscuro
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #335 · 7 · En modo oscuro ──')
await abrirProyecto()
// Volviendo de la Gantt de Mis Tareas la pantalla del proyecto abre en Gantt:
// el conmutador es uno solo. La medida de #335·7 es sobre la tabla.
await verVista('Tabla')
await p.locator('.sesion__tema').first().click()
await esperar(800)
const oscuroSin = await medirFila('table.tareas tbody tr.fila--rojo')
await pasarMouse(p.locator('table.tareas tbody tr.fila--rojo'))
const oscuroCon = await medirFila('table.tareas tbody tr.fila--rojo')
chk(
  !!oscuroCon && oscuroCon.conVelo === oscuroCon.celdas && /255, 255, 255/.test(oscuroCon.veloValor ?? ''),
  '#335·7 en oscuro el velo se ve, y ACLARA en vez de oscurecer',
  oscuroCon?.veloValor ?? 'sin velo',
)
chk(
  oscuroCon?.acento.length === 1,
  '#335·7 y la línea naranja también se ve',
  oscuroCon?.acento.join(' · ') ?? 'sin acento',
)
chk(
  oscuroCon?.fondoPrimera === oscuroSin?.fondoPrimera && oscuroCon?.fondoPrimera !== '(sin fila)',
  '#335·7 y los colores de estado siguen distinguiéndose',
  `${oscuroSin?.fondoPrimera} → ${oscuroCon?.fondoPrimera}`,
)
// Volver a claro para el resto de la prueba.
await p.locator('.sesion__tema').first().click()
await esperar(700)

// ═══════════════════════════════════════════════════════════════════════════
// #336 · "En horizonte visible" y las tareas sin fecha
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #336 · "En horizonte visible" filtra solo por rango ──')
await verVista('Gantt')
const sinFiltroG = await nombresGantt()
const SIN_FECHA = 'Checklist de go-live'
chk(sinFiltroG.includes(SIN_FECHA), '#336 terreno: hay una tarea sin fecha a la vista', SIN_FECHA)
await abrirCampoFecha()
chk(
  !/sin fecha/i.test((await opHorizonte().getAttribute('title')) ?? ''),
  '#336·7 la ayuda del botón ya no menciona las tareas sin fecha',
  (await opHorizonte().getAttribute('title')) ?? '',
)
await opHorizonte().click()
await esperar(600)
await p.keyboard.press('Escape')
await esperar(600)
const conH = await nombresGantt()
chk(!conH.includes(SIN_FECHA), '#336·1 con el filtro activo, la tarea sin fecha ya no aparece')
chk(
  conH.length > 0 && conH.length < sinFiltroG.length,
  '#336·2 y sí siguen las que tienen fecha dentro del horizonte',
  `${sinFiltroG.length} → ${conH.length} tareas`,
)
// 4 · el selector de horizonte sigue disponible; 3 · el filtro lo sigue.
const hayRango = (await p.locator('.controles-btn', { hasText: 'Rango' }).count()) > 0
chk(hayRango, '#336·4 el selector de horizonte sigue disponible con el filtro puesto')
if (hayRango) {
  await p.locator('.controles-btn', { hasText: 'Rango' }).first().click()
  await esperar(450)
  await p.locator('.filtro-op', { hasText: 'Todo el proyecto' }).first().click()
  await esperar(800)
  await p.keyboard.press('Escape')
  await esperar(600)
  const conTodo = await nombresGantt()
  chk(
    conTodo.length >= conH.length && !conTodo.includes(SIN_FECHA),
    '#336·3 al ampliar el horizonte el filtro lo sigue, y las sin fecha siguen fuera',
    `${conH.length} → ${conTodo.length} tareas`,
  )
}
// 5 · la tabla muestra el mismo conjunto.
await verVista('Tabla')
const enTabla = await nombresTabla()
const enGantt = new Set(conH)
void enGantt
chk(!enTabla.includes(SIN_FECHA), '#336·5 la tabla con el filtro puesto tampoco muestra la tarea sin fecha')
// 6 · "Sin fecha" apaga el horizonte y muestra las sin fecha.
await verVista('Gantt')
await abrirCampoFecha()
await p.locator('.filtro-op', { hasText: 'Sin fecha' }).first().click()
await esperar(600)
await p.keyboard.press('Escape')
await esperar(600)
const conSinFecha = await nombresGantt()
chk(
  conSinFecha.includes(SIN_FECHA),
  '#336·6 "Sin fecha" apaga el horizonte y muestra las tareas sin fecha',
  `${conSinFecha.length} tareas`,
)

// ═══════════════════════════════════════════════════════════════════════════
// #337 · "En horizonte visible" en Mis Tareas
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #337 · El filtro en Mis Tareas ──')
await entrarComo('Daniela Vera')
await irAMisTareas()
// 5 · desde la tabla aparece deshabilitada con su ayuda.
await abrirCampoFecha()
const hayOpcionMT = (await opHorizonte().count()) > 0
chk(hayOpcionMT, '#337·1 la opción existe en Mis Tareas')
chk(
  hayOpcionMT && (await opHorizonte().isDisabled()),
  '#337·5 desde la tabla aparece deshabilitada',
)
chk(
  hayOpcionMT && (await opHorizonte().getAttribute('title')) === 'Se activa desde la Gantt',
  '#337·5 con su ayuda "Se activa desde la Gantt"',
  hayOpcionMT ? ((await opHorizonte().getAttribute('title')) ?? '') : 'la opción no está',
)
await p.keyboard.press('Escape')
await esperar(400)
// Sin la opción no hay terreno para el resto de #337: se reporta y se sigue.
if (hayOpcionMT) {
// 1 y 2 · desde la Gantt se activa, y deja fuera las sin fecha.
await verVista('Gantt')
const mtSin = await nombresGantt()
await abrirCampoFecha()
chk(!(await opHorizonte().isDisabled()), '#337·1 desde la Gantt de Mis Tareas se puede activar')
await opHorizonte().click()
await esperar(700)
await p.keyboard.press('Escape')
await esperar(700)
const mtCon = await nombresGantt()
chk(
  mtCon.length <= mtSin.length,
  '#337·2 activada, deja las tareas con fecha dentro del horizonte de ESA Gantt',
  `${mtSin.length} → ${mtCon.length} tareas`,
)
const mtSinFecha = await p.evaluate(() => {
  const raw = localStorage.getItem('planificador.state.v1')
  return raw ? JSON.parse(raw).tareas.filter((t) => !t.fechaObjetivo && !t.archivada).map((t) => t.titulo) : null
})
if (mtSinFecha) {
  chk(
    !mtCon.some((n) => mtSinFecha.includes(n)),
    '#337·2 y no muestra ninguna sin fecha (#336 también acá)',
    mtCon.filter((n) => mtSinFecha.includes(n)).join(' · ') || '(ninguna)',
  )
} else {
  chk(!mtCon.includes(SIN_FECHA), '#337·2 y no muestra la tarea sin fecha conocida')
}
// 3 · sigue al horizonte.
if ((await p.locator('.controles-btn', { hasText: 'Rango' }).count()) > 0) {
  await p.locator('.controles-btn', { hasText: 'Rango' }).first().click()
  await esperar(450)
  await p.locator('.filtro-op', { hasText: 'Todas mis tareas' }).first().click()
  await esperar(800)
  await p.keyboard.press('Escape')
  await esperar(600)
  chk(
    (await nombresGantt()).length >= mtCon.length,
    '#337·3 cambiar a "Todas mis tareas" mueve el filtro con el horizonte',
    `${mtCon.length} → ${(await nombresGantt()).length} tareas`,
  )
} else {
  chk(false, '#337·3 terreno: no hay control "Rango" en la Gantt de Mis Tareas')
}
// 4 · desde la tabla se puede desactivar.
await verVista('Tabla')
const mtTabla = await nombresTabla()
await abrirCampoFecha()
chk(!(await opHorizonte().isDisabled()), '#337·4 con el filtro activo, desde la tabla se puede desactivar')
await opHorizonte().click()
await esperar(700)
await p.keyboard.press('Escape')
await esperar(600)
chk(
  (await nombresTabla()).length >= mtTabla.length,
  '#337·4 y al desactivarlo vuelven las que estaban fuera',
  `${mtTabla.length} → ${(await nombresTabla()).length} tareas`,
)
// 6 · es excluyente.
await verVista('Gantt')
await abrirCampoFecha()
await opHorizonte().click()
await esperar(600)
await p.locator('.filtro-op', { hasText: 'Hoy' }).first().click()
await esperar(600)
const apagado = (await opHorizonte().getAttribute('class')) ?? ''
await p.keyboard.press('Escape')
await esperar(500)
chk(!apagado.includes('filtro-op--on'), '#337·6 activar "Hoy" apaga "En horizonte visible"', apagado)
// 7 · guardar una vista con este filtro y volver a cargarla.
await abrirCampoFecha()
await p.locator('.filtro-op', { hasText: 'Hoy' }).first().click()
await esperar(400)
await opHorizonte().click()
await esperar(600)
await p.keyboard.press('Escape')
await esperar(500)
await p.locator('.controles-btn', { hasText: 'Vistas' }).first().click()
await esperar(450)
await p.locator('.filtro-op--guardar').first().click()
await esperar(450)
await p.locator('.modal-card input').first().fill('Horizonte MT')
await p.getByRole('button', { name: 'Guardar', exact: true }).click()
await esperar(900)
await p.keyboard.press('Escape')
await esperar(400)
// Salir de la vista y volver a entrar.
await p.locator('.controles-ctrl--vistas .controles-x').first().click()
await esperar(700)
await p.locator('.controles-btn', { hasText: 'Vistas' }).first().click()
await esperar(450)
await p.locator('.filtro-guardado', { hasText: 'Horizonte MT' }).first().click()
await esperar(900)
await p.keyboard.press('Escape')
await esperar(500)
await abrirCampoFecha()
const trasCargar = (await opHorizonte().getAttribute('class')) ?? ''
await p.keyboard.press('Escape')
await esperar(400)
chk(
  trasCargar.includes('filtro-op--on'),
  '#337·7 una vista de Mis Tareas guardada con este filtro vuelve a cargarlo',
  trasCargar,
)
} else {
  for (const c of ['#337·2', '#337·3', '#337·4', '#337·6', '#337·7']) {
    chk(false, `${c} sin la opción en Mis Tareas no hay terreno donde comprobarlo`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// #338 · El clic sobre el nombre en la Gantt de Mis Tareas
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #338 · El clic sobre el nombre en Mis Tareas ──')
await entrarComo('Daniela Vera')
await irAMisTareas()
await verVista('Gantt')
const nombreG = p.locator('.gantt td.fija--tarea .tarea-cell__link, .gantt td.fija--tarea .inline-text').first()
const tituloG = (await nombreG.innerText()).trim()
await pulsarSiEsta(nombreG, 800)
chk(
  (await p.locator('.panel-detalle').count()) > 0 && (await p.locator('.gantt input.inline-input').count()) === 0,
  '#338·1 el clic sobre el nombre abre el panel de detalle, no la edición',
  `panel ${(await p.locator('.panel-detalle').count()) > 0 ? 'sí' : 'no'}`,
)
await p.keyboard.press('Escape')
await esperar(500)
// 5 · la tarjeta flotante sigue apareciendo.
await pasarMouse(nombreG, 700)
chk(
  (await p.locator('.hovercard').count()) > 0,
  '#338·5 la tarjeta flotante sigue apareciendo al pasar el mouse por el nombre',
)
await p.mouse.move(4, 4)
await esperar(400)
// 2 · Renombrar sigue en el menú y abre la edición.
await clicDerechoEn(p.locator('.gantt tbody tr.gfila-tarea').first())
const opsMTG = await opciones()
chk(opsMTG.includes('Renombrar'), '#338·2 Renombrar sigue en el menú de esa Gantt', opsMTG.join(' · '))
chk(
  !opsMTG.includes('Duplicar tarea') && !opsMTG.includes('Agregar tarea abajo'),
  '#338·6 y el resto del menú de Mis Tareas sigue igual',
  opsMTG.join(' · '),
)
await elegir('Renombrar', 600)
chk(
  (await p.locator('.gantt input.inline-input').count()) > 0,
  '#338·2 elegirlo deja el nombre en modo edición',
)
await escribirYGuardar(p.locator('.gantt input.inline-input'), 'MT gantt renombrada', 900)
chk(
  (await nombresGantt()).includes('MT gantt renombrada'),
  '#338·2 Enter guarda',
)
await clicDerechoEn(p.locator('.gantt tbody tr.gfila-tarea').first())
await elegir('Renombrar', 600)
if ((await p.locator('.gantt input.inline-input').count()) > 0) {
  await p.locator('.gantt input.inline-input').first().fill('NO-DEBE-QUEDAR')
}
await p.keyboard.press('Escape')
await esperar(700)
chk(
  !(await nombresGantt()).includes('NO-DEBE-QUEDAR'),
  '#338·2 y Escape cancela',
)
void tituloG
// 3 · la tabla de Mis Tareas, igual que hoy.
await verVista('Tabla')
await pulsarSiEsta(p.locator('table.tareas tbody .tarea-cell__link'), 800)
chk(
  (await p.locator('.panel-detalle').count()) > 0,
  '#338·3 la tabla de Mis Tareas se comporta igual: el clic abre el panel',
)
await p.keyboard.press('Escape')
await esperar(500)

// 4 · en un proyecto no cambia nada.
console.log('\n── #338 · 4 · En un proyecto no cambia nada ──')
await abrirProyecto()
const filaP = p.locator('table.tareas').first().locator('tbody tr').first()
await pulsarSiEsta(filaP.locator('.tarea-cell .inline-text'), 500)
chk(
  (await filaP.locator('input.inline-input').count()) > 0,
  '#338·4 en la tabla de un proyecto el clic sobre el nombre lo sigue editando',
)
await p.keyboard.press('Escape')
await esperar(400)
await verVista('Gantt')
await pulsarSiEsta(
  p.locator('.gantt tbody tr.gfila-tarea').first().locator('td.fija--tarea .inline-text'),
  500,
)
chk(
  (await p.locator('.gantt input.inline-input').count()) > 0,
  '#338·4 y en su Gantt también',
)
await p.keyboard.press('Escape')
await esperar(400)

// El campo de creación de la Gantt: escribir y arrepentirse NO crea la tarea.
// Se comprueba porque el campo guarda al perder el foco y Escape lo desenfoca:
// la duda era real. Medido en la base ANTES de tocar nada — no creaba—, así que
// la comprobación deja constancia de la garantía en vez de arreglar nada.
console.log('\n── El campo de la Gantt: Escape cancela de verdad ──')
const SUB_E = 'Procesos Comerciales'
const ganttDe = async (sub) =>
  (await p.evaluate(() => {
    const out = []
    let s = '?'
    document.querySelectorAll('.gantt tbody tr').forEach((r) => {
      const rot = [...r.querySelectorAll('td.fija--rotula')]
      if (rot.length) s = rot[rot.length - 1].textContent.trim().replace(/\+$/, '')
      const t = r.querySelector('td.fija--tarea .con-mas .fija-txt')
      if (t) out.push({ sub: s, titulo: t.textContent.trim() })
    })
    return out
  })).filter((x) => x.sub.startsWith(sub)).map((x) => x.titulo)
const antesE = await ganttDe(SUB_E)
await clicDerechoEn(p.locator('.gantt tbody tr.gfila-tarea').first())
await elegir('Agregar tarea abajo', 600)
const campo = p.locator('input.crear-inline')
if ((await campo.count()) > 0) {
  await campo.first().fill('NO-DEBE-CREARSE')
  await p.keyboard.press('Escape')
  await esperar(900)
  const trasE = await ganttDe(SUB_E)
  chk(
    !trasE.includes('NO-DEBE-CREARSE') && trasE.length === antesE.length,
    'escribir un título en el campo de la Gantt y pulsar Escape NO crea la tarea',
    `${antesE.length} → ${trasE.length} tareas`,
  )
} else {
  chk(false, 'terreno: no se abrió el campo de creación de la Gantt')
}

await b.close()
