// #343, #345, #344 y #347 — cuatro arreglos de interfaz que se verifican
// mirando la pantalla.
//
// #343 — El título congelado del sub frente tenía las dos muescas del redondeo
//   superior TRANSPARENTES, así que las filas que pasaban por detrás asomaban
//   por ahí. Medido en `main`: el pixel (1,1) de la esquina daba 240,228,247
//   con una fila morada detrás, 255,246,224 con una ámbar y 253,236,234 con una
//   roja, contra los 236,236,238 del propio título. Ahora las dos muescas
//   llevan el mismo fondo que hay detrás cuando el título NO está congelado, de
//   modo que los dos se ven idénticos.
//
// #345 — La franja de la semana mostraba el rango completo aunque de esa semana
//   se viera un solo día, y ese texto imponía el ancho de la columna: medido en
//   `main`, un día mide 30, pero con un rango fijo de dos días la columna pasaba
//   a 52 y con uno solo a 97. Ahora, cuando el rango completo no cabe en el
//   ancho de sus días visibles, esa franja muestra solo el mes de su primer día
//   visible; se decide semana por semana.
//
// #344 — El calendario dibujaba solo los días del mes visible: huecos vacíos al
//   principio, corte al final y un alto que cambiaba entre meses de cinco y seis
//   filas. Ahora son siempre seis semanas de corrida desde el lunes de la semana
//   del día 1, con los días del mes vecino en gris más claro y elegibles.
//
// #347 — Segunda línea de atajo en el filtro de Estado, "Seleccionar todos
//   menos Hecha" (#347b: así se llama y va ARRIBA de "Seleccionar todos"),
//   que marca las cuatro categorías que no son "hecha". No es una sexta
//   categoría: escribe los mismos cuatro estados que se marcarían a mano.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-343-344-345-347.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
/** Ni verde ni rojo: la comprobación NO se pudo ejercer hoy, y se dice por qué.
 *  Aprobar por silencio sería peor que no comprobar. */
const skip = (m, motivo) => console.log(`SKIP  ${m} — ${motivo}`)

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
  await esperar(1100)
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
  await esperar(300)
}
/** Tolerante: devuelve false en vez de reventar, para que el control negativo
 *  informe TODO lo que rompe y no solo lo primero. */
const pulsarSiEsta = async (loc, ms = 350) => {
  try {
    await loc.first().click({ timeout: 2500 })
    await esperar(ms)
    return true
  } catch {
    return false
  }
}

// ── #343 · las esquinas del título congelado ───────────────────────────────
//
// Se leen PIXELES de una captura: es lo único que responde la pregunta del
// pedido, que es qué se ve. `--fondo` es #f4f4f5 = 244,244,245.
const FONDO = [244, 244, 245]
/**
 * Un título CONGELADO es el que está pegado justo bajo la barra de controles y
 * ya se despegó del techo de su propio bloque. Sin las dos condiciones se cuela
 * un título que ya se fue de la pantalla (su bloque quedó arriba) y la medición
 * termina leyendo pixeles de la barra superior.
 */
const congelado = (el) => {
  const c = document.querySelector('.content')
  const alto = parseFloat(getComputedStyle(c).getPropertyValue('--filtros-h')) || 0
  const r = el.getBoundingClientRect()
  const sf = el.closest('.subfrente').getBoundingClientRect()
  return sf.top < r.top - 1.5 && Math.abs(r.top - (c.getBoundingClientRect().top + alto)) <= 1.5
}
const leerEsquinas = async (soloPrimero = false) => {
  await p.evaluate(`window.congelado = ${congelado.toString()}`)
  const caja = await p.evaluate((solo) => {
    const titulos = [...document.querySelectorAll('.subfrente__titulo')]
    const t = solo ? titulos[0] : titulos.find(congelado)
    if (!t) return null
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: 24, height: 10 }
  }, soloPrimero)
  if (!caja) return null
  const buf = await p.screenshot({ clip: caja })
  return p.evaluate(async (b64) => {
    const img = new Image()
    await new Promise((res) => {
      img.onload = res
      img.src = 'data:image/png;base64,' + b64
    })
    const cv = document.createElement('canvas')
    cv.width = img.width
    cv.height = img.height
    const g = cv.getContext('2d')
    g.drawImage(img, 0, 0)
    const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3)
    // Los puntos de la muesca superior izquierda (la derecha se mide igual,
    // espejada) más dos de control DENTRO del título.
    return {
      muesca: [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [0, 2],
        [1, 2],
      ].map(([x, y]) => at(x, y)),
      dentro: [at(4, 4), at(12, 5)],
    }
  }, buf.toString('base64'))
}
/** Cuánto se aparta del fondo el pixel más desviado, y cuánto tiñe: un color
 *  asomando desvía los tres canales de forma DESPAREJA (rosa, ámbar, morado),
 *  y eso es lo que se ve. */
