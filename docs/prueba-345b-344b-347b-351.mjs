// Correcciones de #345, #344 y #347, más #351.
//
// #345b — La regla de #345 estaba bien, pero **el mes tampoco cabía**. La causa
//   no era el ancho de la columna sino lo que la rodea: el relleno lateral (6+6)
//   y el borde de inicio de semana (2) se llevaban 14 de los 30, y al texto le
//   quedaban 16 para un mes que mide 18,91. Ahora, cuando la franja muestra solo
//   el mes, el relleno cede y el texto usa el ancho completo de sus días.
//
// #344b — Los días del mes vecino usaban EXACTAMENTE el mismo gris que los
//   rótulos lu·ma·mi, así que se leían como días del mes un poco más apagados y
//   no como relleno de la semana. Ahora son más apagados que esos rótulos, en
//   los dos temas.
//
// #347b — El atajo pasa a llamarse "Seleccionar todos menos Hecha" —y
//   "Deseleccionar todos menos Hecha" cuando las cuatro ya están puestas— y sube
//   POR ENCIMA de "Seleccionar todos", que queda última.
//
// #351 — En la Gantt, el nombre de un sub frente se salía de su celda por abajo
//   y se montaba sobre la fila siguiente. El nombre se dibuja en un envoltorio
//   FLOTANTE —para acompañar el desplazamiento y centrarse en la parte visible
//   del bloque—, y al flotar nada lo recortaba; el alto del bloque, en cambio,
//   lo dan sus tareas. Pasaba con nombre largo y pocas tareas. Ahora se recorta
//   a las líneas que caben, con puntos suspensivos, y el nombre completo sigue
//   en el globo. Vale para sub frente, frente y el rótulo del proyecto.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-345b-344b-347b-351.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
/** Ni verde ni rojo: la comprobación NO se pudo ejercer hoy, y se dice por qué. */
const skip = (m, motivo) => console.log(`SKIP  ${m} — ${motivo}`)

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

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
const pulsarSiEsta = async (loc, ms = 350) => {
  try {
    await loc.first().click({ timeout: 2500 })
    await esperar(ms)
    return true
  } catch {
    return false
  }
}
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
    await esperar(550)
  } catch {
    return false
  }
  await p.keyboard.press('Escape')
  await esperar(500)
  return true
}

await entrarComo('Daniela Vera')
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// #345b · el mes tiene que LEERSE, no solo mostrarse
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #345b · el mes entra completo ──')

/**
 * El ancho REAL del texto renderizado, con un Range sobre el nodo de texto: es
 * lo único que sirve acá. `scrollWidth` no dice nada, porque el bloque que
 * lleva el texto tiene `width: 0; min-width: 100%` —lo que impide que ensanche
 * la columna— y devuelve siempre el ancho disponible.
 */
const franjas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.gantt th.semana-lbl')].map((t) => {
      const txt = t.querySelector('.semana-lbl__txt')
      const r = document.createRange()
      r.selectNodeContents(txt)
      const ancho = r.getBoundingClientRect().width
      const cs = getComputedStyle(t)
      return {
        txt: txt.textContent.trim(),
        cols: t.colSpan,
        disponible: txt.clientWidth,
        texto: Math.round(ancho * 100) / 100,
        cabe: ancho <= txt.clientWidth + 0.5,
        alto: Math.round(t.getBoundingClientRect().height),
        pad: `${cs.paddingLeft}/${cs.paddingRight}`,
        borde: cs.borderLeftWidth,
      }
    }),
  )
const anchosDia = () =>
  p.evaluate(() => [...new Set([...document.querySelectorAll('.gantt th.dia')].map((t) => Math.round(t.getBoundingClientRect().width)))])

await verVista('Gantt')
const sinFiltro = await franjas()
const anchoBase = await anchosDia()
chk(
  anchoBase.length === 1 && anchoBase[0] === 30,
  '#345b · referencia: sin filtro la columna de un día mide 30',
  JSON.stringify(anchoBase),
)
chk(
  sinFiltro.every((f) => f.cabe && /–/.test(f.txt) && f.pad === '6px/6px' && f.borde === '2px'),
  '#345b · sin filtro la franja muestra su rango completo, con su relleno y su borde de siempre',
  sinFiltro.map((f) => `${f.txt} pad=${f.pad} borde=${f.borde}`).join(' | '),
)
const altoFranja = sinFiltro[0]?.alto

