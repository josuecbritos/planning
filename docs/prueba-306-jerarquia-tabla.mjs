// #306, #306b y #306c — La tabla: jerarquía y espacio muerto, el "+" de la
// Gantt, y un solo valor para todo lo que separa bloques.
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
// Los criterios de #306b —los ajustes tras la primera revisión— van con
// prefijo B. Medido entre las dos versiones: el aire entre los contadores y
// los botones pasó de 26 a 13, la separación entre frentes de 28 a 20, y el
// alto con todo plegado de 452 a 432. Y el "+" de la Gantt dejó de estar
// siempre en el borde: ahora se pega al nombre, y solo se apoya en el borde
// cuando el nombre no deja sitio.
//
// Los de #306c van al final, con prefijo C. Ahí los cuatro espaciados que
// estaban fijados cada uno por su cuenta pasan a salir de un valor único de
// 16, y lo que se comprueba son las IGUALDADES —arriba contra abajo de la
// barra, el primer frente contra uno cualquiera, el título plegado contra sus
// dos líneas—, no los números: un valor se puede cambiar, que calcen entre sí
// es la propiedad. Medido: la barra pasó de 12 arriba y 24 abajo a 16 y 16, y
// el alto con todo plegado de 432 a 412.
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
// Y el que dejó la primera versión de #306, antes de los ajustes de #306b.
const ALTO_306 = 452

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
  // #306b bajó esta distancia de 28 a 20 y #306c la fijó en 16, el valor único
  // de bloque: lo que se exige es que siga siendo la separación GRANDE, no un
  // número concreto.
  aire.entreFrentes.length > 0 && aire.entreFrentes.every((d) => d >= 16),
  '1 y la separación grande queda solo entre un frente y el siguiente',
  aire.entreFrentes.join(', '),
)
chk(
  // `>=` y no `>`: con el valor único de #306c la separación entre frentes es
  // EXACTAMENTE el doble del aire de adentro (16 contra 8). Doblar es la
  // propiedad que se pide; pasarse no aporta nada.
  Math.min(...aire.entreFrentes) >= Math.max(...aire.hermanos) * 2,
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
  // #306c la fijó en `--aire-bloque` (16). Se exige que la separación siga
  // existiendo, no un número concreto: el frente plegado dejó de poner además
  // su propio margen abajo, que era lo que dejaba el título a 28 de una línea
  // y a 8 de la otra.
  conFrentePlegado !== null && conFrentePlegado >= 16,
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
  // #327 sacó el globo de la celda: ya no es un `::after` del disparador sino
  // un elemento propio en una capa aparte, fuera del recuadro con scroll que
  // lo recortaba. Se actualiza dónde se lo busca; lo que se exige es lo mismo
  // de antes, que muestre el nombre completo.
  const globo = await p.evaluate((s) => {
    const tip = document.querySelector(`${s} .fija-tip`)
    const g = document.querySelector('.globo-tip')
    return { tip: tip.getAttribute('data-tip'), contenido: g?.textContent ?? 'sin globo' }
  }, sel)
  chk(
    !!globo.tip && globo.contenido === globo.tip,
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

// ═══════════════════════════════════════════════════════════════════════════
// #306b — Ajustes tras la primera revisión
// ═══════════════════════════════════════════════════════════════════════════

// ── B1 y B2 · El aire entre el encabezado y la barra ───────────────────────
console.log('\n── B1 y B2 · El aire sobre la barra de controles ──')
await abrirProyecto()
const aireSobreLaBarra = () =>
  p.evaluate(() => {
    const contadores = document.querySelector('.counters').getBoundingClientRect()
    const boton = document.querySelector('.controles-bar .controles-btn').getBoundingClientRect()
    return Math.round(boton.top - contadores.bottom)
  })
const aireTabla = await aireSobreLaBarra()
await verVista('Gantt')
const aireGantt = await aireSobreLaBarra()
chk(
  // #306b lo bajó de 26 a 13 y #306c lo volvió a subir a 16 (17 contando la
  // línea del encabezado), a propósito: 13 arriba contra 24 abajo dejaba la
  // barra descolgada. Lo que se exige acá es que siga siendo claramente menor
  // que los 26 del principio; que ARRIBA Y ABAJO midan lo mismo lo comprueba
  // C1, que es el criterio real.
  aireTabla <= 20,
  'B1 el aire entre los contadores y los botones es claramente menor que antes',
  `${aireTabla} (antes 26)`,
)
chk(aireTabla === aireGantt, 'B1 y es el mismo en tabla y en Gantt', `tabla=${aireTabla} gantt=${aireGantt}`)

// B2 · la barra sigue pegándose arriba, con fondo opaco.
await verVista('Tabla')
const pegajosa = await p.evaluate(() => {
  const barra = document.querySelector('.controles-bar')
  const s = getComputedStyle(barra)
  const contenido = document.querySelector('.content')
  contenido.scrollTop = 300
  return {
    posicion: s.position,
    // Sin fondo opaco, las filas se verían pasar por debajo.
    fondoTransparente: s.backgroundColor === 'transparent' || s.backgroundColor.endsWith(', 0)'),
    relleno: s.paddingTop,
  }
})
await esperar(400)
const trasDesplazar = await p.evaluate(() => {
  const barra = document.querySelector('.controles-bar').getBoundingClientRect()
  const contenido = document.querySelector('.content').getBoundingClientRect()
  return { desfase: Math.round(barra.top - contenido.top), desplazado: document.querySelector('.content').scrollTop }
})
chk(pegajosa.posicion === 'sticky', 'B2 la barra sigue siendo pegajosa', pegajosa.posicion)
chk(!pegajosa.fondoTransparente, 'B2 y conserva su fondo opaco, que tapa lo que pasa por debajo')
chk(
  trasDesplazar.desplazado > 0 && Math.abs(trasDesplazar.desfase) <= 1,
  'B2 al desplazar queda pegada arriba',
  `scroll=${trasDesplazar.desplazado} desfase=${trasDesplazar.desfase}`,
)
await p.evaluate(() => (document.querySelector('.content').scrollTop = 0))
await esperar(300)

// ── B3 a B5 · La línea cierra el grupo, y la separación baja ───────────────
console.log('\n── B3 a B5 · La línea de "+ Sub Frente" cierra su grupo ──')
const chevs2 = p.locator('.subfrente__titulo .colapso-btn')
const n2 = await chevs2.count()
for (let i = 0; i < n2; i++) {
  await chevs2.nth(i).click()
  await esperar(140)
}
await esperar(400)
const grupos = await p.evaluate(() => {
  const bl = [...document.querySelectorAll('.frente-bloque')]
  const medidas = []
  for (let i = 0; i < bl.length; i++) {
    const linea = bl[i].querySelector('.subfrente-add-linea')
    const subs = [...bl[i].querySelectorAll('.subfrente')]
    if (!linea || !subs.length) continue
    const ultimo = subs[subs.length - 1].getBoundingClientRect()
    const lr = linea.getBoundingClientRect()
    const siguiente = bl[i + 1]?.getBoundingClientRect() ?? null
    medidas.push({
      alUltimoSub: Math.round(lr.top - ultimo.bottom),
      alSiguienteFrente: siguiente ? Math.round(siguiente.top - lr.bottom) : null,
    })
  }
  const entreBloques = []
  for (let i = 1; i < bl.length; i++) {
    entreBloques.push(Math.round(bl[i].getBoundingClientRect().top - bl[i - 1].getBoundingClientRect().bottom))
  }
  return { medidas, entreBloques, alto: Math.round(document.querySelector('.tabla-wrap').getBoundingClientRect().height) }
})
chk(
  grupos.medidas.length > 0 && grupos.medidas.every((m) => m.alUltimoSub <= 6),
  'B3 la línea de "+ Sub Frente" queda pegada al último sub frente de su grupo',
  grupos.medidas.map((m) => m.alUltimoSub).join(', '),
)
const conSiguiente = grupos.medidas.filter((m) => m.alSiguienteFrente !== null)
chk(
  conSiguiente.length > 0 && conSiguiente.every((m) => m.alSiguienteFrente >= m.alUltimoSub * 3),
  'B3 y está mucho más cerca del sub frente de arriba que del frente de abajo: no flota entre dos',
  conSiguiente.map((m) => `${m.alUltimoSub} arriba contra ${m.alSiguienteFrente} abajo`).join(' · '),
)
chk(
  grupos.entreBloques.every((d) => d < 28),
  'B4 la separación entre frentes bajó',
  `${grupos.entreBloques.join(', ')} (antes 28)`,
)
// Y los grupos se siguen distinguiendo: el contraste con el aire de adentro
// tiene que seguir siendo grande. Es la propiedad que #306 vino a conseguir y
// la reserva que el pedido declaró.
const dentro = await p.evaluate(() => {
  const bl = [...document.querySelectorAll('.frente-bloque')]
  const d = []
  for (const b of bl) {
    const subs = [...b.querySelectorAll('.subfrente')]
    for (let i = 1; i < subs.length; i++) {
      d.push(Math.round(subs[i].getBoundingClientRect().top - subs[i - 1].getBoundingClientRect().bottom))
    }
  }
  return d
})
chk(
  Math.min(...grupos.entreBloques) >= Math.max(...dentro) * 2,
  'B4 y los grupos se siguen distinguiendo: la separación entre frentes sigue doblando a la de adentro',
  `${Math.max(...dentro)} dentro contra ${Math.min(...grupos.entreBloques)} entre frentes`,
)
// Se compara contra `aire.alto`, medido MÁS ARRIBA sobre el proyecto intacto:
// a esta altura de la prueba ya se creó y se eliminó estructura, así que el
// alto de acá no es comparable con la referencia.
chk(
  aire.alto < ALTO_306,
  'B5 caben más sub frentes en la misma pantalla que en la primera versión',
  `${aire.alto} contra ${ALTO_306} de #306 (y ${ALTO_ANTES} antes de todo)`,
)

// ── B6 a B8 · El "+" de la Gantt, pegado al nombre ─────────────────────────
console.log('\n── B6 a B8 · El "+" se pega al nombre ──')
await verVista('Gantt')
/** Para cada celda de rótula: dónde acaba el TEXTO y dónde empieza el "+". */
const celdas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('td.fija--rotula')]
      .map((td) => {
        const txt = td.querySelector('.fija-txt')
        const btn = td.querySelector('.mas-btn')
        if (!txt || !btn) return null
        // El ancho de la CAJA no es el del texto: con dos palabras que
        // envuelven, las líneas son mucho más cortas. Un `Range` da un
        // rectángulo por línea.
        const r = document.createRange()
        r.selectNodeContents(txt)
        const lineas = [...r.getClientRects()]
        const c = td.getBoundingClientRect()
        const caja = txt.getBoundingClientRect()
        const b = btn.getBoundingClientRect()
        return {
          nombre: txt.innerText.replace(/\s+/g, ' ').trim(),
          textoDer: Math.round(Math.max(...lineas.map((x) => x.right)) - c.left),
          masIzq: Math.round(b.left - c.left),
          masDer: Math.round(b.right - c.left),
          ancho: Math.round(c.width),
          cajaIzq: Math.round(caja.left - c.left),
          cajaDer: Math.round(c.right - caja.right),
        }
      })
      .filter(Boolean),
  )