const desvio = (muesca) => {
  let max = 0
  let tinte = 0
  for (const px of muesca) {
    for (let i = 0; i < 3; i++) max = Math.max(max, Math.abs(px[i] - FONDO[i]))
    tinte = Math.max(tinte, Math.max(...px) - Math.min(...px))
  }
  return { max, tinte }
}

await entrarComo('Daniela Vera')
await abrirProyecto()

const colores = await p.evaluate(() => {
  const o = {}
  document.querySelectorAll('tr.fila-tarea').forEach((tr) => {
    const c = [...tr.classList].find((k) => k.startsWith('fila--'))
    if (c) o[c] = (o[c] || 0) + 1
  })
  return o
})
chk(
  (colores['fila--rojo'] ?? 0) > 0 && (colores['fila--morado'] ?? 0) > 0 && (colores['fila--ambar'] ?? 0) > 0,
  '#343 · el proyecto tiene filas roja, ámbar y morada para que algo pueda asomar',
  JSON.stringify(colores),
)

// Referencia: el título que todavía no llegó al tope. El tinte de su muesca es
// lo que el congelado tiene que igualar.
await desplazar(0)
const refe = await leerEsquinas(true)
chk(!!refe, '#343 · se puede leer la esquina de un título SIN congelar (la referencia)')
const dRef = refe ? desvio(refe.muesca) : null
chk(
  !!dRef && dRef.tinte <= 3,
  '#343 · sin congelar, por la muesca no asoma ningún color',
  dRef ? `desvío ${dRef.max}, tinte ${dRef.tinte}` : '',
)

let peor = { max: 0, tinte: 0, y: null }
let medidas = 0
for (let y = 540; y <= 1040; y += 20) {
  await desplazar(y)
  const r = await leerEsquinas()
  if (!r) continue
  medidas++
  const d = desvio(r.muesca)
  if (d.tinte > peor.tinte) peor = { ...d, y }
  // El título tiene que seguir siendo el título: su relleno no se toca.
  const dentroOk = r.dentro.every((px) => Math.abs(px[0] - 236) <= 4 && Math.abs(px[2] - 238) <= 4)
  if (!dentroOk) chk(false, `#343 · a scroll ${y} el relleno del título dejó de ser el suyo`, JSON.stringify(r.dentro))
}
chk(medidas >= 15, '#343 · se recorrió el bloque con el título congelado', `${medidas} posiciones medidas`)
chk(
  peor.tinte <= 3 && peor.max <= 3,
  '#343 · por las esquinas del título congelado no asoma nada, pase por detrás lo que pase',
  `peor caso: scroll ${peor.y}, desvío ${peor.max}, tinte ${peor.tinte}`,
)
// Criterio 2 del pedido, dicho tal cual: el congelado se ve IGUAL que el que
// todavía no llegó al tope. Se compara contra la referencia medida, no contra
// un número elegido.
chk(
  !!dRef && peor.tinte <= dRef.tinte + 2,
  '#343 · el título congelado se ve igual que uno que todavía no llega al tope',
  dRef ? `tinte congelado ${peor.tinte} vs referencia ${dRef.tinte}` : '',
)

const igual = await p.evaluate(() => {
  const t = document.querySelector('.subfrente__titulo')
  const c = document.querySelector('.content')
  const cs = getComputedStyle(t)
  return {
    alto: Math.round(t.getBoundingClientRect().height),
    radio: cs.borderRadius,
    fondo: cs.backgroundColor,
    borde: cs.borderTopColor,
    sf: getComputedStyle(c).getPropertyValue('--sf-titulo-h').trim(),
  }
})
chk(
  igual.radio === '8px 8px 0px 0px',
  '#343 · el redondeo del título es el mismo de siempre',
  igual.radio,
)
chk(igual.alto === 45 && igual.sf === '45px', '#343 · el alto de la franja del título no cambió', `${igual.alto} / ${igual.sf}`)