// Dos días: el mes tiene que leerse entero.
await ponerRango('2024-10-30', '2024-10-31')
const dos = await franjas()
chk(
  (await anchosDia())[0] === 30,
  '#345b · con dos días la columna sigue midiendo 30',
  JSON.stringify(await anchosDia()),
)
chk(
  dos.length === 1 && dos[0].txt === 'oct' && dos[0].cabe,
  '#345b · y el mes se lee completo, sin cortes',
  dos[0] ? `"${dos[0].txt}" mide ${dos[0].texto} y dispone de ${dos[0].disponible}` : '',
)

// Tres días.
await ponerRango('2024-10-30', '2024-11-01')
const tres = await franjas()
chk(
  tres.every((f) => f.cabe) && (await anchosDia())[0] === 30,
  '#345b · lo mismo con un rango de tres días',
  tres.map((f) => `"${f.txt}" ${f.texto}/${f.disponible}`).join(' | '),
)

// El caso peor: una semana de UN SOLO día visible.
await ponerRango('2024-10-30', '2024-11-04')
const cruce = await franjas()
const unDia = cruce.find((f) => f.cols === 1)
chk(
  !!unDia && unDia.cabe,
  '#345b · el caso peor —una semana de un solo día— también entra',
  unDia ? `"${unDia.txt}" mide ${unDia.texto} y dispone de ${unDia.disponible} en una columna de 30` : 'sin semana de un día',
)
chk(
  !!unDia && unDia.pad === '0px/0px' && unDia.borde === '2px',
  '#345b · lo que cede es el relleno lateral; el borde de inicio de semana se queda',
  unDia ? `pad=${unDia.pad} borde=${unDia.borde}` : '',
)
chk(
  cruce.every((f) => f.alto === altoFranja) && (await anchosDia())[0] === 30,
  '#345b · ni el alto de la franja ni el ancho de la columna se movieron',
  `alto ${cruce.map((f) => f.alto).join('/')} vs ${altoFranja}, ancho ${JSON.stringify(await anchosDia())}`,
)

// Semana entera: vuelve todo a como estaba.
await ponerRango('2024-10-14', '2024-10-25')
const enteras = await franjas()
chk(
  enteras.length === 2 && enteras.every((f) => /–/.test(f.txt) && f.cabe && f.pad === '6px/6px'),
  '#345b · con semanas enteras vuelve el rango completo, con su relleno de siempre',
  enteras.map((f) => `${f.txt} pad=${f.pad}`).join(' | '),
)
await pulsarSiEsta(p.locator('.controles-x[aria-label="Limpiar todos los filtros"]'), 600)

// ═══════════════════════════════════════════════════════════════════════════
// #347b · el texto del atajo y su posición
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #347b · el atajo se llama distinto y va arriba ──')

const atajos = () =>
  p.evaluate(() => [...document.querySelectorAll('.filtro-menu .filtro-op--todos')].map((x) => x.textContent.trim()))
const casillas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.filtro-menu .filtro-op--check')].map((l) => ({
      nombre: l.textContent.trim(),
      on: l.querySelector('input').checked,
    })),
  )
// Por texto EXACTO: "Seleccionar todos" es prefijo de "Seleccionar todos menos
// Hecha" y una búsqueda por subcadena casaría con los dos.
const atajoExacto = (texto) =>
  p.locator('.filtro-menu .filtro-op--todos').filter({ hasText: new RegExp(`^${texto}$`) })