const antesDelMouse = await celdas()
await p.locator('td.fija--rotula .fija-tip').first().hover()
await esperar(250)
const conMouse = await celdas()

chk(antesDelMouse.length > 0, 'B6 terreno: hay celdas de frente y sub frente con "+"')
const pegados = conMouse.filter((c) => c.masIzq - c.textoDer >= 0 && c.masIzq - c.textoDer <= 8)
chk(
  pegados.length > 0,
  'B6 en los nombres que dejan sitio, el "+" queda pegado a su derecha',
  pegados.map((c) => `"${c.nombre}" +${c.masIzq - c.textoDer}`).join(' · ') || 'ninguno',
)
const apoyados = conMouse.filter((c) => c.masIzq - c.textoDer < 0)
chk(
  apoyados.every((c) => c.ancho - c.masDer <= 10),
  'B7 y en los que no dejan sitio, se apoya contra el borde derecho de la columna',
  apoyados.map((c) => `"${c.nombre}" a ${c.ancho - c.masDer} del borde`).join(' · ') || 'ninguno',
)
chk(
  apoyados.length > 0,
  'B7 terreno: hay al menos un nombre que no deja sitio',
  apoyados.map((c) => c.nombre).join(' · '),
)
chk(
  await p.evaluate(
    () => getComputedStyle(document.querySelector('td.fija--rotula:hover .fija-txt') ?? document.body).maskImage !== 'none',
  ),
  'B7 y el texto se sigue desvaneciendo bajo él',
)
// B8 · el nombre sigue centrado y no se mueve.
chk(
  conMouse.every((c) => Math.abs(c.cajaIzq - c.cajaDer) <= 1),
  'B8 el nombre sigue centrado en su columna',
  conMouse.map((c) => `${c.cajaIzq}/${c.cajaDer}`).join(' '),
)
chk(
  conMouse.every((c, i) => c.textoDer === antesDelMouse[i].textoDer),
  'B8 y no se mueve al pasar el mouse',
)