// El orden de las tres franjas fijas (#330) sigue siendo el mismo.
// 600 y no 700: a 700 el título de este bloque ya está siendo empujado hacia
// arriba por el final de su propio sub frente y el siguiente aún no llegó a la
// línea, así que en ese punto no hay ninguno congelado que mirar.
await desplazar(600)
const orden = await p.evaluate(() => {
  const c = document.querySelector('.content')
  const sc = c.getBoundingClientRect()
  const bar = document.querySelector('.controles-bar').getBoundingClientRect()
  const el = [...document.querySelectorAll('.subfrente__titulo')].find(window.congelado)
  if (!el) return null
  const tit = el.getBoundingClientRect()
  const th = [...el.closest('.subfrente').querySelectorAll('table.tareas thead th')]
    .map((x) => x.getBoundingClientRect())
    .sort((a, b) => a.top - b.top)[0]
  return th
    ? { bar: Math.round(bar.bottom - sc.top), tit: Math.round(tit.top - sc.top), th: Math.round(th.top - sc.top) }
    : null
})
chk(
  !!orden && Math.abs(orden.tit - orden.bar) <= 1 && orden.th >= orden.tit + 40,
  '#343 · las tres franjas siguen en el mismo orden: barra · título · encabezados',
  JSON.stringify(orden),
)

// ── #345 · la franja de la semana no deforma el ancho ──────────────────────
const medirGantt = () =>
  p.evaluate(() => {
    const dias = [...document.querySelectorAll('.gantt th.dia')].map((t) => Math.round(t.getBoundingClientRect().width))
    const sem = [...document.querySelectorAll('.gantt th.semana-lbl')].map((t) => ({
      txt: (t.querySelector('.semana-lbl__txt') ?? t).textContent.trim(),
      cols: t.colSpan,
      alto: Math.round(t.getBoundingClientRect().height),
    }))
    return { n: dias.length, anchos: [...new Set(dias)], sem }
  })
const abrirCampoFiltro = async (campo) => {
  await pulsarSiEsta(p.locator('.controles-bar').getByText('Filtrar', { exact: true }), 250)
  return pulsarSiEsta(p.locator('.filtro-menu').getByText(campo, { exact: true }), 250)
}
const ponerRango = async (desde, hasta) => {
  if (!(await abrirCampoFiltro('Fecha'))) return false
  try {
    await p.locator('.filtro-menu input[aria-label="Filtro desde"]').fill(desde)
    await esperar(250)
    await p.locator('.filtro-menu input[aria-label="Filtro hasta"]').fill(hasta)
    await esperar(500)
  } catch {
    return false
  }
  await p.keyboard.press('Escape')
  await esperar(500)
  return true
}
const limpiarFiltros = () => pulsarSiEsta(p.locator('.controles-x[aria-label="Limpiar todos los filtros"]'), 600)

await desplazar(0)
await verVista('Gantt')
const base = await medirGantt()
chk(
  base.anchos.length === 1 && base.anchos[0] === 30,
  '#345 · sin filtro de fecha, la columna de un día mide 30 (la referencia)',
  JSON.stringify(base.anchos),
)
const altoFranja = base.sem[0]?.alto
chk(
  base.sem.length > 0 && base.sem.every((s) => /–/.test(s.txt)),
  '#345 · sin filtro, cada semana muestra su rango completo',
  base.sem.map((s) => s.txt).join(' | '),
)

await ponerRango('2024-10-30', '2024-10-31')
const dos = await medirGantt()
chk(
  dos.n === 2 && dos.anchos.length === 1 && dos.anchos[0] === 30,
  '#345 · con un rango fijo de dos días las columnas siguen midiendo 30',
  `n=${dos.n} anchos=${JSON.stringify(dos.anchos)}`,
)
chk(
  dos.sem.length === 1 && dos.sem[0].txt === 'oct',
  '#345 · esa semana muestra solo el mes de su primer día visible',
  dos.sem.map((s) => s.txt).join(' | '),
)
chk(dos.sem[0]?.alto === altoFranja, '#345 · la franja no cambió de alto', `${dos.sem[0]?.alto} vs ${altoFranja}`)