await verVista('Tabla')
await abrirCampoFiltro('Estado')
const at0 = await atajos()
chk(
  at0.length === 2 && at0[0] === 'Seleccionar todos menos Hecha' && at0[1] === 'Seleccionar todos',
  '#347b · se lee primero "Seleccionar todos menos Hecha" y después "Seleccionar todos"',
  at0.join(' | '),
)
await pulsarSiEsta(atajoExacto('Seleccionar todos menos Hecha'), 450)
const tras = await casillas()
chk(
  tras.filter((c) => c.on).length === 4 && !tras.find((c) => c.nombre === 'Hecha')?.on,
  '#347b · marca las cuatro que no son "hecha" (el comportamiento no cambió)',
  tras.map((c) => `${c.nombre}=${c.on ? 1 : 0}`).join(' '),
)
chk(
  (await atajos())[0] === 'Deseleccionar todos menos Hecha',
  '#347b · y pasa a decir "Deseleccionar todos menos Hecha"',
  (await atajos()).join(' | '),
)
await p.keyboard.press('Escape')
await esperar(400)
await pulsarSiEsta(p.locator('.controles-bar').getByText('Filtrar', { exact: true }), 300)
const ficha = await p.evaluate(() => [...document.querySelectorAll('.filtro-ficha')].map((x) => x.textContent.trim()))
chk(ficha.some((x) => /Estado/.test(x) && /4/.test(x)), '#347b · la ficha sigue diciendo "Estado: 4"', ficha.join(' | '))
await pulsarSiEsta(p.locator('.filtro-menu').getByText('Estado', { exact: true }), 300)
await pulsarSiEsta(atajoExacto('Deseleccionar todos menos Hecha'), 450)
const vacio = await casillas()
chk(
  vacio.every((c) => !c.on) && (await atajos())[0] === 'Seleccionar todos menos Hecha',
  '#347b · volver a tocarla vacía el campo y la línea recupera su texto',
  `${vacio.map((c) => (c.on ? 1 : 0)).join('')} · ${(await atajos())[0]}`,
)
// "Seleccionar todos" sigue haciendo lo suyo.
await pulsarSiEsta(atajoExacto('Seleccionar todos'), 450)
const todas = await casillas()
chk(
  todas.every((c) => c.on) && (await atajos())[1] === 'Deseleccionar todos',
  '#347b · "Seleccionar todos" sigue funcionando igual que hoy',
  todas.map((c) => (c.on ? 1 : 0)).join(''),
)
await pulsarSiEsta(atajoExacto('Deseleccionar todos'), 450)
await p.keyboard.press('Escape')
await esperar(400)

// ═══════════════════════════════════════════════════════════════════════════
// #344b · los días del mes vecino, más apagados que lu·ma·mi
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #344b · el contraste de los días vecinos ──')

/** Luminancia relativa (WCAG) de un `rgb(r, g, b)`. */
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number)
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
}
const coloresCal = () =>
  p.evaluate(() => {
    const cal = document.querySelector('.fecha-cal')
    if (!cal) return null
    const fuera = cal.querySelector('.fecha-cal__dia--fuera')
    const dentro = [...cal.querySelectorAll('.fecha-cal__dia')].find((d) => !d.classList.contains('fecha-cal__dia--fuera'))
    const dow = cal.querySelector('.fecha-cal__dow')
    return {
      fuera: getComputedStyle(fuera).color,
      dentro: getComputedStyle(dentro).color,
      dow: getComputedStyle(dow).color,
      fondo: getComputedStyle(cal).backgroundColor,
      hoyDibujado: !!cal.querySelector('.fecha-cal__dia--hoy'),
      hoyEsVecino: !!cal.querySelector('.fecha-cal__dia--hoy.fecha-cal__dia--fuera'),
    }
  })

const medirTema = async (tema) => {
  await p.evaluate((t) => {
    if (t === 'claro') delete document.documentElement.dataset.tema
    else document.documentElement.dataset.tema = t
  }, tema)
  await esperar(350)
  await pulsarSiEsta(p.locator('.fecha-btn').first(), 500)
  const c = await coloresCal()
  if (!c) return null
  return {
    ...c,
    cFuera: contraste(c.fuera, c.fondo),
    cDow: contraste(c.dow, c.fondo),
    cDentro: contraste(c.dentro, c.fondo),
  }
}

