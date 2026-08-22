// #326 y #327 — El peso de los nombres, y los globos de la Gantt.
//
// #326 · El nombre de la tarea iba en semi negrita (600) y el título del sub
// frente que la contiene en 500 —perdió la negrita en #306, a propósito, para
// dejar de competir con el nombre del frente—, así que **el hijo pesaba más
// que su contenedor**. Queda en **500, el mismo peso que su sub frente**, en la
// tabla, en la Gantt y en Mis Tareas. Y "+ Sub Frente", que es la misma acción
// que "+ Tarea", se iguala a su peso: uno era línea normal y el otro botón
// fantasma en 600.
//   *La primera versión bajó dos escalones de una vez, de 600 a 400, y visto en
//   pantalla se fue de largo: los nombres costaban de leer. El objetivo era que
//   la tarea dejara de pesar MÁS que lo que la contiene, no que pesara menos,
//   así que la corrección los iguala. El TAMAÑO de la letra no se toca: en la
//   Gantt ya mide 12.5 contra los 13 de la tabla.*
//
// #327 · Los cuatro globos de texto corto de la Gantt colgaban de su celda con
// un `::after`, así que quedaban DENTRO del recuadro con scroll de la grilla y
// ese recuadro los recortaba. Ahora los dibuja `GloboTip` en una capa aparte,
// por encima de la página — el mismo camino que el producto ya usó dos veces
// (#213 y la tarjeta flotante de la tarea).
//
// Lo que se comprueba de #327 no es "se ve bonito" sino la propiedad que
// garantiza que no se recorte: **el globo no cuelga del recuadro con scroll,
// cuelga del `body`**, y en todos los casos queda entero dentro de la pantalla.
// Un `::after` dentro de un contenedor con `overflow` se recorta sin importar
// el z-index: por eso el arreglo es sacarlo del árbol, no subirle la capa.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-326-327-pesos-y-globos.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

// Pesos medidos en `main` antes del arreglo.
const TAREA_ANTES = 600
const SUB_ANTES = 500
// Y el que dejó la primera versión de #326, antes de la corrección: 400 se vio
// en pantalla y quedó demasiado liviano para leer los nombres de corrido.
const TAREA_PRIMERA_VERSION = 400

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
  await esperar(1100)
}
const peso = (sel) =>
  p.evaluate((s) => {
    const e = document.querySelector(s)
    return e ? Number(getComputedStyle(e).fontWeight) : null
  }, sel)

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// #326 · El nombre de la tarea pesa menos que lo que lo contiene
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #326 · 1 · En la tabla ──')
const enTabla = {
  tarea: await peso('table.tareas td.tarea-cell'),
  sub: await peso('.subfrente__titulo'),
  frente: await peso('.frente-titulo'),
}
chk(
  enTabla.tarea < 600,
  '1 el nombre de la tarea ya no se ve en negrita',
  `${TAREA_ANTES} → ${enTabla.tarea}`,
)
chk(
  // Corrección de #326: la primera versión lo bajó a 400 y se fue un escalón
  // de más. Lo que se exige es IGUALDAD, no que pese menos: el objetivo era
  // que la tarea dejara de pesar más que lo que la contiene.
  enTabla.tarea === enTabla.sub,
  '1 y se ve con el mismo peso que el título del sub frente que lo contiene',
  `tarea ${enTabla.tarea} · sub frente ${enTabla.sub}`,
)
chk(
  enTabla.sub === SUB_ANTES && enTabla.frente === 700,
  '8 el nombre del frente y el título del sub frente se ven igual que hoy',
  `frente ${enTabla.frente} · sub frente ${enTabla.sub}`,
)

// 5 · el visto y el ↻ ×N declaran su propio peso y no dependen de la celda.
console.log('\n── #326 · 5 · El visto y el ↻ ×N ──')
const propios = await p.evaluate(() => {
  const marca = document.querySelector('.tarea-cell__mark')
  const replan = document.querySelector('.replan-count')
  const w = (e) => (e ? Number(getComputedStyle(e).fontWeight) : null)
  return { marca: w(marca), replan: w(replan), hayMarca: !!marca, hayReplan: !!replan }
})
chk(propios.hayMarca && propios.marca === 700, '5 el visto verde conserva su peso propio', `${propios.marca}`)
chk(propios.hayReplan && propios.replan === 700, '5 y el ↻ ×N también', `${propios.replan}`)