await ponerRango('2024-10-30', '2024-11-04')
const cruce = await medirGantt()
chk(
  cruce.anchos.length === 1 && cruce.anchos[0] === 30,
  '#345 · con un rango que cruza dos meses las columnas siguen midiendo 30',
  JSON.stringify(cruce.anchos),
)
chk(
  cruce.sem.length === 2 && cruce.sem[0].txt === 'oct' && cruce.sem[1].txt === 'nov',
  '#345 · cada semana parcial muestra el mes de SU primer día visible',
  cruce.sem.map((s) => `${s.txt}(${s.cols})`).join(' | '),
)
chk(
  cruce.sem.every((s) => s.alto === altoFranja),
  '#345 · las dos franjas conservan el alto',
  cruce.sem.map((s) => s.alto).join('/'),
)

await ponerRango('2024-10-14', '2024-10-25')
const enteras = await medirGantt()
chk(
  enteras.sem.length === 2 && enteras.sem.every((s) => /–/.test(s.txt)) && enteras.anchos[0] === 30,
  '#345 · con semanas enteras la franja vuelve a mostrar el rango completo',
  enteras.sem.map((s) => s.txt).join(' | '),
)

// Semana por semana, no para toda la Gantt: una completa y otra de un día.
await ponerRango('2024-10-21', '2024-10-28')
const mezcla = await medirGantt()
chk(
  mezcla.sem.length === 2 && /–/.test(mezcla.sem[0].txt) && mezcla.sem[1].txt === 'oct' && mezcla.anchos[0] === 30,
  '#345 · se decide semana por semana: la completa conserva el rango, la parcial muestra el mes',
  mezcla.sem.map((s) => `${s.txt}(${s.cols})`).join(' | '),
)

// El horizonte (#250) sigue igual: impuesto con filtro, elegible sin filtro.
// "Rango" es un control propio de la barra, no un campo dentro de "Filtrar".
const abrirRango = () => pulsarSiEsta(p.locator('.controles-bar .controles-btn', { hasText: 'Rango' }), 350)
await abrirRango()
const conFiltro = await p.locator('.filtro-menu__nota', { hasText: 'Horizonte definido por el filtro de fecha' }).count()
await p.keyboard.press('Escape')
await esperar(300)
chk(conFiltro === 1, '#345 · con filtro de fecha el horizonte lo sigue definiendo el filtro (#250)')
await limpiarFiltros()
await abrirRango()
const sinFiltro = await p.evaluate(() =>
  [...document.querySelectorAll('.filtro-menu .filtro-op')]
    .filter((x) => /Alrededor de hoy|Todo el proyecto/.test(x.textContent))
    .map((x) => ({ t: x.textContent.trim(), off: x.disabled })),
)
await p.keyboard.press('Escape')
await esperar(300)
chk(
  sinFiltro.length === 2 && sinFiltro.every((x) => !x.off),
  '#345 · sin filtro de fecha se puede volver a elegir el horizonte',
  JSON.stringify(sinFiltro),
)

// ── #344 · el calendario ───────────────────────────────────────────────────
await verVista('Tabla')
await desplazar(0)
const estadoCal = () =>
  p.evaluate(() => {
    const cal = document.querySelector('.fecha-cal')
    if (!cal) return null
    const dias = [...cal.querySelectorAll('.fecha-cal__dia')]
    const r = cal.getBoundingClientRect()
    const col = (d) => {
      const cs = getComputedStyle(d)
      return `${cs.color}|${cs.opacity}`
    }
    const fuera = dias.filter((d) => d.classList.contains('fecha-cal__dia--fuera'))
    const dentro = dias.filter((d) => !d.classList.contains('fecha-cal__dia--fuera'))
    return {
      mes: cal.querySelector('.fecha-cal__mes').textContent.trim(),
      n: dias.length,
      // Casillas de relleno vacías: lo que había antes al principio del mes.
      huecos: [...cal.querySelectorAll('.fecha-cal__grilla > span')].filter((s) => !s.classList.contains('fecha-cal__dow')).length,
      fuera: fuera.length,
      primera: dias[0]?.dataset.fecha,
      ultima: dias[dias.length - 1]?.dataset.fecha,
      hoy: dias.filter((d) => d.classList.contains('fecha-cal__dia--hoy')).map((d) => d.dataset.fecha),
      hoyEsVecino: dias.some(
        (d) => d.classList.contains('fecha-cal__dia--hoy') && d.classList.contains('fecha-cal__dia--fuera'),
      ),
      alto: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      colFuera: fuera[0] ? col(fuera[0]) : null,
      colDentro: dentro[0] ? col(dentro[0]) : null,
    }
  })