for (const tema of ['claro', 'oscuro']) {
  const m = await medirTema(tema)
  chk(!!m, `#344b · el calendario abre en modo ${tema}`)
  chk(
    !!m && m.fuera !== m.dow && m.cFuera < m.cDow,
    `#344b · en modo ${tema} los días vecinos se ven MÁS APAGADOS que los rótulos lu·ma·mi`,
    m ? `vecino ${m.fuera} (${m.cFuera}:1) vs lu·ma·mi ${m.dow} (${m.cDow}:1) · mes visible ${m.cDentro}:1` : '',
  )
  // Siguen siendo días como cualquier otro: caja, realce y marcas.
  const vivo = await p.evaluate(async () => {
    const d = document.querySelector('.fecha-cal__dia--fuera')
    if (!d) return null
    const antes = getComputedStyle(d).backgroundColor
    d.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    return { antes, esBoton: d.tagName === 'BUTTON', deshabilitado: d.disabled }
  })
  chk(
    !!vivo && vivo.esBoton && !vivo.deshabilitado,
    `#344b · en modo ${tema} un día vecino se sigue pudiendo elegir`,
    vivo ? `botón=${vivo.esBoton} deshabilitado=${vivo.deshabilitado}` : '',
  )
  await p.keyboard.press('Escape')
  await esperar(250)
}
// La marca de hoy sobre un día vecino, con el color nuevo puesto.
await p.evaluate(() => delete document.documentElement.dataset.tema)
await esperar(300)
await pulsarSiEsta(p.locator('.fecha-btn').first(), 450)
// Hoy solo aparece como día VECINO en el mes anterior o en el siguiente, y solo
// si cae cerca de un borde de mes: a mitad de mes no lo muestra ninguno. Se
// busca el mes que lo muestre y, si con esta fecha no existe, se dice — antes
// esta comprobación daba por sentado que hoy caía en la primera semana.
await pulsarSiEsta(p.locator('.fecha-cal__ir-hoy'), 300)
let conHoy = null
for (const [etiqueta, pasos] of [['Mes anterior', 1], ['Mes siguiente', 2]]) {
  for (let i = 0; i < pasos; i++) await pulsarSiEsta(p.locator(`.fecha-cal__nav[aria-label="${etiqueta}"]`), 280)
  const e = await coloresCal()
  if (e && e.hoyDibujado && e.hoyEsVecino) {
    conHoy = e
    break
  }
}
if (conHoy) {
  chk(true, '#344b · y la marca de hoy se sigue dibujando cuando hoy cae en un día vecino', 'dibujada sobre un día vecino')
} else {
  await pulsarSiEsta(p.locator('.fecha-cal__ir-hoy'), 300)
  const enSuMes = await coloresCal()
  skip(
    '#344b · y la marca de hoy se sigue dibujando cuando hoy cae en un día vecino',
    'hoy cae a mitad de mes: ninguna grilla lo muestra como día vecino con esta fecha',
  )
  chk(
    !!enSuMes && enSuMes.hoyDibujado && !enSuMes.hoyEsVecino,
    '#344b · control de vida: la marca de hoy sí se dibuja en su propio mes',
    enSuMes ? `dibujada=${enSuMes.hoyDibujado}` : '',
  )
}
// El elegido, si cae en el mes vecino, se sigue viendo como elegido.
const elegido = await p.evaluate(() => {
  const d = document.querySelector('.fecha-cal__dia--fuera')
  return d ? d.dataset.fecha : null
})
await pulsarSiEsta(p.locator('.fecha-cal__dia--fuera').first(), 500)
await pulsarSiEsta(p.locator('.fecha-btn').first(), 500)
const selVecino = await p.evaluate(() => {
  const cal = document.querySelector('.fecha-cal')
  if (!cal) return null
  // El mes visible es el del día elegido, así que hay que navegar uno para que
  // el elegido caiga del lado vecino.
  cal.querySelector('.fecha-cal__nav[aria-label="Mes siguiente"]').click()
  return true
})
await esperar(350)
const sel = await p.evaluate(() => {
  const d = document.querySelector('.fecha-cal__dia--sel')
  if (!d) return null
  const cs = getComputedStyle(d)
  return { fuera: d.classList.contains('fecha-cal__dia--fuera'), fondo: cs.backgroundColor, color: cs.color }
})
chk(
  !!selVecino && !!sel && sel.fuera && sel.fondo !== 'rgba(0, 0, 0, 0)',
  '#344b · el día elegido, si cae en el mes vecino, se sigue viendo como elegido',
  sel ? `vecino=${sel.fuera} fondo=${sel.fondo} texto=${sel.color}` : `elegido ${elegido}`,
)
await p.keyboard.press('Escape')
await esperar(300)