// 4 · editar el nombre no cambia el grosor.
console.log('\n── #326 · 4 · Al editar el nombre ──')
const texto = p.locator('table.tareas td.tarea-cell .inline-text').first()
const fuera = await texto.evaluate((e) => Number(getComputedStyle(e).fontWeight))
await texto.click()
await esperar(400)
const dentro = await p
  .locator('table.tareas td.tarea-cell .inline-input')
  .first()
  .evaluate((e) => Number(getComputedStyle(e).fontWeight))
await p.keyboard.press('Escape')
await esperar(300)
const trasSalir = await p
  .locator('table.tareas td.tarea-cell .inline-text')
  .first()
  .evaluate((e) => Number(getComputedStyle(e).fontWeight))
chk(
  fuera === dentro && dentro === trasSalir,
  '4 el texto no cambia de grosor al entrar ni al salir de edición',
  `fuera ${fuera} · editando ${dentro} · al salir ${trasSalir}`,
)

// 6 y 7 · "+ Sub Frente" contra "+ Tarea".
console.log('\n── #326 · 6 y 7 · Los dos accesos equivalentes ──')
const accesos = await p.evaluate(() => {
  const w = (e) => (e ? Number(getComputedStyle(e).fontWeight) : null)
  return {
    linea: w(document.querySelector('.subfrente-add-linea')),
    masTarea: w(document.querySelector('.fila-add button, .fila-add .btn')),
  }
})
chk(
  accesos.linea !== null && accesos.linea === accesos.masTarea,
  '6 "+ Sub Frente" se ve con el mismo peso que "+ Tarea"',
  `línea ${accesos.linea} · botón ${accesos.masTarea}`,
)
chk(accesos.linea === 600, '6 y ese peso es el del botón fantasma', `${accesos.linea}`)

// 7 · con el frente vacío sigue siendo botón, igual que hoy.
await p.locator('.frente-cabecera .colapso-btn').first().click()
await esperar(300)
await p.locator('.frente-cabecera .colapso-btn').first().click()
await esperar(300)

// 2 · en la Gantt.
console.log('\n── #326 · 2 · En la Gantt ──')
await verVista('Gantt')
const enGantt = await peso('.gantt td.fija--tarea')
chk(
  enGantt === enTabla.tarea,
  '2 el nombre de la tarea se ve con el mismo peso que en la tabla',
  `gantt ${enGantt} · tabla ${enTabla.tarea} (antes ${TAREA_ANTES} en las dos)`,
)
chk(
  enGantt > TAREA_PRIMERA_VERSION && enGantt < TAREA_ANTES,
  '2 y queda en el escalón del medio: más marcado que la primera versión, menos que producción',
  `${TAREA_ANTES} (producción) → ${TAREA_PRIMERA_VERSION} (primera versión) → ${enGantt}`,
)
// 3 · el TAMAÑO de la letra no cambia: lo reportado es legibilidad, y en la
// Gantt la letra ya es más chica que en la tabla.
const tamGantt = await p.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('.gantt td.fija--tarea')).fontSize),
)
chk(tamGantt === 12.5, '3 y el tamaño de la letra de la Gantt no cambia', `${tamGantt}px`)

// ═══════════════════════════════════════════════════════════════════════════
// #327 · Los globos ya no se recortan
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #327 · Dónde vive el globo ──')

/** Pasa el mouse por `sel` y devuelve lo medible del globo que aparece. */
const globoDe = async (sel, ms = 500) => {
  await p.mouse.move(4, 4)
  await esperar(220)
  const loc = typeof sel === 'string' ? p.locator(sel).first() : sel
  if ((await loc.count()) === 0) return null
  await loc.hover()
  await esperar(ms)
  return p.evaluate(() => {
    const g = document.querySelector('.globo-tip')
    if (!g) return { hay: false }
    const r = g.getBoundingClientRect()
    const scroll = document.querySelector('.gantt-scroll')
    const sc = scroll.getBoundingClientRect()
    return {
      hay: true,
      texto: g.textContent,
      // LA propiedad del arreglo: no cuelga del recuadro con scroll.
      dentroDelScroll: scroll.contains(g),
      padre: g.parentElement.tagName,
      entero:
        r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      // Cuánto sube por encima del borde de arriba del recuadro (positivo =
      // el `::after` de antes habría quedado recortado ahí).
      sobreElScroll: Math.round(sc.top - r.top),
    }
  })
}
/** Marca la primera o la última fila visible que de verdad CONTENGA `dentro`.
 *  Sin esto, la fila de más arriba podía ser una que no tiene "+", o una sin
 *  ninguna celda con globo, y la comprobación fallaba por terreno y no por el
 *  producto. */
