// #306 — La tabla: jerarquía y espacio muerto, y el "+" de la Gantt.
//
// Dos problemas que se resuelven juntos, porque el aire que se recupera es el
// mismo que pasa a marcar los grupos:
//
//   1. El frente no se leía como el contenedor de sus sub frentes. El frente
//      era texto de 15 en negrita SIN fondo; el sub frente, texto de 13.5 en
//      la MISMA negrita, con fondo y con borde. El hijo tenía más presencia
//      que el padre.
//   2. Con los sub frentes cerrados la pantalla era casi todo aire: 26 de
//      margen entre sub frentes contra una barra de 33 de alto, más unos 60
//      por frente para la fila de "+ Sub Frente".
//
// Y, en la Gantt, el "+" compartía la línea con el nombre y ocupaba su lugar
// aunque estuviera invisible (18 de ancho más 6 de separación), así que el
// nombre estaba corrido 12 a la izquierda SIEMPRE.
//
// Medido contra `main` antes del arreglo, con los cinco sub frentes cerrados:
// el contenido de la tabla medía **600** de alto; ahora mide **452**. Y la
// franja gris de los controles medía **24 en la tabla contra 16 en la Gantt**;
// ahora las dos miden 16.
//
// Control negativo: corrida contra `main`, **12 comprobaciones fallan** y
// después la prueba se detiene, porque el elemento que reemplaza a la fila de
// "+ Sub Frente" todavía no existe. Entre las que fallan: el frente y el sub
// frente tenían el MISMO peso (15px/700 contra 13.5px/700), no había cuenta de
// sub frentes al lado del nombre, y el alto con todo plegado era 600.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-306-jerarquia-tabla.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

// Alto del contenido de la tabla con TODO plegado, medido en `main` antes de
// este pedido. La comprobación exige quedar claramente por debajo.
const ALTO_ANTES = 600

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)