// ── B9 · Lo de #306 sigue en pie ───────────────────────────────────────────
console.log('\n── B9 · Lo verificado en #306 ──')
await verVista('Tabla')
const siguePie = await p.evaluate(() => {
  const fr = document.querySelector('.frente-titulo')
  const sf = document.querySelector('.subfrente__titulo')
  const px = (e) => parseFloat(getComputedStyle(e).fontSize)
  const peso = (e) => Number(getComputedStyle(e).fontWeight)
  return {
    masGrande: px(fr) > px(sf) && peso(fr) > peso(sf),
    cuenta: fr.querySelector('.frente-titulo__count')?.textContent.trim() ?? null,
  }
})
chk(siguePie.masGrande, 'B9 el frente sigue pesando más que sus sub frentes')
chk(!!siguePie.cuenta && /sub frentes?$/.test(siguePie.cuenta), 'B9 y sigue diciendo cuántos tiene', siguePie.cuenta ?? '')

// ═══════════════════════════════════════════════════════════════════════════
// #306c — Un solo valor para todo lo que separa bloques
// ═══════════════════════════════════════════════════════════════════════════
//
// Cuatro espaciados, cada uno fijado por su cuenta y ninguno calzando con
// otro: 12 arriba de la barra de botones, 24 abajo, 28 del título de un frente
// a la línea de arriba y 8 a la de abajo. Por eso ajustar uno descuadraba
// otro. Ahora los cuatro salen del mismo `--aire-bloque`.
//
// Lo que se comprueba NO son los números sino las igualdades: que arriba y
// abajo de la barra midan lo mismo, que el primer frente se separe de los
// botones igual que un frente del anterior, y que el título plegado quede a la
// misma distancia de sus dos líneas. Un solo valor se puede cambiar; que
// calcen entre sí es la propiedad.