const esLunes = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay() === 1

await pulsarSiEsta(p.locator('.fecha-btn').first(), 450)
const cal0 = await estadoCal()
chk(!!cal0, '#344 · el calendario se abre desde la fecha de una tarea')
chk(
  !!cal0 && cal0.n === 42 && cal0.huecos === 0,
  '#344 · seis filas de días de corrida, sin casillas vacías',
  cal0 ? `${cal0.n} días, ${cal0.huecos} huecos` : '',
)
chk(!!cal0 && esLunes(cal0.primera), '#344 · empieza en el lunes de la semana del día 1', cal0?.primera)
chk(
  !!cal0 && cal0.fuera >= 5 && cal0.colFuera !== cal0.colDentro,
  '#344 · los días del mes vecino se distinguen a simple vista',
  cal0 ? `${cal0.fuera} vecinos · ${cal0.colFuera} vs ${cal0.colDentro}` : '',
)

const altos = new Set()
const meses = []
for (let i = 0; i < 13; i++) {
  const s = await estadoCal()
  if (s) {
    altos.add(s.alto)
    meses.push(`${s.mes}:${s.n}`)
  }
  await pulsarSiEsta(p.locator('.fecha-cal__nav[aria-label="Mes siguiente"]'), 180)
}
chk(
  altos.size === 1 && meses.length === 13 && meses.every((m) => m.endsWith(':42')),
  '#344 · el calendario no cambia de alto en ningún mes del año',
  `altos ${[...altos].join('/')} · ${meses.join(' ')}`,
)

// Navegar no asigna ni cierra; "Hoy" solo lleva al mes actual (#262, #285).
const fechaDeLaFila = () =>
  p.evaluate(() => document.querySelector('tr.fila-tarea .fecha-btn')?.textContent.trim() ?? null)
const antesDeNavegar = await fechaDeLaFila()
const trasNavegar = await estadoCal()
chk(!!trasNavegar, '#344 · navegar de mes no cierra el calendario')
chk(
  (await fechaDeLaFila()) === antesDeNavegar,
  '#344 · navegar de mes no asigna ninguna fecha (#262)',
  `${antesDeNavegar} → ${await fechaDeLaFila()}`,
)
await pulsarSiEsta(p.locator('.fecha-cal__ir-hoy'), 300)
const trasHoy = await estadoCal()
chk(!!trasHoy && trasHoy.hoy.length === 1, '#344 · "Hoy" lleva al mes actual sin asignar ni cerrar (#285)', trasHoy?.mes)
chk((await fechaDeLaFila()) === antesDeNavegar, '#344 · y tampoco asignó nada', await fechaDeLaFila())