// ═══════════════════════════════════════════════════════════════════════════
// #351 · el nombre no se sale de su celda
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #351 · el nombre se recorta al alto de su celda ──')

const LARGO_FRENTE = 'Implementación y despliegue de la plataforma corporativa'
const LARGO_SUB = 'Levantamiento detallado de procesos comerciales y financieros'

// Terreno: el caso peor del reporte —nombre largo con UNA sola tarea—. Se
// construye con los gestos del producto, no escribiendo en el almacenamiento.
await p.locator('.nav-proyecto', { hasText: 'Plan PGP Arauco' }).first().locator('.nav-proyecto__menu-btn').click()
await esperar(300)
await pulsarSiEsta(p.locator('.nav-proyecto__menu-op', { hasText: 'Agregar frente' }), 400)
await p.locator('.modal-card input').first().fill(LARGO_FRENTE)
await pulsarSiEsta(p.locator('.modal-acciones .btn--primary'), 800)
await verVista('Tabla')
await esperar(600)
const creoSub = await pulsarSiEsta(p.locator('.subfrente-add').first(), 500)
if (creoSub) {
  await p.locator('.subfrente--nuevo input').fill(LARGO_SUB)
  await p.keyboard.press('Enter')
  await esperar(900)
  await p.keyboard.press('Escape')
  await esperar(500)
}
const creoTarea = await pulsarSiEsta(p.locator('.fila-add button', { hasText: '+ Tarea' }).first(), 500)
if (creoTarea) {
  await p.locator('tr.fila-nueva input.inline-input').first().fill('Tarea única')
  await p.keyboard.press('Enter')
  await esperar(900)
  await p.keyboard.press('Escape')
  await esperar(500)
}
chk(creoSub && creoTarea, '#351 · terreno: un frente y un sub frente de nombre largo con una sola tarea')

await verVista('Gantt')
/** Cada rótulo flotante contra su celda: lo que se pregunta es si SE SALE. */
const rotulos = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.gantt td.fija--rotula')].map((td) => {
      const label = td.firstElementChild
      const txt = td.querySelector('.fija-txt') ?? td.querySelector('.proy-rotulo__txt')
      const tr = td.getBoundingClientRect()
      const lr = label.getBoundingClientRect()
      const cs = txt ? getComputedStyle(txt) : null
      return {
        nombre: (txt?.textContent ?? '').trim().slice(0, 30),
        tipo: td.classList.contains('fija--sf') ? 'sf' : td.classList.contains('fija--frente') ? 'frente' : 'proy',
        celda: Math.round(tr.height),
        rotulo: Math.round(lr.height),
        desborde: Math.round(lr.bottom - tr.bottom),
        clamp: cs ? cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp') : null,
        recortado: txt ? txt.scrollHeight > txt.clientHeight + 0.5 : false,
        globo: td.querySelector('[data-tip]')?.getAttribute('data-tip') ?? null,
      }
    }),
  )