const marcarFila = (dentro, cual, marca) =>
  p.evaluate(
    ([sel, extremo, atributo]) => {
      const visibles = [...document.querySelectorAll('.gantt tbody tr')].filter((r) => {
        const x = r.getBoundingClientRect()
        const sc = document.querySelector('.gantt-scroll').getBoundingClientRect()
        const alto = document.querySelector('.gantt thead')?.getBoundingClientRect().height ?? 0
        return x.top >= sc.top + alto - 2 && x.bottom <= Math.min(sc.bottom, window.innerHeight)
      })
      const conElemento = visibles.filter((r) => {
        const e = r.querySelector(sel)
        if (!e) return false
        const x = e.getBoundingClientRect()
        return x.width > 0 && x.left >= 0 && x.right <= window.innerWidth
      })
      const f = extremo === 'primera' ? conElemento[0] : conElemento[conElemento.length - 1]
      document.querySelectorAll(`[${atributo}]`).forEach((x) => x.removeAttribute(atributo))
      if (!f) return false
      f.setAttribute(atributo, '1')
      return true
    },
    [dentro, cual, marca],
  )

/** ¿De qué lado del ancla quedó? */
const ladoRespectoDe = async (sel) =>
  p.evaluate((s) => {
    const g = document.querySelector('.globo-tip')
    const a = document.querySelector(s)
    if (!g || !a) return null
    const rg = g.getBoundingClientRect()
    const ra = a.getBoundingClientRect()
    return rg.left >= ra.right - 1 ? 'derecha' : rg.bottom <= ra.top + 1 ? 'arriba' : 'otro'
  }, sel)

// #328 quitó el ⓘ de la fila de la Gantt: hacía lo mismo que el clic sobre el
// nombre y su función pasó al menú del clic derecho. El botón de la fila que
// queda —el "+"— tiene el mismo globo y sirve igual para lo que se comprueba
// acá, que es DÓNDE vive el globo, no cuál de los dos lo dispara.
const info = await globoDe('.gantt tbody .mas-btn[data-tip="Agregar tarea abajo"]')
chk(info?.hay, '#327 terreno: el "+" de la grilla muestra su globo', info?.texto ?? 'sin globo')
chk(
  info?.padre === 'BODY' && !info.dentroDelScroll,
  '1 el globo NO cuelga del recuadro con scroll: vive en una capa aparte',
  info?.padre ? `padre <${info.padre.toLowerCase()}>` : 'no hay globo propio',
)
chk(info?.entero === true, '1 y se ve entero dentro de la pantalla', info?.rect?.join(',') ?? 'sin globo')

// 1 a 4 · con una fila pegada al borde de arriba, que es donde se recortaba.
console.log('\n── #327 · 1 a 4 · Contra el borde de arriba ──')
await p.evaluate(() => document.querySelector('.gantt-scroll').scrollBy(0, 220))
await esperar(450)
for (const [etiqueta, dentro, ms] of [
  // El criterio 1 era el globo del ⓘ; #328 lo sacó de la fila, así que el
  // primer botón con globo pasa a ser el "+", que es el criterio 2.
  ['2 el globo del "+"', '.mas-btn[data-tip="Agregar tarea abajo"]', 500],
  ['3 el de una celda de la grilla', 'td.celda[data-tip]', 600],
]) {
  const hay = await marcarFila(dentro, 'primera', 'data-primera')
  if (!hay) {
    chk(false, `${etiqueta}: terreno — no hay fila visible con ese elemento`)
    continue
  }
  const g = await globoDe(`tr[data-primera] ${dentro}`, ms)
  if (!g?.hay) {
    chk(false, `${etiqueta} aparece en la primera fila visible`)
    continue
  }
  chk(
    g.entero && !g.dentroDelScroll,
    `${etiqueta} se ve entero, sin recortarse contra el borde`,
    `${g.rect.join(',')} · sube ${g.sobreElScroll} sobre el borde del recuadro`,
  )
}