// La marca de hoy también cuando hoy cae en un día del mes vecino.
// Hoy aparece como día VECINO solo en el mes anterior o en el siguiente, y solo
// si cae cerca de un borde de mes: a mitad de mes no lo muestra ninguno. Antes
// esta comprobación daba por sentado que hoy caía en la primera semana —cierto
// el día que se escribió, falso una semana después—, así que ahora se BUSCA el
// mes que lo muestre y, si no existe hoy, se dice en vez de aprobar o reprobar.
const buscarHoyDeVecino = async () => {
  for (const [etiqueta, pasos] of [['Mes anterior', 1], ['Mes siguiente', 2]]) {
    for (let i = 0; i < pasos; i++) await pulsarSiEsta(p.locator(`.fecha-cal__nav[aria-label="${etiqueta}"]`), 280)
    const e = await estadoCal()
    if (e && e.hoy.length === 1 && e.hoyEsVecino) return e
  }
  return null
}
await pulsarSiEsta(p.locator('.fecha-cal__ir-hoy'), 300)
const mesVecino = await buscarHoyDeVecino()
if (mesVecino) {
  chk(
    true,
    '#344 · hoy se ve marcado aunque caiga en un día del mes vecino',
    `viendo ${mesVecino.mes}, marcado ${mesVecino.hoy.join()} como día vecino`,
  )
} else {
  const enSuMes = await (async () => {
    await pulsarSiEsta(p.locator('.fecha-cal__ir-hoy'), 300)
    return estadoCal()
  })()
  skip(
    '#344 · hoy se ve marcado aunque caiga en un día del mes vecino',
    'hoy cae a mitad de mes: ninguna grilla de seis semanas lo muestra como día vecino, así que el caso no se puede ejercer con esta fecha',
  )
  chk(
    !!enSuMes && enSuMes.hoy.length === 1 && !enSuMes.hoyEsVecino,
    '#344 · control de vida: hoy sí se ve marcado en su propio mes',
    enSuMes ? `viendo ${enSuMes.mes}, marcado ${enSuMes.hoy.join()}` : '',
  )
}

// Elegir un día del mes vecino asigna y cierra.
const elegido = await p.evaluate(() => {
  const d = document.querySelector('.fecha-cal__dia--fuera')
  return d ? d.dataset.fecha : null
})
await pulsarSiEsta(p.locator('.fecha-cal__dia--fuera').first(), 500)
const cerrado = await estadoCal()
chk(cerrado === null, '#344 · al elegir un día del mes vecino el calendario se cierra')
const puesta = await fechaDeLaFila()
const esperada = elegido
  ? `${elegido.slice(8)}-${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(elegido.slice(5, 7)) - 1]}-${elegido.slice(0, 4)}`
  : null
chk(!!puesta && puesta === esperada, '#344 · y la tarea queda con la fecha de ese día', `${elegido} → ${puesta}`)

// Criterio 7: abajo del todo se abre entero, sin quedar cortado.
await p.evaluate(() => {
  const c = document.querySelector('.content')
  c.scrollTo(0, c.scrollHeight)
})
await esperar(500)
const abajo = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('.fecha-btn')]
  const b = btns.reverse().find((x) => x.getBoundingClientRect().top > window.innerHeight - 220)
  if (!b) return null
  b.click()
  return true
})
await esperar(500)
const calAbajo = await estadoCal()
chk(
  !abajo || (!!calAbajo && calAbajo.top >= 0 && calAbajo.bottom <= 900),
  '#344 · abierto en una tarea de abajo del todo, el calendario se ve completo',
  calAbajo ? `${calAbajo.top}–${calAbajo.bottom} (alto ${calAbajo.alto}) en una ventana de 900` : 'sin tarea abajo',
)
await p.keyboard.press('Escape')
await esperar(250)

// ── #347 · "Seleccionar todos menos Hecha" ────────────────────────────────
// El atajo se localiza por texto EXACTO y no por subcadena: "Seleccionar
// todos" es prefijo de "Seleccionar todos menos Hecha" y `hasText` casaría con
// los dos.
const atajoExacto = (texto) =>
  p.locator('.filtro-menu .filtro-op--todos').filter({ hasText: new RegExp(`^${texto}$`) })
const atajos = () =>
  p.evaluate(() => [...document.querySelectorAll('.filtro-menu .filtro-op--todos')].map((x) => x.textContent.trim()))
const casillas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.filtro-menu .filtro-op--check')].map((l) => ({
      nombre: l.textContent.trim(),
      on: l.querySelector('input').checked,
    })),
  )
const fichas = async () => {
  await pulsarSiEsta(p.locator('.controles-bar').getByText('Filtrar', { exact: true }), 300)
  const f = await p.evaluate(() => [...document.querySelectorAll('.filtro-ficha')].map((x) => x.textContent.trim()))
  return f
}

await desplazar(0)
await abrirCampoFiltro('Estado')
const at0 = await atajos()
chk(
  at0.length === 2 && at0[0] === 'Seleccionar todos menos Hecha' && at0[1] === 'Seleccionar todos',
  '#347 · bajo las cinco categorías están las dos líneas de atajo, en ese orden',
  at0.join(' | '),
)
const cajas0 = await casillas()
chk(cajas0.length === 5, '#347 · las cinco casillas siguen estando', `${cajas0.length}`)