const r1 = await rotulos()
chk(r1.length > 0, '#351 · hay rótulos que mirar en la Gantt', `${r1.length}`)
const fuera = r1.filter((r) => r.desborde > 1)
chk(
  fuera.length === 0,
  '#351 · ningún rótulo se sale de su celda por abajo',
  fuera.length ? fuera.map((r) => `${r.tipo} "${r.nombre}" se sale ${r.desborde}`).join(' | ') : `${r1.length} rótulos, desborde máximo ${Math.max(...r1.map((r) => r.desborde))}`,
)
const subLargo = r1.find((r) => r.tipo === 'sf' && r.globo === LARGO_SUB)
chk(
  !!subLargo && subLargo.recortado,
  '#351 · el sub frente de nombre largo con una tarea queda recortado dentro de su celda',
  subLargo ? `celda ${subLargo.celda}, rótulo ${subLargo.rotulo}, ${subLargo.clamp} líneas` : 'no se encontró el sub frente creado',
)
chk(
  !!subLargo && subLargo.globo === LARGO_SUB,
  '#351 · y el globo lleva el nombre completo',
  subLargo?.globo ?? '',
)
const frenteLargo = r1.find((r) => r.tipo === 'frente' && r.globo === LARGO_FRENTE)
chk(
  !!frenteLargo && frenteLargo.desborde <= 1 && frenteLargo.recortado,
  '#351 · lo mismo con el nombre del FRENTE',
  frenteLargo ? `celda ${frenteLargo.celda}, rótulo ${frenteLargo.rotulo}, desborde ${frenteLargo.desborde}` : 'no encontrado',
)
const corto = r1.find((r) => r.tipo === 'sf' && r.celda >= 120)
chk(
  !!corto && !corto.recortado,
  '#351 · un sub frente que SÍ cabe se sigue viendo entero, sin puntos suspensivos',
  corto ? `"${corto.nombre}" en una celda de ${corto.celda}` : '',
)

// El rótulo sigue acompañando el desplazamiento y sin salirse.
const scrollY = await p.evaluate(() => {
  const s = document.querySelector('.gantt-scroll')
  s.scrollTo(0, Math.round(s.scrollHeight / 2))
  return s.scrollTop
})
await esperar(600)
const r2 = await rotulos()
const fuera2 = r2.filter((r) => r.desborde > 1)
chk(
  scrollY > 0 && fuera2.length === 0,
  '#351 · desplazada la Gantt, ningún rótulo se sale',
  `scroll ${scrollY}, desborde máximo ${Math.max(...r2.map((r) => r.desborde))}`,
)
const centrado = await p.evaluate(() => {
  const s = document.querySelector('.gantt-scroll')
  const banda = s.getBoundingClientRect()
  const alto = s.querySelector('thead').getBoundingClientRect().height
  return [...s.querySelectorAll('td.fija--rotula')]
    .map((td) => {
      const tr = td.getBoundingClientRect()
      const lr = td.firstElementChild.getBoundingClientRect()
      if (tr.height <= banda.height - alto) return null
      const visTop = Math.max(tr.top, banda.top + alto)
      const visBottom = Math.min(tr.bottom, banda.bottom)
      // El rótulo tiene que caer DENTRO de la porción visible del bloque.
      return { dentro: lr.top >= visTop - 2 && lr.bottom <= visBottom + 2, alto: Math.round(tr.height) }
    })
    .filter(Boolean)
})
chk(
  centrado.length === 0 || centrado.every((c) => c.dentro),
  '#351 · y el que tiene un bloque más alto que la pantalla sigue acompañando en la parte visible',
  centrado.length ? JSON.stringify(centrado) : 'ningún bloque más alto que la banda visible',
)

// El ancho de las columnas congeladas no se tocó.
const anchosFijos = await p.evaluate(() => {
  const uno = (sel) => {
    const el = document.querySelector(sel)
    return el ? Math.round(el.getBoundingClientRect().width) : null
  }
  return { frente: uno('td.fija--frente'), sf: uno('td.fija--sf'), tarea: uno('td.fija--tarea'), resp: uno('td.fija--resp') }
})
chk(
  anchosFijos.frente === 120 && anchosFijos.sf === 150 && anchosFijos.tarea === 240 && anchosFijos.resp === 60,
  '#351 · el ancho de las columnas congeladas es el de siempre',
  JSON.stringify(anchosFijos),
)

// Mis Tareas: el rótulo del proyecto usa el mismo mecanismo.
await irAMisTareas()
await verVista('Gantt')
const rMT = await rotulos()
const proy = rMT.filter((r) => r.tipo === 'proy')
chk(proy.length > 0, '#351 · en Mis Tareas hay rótulo de proyecto', `${proy.length}`)
chk(
  rMT.every((r) => r.desborde <= 1),
  '#351 · y ahí tampoco se sale ningún rótulo',
  `desborde máximo ${Math.max(...rMT.map((r) => r.desborde))}`,
)

await b.close()