// 4 · y con la grilla desplazada hasta abajo.
console.log('\n── #327 · 4 · Con la grilla desplazada ──')
await p.evaluate(() => {
  const s = document.querySelector('.gantt-scroll')
  s.scrollTop = s.scrollHeight
})
await esperar(500)
const ultima = await marcarFila('.mas-btn[data-tip="Agregar tarea abajo"]', 'ultima', 'data-ultima')
const abajo = ultima ? await globoDe('tr[data-ultima] .mas-btn[data-tip="Agregar tarea abajo"]') : null
chk(
  abajo?.hay && abajo.entero && !abajo.dentroDelScroll,
  '4 en la última fila visible el globo también se ve entero',
  abajo?.rect?.join(',') ?? 'sin globo',
)

// 5 y 9 · frente y sub frente: enteros y hacia la derecha.
console.log('\n── #327 · 5 y 9 · Frente, sub frente y hacia dónde se abren ──')
await p.evaluate(() => (document.querySelector('.gantt-scroll').scrollTop = 0))
await esperar(400)
for (const [etiqueta, sel] of [
  ['5 el globo del frente', '.gantt .fija--frente .fija-tip'],
  ['5 el del sub frente', '.gantt .fija--sf .fija-tip'],
]) {
  const g = await globoDe(sel)
  chk(g?.hay === true && g.entero && !g.dentroDelScroll, `${etiqueta} se ve entero`, g?.texto ?? 'sin globo')
  chk((await ladoRespectoDe(sel)) === 'derecha', `9 ${etiqueta} sigue abriéndose hacia la derecha`)
}
const gBoton = await globoDe('.gantt tbody .mas-btn[data-tip="Agregar tarea abajo"]')
chk(gBoton?.hay === true, '9 terreno: el globo del "+" está visible')
chk(
  (await ladoRespectoDe('.gantt tbody .mas-btn[data-tip="Agregar tarea abajo"]')) === 'arriba',
  '9 el de los botones sigue abriéndose hacia arriba',
)

// 3 · el retardo de la celda se conserva, y los otros siguen siendo inmediatos.
console.log('\n── #327 · 3 · El retardo ──')
await p.mouse.move(4, 4)
await esperar(250)
await p.locator('.gantt tbody td.celda[data-tip]').first().hover()
await esperar(70)
const prontoCelda = await p.evaluate(() => !!document.querySelector('.globo-tip'))
await esperar(500)
const luegoCelda = await p.evaluate(() => !!document.querySelector('.globo-tip'))
chk(!prontoCelda && luegoCelda, '3 el globo de la celda conserva su retardo corto', `a los 70ms ${prontoCelda}, después ${luegoCelda}`)
await p.mouse.move(4, 4)
await esperar(250)
await p.locator('.gantt tbody .mas-btn[data-tip="Agregar tarea abajo"]').first().hover()
await esperar(70)
chk(
  await p.evaluate(() => !!document.querySelector('.globo-tip')),
  '3 y el de los botones sigue siendo inmediato',
)

// 7 · extremo derecho: se corre de lado si hace falta.
console.log('\n── #327 · 7 · Contra el borde derecho ──')
await p.mouse.move(4, 4)
await esperar(250)
await p.evaluate(() => {
  const s = document.querySelector('.gantt-scroll')
  s.scrollLeft = s.scrollWidth
})
await esperar(500)
const hayUltimaCelda = await p.evaluate(() => {
  const visible = [...document.querySelectorAll('.gantt tbody td.celda[data-tip]')].filter((c) => {
    const r = c.getBoundingClientRect()
    return r.right <= window.innerWidth && r.left >= 0 && r.top >= 0 && r.bottom <= window.innerHeight
  })
  const c = visible[visible.length - 1]
  if (!c) return false
  document.querySelectorAll('[data-derecha]').forEach((x) => x.removeAttribute('data-derecha'))
  c.setAttribute('data-derecha', '1')
  return true
})
const derecha = hayUltimaCelda ? await globoDe('td[data-derecha]', 600) : null
chk(
  derecha?.hay && derecha.entero,
  '7 contra el extremo derecho el globo se corre y se ve entero',
  derecha?.rect?.join(',') ?? 'sin globo',
)