await pulsarSiEsta(atajoExacto('Seleccionar todos menos Hecha'), 450)
const cajas1 = await casillas()
const hecha = cajas1.find((c) => c.nombre === 'Hecha')
chk(
  cajas1.filter((c) => c.on).length === 4 && hecha && !hecha.on,
  '#347 · quedan marcadas las cuatro que no son "hecha", y "hecha" desmarcada',
  cajas1.map((c) => `${c.nombre}=${c.on ? 1 : 0}`).join(' '),
)
chk(
  (await atajos())[0] === 'Deseleccionar todos menos Hecha',
  '#347 · con esas cuatro puestas la línea pasa a "Deseleccionar todos menos Hecha"',
  (await atajos()).join(' | '),
)
await p.keyboard.press('Escape')
await esperar(400)
const f1 = await fichas()
chk(
  f1.some((x) => /Estado/.test(x) && /4/.test(x)),
  '#347 · la ficha dice "Estado: 4" — no aparece como si fuera un estado más',
  f1.join(' | '),
)
await p.keyboard.press('Escape')
await esperar(300)
const verdes = await p.locator('tr.fila--verde').count()
chk(verdes === 0, '#347 · en la tabla no queda ninguna tarea verde a la vista', `${verdes} verdes`)
await verVista('Gantt')
const verdesG = await p.evaluate(
  () => document.querySelectorAll('.gantt .marca--hecha, .gantt tr.gfila-tarea .hecha').length,
)
const totalG = await p.locator('.gantt tbody tr.gfila-tarea').count()
chk(verdesG === 0 && totalG > 0, '#347 · en la Gantt tampoco', `${totalG} filas, ${verdesG} marcas de hecha`)
await verVista('Tabla')

// Guardar la vista con el filtro puesto y volver a cargarla. "Guardar vista"
// vive dentro del control "Vistas" de la barra (#305).
const abrirVistas = () => pulsarSiEsta(p.locator('.controles-ctrl--vistas .controles-btn'), 350)
await abrirVistas()
const guardo = await pulsarSiEsta(p.locator('.filtro-op--guardar'), 450)
chk(guardo, '#347 · se puede guardar la vista con este filtro puesto')
if (guardo) {
  await p.locator('.modal-card input').fill('Sin hechas')
  await esperar(200)
  await pulsarSiEsta(p.locator('.modal-card').getByRole('button', { name: 'Guardar', exact: true }), 700)
}
await limpiarFiltros()
// #215: guardar deja DENTRO de la vista, y tocar la vista activa se sale de
// ella. Para volver a cargarla hay que salir primero: si sigue marcada, el
// primer toque la desmarca y el segundo la aplica.
await abrirVistas()
// El menú NO se cierra al tocar una vista, así que los dos toques van seguidos
// sin volver a abrirlo (reabrirlo lo cerraría).
if (await p.locator('.filtro-guardado--activa').count()) {
  await pulsarSiEsta(p.locator('.filtro-guardado__aplicar', { hasText: 'Sin hechas' }), 600)
}
await pulsarSiEsta(p.locator('.filtro-guardado__aplicar', { hasText: 'Sin hechas' }), 700)
await p.keyboard.press('Escape')
await esperar(300)
await abrirCampoFiltro('Estado')
const cajas2 = await casillas()
chk(
  cajas2.filter((c) => c.on).length === 4 && !cajas2.find((c) => c.nombre === 'Hecha')?.on,
  '#347 · una vista guardada con ese filtro vuelve con las cuatro categorías marcadas',
  cajas2.map((c) => `${c.nombre}=${c.on ? 1 : 0}`).join(' '),
)