// ── C1 y C2 · La barra queda centrada, y lo mismo en las dos vistas ────────
console.log('\n── C1 y C2 · La barra de botones, centrada ──')
await abrirProyecto()
const alrededorDeLaBarra = () =>
  p.evaluate(() => {
    const r = (e) => e.getBoundingClientRect()
    const contadores = r(document.querySelector('.counters'))
    const boton = r(document.querySelector('.controles-bar .controles-btn'))
    const envoltorio = document.querySelector('.tabla-wrap, .gantt-wrap')
    return {
      arriba: Math.round(boton.top - contadores.bottom),
      abajo: Math.round(r(envoltorio.firstElementChild).top - boton.bottom),
    }
  })
const barraTabla = await alrededorDeLaBarra()
await verVista('Gantt')
const barraGantt = await alrededorDeLaBarra()
await verVista('Tabla')
// El de arriba cruza la línea del encabezado, que suma 1: se admite esa
// diferencia y nada más.
chk(
  Math.abs(barraTabla.arriba - barraTabla.abajo) <= 1,
  'C1 la barra de botones queda centrada: mide lo mismo arriba que abajo',
  `${barraTabla.arriba} arriba contra ${barraTabla.abajo} abajo (antes 12 contra 24)`,
)
chk(
  barraTabla.arriba === barraGantt.arriba && barraTabla.abajo === barraGantt.abajo,
  'C2 y es igual en tabla y en Gantt',
  `tabla ${barraTabla.arriba}/${barraTabla.abajo} · gantt ${barraGantt.arriba}/${barraGantt.abajo}`,
)