async function irAlResumen() {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(400)
}
async function abrirProyecto(nombre = 'Plan PGP Arauco') {
  await irAlResumen()
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await esperar(900)
}
async function verVista(cual) {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(900)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 a 4 · Jerarquía y espacio
// ═══════════════════════════════════════════════════════════════════════════
await abrirProyecto()

// ── 2 y 3 · El peso del frente, y qué dice al lado ─────────────────────────
console.log('\n── 2 y 3 · El frente pesa más que sus hijos ──')
const pesos = await p.evaluate(() => {
  const fr = document.querySelector('.frente-titulo')
  const sf = document.querySelector('.subfrente__titulo')
  const cs = (e) => {
    const s = getComputedStyle(e)
    return { px: parseFloat(s.fontSize), peso: Number(s.fontWeight) }
  }
  return {
    frente: cs(fr),
    sub: cs(sf),
    cuenta: fr.querySelector('.frente-titulo__count')?.textContent.trim() ?? null,
    subsReales: document.querySelectorAll('.frente-bloque:first-of-type .subfrente').length,
  }
})
chk(
  pesos.frente.px > pesos.sub.px && pesos.frente.peso > pesos.sub.peso,
  '2 el título del frente es más grande Y más pesado que el de sus sub frentes',
  `frente ${pesos.frente.px}px/${pesos.frente.peso} · sub ${pesos.sub.px}px/${pesos.sub.peso}`,
)
chk(pesos.sub.peso < 700, '2 el sub frente perdió la negrita', `peso=${pesos.sub.peso}`)
chk(
  !!pesos.cuenta && /sub frentes?$/.test(pesos.cuenta),
  '3 al lado del frente dice cuántos SUB FRENTES tiene',
  pesos.cuenta ?? 'sin cuenta',
)
chk(!/tarea/i.test(pesos.cuenta ?? ''), '3 y no la cuenta de tareas')
chk(
  Number((pesos.cuenta ?? '').match(/^\d+/)?.[0]) === pesos.subsReales,
  '3 y el número cuadra con los sub frentes que se ven',
  `dice ${pesos.cuenta}, hay ${pesos.subsReales}`,
)

// ── 1 y 4 · Los grupos se leen, y cabe más en la pantalla ──────────────────
console.log('\n── 1 y 4 · El aire se reordena ──')
// Se pliegan todos los sub frentes: ese es el estado en que uno abre la
// pantalla para orientarse, y el que estaba lleno de aire.
const chevs = p.locator('.subfrente__titulo .colapso-btn')
const nSubs = await chevs.count()
for (let i = 0; i < nSubs; i++) {
  await chevs.nth(i).click()
  await esperar(150)
}
await esperar(400)

const aire = await p.evaluate(() => {
  const bloques = [...document.querySelectorAll('.frente-bloque')]
  const hermanos = []
  for (const bl of bloques) {
    const subs = [...bl.querySelectorAll('.subfrente')]
    for (let i = 1; i < subs.length; i++) {
      hermanos.push(
        Math.round(subs[i].getBoundingClientRect().top - subs[i - 1].getBoundingClientRect().bottom),
      )
    }
  }
  const entreFrentes = []
  for (let i = 1; i < bloques.length; i++) {
    entreFrentes.push(
      Math.round(bloques[i].getBoundingClientRect().top - bloques[i - 1].getBoundingClientRect().bottom),
    )
  }
  return {
    hermanos,
    entreFrentes,
    alto: Math.round(document.querySelector('.tabla-wrap').getBoundingClientRect().height),
  }
})
chk(
  aire.hermanos.length > 0 && aire.hermanos.every((d) => d <= 12),
  '1 entre sub frentes del mismo frente hay poco aire: se leen como un grupo',
  `${aire.hermanos.join(', ')} (antes 26)`,
)
chk(
  aire.entreFrentes.length > 0 && aire.entreFrentes.every((d) => d >= 24),
  '1 y la separación grande queda solo entre un frente y el siguiente',
  aire.entreFrentes.join(', '),
)
chk(
  Math.min(...aire.entreFrentes) > Math.max(...aire.hermanos) * 2,
  '1 el contraste entre las dos distancias es lo que comunica la pertenencia',
  `${Math.max(...aire.hermanos)} dentro contra ${Math.min(...aire.entreFrentes)} entre frentes`,
)
chk(
  aire.alto < ALTO_ANTES * 0.85,
  '4 con los sub frentes cerrados cabe bastante más en la misma pantalla',
  `${aire.alto} contra ${ALTO_ANTES} de antes`,
)

// ── 9 · Plegar y desplegar sigue funcionando ───────────────────────────────
console.log('\n── 9 y 10 · Plegar, desplegar y eliminar ──')
chk(
  (await p.locator('.subfrente__titulo--colapsado').count()) === nSubs,
  '9 los sub frentes quedaron plegados',
)
await chevs.first().click()
await esperar(400)
chk(
  (await p.locator('.subfrente__titulo--colapsado').count()) === nSubs - 1,
  '9 y se despliegan tocando el mismo control',
)
// Un frente plegado: la separación con el siguiente se sigue leyendo.
await p.locator('.frente-cabecera .colapso-btn').first().click()
await esperar(400)
const conFrentePlegado = await p.evaluate(() => {
  const bl = [...document.querySelectorAll('.frente-bloque')]
  if (bl.length < 2) return null
  return Math.round(bl[1].getBoundingClientRect().top - bl[0].getBoundingClientRect().bottom)
})
chk(
  conFrentePlegado !== null && conFrentePlegado >= 24,
  '9 con un frente plegado, la separación con el siguiente se sigue leyendo',
  `${conFrentePlegado}px`,
)
await p.locator('.frente-cabecera .colapso-btn').first().click()
await esperar(400)

// ── 10 · Eliminar un sub frente ────────────────────────────────────────────
const antesDeEliminar = await p.locator('.subfrente').count()
const papelera = p.locator('.subfrente__tools .icon-btn').last()
if (await papelera.count()) {
  await papelera.click()
  await esperar(900)
  chk(
    (await p.locator('.subfrente').count()) === antesDeEliminar - 1,
    '10 eliminar un sub frente sigue funcionando',
    `${antesDeEliminar} → ${await p.locator('.subfrente').count()}`,
  )
} else {
  chk(false, '10 no se encontró el control de eliminar del sub frente')
}

// ── 5 · "+ Sub Frente" como línea cuando el frente ya tiene sub frentes ────
console.log('\n── 5 · "+ Sub Frente" con el frente poblado ──')
const linea = await p.evaluate(() => {
  const e = document.querySelector('.frente-bloque .subfrente-add-linea')
  if (!e) return null
  const s = getComputedStyle(e)
  const cuerpo = getComputedStyle(document.body)
  return {
    texto: e.textContent.trim(),
    px: parseFloat(s.fontSize),
    gris: s.color !== cuerpo.color,
    esBoton: e.classList.contains('btn'),
    alto: Math.round(e.getBoundingClientRect().height),
  }
})
chk(!!linea, '5 con sub frentes, "+ Sub Frente" existe al final de la lista')
chk(!!linea && !linea.esBoton, '5 y NO es un botón')
chk(!!linea && linea.px <= 13 && linea.gris, '5 es una línea de texto chica y gris', `${linea?.px}px`)
chk(!!linea && linea.alto <= 26, '5 y ya no pesa como un elemento de la lista', `${linea?.alto}px de alto (antes ~60 con su aire)`)
// Y al tocarla se puede crear.
const antesDeCrear = await p.locator('.subfrente').count()
await p.locator('.frente-bloque .subfrente-add-linea').first().click()
await esperar(400)
await p.locator('.subfrente--nuevo input').fill('Sub frente desde la línea')
await p.keyboard.press('Enter')
await esperar(900)
await p.keyboard.press('Escape')
await esperar(500)
chk(
  (await p.locator('.subfrente').count()) > antesDeCrear,
  '5 y al tocarla se puede crear',
  `${antesDeCrear} → ${await p.locator('.subfrente').count()}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 6, 7 y 8 · El frente vacío y el proyecto sin frentes
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 6 a 8 · El frente vacío ──')
await p.locator('button[title="Nuevo proyecto"]').click()
await esperar(400)
await p.locator('form .campo input').first().fill('P306')
await p.locator('form button[type="submit"]').first().click()
await esperar(900)

// 8 · la pantalla de "aún no tiene frentes" sigue funcionando.
chk((await p.locator('.vacio-frentes').count()) === 1, '8 el proyecto nuevo muestra su pantalla de "aún no tiene frentes"')
await p.locator('.vacio-frentes button').first().click()
await esperar(300)
await p.locator('.vacio-frentes__form input').fill('Frente sin sub frentes')
await p.keyboard.press('Enter')
await esperar(1000)

// 6 · frente recién creado, sin sub frentes.
const vacio = await p.evaluate(() => {
  const boton = document.querySelector('.subfrente-add')
  const aviso = [...document.querySelectorAll('.vacio-inline')].map((e) => e.textContent.trim())
  return {
    hayBoton: !!boton && boton.classList.contains('btn'),
    hayLinea: !!document.querySelector('.subfrente-add-linea'),
    aviso: aviso.find((t) => /sin sub frentes/i.test(t)) ?? null,
    cuenta: document.querySelector('.frente-titulo__count')?.textContent.trim() ?? null,
  }
})
chk(vacio.hayBoton && !vacio.hayLinea, '6 un frente sin sub frentes: "+ Sub Frente" es un BOTÓN')
chk(!!vacio.aviso, '6 y la línea "Sin sub frentes en este frente" sigue apareciendo', vacio.aviso ?? '')
chk(vacio.cuenta === '0 sub frentes', '6 la cuenta del frente dice 0', vacio.cuenta ?? '')

// 7 · al crear el primero, el botón pasa a ser la línea.
await p.locator('.subfrente-add').first().click()
await esperar(300)
await p.locator('.subfrente--nuevo input').fill('Primero')
await p.keyboard.press('Enter')
await esperar(900)
await p.keyboard.press('Escape')
await esperar(600)
const trasCrear = await p.evaluate(() => ({
  hayBoton: !!document.querySelector('.subfrente-add'),
  hayLinea: !!document.querySelector('.subfrente-add-linea'),
  aviso: [...document.querySelectorAll('.vacio-inline')].some((e) => /sin sub frentes/i.test(e.textContent)),
  cuenta: document.querySelector('.frente-titulo__count')?.textContent.trim() ?? null,
}))
chk(!trasCrear.hayBoton && trasCrear.hayLinea, '7 al aparecer el primer sub frente, el botón pasa a ser la línea')
chk(!trasCrear.aviso, '7 y el aviso de "sin sub frentes" desaparece')
chk(trasCrear.cuenta === '1 sub frente', '7 y la cuenta pasa a 1, en singular', trasCrear.cuenta ?? '')

// ═══════════════════════════════════════════════════════════════════════════
// 11 · La franja gris mide lo mismo en tabla y en Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 11 · La franja gris de los controles ──')
await abrirProyecto()
const franja = () =>
  p.evaluate(() => {
    const barra = document.querySelector('.controles-bar').getBoundingClientRect()
    const primero = document.querySelector('.tabla-wrap .frente-bloque, .gantt-scroll').getBoundingClientRect()
    return Math.round(primero.top - barra.bottom)
  })
const franjaTabla = await franja()
await verVista('Gantt')
const franjaGantt = await franja()
chk(
  franjaTabla === franjaGantt,
  '11 la franja gris mide lo mismo en tabla y en Gantt',
  `tabla=${franjaTabla} gantt=${franjaGantt} (antes 24 contra 16)`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 12 a 15 · El "+" de la Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 12 a 15 · El "+" sale del flujo ──')
const medirCelda = (sel) =>
  p.evaluate((s) => {
    const td = document.querySelector(s)
    if (!td) return null
    const caja = td.querySelector('.fija-nombre').getBoundingClientRect()
    const txt = td.querySelector('.fija-txt')
    const t = txt.getBoundingClientRect()
    const mas = td.querySelector('.mas-btn')
    const m = mas ? mas.getBoundingClientRect() : null
    return {
      // ¿El bloque de texto está centrado en su celda? Se compara el aire de
      // los dos lados dentro del envoltorio.
      izq: Math.round(t.left - caja.left),
      der: Math.round(caja.right - t.right),
      textoIzq: Math.round(t.left),
      textoDer: Math.round(t.right),
      // El "+" fuera del flujo: no aporta ancho a la línea.
      masEnFlujo: mas ? getComputedStyle(mas).position !== 'absolute' : null,
      masIzq: m ? Math.round(m.left) : null,
      masDer: m ? Math.round(m.right) : null,
      mascara: getComputedStyle(txt).maskImage,
      alineado: getComputedStyle(td).textAlign,
    }
  }, sel)

for (const [sel, etiqueta] of [
  ['.gantt td.fija--frente.fija--rotula', 'frente'],
  ['.gantt td.fija--sf.fija--rotula', 'sub frente'],
]) {
  const sinMouse = await medirCelda(sel)
  chk(!!sinMouse, `12 la celda de ${etiqueta} está`)
  if (!sinMouse) continue
  chk(
    sinMouse.masEnFlujo === false,
    `13 el "+" de ${etiqueta} está fuera del flujo: no ocupa lugar en la línea`,
  )
  chk(
    Math.abs(sinMouse.izq - sinMouse.der) <= 1,
    `12 el nombre de ${etiqueta} queda centrado en su columna sin el mouse encima`,
    `izq=${sinMouse.izq} der=${sinMouse.der}`,
  )
  chk(sinMouse.alineado === 'center', `12 y su texto va centrado`, sinMouse.alineado)

  // Con el mouse encima: el nombre NO se mueve y el "+" queda a su derecha.
  await p.locator(`${sel} .fija-tip`).first().hover()
  await esperar(200)
  const conMouse = await medirCelda(sel)
  chk(
    conMouse.textoIzq === sinMouse.textoIzq && conMouse.textoDer === sinMouse.textoDer,
    `13 al pasar el mouse, el nombre de ${etiqueta} no se mueve`,
    `${sinMouse.textoIzq}-${sinMouse.textoDer} → ${conMouse.textoIzq}-${conMouse.textoDer}`,
  )
  chk(
    conMouse.masDer !== null && conMouse.masIzq >= conMouse.textoDer - 26,
    `13 y el "+" aparece a la derecha del nombre`,
    `texto acaba en ${conMouse.textoDer}, "+" en ${conMouse.masIzq}-${conMouse.masDer}`,
  )
  chk(
    conMouse.mascara !== 'none',
    `14 con el "+" a la vista, el texto se desvanece bajo él en vez de cortarse`,
    conMouse.mascara,
  )
  chk(
    sinMouse.mascara === 'none',
    `14 y sin el mouse encima no hay desvanecido: la regla se aplica sola donde hace falta`,
    sinMouse.mascara,
  )
  // 14: el globo sigue mostrando el nombre completo.
  const globo = await p.evaluate((s) => {
    const tip = document.querySelector(`${s} .fija-tip`)
    return { tip: tip.getAttribute('data-tip'), contenido: getComputedStyle(tip, '::after').content }
  }, sel)
  chk(
    !!globo.tip && globo.contenido.includes(globo.tip),
    `14 el globo de ${etiqueta} sigue mostrando el nombre completo`,
    globo.contenido,
  )
}

// ── 15 · El "+" sigue haciendo lo mismo ────────────────────────────────────
const antesFrentes = await p.evaluate(
  () => JSON.parse(localStorage.getItem('planificador.state.v1')).frentes.length,
)
await p.locator('.gantt td.fija--frente.fija--rotula .mas-btn').first().click()
await esperar(500)
chk(
  (await p.locator('.gantt .fija--input input').count()) > 0,
  '15 el "+" del frente sigue abriendo la fila de creación en la grilla',
)
await p.locator('.gantt .fija--input input').first().fill('Frente desde el más')
await p.keyboard.press('Enter')
await esperar(900)
await p.keyboard.press('Escape')
await esperar(500)
const despuesFrentes = await p.evaluate(
  () => JSON.parse(localStorage.getItem('planificador.state.v1')).frentes.length,
)
chk(despuesFrentes === antesFrentes + 1, '15 y sigue creando lo que creaba', `${antesFrentes} → ${despuesFrentes}`)

// ── 16 · Lo de #305 y #321 sigue en pie ────────────────────────────────────
console.log('\n── 16 · Lo verificado en #305 y #321 ──')
const intacto = await p.evaluate(() => {
  const contenido = document.querySelector('.content')
  const scroll = document.querySelector('.gantt-scroll')
  const anchos = {}
  for (const k of ['frente', 'sf', 'tarea', 'resp']) {
    const e = document.querySelector('.gantt td.fija--' + k)
    if (e) anchos[k] = Math.round(e.getBoundingClientRect().width)
  }
  return {
    pantallaDesplaza: Math.max(0, contenido.scrollHeight - contenido.clientHeight),
    huecoAbajo: Math.round(window.innerHeight - scroll.getBoundingClientRect().bottom),
    contadores: document.querySelectorAll('.counters--gantt .counter').length,
    controles: [...document.querySelectorAll('.controles-bar .controles-btn')].map((e) =>
      e.innerText.split('\n')[0].trim(),
    ),
    anchos,
  }
})
chk(intacto.pantallaDesplaza === 0 && intacto.huecoAbajo <= 24, '16 la Gantt sigue ocupando lo que sobra, sin scroll de pantalla')
chk(intacto.contadores === 6, '16 los contadores siguen haciendo de leyenda en Gantt')
chk(intacto.controles.join(' · ') === 'Filtrar · Ordenar · Rango · Vistas', '16 la barra sigue con sus cuatro controles', intacto.controles.join(' · '))
chk(
  intacto.anchos.frente === 120 && intacto.anchos.sf === 150 && intacto.anchos.tarea === 240 && intacto.anchos.resp === 60,
  '16 las columnas fijas siguen midiendo lo mismo',
  JSON.stringify(intacto.anchos),
)

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #306 — la tabla se lee por grupos y el "+" de la Gantt salió del flujo')