// 10 · desaparece al salir y al desplazar.
console.log('\n── #327 · 10 · Al salir y al desplazar ──')
await p.mouse.move(4, 4)
await esperar(300)
chk(
  !(await p.evaluate(() => !!document.querySelector('.globo-tip'))),
  '10 al sacar el mouse el globo desaparece',
)
await p.locator('.gantt tbody .mas-btn[data-tip="Agregar tarea abajo"]').first().hover()
await esperar(300)
chk(await p.evaluate(() => !!document.querySelector('.globo-tip')), '10 terreno: hay un globo visible')
await p.evaluate(() => document.querySelector('.gantt-scroll').scrollBy(0, 90))
await esperar(350)
chk(
  !(await p.evaluate(() => !!document.querySelector('.globo-tip'))),
  '10 y al desplazar la grilla no queda ninguno pegado ni suelto',
)

// 11 · el nombre de la tarea sigue sin globo propio.
console.log('\n── #327 · 11 · El nombre de la tarea ──')
const nombreTarea = await p.evaluate(() => {
  const celda = document.querySelector('.gantt td.fija--tarea .fija-tip')
  return { existe: !!celda, tip: celda?.getAttribute('data-tip') ?? null }
})
chk(
  nombreTarea.existe && nombreTarea.tip === null,
  '11 el nombre de la tarea no declara globo propio',
  `data-tip=${nombreTarea.tip}`,
)
await p.mouse.move(4, 4)
await esperar(250)
await p.locator('.gantt td.fija--tarea .fija-txt').first().hover()
await esperar(400)
const alPasarPorElNombre = await p.evaluate(() => ({
  globos: document.querySelectorAll('.globo-tip').length,
  tarjetas: document.querySelectorAll('.hovercard').length,
}))
chk(
  alPasarPorElNombre.tarjetas === 1 && alPasarPorElNombre.globos === 0,
  '11 al pasar el mouse aparece la tarjeta flotante de siempre, una sola',
  `tarjetas ${alPasarPorElNombre.tarjetas} · globos ${alPasarPorElNombre.globos}`,
)

// 8 · ventana angosta.
console.log('\n── #327 · 8 · Con la ventana angosta ──')
await p.mouse.move(4, 4)
await p.setViewportSize({ width: 900, height: 600 })
await esperar(700)
for (const [etiqueta, sel, ms] of [
  ['8 el del frente', '.gantt .fija--frente .fija-tip', 500],
  ['8 el del "+"', '.gantt tbody .mas-btn[data-tip="Agregar tarea abajo"]', 500],
]) {
  const g = await globoDe(sel, ms)
  chk(g?.hay && g.entero, `${etiqueta} no queda cortado por el borde de la pantalla`, g?.rect?.join(',') ?? 'sin globo')
}
await p.setViewportSize({ width: 1440, height: 900 })
await esperar(600)

// 6 · Mis Tareas: el rótulo vertical del proyecto.
console.log('\n── #327 · 6 · El rótulo del proyecto en Mis Tareas ──')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(900)
await verVista('Gantt')
const rotulo = await globoDe('.gantt td.fija--proy[data-tip]')
chk(rotulo?.hay, '6 terreno: el rótulo del proyecto muestra su globo', rotulo?.texto ?? 'sin globo')
chk(
  rotulo?.entero === true && !rotulo.dentroDelScroll,
  '6 y se ve entero, fuera del recuadro con scroll',
  rotulo?.rect?.join(',') ?? 'sin globo',
)
chk(
  (await ladoRespectoDe('.gantt td.fija--proy[data-tip]')) === 'derecha',
  '9 y sigue abriéndose hacia la derecha',
)

// #326 · 3 · Mis Tareas, tabla y Gantt.
console.log('\n── #326 · 3 · En Mis Tareas ──')
const mtGantt = await peso('.gantt td.fija--tarea')
await verVista('Tabla')
const mtTabla = await peso('table.tareas td.tarea-cell')
chk(
  mtTabla === enTabla.tarea && mtGantt === enTabla.tarea,
  '3 en Mis Tareas, tabla y Gantt, el nombre pesa lo mismo que en el proyecto',
  `tabla ${mtTabla} · gantt ${mtGantt}`,
)

await b.close()
console.log(
  process.exitCode
    ? '\n⛔ HAY FALLAS'
    : '\n✅ #326 y #327 — el nombre de la tarea pesa lo mismo que su contenedor, y los globos ya no se recortan',
)