// ── C3 · El aire de abajo es de la barra, no del contenedor ────────────────
// Es lo que hace que la franja pegajosa lo incluya y tape con su fondo opaco
// lo que pasa por debajo. Si lo pusiera el contenedor, el hueco sería
// transparente y las filas se verían pasar por ahí.
console.log('\n── C3 · La franja pegajosa incluye su aire ──')
const franjaPegajosa = await p.evaluate(async () => {
  const contenido = document.querySelector('.content')
  contenido.scrollTop = 300
  await new Promise((r) => requestAnimationFrame(r))
  const barra = document.querySelector('.controles-bar')
  const rb = barra.getBoundingClientRect()
  const s = getComputedStyle(barra)
  const envoltorio = getComputedStyle(document.querySelector('.tabla-wrap'))
  return {
    desplazado: contenido.scrollTop,
    desfase: Math.round(rb.top - contenido.getBoundingClientRect().top),
    rellenoAbajo: Math.round(parseFloat(s.paddingBottom)),
    rellenoDelEnvoltorio: Math.round(parseFloat(envoltorio.paddingTop)),
    // Justo sobre el borde de abajo del aire tiene que estar la barra, no una
    // fila pasando por debajo.
    justoAbajo: document.elementFromPoint(rb.left + 40, rb.bottom - 2)?.closest('.controles-bar') !== null,
  }
})
chk(
  franjaPegajosa.desplazado > 0 && Math.abs(franjaPegajosa.desfase) <= 1,
  'C3 al desplazar la barra sigue pegada arriba',
  `scroll=${franjaPegajosa.desplazado} desfase=${franjaPegajosa.desfase}`,
)
chk(
  franjaPegajosa.rellenoAbajo > 0 && franjaPegajosa.rellenoDelEnvoltorio === 0,
  'C3 y el aire de abajo lo pone la barra como relleno, no el contenedor',
  `barra=${franjaPegajosa.rellenoAbajo} envoltorio=${franjaPegajosa.rellenoDelEnvoltorio}`,
)
chk(franjaPegajosa.justoAbajo, 'C3 y ese aire tapa lo que pasa por debajo: es franja, no hueco')
await p.evaluate(() => (document.querySelector('.content').scrollTop = 0))
await esperar(300)

// ── C4 y C5 · El título plegado, centrado entre sus dos líneas ─────────────
console.log('\n── C4 y C5 · El frente plegado ──')
const chevsFrente = p.locator('.frente-cabecera .colapso-btn')
const nFrentes = await chevsFrente.count()
for (let i = 0; i < nFrentes; i++) {
  await chevsFrente.nth(i).click()
  await esperar(140)
}
await esperar(400)
const franjas = await p.evaluate(() => {
  const r = (e) => e.getBoundingClientRect()
  const cabs = [...document.querySelectorAll('.frente-cabecera--colapsado')]
  const boton = r(document.querySelector('.controles-bar .controles-btn'))
  return cabs.map((c, i) => {
    const t = c.querySelector('.frente-titulo')
    // Para el primero, "lo que viene antes" es la barra de botones; para el
    // resto, la línea del frente anterior. El pedido pide que se vean IGUAL.
    const arriba = i === 0 ? boton.bottom : r(cabs[i - 1]).bottom
    return {
      nombre: t.firstChild.textContent.trim(),
      deArriba: Math.round(r(t).top - arriba),
      aSuLinea: Math.round(r(c).bottom - r(t).bottom),
      primero: i === 0,
    }
  })
})
chk(franjas.length >= 2, 'C4 terreno: hay al menos dos frentes plegados', `${franjas.length}`)
chk(
  franjas.every((f) => Math.abs(f.deArriba - f.aSuLinea) <= 1),
  'C4 el título del frente plegado queda centrado entre su línea de arriba y la de abajo',
  franjas.map((f) => `${f.nombre} ${f.deArriba}/${f.aSuLinea}`).join(' · '),
)
const primero = franjas.find((f) => f.primero)
const resto = franjas.filter((f) => !f.primero)
chk(
  resto.length > 0 && resto.every((f) => f.deArriba === primero.deArriba),
  'C5 y el primer frente se separa de los botones igual que un frente del anterior',
  `primero ${primero.deArriba} · resto ${resto.map((f) => f.deArriba).join(', ')}`,
)

