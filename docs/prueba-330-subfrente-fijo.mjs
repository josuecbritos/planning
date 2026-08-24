// #330 — El título del sub frente se queda fijo mientras dura su bloque.
//
// En la tabla quedaban fijas DOS franjas al desplazar: la barra de controles
// arriba y los encabezados de columna justo debajo. **El título del sub frente
// no**: se iba hacia arriba con sus filas, así que al recorrer un bloque largo
// se dejaba de saber en qué sub frente se estaba mientras los títulos de
// columna sí seguían a la vista.
//
// Ahora las tres franjas viajan juntas y en el mismo orden en que están en la
// pantalla: barra · título del sub frente · encabezados de columna. Cuando el
// bloque termina se van juntas y las reemplazan las del sub frente siguiente,
// sin apilarse.
//
// Solo en la tabla de un proyecto. En la Gantt no hace falta —el rótulo es una
// celda combinada que se centra en la parte visible de su bloque—, en Mis
// Tareas no hay título de sub frente, y el título del FRENTE no se fija: una
// cuarta franja empezaría a comerse la pantalla.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-330-subfrente-fijo.mjs
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
  await esperar(1000)
}
const irAMisTareas = async () => {
  await p.getByText('Mis Tareas', { exact: true }).first().click()
  await esperar(1300)
}
const verVista = async (cual) => {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(1300)
}
const desplazar = async (y) => {
  await p.evaluate((v) => document.querySelector('.content')?.scrollTo(0, v), y)
  await esperar(400)
}
/**
 * Las tres franjas, medidas desde el borde de arriba del contenedor con scroll.
 * Solo se devuelven las que están dentro de la banda visible: lo que ya pasó de
 * largo no dice nada.
 */
const franjas = () =>
  p.evaluate(() => {
    const content = document.querySelector('.content')
    if (!content) return null
    const sc = content.getBoundingClientRect()
    const rel = (el) => {
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top - sc.top), bottom: Math.round(r.bottom - sc.top), alto: Math.round(r.height) }
    }
    const bar = document.querySelector('.controles-bar')
    const visible = (x) => x.bottom > 0 && x.top < sc.height
    return {
      alto: Math.round(sc.height),
      scrollTop: Math.round(content.scrollTop),
      barra: bar ? rel(bar) : null,
      vars: {
        filtros: getComputedStyle(content).getPropertyValue('--filtros-h').trim(),
        titulo: getComputedStyle(content).getPropertyValue('--sf-titulo-h').trim(),
      },
      titulos: [...document.querySelectorAll('.subfrente__titulo')]
        .map((t) => ({ ...rel(t), txt: t.textContent.trim().split('·')[0].trim() }))
        .filter(visible),
      theads: [...document.querySelectorAll('table.tareas thead th:first-child')].map(rel).filter(visible),
    }
  })
/** ¿Qué elemento pinta el punto (x, y) del contenedor con scroll? */
const quienPinta = (dx, dy) =>
  p.evaluate(
    ([x, y]) => {
      const sc = document.querySelector('.content').getBoundingClientRect()
      const el = document.elementFromPoint(sc.left + x, sc.top + y)
      if (!el) return null
      const clases = []
      for (let n = el; n && n !== document.body; n = n.parentElement) clases.push(n.className || n.tagName)
      return clases.slice(0, 4).join(' < ')
    },
    [dx, dy],
  )

await entrarComo('Daniela Vera')
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// 1 y 2 · Las tres franjas, en su orden
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1 y 2 · Las tres franjas ──')
const enReposo = await franjas()
chk(!!enReposo?.barra, 'terreno: la tabla del proyecto está a la vista', `contenedor de ${enReposo?.alto}px`)
chk(
  !!enReposo?.vars.titulo && parseFloat(enReposo.vars.titulo) > 0,
  '1 el alto del título se mide en vivo y se publica',
  `barra ${enReposo?.vars.filtros} · título ${enReposo?.vars.titulo}`,
)