// Segundo toque: el campo Estado queda vacío.
await pulsarSiEsta(atajoExacto('Deseleccionar todos menos Hecha'), 450)
const cajas3 = await casillas()
chk(cajas3.every((c) => !c.on), '#347 · tocarla de nuevo deja el campo Estado vacío', cajas3.map((c) => (c.on ? 1 : 0)).join(''))
await p.keyboard.press('Escape')
await esperar(400)
const f2 = await fichas()
chk(!f2.some((x) => /Estado/.test(x)), '#347 · y la ficha de Estado desaparece', f2.join(' | ') || '(sin fichas)')
await p.keyboard.press('Escape')
await esperar(300)
const verdes2 = await p.locator('tr.fila--verde').count()
chk(verdes2 > 0, '#347 · vuelven a verse todas las tareas', `${verdes2} verdes`)

// La × de la ficha borra el filtro completo.
await abrirCampoFiltro('Estado')
await pulsarSiEsta(atajoExacto('Seleccionar todos menos Hecha'), 400)
await p.keyboard.press('Escape')
await esperar(400)
await pulsarSiEsta(p.locator('.controles-bar').getByText('Filtrar', { exact: true }), 300)
await pulsarSiEsta(p.locator('.filtro-ficha__x').first(), 500)
await p.keyboard.press('Escape')
await esperar(400)
const verdes3 = await p.locator('tr.fila--verde').count()
chk(verdes3 > 0, '#347 · la × de la ficha borra el filtro completo, igual que hoy', `${verdes3} verdes`)

// ── Mis Tareas: los mismos tres controles ──────────────────────────────────
await irAMisTareas()
await verVista('Gantt')
const mtBase = await medirGantt()
chk(
  mtBase.anchos.length === 1 && mtBase.anchos[0] === 30,
  '#345 · en la Gantt de Mis Tareas la columna de un día también mide 30',
  JSON.stringify(mtBase.anchos),
)
await ponerRango('2024-10-30', '2024-11-04')
const mtCruce = await medirGantt()
chk(
  mtCruce.anchos.length === 1 &&
    mtCruce.anchos[0] === 30 &&
    mtCruce.sem.length === 2 &&
    mtCruce.sem[0].txt === 'oct' &&
    mtCruce.sem[1].txt === 'nov',
  '#345 · y ahí también cada semana parcial muestra el mes de su primer día visible',
  `${JSON.stringify(mtCruce.anchos)} ${mtCruce.sem.map((s) => s.txt).join('|')}`,
)
await limpiarFiltros()

await abrirCampoFiltro('Estado')
const atMT = await atajos()
chk(
  atMT.length === 2 && atMT[0] === 'Seleccionar todos menos Hecha',
  '#347 · el atajo está también en el filtro de Estado de Mis Tareas (Gantt)',
  atMT.join(' | '),
)
await pulsarSiEsta(atajoExacto('Seleccionar todos menos Hecha'), 450)
const cajasMT = await casillas()
chk(
  cajasMT.filter((c) => c.on).length === 4 && !cajasMT.find((c) => c.nombre === 'Hecha')?.on,
  '#347 · y hace lo mismo',
  cajasMT.map((c) => `${c.nombre}=${c.on ? 1 : 0}`).join(' '),
)
await p.keyboard.press('Escape')
await esperar(400)
await limpiarFiltros()

await verVista('Tabla')
await abrirCampoFiltro('Estado')
const atMTt = await atajos()
chk(
  atMTt.length === 2 && atMTt[0] === 'Seleccionar todos menos Hecha',
  '#347 · y en la tabla de Mis Tareas',
  atMTt.join(' | '),
)
await p.keyboard.press('Escape')
await esperar(300)

// #344 en Mis Tareas: la misma grilla de seis semanas.
await pulsarSiEsta(p.locator('.fecha-btn').first(), 450)
const calMT = await estadoCal()
chk(
  !!calMT && calMT.n === 42 && calMT.huecos === 0 && calMT.fuera >= 5,
  '#344 · en la tabla de Mis Tareas el calendario es el mismo: seis semanas y días vecinos',
  calMT ? `${calMT.n} días, ${calMT.fuera} vecinos, ${calMT.huecos} huecos` : '',
)
await p.keyboard.press('Escape')
await esperar(200)

// Mis Tareas no tiene título de sub frente: #343 no aplica ahí, y se comprueba.
const sinTitulo = await p.locator('.subfrente__titulo').count()
chk(sinTitulo === 0, '#343 · Mis Tareas no tiene título de sub frente (el defecto no existía ahí)', `${sinTitulo}`)

await b.close()