// ── C6 y C7 · Los grupos se siguen leyendo, y el 8 de adentro no se toca ───
console.log('\n── C6 y C7 · La agrupación no se pierde ──')
for (let i = 0; i < nFrentes; i++) {
  await chevsFrente.nth(i).click()
  await esperar(140)
}
await esperar(400)
const contraste = await p.evaluate(() => {
  const r = (e) => e.getBoundingClientRect()
  const bl = [...document.querySelectorAll('.frente-bloque')]
  const dentro = []
  for (const b of bl) {
    const subs = [...b.querySelectorAll('.subfrente')]
    for (let i = 1; i < subs.length; i++) dentro.push(Math.round(r(subs[i]).top - r(subs[i - 1]).bottom))
  }
  const entre = []
  for (let i = 1; i < bl.length; i++) entre.push(Math.round(r(bl[i]).top - r(bl[i - 1]).bottom))
  const linea = bl[0].querySelector('.subfrente-add-linea')
  const subs0 = [...bl[0].querySelectorAll('.subfrente')]
  return {
    dentro,
    entre,
    lineaAlUltimoSub: linea && subs0.length ? Math.round(r(linea).top - r(subs0.at(-1)).bottom) : null,
  }
})
chk(
  contraste.dentro.length > 0 && contraste.dentro.every((d) => d === 8),
  'C7 los sub frentes de un mismo frente siguen separados por 8, sin cambios',
  contraste.dentro.join(', '),
)
chk(
  contraste.entre.length > 0 && Math.min(...contraste.entre) >= Math.max(...contraste.dentro) * 2,
  'C6 y la separación entre frentes sigue doblando a la de adentro: los grupos se leen',
  `${Math.max(...contraste.dentro)} dentro contra ${Math.min(...contraste.entre)} entre frentes`,
)
chk(
  contraste.lineaAlUltimoSub !== null && contraste.lineaAlUltimoSub <= 6,
  'C8 la línea de "+ Sub Frente" sigue pegada al último sub frente, como en #306b',
  `${contraste.lineaAlUltimoSub}`,
)

// ── C9 · Un solo valor, y de ahí salen los cuatro espaciados ───────────────
// Si mañana hay que ajustar el espaciado, tiene que ser UNA decisión. Esta
// comprobación es la que se rompe si alguien vuelve a fijar un número suelto.
console.log('\n── C9 · Los cuatro espaciados salen del mismo valor ──')
const regla = await p.evaluate(() => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--aire-bloque').trim()
  const n = parseFloat(v)
  const s = getComputedStyle(document.querySelector('.controles-bar'))
  const cab = document.querySelector('.frente-cabecera')
  const bloque = document.querySelectorAll('.frente-bloque')[1]
  return {
    valor: n,
    barraArriba: Math.round(parseFloat(s.paddingTop)) * 2,
    barraAbajo: Math.round(parseFloat(s.paddingBottom)),
    entreBloques: Math.round(parseFloat(getComputedStyle(bloque).marginTop)),
    // La franja del frente plegado: hay que plegarlo para leerla, así que se
    // mide sobre la regla, no sobre el elemento.
    tieneCabecera: !!cab,
  }
})
chk(regla.valor === 16, 'C9 hay un valor único de aire de bloque', `--aire-bloque: ${regla.valor}`)
chk(
  regla.barraArriba === regla.valor && regla.barraAbajo === regla.valor,
  'C9 y de él salen el aire de arriba y el de abajo de la barra',
  `arriba ${regla.barraArriba} (dos mitades) · abajo ${regla.barraAbajo}`,
)
chk(
  regla.entreBloques === regla.valor,
  'C9 y también la separación entre un frente y el siguiente',
  `${regla.entreBloques}`,
)

// ── C10 · Lo de #306 y #306b sigue en pie ──────────────────────────────────
console.log('\n── C10 · Lo verificado en #306 y #306b ──')
const cierre = await p.evaluate(() => {
  const fr = document.querySelector('.frente-titulo')
  const sf = document.querySelector('.subfrente__titulo')
  const px = (e) => parseFloat(getComputedStyle(e).fontSize)
  const peso = (e) => Number(getComputedStyle(e).fontWeight)
  return {
    masGrande: px(fr) > px(sf) && peso(fr) > peso(sf),
    cuenta: fr.querySelector('.frente-titulo__count')?.textContent.trim() ?? null,
    hayLinea: !!document.querySelector('.subfrente-add-linea'),
  }
})
chk(cierre.masGrande, 'C10 el frente sigue pesando más que sus sub frentes')
chk(!!cierre.cuenta && /sub frentes?$/.test(cierre.cuenta), 'C10 y sigue diciendo cuántos tiene', cierre.cuenta ?? '')
chk(cierre.hayLinea, 'C10 y "+ Sub Frente" sigue siendo línea con el frente poblado')

await b.close()
console.log(
  process.exitCode
    ? '\n⛔ HAY FALLAS'
    : '\n✅ #306, #306b y #306c — la tabla se lee por grupos, el "+" se pega al nombre y los espaciados calzan',
)