// Bajar hasta la mitad de la lista del primer sub frente.
await desplazar(200)
const bajado = await franjas()
const tituloFijo = bajado?.titulos[0]
const theadFijo = bajado?.theads[0]
chk(
  !!tituloFijo && !!bajado.barra && tituloFijo.top === bajado.barra.bottom,
  '1 al bajar, el título del sub frente queda JUSTO debajo de la barra de controles',
  bajado ? `barra ${bajado.barra.top}–${bajado.barra.bottom} · título ${tituloFijo?.top}–${tituloFijo?.bottom}` : '',
)
chk(
  !!theadFijo && !!tituloFijo && theadFijo.top === tituloFijo.bottom,
  '2 y los encabezados de columna quedan JUSTO debajo del título, en ese orden',
  theadFijo ? `título ${tituloFijo.top}–${tituloFijo.bottom} · encabezados ${theadFijo.top}–${theadFijo.bottom}` : '',
)
chk(
  bajado.scrollTop > 0 && tituloFijo?.top === bajado.barra.bottom,
  '1 terreno: la lista está desplazada y aun así el título no se fue',
  `scroll ${bajado.scrollTop}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Las filas pasan por debajo, sin verse a través
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 3 · Las filas pasan por debajo ──')
const pintaTitulo = await quienPinta(300, (tituloFijo.top + tituloFijo.bottom) / 2)
const pintaThead = await quienPinta(300, (theadFijo.top + theadFijo.bottom) / 2)
chk(
  (pintaTitulo ?? '').includes('subfrente__titulo'),
  '3 en la franja del título, lo que se ve es el título y no una fila',
  pintaTitulo ?? 'nada',
)
chk(
  (pintaThead ?? '').includes('TH') || (pintaThead ?? '').includes('col-'),
  '3 y en la de los encabezados, los encabezados',
  pintaThead ?? 'nada',
)
const fondos = await p.evaluate(() => {
  const t = document.querySelector('.subfrente__titulo')
  const th = document.querySelector('table.tareas thead th')
  const op = (el) => getComputedStyle(el).backgroundColor
  return { titulo: op(t), thead: op(th) }
})
chk(
  !/rgba\(0, 0, 0, 0\)/.test(fondos.titulo) && !/rgba\(0, 0, 0, 0\)/.test(fondos.thead),
  '3 las dos franjas tienen fondo propio: nada se ve a través',
  `título ${fondos.titulo} · encabezados ${fondos.thead}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 4 y 5 · El relevo entre sub frentes
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 4 y 5 · El relevo ──')
// Se recorre la lista entera de a poco y se exige que NUNCA haya dos títulos
// pegados al tope a la vez, y que siempre haya como mucho uno fijo.
const alturaTotal = await p.evaluate(() => document.querySelector('.content').scrollHeight)
let apilados = 0
let relevos = 0
let anterior = null
let conFijoYOrden = 0
let muestras = 0
for (let y = 0; y < alturaTotal - 400; y += 90) {
  await p.evaluate((v) => document.querySelector('.content').scrollTo(0, v), y)
  await esperar(90)
  const f = await franjas()
  if (!f?.barra) continue
  muestras++
  const fijos = f.titulos.filter((t) => t.top === f.barra.bottom)
  if (fijos.length > 1) apilados++
  if (fijos.length === 1) {
    // Su thead tiene que estar pegado debajo.
    const suThead = f.theads.find((t) => t.top === fijos[0].bottom)
    if (suThead) conFijoYOrden++
    if (anterior && fijos[0].txt !== anterior) relevos++
    anterior = fijos[0].txt
  }
}
chk(apilados === 0, '4 nunca quedan dos títulos apilados al tope', `${muestras} muestras`)
chk(relevos >= 2, '4 y el título se releva al pasar de un sub frente al siguiente', `${relevos} relevos`)
chk(
  conFijoYOrden > 0 && conFijoYOrden >= muestras / 3,
  '5 cuando hay un título fijo, sus encabezados están pegados debajo',
  `${conFijoYOrden} de ${muestras} muestras`,
)
await desplazar(0)

// ═══════════════════════════════════════════════════════════════════════════
// 7 · Los botones del título funcionan mientras está fijo
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 7 · Los botones del título fijo ──')
await desplazar(300)
const fFijo = await franjas()
const tituloAhora = fFijo.titulos.find((t) => t.top === fFijo.barra.bottom)
chk(!!tituloAhora, '7 terreno: hay un título fijo', tituloAhora?.txt ?? 'ninguno')
const nombreFijo = tituloAhora?.txt
// El chevron de colapsar, estando fijo.
const chevron = p
  .locator('.subfrente__titulo', { hasText: nombreFijo })
  .first()
  .locator('.colapso-btn')
await chevron.click()
await esperar(600)
const colapsado = await p.evaluate(
  (n) =>
    [...document.querySelectorAll('.subfrente')].some(
      (s) => s.textContent.includes(n) && s.className.includes('subfrente--colapsado'),
    ),
  nombreFijo,
)
chk(colapsado, '7 el chevron de colapsar funciona con el título fijo', nombreFijo)
// 6 · un sub frente contraído se comporta igual que hoy.
const contraido = await p.evaluate(
  (n) => {
    const s = [...document.querySelectorAll('.subfrente')].find((x) => x.textContent.includes(n))
    if (!s) return null
    const t = s.querySelector('.subfrente__titulo')
    return {
      tablas: s.querySelectorAll('table.tareas').length,
      pegajoso: getComputedStyle(t).position,
      alto: Math.round(s.getBoundingClientRect().height),
    }
  },
  nombreFijo,
)
chk(
  contraido && contraido.tablas === 0,
  '6 un sub frente contraído esconde su tabla, como hoy',
  contraido ? `${contraido.tablas} tablas · bloque de ${contraido.alto}px` : 'no está',
)
await chevron.click()
await esperar(600)
chk(
  (await p.evaluate(
    (n) => [...document.querySelectorAll('.subfrente')].some((s) => s.textContent.includes(n) && s.querySelector('table.tareas')),
    nombreFijo,
  )),
  '7 y vuelve a desplegarse',
)
await desplazar(0)

// ═══════════════════════════════════════════════════════════════════════════
// 8 · Con un filtro puesto y con un orden activo
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 8 · Con filtro y con orden ──')
const compruebaTresFranjas = async (etiqueta) => {
  await desplazar(250)
  const f = await franjas()
  const t = f?.titulos.find((x) => x.top === f.barra.bottom)
  const th = t ? f.theads.find((x) => x.top === t.bottom) : null
  chk(!!t && !!th, `8 ${etiqueta}: las tres franjas siguen en orden`, t ? `título ${t.top}–${t.bottom} · encabezados ${th?.top}` : 'sin título fijo')
  await desplazar(0)
}
// Un filtro que deje varias tareas por sub frente.
await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
await esperar(450)
await p.locator('.filtro-op', { hasText: 'Estado' }).first().click()
await esperar(450)
for (const c of ['Pendiente', 'Atrasada', 'Hecha']) {
  await p.locator('.filtro-op', { hasText: c }).first().click()
  await esperar(300)
}
await p.keyboard.press('Escape')
await esperar(700)
await compruebaTresFranjas('con un filtro puesto')
await p.locator('.controles-x[aria-label="Limpiar todos los filtros"]').click()
await esperar(700)
// Un orden activo.
await p.locator('.controles-btn', { hasText: 'Ordenar' }).first().click()
await esperar(450)
await p.locator('.orden-campo').first().locator('.orden-campo__dir').first().click()
await esperar(500)
await p.keyboard.press('Escape')
await esperar(600)
await compruebaTresFranjas('con un orden activo')
await p.locator('.controles-x[aria-label="Limpiar el orden"]').click()
await esperar(700)

// ═══════════════════════════════════════════════════════════════════════════
// El título del FRENTE no se fija — y no hay una cuarta franja
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── El frente no se fija ──')
await desplazar(600)
const frenteFijo = await p.evaluate(() => {
  const h = document.querySelector('.frente-bloque h2, .frente-bloque__titulo, .frente-titulo')
  return h ? getComputedStyle(h).position : 'no hay título de frente propio'
})
chk(
  frenteFijo !== 'sticky',
  'el título del frente NO se fija: la cuarta franja se descartó a propósito',
  frenteFijo,
)
await desplazar(0)

// ═══════════════════════════════════════════════════════════════════════════
// 9 y 10 · Mis Tareas y la Gantt no cambian
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 9 y 10 · Mis Tareas y la Gantt ──')
await verVista('Gantt')
const enGantt = await p.evaluate(() => {
  const content = document.querySelector('.content')
  return {
    titulos: document.querySelectorAll('.subfrente__titulo').length,
    sfVar: content ? getComputedStyle(content).getPropertyValue('--sf-titulo-h').trim() : null,
    rotulas: document.querySelectorAll('.gantt td.fija--rotula').length,
  }
})
chk(
  enGantt.titulos === 0 && !enGantt.sfVar,
  '10 en la Gantt no hay título de sub frente y la variable queda suelta',
  `títulos ${enGantt.titulos} · --sf-titulo-h "${enGantt.sfVar}"`,
)
chk(enGantt.rotulas > 0, '10 y sus rótulas de celda combinada siguen ahí', `${enGantt.rotulas}`)
await irAMisTareas()
const enMisTareas = await p.evaluate(() => {
  const th = document.querySelector('table.tareas thead th')
  const content = document.querySelector('.content')
  return {
    titulos: document.querySelectorAll('.subfrente__titulo').length,
    theadTop: th ? getComputedStyle(th).top : null,
    barra: document.querySelector('.controles-bar')?.offsetHeight ?? null,
  }
})
chk(enMisTareas.titulos === 0, '9 en Mis Tareas no hay título de sub frente')
chk(
  enMisTareas.theadTop !== null && parseFloat(enMisTareas.theadTop) === enMisTareas.barra,
  '9 y sus encabezados se congelan justo debajo de la barra, como siempre',
  `top ${enMisTareas.theadTop} · barra ${enMisTareas.barra}px`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 11 · En mobile la tabla se sigue viendo y desplazando
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 11 · En mobile ──')
// Se entra al proyecto en escritorio y DESPUÉS se achica: en mobile la barra
// lateral vive detrás del botón de menú y navegar hasta acá sería otra prueba.
await abrirProyecto()
await p.setViewportSize({ width: 420, height: 780 })
await esperar(800)
const movil = await p.evaluate(() => {
  const content = document.querySelector('.content')
  const t = document.querySelector('.subfrente__titulo')
  return {
    filas: document.querySelectorAll('table.tareas tbody tr').length,
    desplazable: content ? content.scrollHeight > content.clientHeight : false,
    posicionTitulo: t ? getComputedStyle(t).position : null,
  }
})
chk(
  movil.filas > 0 && movil.desplazable,
  '11 en mobile la tabla se sigue viendo y desplazando',
  `${movil.filas} filas · desplazable ${movil.desplazable}`,
)
await p.evaluate(() => document.querySelector('.content').scrollTo(0, 400))
await esperar(500)
const movilTrasScroll = await p.evaluate(() => {
  const content = document.querySelector('.content')
  const sc = content.getBoundingClientRect()
  const bar = document.querySelector('.controles-bar')?.getBoundingClientRect()
  const t = [...document.querySelectorAll('.subfrente__titulo')]
    .map((x) => x.getBoundingClientRect())
    .find((r) => r.bottom > sc.top && r.top < sc.top + 200)
  return {
    scrollTop: Math.round(content.scrollTop),
    tituloTop: t ? Math.round(t.top - sc.top) : null,
    barraBottom: bar ? Math.round(bar.bottom - sc.top) : null,
  }
})
chk(
  movilTrasScroll.scrollTop > 0,
  '11 y el desplazamiento funciona',
  `scroll ${movilTrasScroll.scrollTop} · título en ${movilTrasScroll.tituloTop} · barra hasta ${movilTrasScroll.barraBottom}`,
)
await p.setViewportSize({ width: 1440, height: 900 })

await b.close()
