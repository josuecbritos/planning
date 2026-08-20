// #321, #324, #305c y #305d — La Gantt (alto, scroll y columnas), el
// encabezado de Mis Tareas, y el cierre de #305.
//
// Tres pedidos que entran juntos y se comprueban juntos, porque se tocan: #321
// cambia la Gantt, #324 le da a Mis Tareas el mismo encabezado (y con él la
// leyenda que #305 le había quitado), y #305c ajusta dos detalles de la barra.
// Prefijos: G = #321, M = #324, C = #305c, D = #305d.
//
// Controles negativos comprobados (contra el código anterior):
//   · G1/G3 fallan: el alto era `100vh - 250px`, medido contra la pantalla
//     COMPLETA, así que sobraba franja abajo y la página se desplazaba.
//   · G7 falla: el frente era negro sólido, y en modo oscuro frente y sub
//     frente eran el MISMO valor exacto (#26262b) — razón 1.00.
//   · G8/G9 fallan: el corte estaba forzado en cualquier letra, así que una
//     palabra larga se partía en dos líneas en vez de recortarse.
//   · G11 falla: el rótulo del proyecto se centraba sobre el bloque COMPLETO,
//     así que con un bloque más alto que la pantalla quedaba fuera de vista.
//   · M1/M4/M5 fallan: Mis Tareas no tenía contadores, tenía el aviso de
//     atrasadas en texto y el título con la cuenta en una línea aparte.
//   · C3 falla: el ícono de actualizar se habilitaba en TODAS las vistas.
//   · D2 falla contra main (sin #305c): el ícono se apagaba por la razón
//     equivocada —porque ya no quedaba nada puesto, no porque la vista
//     estuviera al día—, así que tras guardar con un orden puesto seguía
//     encendido. Es la reproducción exacta del pedido.
//   · D7/D8 fallan: los menús decían "Campos" y "Criterios", y el segundo
//     nivel gastaba dos renglones ("< Filtrar" y el nombre del campo).
//   · D10 falla: los dos campos de fecha sumaban unos 250 dentro de 230, y el
//     segundo quedaba cortado por el borde del menú.
//   · D13 falla: el nombre del frente no tenía globo propio; el que aparecía
//     era el del navegador, con cerca de un segundo de retardo.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-321-gantt-y-encabezados.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })

async function sesion(ancho = 1440, alto = 900) {
  const p = await (await b.newContext({ viewport: { width: ancho, height: alto } })).newPage()
  p.on('dialog', (d) => d.accept())
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await p.waitForTimeout(700)
  await p.getByText('Daniela Vera', { exact: true }).click()
  await p.waitForTimeout(900)
  return p
}

async function abrirBarra(p) {
  const m = p.locator('button.movil-menu[aria-label="Abrir menú"]')
  if (await m.isVisible().catch(() => false)) {
    await m.click()
    await p.waitForTimeout(400)
  }
}
async function abrirProyecto(p, nombre = 'Plan PGP Arauco') {
  await abrirBarra(p)
  await p.getByText('Resumen', { exact: true }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.resumen-card', { hasText: nombre }).first().click()
  await p.waitForTimeout(900)
}
async function verVista(p, cual) {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await p.waitForTimeout(900)
}
const menu = (p) => p.locator('.filtro-menu--portal')
async function abrirCtrl(p, nombre) {
  await p.locator('.controles-btn', { hasText: nombre }).first().click()
  await p.waitForTimeout(350)
}
async function cerrarMenu(p) {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(250)
}
const opcion = (pg, nombre) =>
  menu(pg).locator('.filtro-op--check').filter({ has: pg.locator(`span:text-is("${nombre}")`) })

/**
 * Renombra por el estado guardado. El repo en memoria solo escribe en
 * localStorage al MUTAR algo, así que primero se provoca una mutación
 * inocua (marcar y desmarcar una tarea) y recién entonces se parchea.
 */
async function renombrar(p, patch) {
  const chkBox = p.locator('table.tareas tbody input[type="checkbox"], table.tareas tbody .check-hecha').first()
  await chkBox.click()
  await p.waitForTimeout(500)
  await chkBox.click()
  await p.waitForTimeout(500)
  const r = await p.evaluate((patch) => {
    const s = JSON.parse(localStorage.getItem('planificador.state.v1') || 'null')
    if (!s) return 'sin estado'
    if (patch.frente) s.frentes[0].nombre = patch.frente
    if (patch.sub) s.subFrentes[0].nombre = patch.sub
    if (patch.tarea) s.tareas[0].titulo = patch.tarea
    localStorage.setItem('planificador.state.v1', JSON.stringify(s))
    return 'ok'
  }, patch)
  await p.reload()
  await p.waitForTimeout(1000)
  return r
}

/** Luminancia relativa de un `rgb(r, g, b)` de getComputedStyle. */
function luminancia(css) {
  const [r, g, b] = css.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const razon = (a, b_) => {
  const [x, y] = [luminancia(a), luminancia(b_)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

// ═══════════════════════════════════════════════════════════════════════════
// #321 — La Gantt
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── G1 a G4 · Alto automático y un solo scroll ──')
const p = await sesion(1440, 900)
await abrirProyecto(p)
await verVista(p, 'Gantt')

const geom = (pg) =>
  pg.evaluate(() => {
    const contenido = document.querySelector('.content')
    const scroll = document.querySelector('.gantt-scroll')
    const doc = document.documentElement
    const r = scroll.getBoundingClientRect()
    return {
      // ¿Se desplaza algo que no sea la grilla?
      pantallaDesplaza: Math.max(0, contenido.scrollHeight - contenido.clientHeight),
      documentoDesplaza: Math.max(0, doc.scrollHeight - doc.clientHeight),
      huecoAbajo: Math.round(window.innerHeight - r.bottom),
      grillaDesplaza: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      topbarVisible: document.querySelector('.topbar').getBoundingClientRect().top >= -0.5,
      contadoresVisibles: document.querySelector('.counters').getBoundingClientRect().bottom <= window.innerHeight,
      barraVisible: document.querySelector('.controles-bar').getBoundingClientRect().bottom <= window.innerHeight,
      alto: Math.round(r.height),
    }
  })

let g = await geom(p)
chk(g.huecoAbajo <= 24, 'G1 la grilla llega hasta el borde inferior, sin franja vacía debajo', `hueco=${g.huecoAbajo}px`)
chk(
  g.pantallaDesplaza === 0 && g.documentoDesplaza === 0,
  'G3 la pantalla no se desplaza',
  `contenido=${g.pantallaDesplaza} documento=${g.documentoDesplaza}`,
)
chk(
  g.topbarVisible && g.contadoresVisibles && g.barraVisible,
  'G3 encabezado, contadores y barra de controles quedan siempre visibles',
)

// G2 y G4: con una pantalla baja la grilla SÍ se desplaza por dentro, y se
// llega al final sin mover ningún otro scroll.
console.log('\n── G2 y G4 · Con más filas de las que caben ──')
const bajo = await sesion(1440, 520)
await abrirProyecto(bajo)
await verVista(bajo, 'Gantt')
let gb = await geom(bajo)
chk(gb.grillaDesplaza > 0, 'G2 con más filas de las que caben, la grilla se desplaza por dentro', `sobra=${gb.grillaDesplaza}px`)
chk(gb.pantallaDesplaza === 0 && gb.documentoDesplaza === 0, 'G4 y no hay ningún otro scroll que mover')
const finDeGrilla = await bajo.evaluate(() => {
  const s = document.querySelector('.gantt-scroll')
  s.scrollTop = s.scrollHeight
  const filas = [...s.querySelectorAll('tbody tr')]
  const ultima = filas[filas.length - 1]
  return {
    llegoAlFinal: Math.abs(s.scrollTop + s.clientHeight - s.scrollHeight) <= 1,
    ultimaCompleta: ultima.getBoundingClientRect().bottom <= s.getBoundingClientRect().bottom + 1,
  }
})
chk(finDeGrilla.llegoAlFinal, 'G4 se llega al final de la grilla con su propio scroll')
chk(finDeGrilla.ultimaCompleta, 'G2 la última fila no queda cortada por el borde')
await bajo.context().close()

// G5 y G6: entre vistas, entre proyectos y al redimensionar.
console.log('\n── G5 y G6 · Cambiar de vista, de proyecto y de tamaño ──')
await verVista(p, 'Tabla')
const tablaDesplaza = await p.evaluate(() => {
  const c = document.querySelector('.content')
  return { puede: c.scrollHeight > c.clientHeight, clase: c.className }
})
chk(!tablaDesplaza.clase.includes('content--gantt'), 'G5 en tabla se conserva el scroll de pantalla', tablaDesplaza.clase)
await verVista(p, 'Gantt')
g = await geom(p)
chk(g.huecoAbajo <= 24, 'G5 al volver a Gantt la grilla vuelve a llegar al borde', `hueco=${g.huecoAbajo}px`)
for (const [w, h] of [[1200, 700], [1600, 1000], [1024, 620]]) {
  await p.setViewportSize({ width: w, height: h })
  await p.waitForTimeout(500)
  const gr = await geom(p)
  chk(
    gr.huecoAbajo <= 24 && gr.pantallaDesplaza === 0,
    `G6 a ${w}×${h} la grilla se adapta sin dejar espacio muerto`,
    `hueco=${gr.huecoAbajo}px alto=${gr.alto}px`,
  )
}
await p.setViewportSize({ width: 1440, height: 900 })
await p.waitForTimeout(500)

// ── G7 · El frente deja de ser negro, y se distingue del sub frente ────────
console.log('\n── G7 · Colores de frente y sub frente (cierra #323) ──')
const colores = async (pg, tema) => {
  await pg.evaluate((t) => document.documentElement.setAttribute('data-tema', t), tema)
  await pg.waitForTimeout(300)
  return pg.evaluate(() => ({
    frente: getComputedStyle(document.querySelector('.gantt td.fija--frente')).backgroundColor,
    frenteTexto: getComputedStyle(document.querySelector('.gantt td.fija--frente')).color,
    sf: getComputedStyle(document.querySelector('.gantt td.fija--sf')).backgroundColor,
  }))
}
const claro = await colores(p, 'claro')
chk(
  luminancia(claro.frente) > 0.5,
  'G7 en modo claro el bloque del frente ya no es negro: es un gris claro',
  `${claro.frente} (luminancia ${luminancia(claro.frente).toFixed(2)})`,
)
chk(
  luminancia(claro.frenteTexto) < 0.2,
  'G7 y su nombre va en texto normal, no en blanco sobre negro',
  claro.frenteTexto,
)
for (const [tema, c] of [['claro', claro], ['oscuro', await colores(p, 'oscuro')]]) {
  const r = razon(c.frente, c.sf)
  chk(
    r >= 1.1,
    `G7 en modo ${tema} frente y sub frente se distinguen`,
    `${c.frente} vs ${c.sf} → razón ${r.toFixed(2)} (idénticos daría 1.00)`,
  )
}
await p.evaluate(() => document.documentElement.setAttribute('data-tema', 'claro'))
await p.waitForTimeout(300)

// ── G8, G9 y G10 · Los nombres se cortan, no se parten ─────────────────────
console.log('\n── G8 a G10 · Corte con puntos suspensivos y anchos de columna ──')
await verVista(p, 'Tabla')
chk(
  (await renombrar(p, {
    frente: 'Herramienta Planificación',
    sub: 'Documentación Complementariaadicional',
    tarea: 'Contextualizaciónestratégicaintegral del proyecto',
  })) === 'ok',
  'G8 terreno: se renombran frente, sub frente y tarea con palabras largas',
)
await abrirProyecto(p)
await verVista(p, 'Gantt')
const textos = await p.evaluate(() => {
  const leer = (sel) => {
    const t = document.querySelector(sel)
    if (!t) return null
    const cs = getComputedStyle(t)
    return {
      texto: t.innerText.trim(),
      // #305d: el nombre completo va en el `data-tip` del producto (inmediato)
      // y no en el `title` del navegador (lento). Vive en el envoltorio, no en
      // el elemento que recorta.
      tip: t.parentElement?.getAttribute('data-tip') ?? null,
      // Con `overflow-wrap: anywhere` (lo de antes) una palabra larga se
      // PARTÍA y nunca desbordaba; que desborde a lo ancho es la prueba de
      // que ahora envuelve por palabras y recorta la que no cabe.
      desborda: t.scrollWidth > t.clientWidth,
      corte: cs.overflowWrap,
      elipsis: cs.textOverflow,
    }
  }
  const anchos = {}
  for (const k of ['frente', 'sf', 'tarea', 'resp']) {
    const e = document.querySelector('.gantt td.fija--' + k)
    if (e) anchos[k] = Math.round(e.getBoundingClientRect().width)
  }
  return {
    frente: leer('.gantt td.fija--frente .fija-txt'),
    sf: leer('.gantt td.fija--sf .fija-txt'),
    tarea: leer('.gantt td.fija--tarea .fija-txt'),
    anchos,
  }
})
for (const [k, etiqueta] of [['frente', 'frente'], ['sf', 'sub frente'], ['tarea', 'tarea']]) {
  const t = textos[k]
  chk(!!t, `G8/G9 la columna de ${etiqueta} envuelve su nombre en el recorte`)
  if (!t) continue
  chk(
    t.corte === 'normal' && t.elipsis === 'ellipsis',
    `G8/G9 ${etiqueta}: envuelve por palabras y recorta con puntos suspensivos`,
    `overflow-wrap=${t.corte} text-overflow=${t.elipsis}`,
  )
}
chk(textos.sf.desborda, 'G9 la palabra que no cabe desborda su línea y se recorta (sub frente)')
chk(textos.tarea.desborda, 'G9 lo mismo en la columna de tarea')
chk(
  textos.frente.tip === 'Herramienta Planificación' && textos.sf.tip === 'Documentación Complementariaadicional',
  'G8 el nombre completo queda al pasar el mouse',
  `frente="${textos.frente.tip}"`,
)
chk(
  textos.anchos.frente === 120 && textos.anchos.sf === 150 && textos.anchos.tarea === 240 && textos.anchos.resp === 60,
  'G10 las columnas fijas siguen midiendo lo mismo: 120 + 150 + 240 + 60',
  JSON.stringify(textos.anchos),
)

// ── G12 · Lo de #305 sigue en pie ──────────────────────────────────────────
console.log('\n── G12 · Lo verificado en #305 ──')
chk((await p.locator('.leyenda, .gantt-toolbar').count()) === 0, 'G12 la leyenda sigue sin ser una fila propia')
chk((await p.locator('.counters--gantt .counter').count()) === 6, 'G12 los contadores siguen haciendo de leyenda en Gantt')
const ctrls = (await p.locator('.controles-bar .controles-btn').allInnerTexts()).map((t) => t.split('\n')[0].trim())
chk(ctrls.join(' · ') === 'Filtrar · Ordenar · Rango · Vistas', 'G12 la barra sigue con sus cuatro controles', ctrls.join(' · '))

// ═══════════════════════════════════════════════════════════════════════════
// #324 — El encabezado de Mis Tareas
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── M1 a M7 · El encabezado de Mis Tareas ──')
const mt = await sesion(1440, 900)
await abrirBarra(mt)
await mt.getByText('Mis Tareas', { exact: true }).first().click()
await mt.waitForTimeout(1000)

const cab = async (pg) =>
  pg.evaluate(() => {
    const t = document.querySelector('.topbar__title')
    return {
      hayTopbar: !!document.querySelector('.topbar'),
      titulo: t?.firstChild?.textContent?.trim(),
      cuenta: t?.querySelector('small')?.textContent?.trim(),
      cajas: document.querySelectorAll('.counter').length,
      marcas: document.querySelectorAll('.counters .mark').length,
      puntos: document.querySelectorAll('.counter__swatch').length,
      rastro: document.querySelector('.counter--rastro')?.textContent?.trim() ?? null,
      chip: document.querySelector('.hoy-chip')?.innerText?.trim() ?? null,
      simulado: !!document.querySelector('.hoy-chip__sim'),
      miembros: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Miembros'),
      avisoTexto: !!document.querySelector('.mipanel-alerta') || !!document.querySelector('.usuarios-sub'),
      toggle: !!document.querySelector('.topbar .toggle'),
      numeros: [...document.querySelectorAll('.counter__num')].map((e) => Number(e.textContent)),
    }
  })

let m = await cab(mt)
chk(m.hayTopbar, 'M8 Mis Tareas usa el mismo encabezado que un proyecto')
chk(m.titulo === 'Mis Tareas', 'M5 el título dice "Mis Tareas"', m.titulo ?? '')
chk(/^\d+ tareas en \d+ proyectos?$/.test(m.cuenta ?? ''), 'M5 con la cuenta al lado, en gris', m.cuenta ?? '')
chk(!m.avisoTexto, 'M5 y no hay línea de texto debajo')
chk(!m.avisoTexto, 'M4 ya no aparece el aviso de atrasadas en texto')
chk(m.cajas === 5 && m.puntos === 5, 'M2 en tabla hay cinco cajas con puntos de color', `${m.cajas} cajas, ${m.puntos} puntos`)
chk(!!m.chip && m.simulado, 'M6 está el chip de fecha y avisa que es simulada', m.chip ?? '')
chk(!m.miembros, 'M7 no hay botón Miembros')
chk(m.toggle, 'M9 el selector Tabla/Gantt sigue estando')

// M3: los números cuadran con las tareas a cargo, y el total con el título.
const totalCajas = m.numeros.reduce((a, n) => a + n, 0)
chk(
  totalCajas === Number((m.cuenta ?? '').match(/^\d+/)?.[0]),
  'M3 los contadores suman el total que dice el título',
  `cajas=${totalCajas} título="${m.cuenta}"`,
)
const filasTabla = await mt.locator('table.mistareas tbody tr').count()
chk(totalCajas === filasTabla, 'M3 y ese total son las tareas a tu cargo cruzando proyectos', `${totalCajas} vs ${filasTabla} filas`)

await verVista(mt, 'Gantt')
m = await cab(mt)
chk(m.cajas === 6, 'M1 en Gantt hay seis cajas')
chk(m.marcas === 6 && m.puntos === 0, 'M1 y las muestras son las marcas de la grilla', `${m.marcas} marcas, ${m.puntos} puntos`)
chk(m.rastro === 'Fecha anterior' && !/\d/.test(m.rastro), 'M1 la sexta dice "Fecha anterior" sin número', m.rastro ?? '')

// M8: los dos encabezados armados igual. Se comparan las piezas, no los píxeles.
const piezasMT = await mt.evaluate(() => {
  const t = document.querySelector('.topbar__title')
  return {
    tituloFuente: getComputedStyle(t).fontSize,
    padding: getComputedStyle(document.querySelector('.topbar')).padding,
    gapContadores: getComputedStyle(document.querySelector('.counters')).gap,
  }
})
const piezasProy = await p.evaluate(() => {
  const t = document.querySelector('.topbar__title')
  return {
    tituloFuente: getComputedStyle(t).fontSize,
    padding: getComputedStyle(document.querySelector('.topbar')).padding,
    gapContadores: getComputedStyle(document.querySelector('.counters')).gap,
  }
})
chk(
  JSON.stringify(piezasMT) === JSON.stringify(piezasProy),
  'M8 mismo tamaño de título, mismo espaciado y misma fila de contadores',
  `${JSON.stringify(piezasMT)} vs ${JSON.stringify(piezasProy)}`,
)

// M10: la barra de controles sigue como quedó en #305.
const ctrlsMT = (await mt.locator('.controles-bar .controles-btn').allInnerTexts()).map((t) => t.split('\n')[0].trim())
chk(ctrlsMT.join(' · ') === 'Filtrar · Ordenar · Rango · Vistas', 'M10 la barra de Mis Tareas sigue como en #305', ctrlsMT.join(' · '))

// M9: en móvil no hay Gantt y el selector no se ve.
const movil = await sesion(390, 844)
await abrirBarra(movil)
await movil.getByText('Mis Tareas', { exact: true }).first().click()
await movil.waitForTimeout(900)
chk(
  (await movil.locator('.topbar .toggle').count()) === 0,
  'M9 en móvil el selector Tabla/Gantt sigue oculto',
)
chk((await movil.locator('.counter').count()) === 5, 'M9 y el encabezado sigue mostrando sus contadores')
await movil.context().close()

// ── G11 · El rótulo del proyecto se centra en lo visible ───────────────────
console.log('\n── G11 · El rótulo del proyecto acompaña al desplazar ──')
const corto = await sesion(1440, 460)
await abrirBarra(corto)
await corto.getByText('Mis Tareas', { exact: true }).first().click()
await corto.waitForTimeout(900)
await verVista(corto, 'Gantt')
// El rótulo se centra en la porción VISIBLE del bloque, exactamente como el
// nombre del frente: los dos se miden contra la misma banda, así que sus
// centros tienen que coincidir. Cuando la porción visible es MÁS CORTA que el
// rótulo, el mecanismo lo apoya contra el borde del bloque sin dejar que se
// salga de él — es el mismo límite que ya tienen frente y sub frente, solo que
// el rótulo del proyecto es mucho más alto y ahí se nota.
const rotulas = () =>
  corto.evaluate(() => {
    const s = document.querySelector('.gantt-scroll')
    const sr = s.getBoundingClientRect()
    const bandTop = sr.top + s.querySelector('thead').getBoundingClientRect().height
    return [...document.querySelectorAll('td.fija--proy')]
      .map((td) => {
        const rot = td.querySelector('.proy-rotulo')
        if (!rot) return null
        const r = rot.getBoundingClientRect()
        const cr = td.getBoundingClientRect()
        const fr = td.parentElement.querySelector('td.fija--frente .fija-nombre')?.getBoundingClientRect()
        return {
          usaMecanismo: td.classList.contains('fija--rotula'),
          bloqueMasAlto: cr.height > sr.bottom - bandTop,
          visible: Math.round(Math.min(cr.bottom, sr.bottom) - Math.max(cr.top, bandTop)),
          alto: Math.round(r.height),
          centro: Math.round((r.top + r.bottom) / 2),
          centroFrente: fr ? Math.round((fr.top + fr.bottom) / 2) : null,
          dentroDelBloque: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1,
          dentroDeLaBanda: r.top >= bandTop - 1 && r.bottom <= sr.bottom + 1,
        }
      })
      .filter(Boolean)
  })

const r0 = await rotulas()
chk(r0.length > 0 && r0.every((r) => r.usaMecanismo), 'G11 la columna de proyecto usa el mismo mecanismo que frente y sub frente')
chk(r0.some((r) => r.bloqueMasAlto), 'G11 terreno: hay un bloque más alto que la parte visible de la pantalla')
const holgados0 = r0.filter((r) => r.visible >= r.alto)
chk(
  holgados0.length > 0 && holgados0.every((r) => r.dentroDeLaBanda),
  'G11 el nombre del proyecto se ve, dentro de la parte visible',
  holgados0.map((r) => `visible=${r.visible} alto=${r.alto}`).join(' | '),
)
chk(
  holgados0.every((r) => Math.abs(r.centro - r.centroFrente) <= 2),
  'G11 y queda centrado en lo mismo que el nombre del frente: es el mismo mecanismo',
  holgados0.map((r) => `${r.centro} vs ${r.centroFrente}`).join(' | '),
)
await corto.locator('.gantt-scroll').evaluate((e) => (e.scrollTop = 120))
await corto.waitForTimeout(500)
const r1 = await rotulas()
chk(
  r1.some((r, i) => r0[i] && r.centro !== r0[i].centro),
  'G11 acompaña al desplazar, no se queda fijo en el centro del bloque',
  `${r0.map((r) => r.centro).join(',')} → ${r1.map((r) => r.centro).join(',')}`,
)
const holgados1 = r1.filter((r) => r.visible >= r.alto)
chk(
  holgados1.length > 0 && holgados1.every((r) => r.dentroDeLaBanda && Math.abs(r.centro - r.centroFrente) <= 2),
  'G11 y tras desplazar sigue centrado en la parte visible, igual que el frente',
  holgados1.map((r) => `centro=${r.centro} frente=${r.centroFrente}`).join(' | '),
)
chk(
  r1.every((r) => r.dentroDelBloque),
  'G11 y nunca se sale de su propio bloque de color',
)
await corto.context().close()

// ═══════════════════════════════════════════════════════════════════════════
// #305c — Cierre de #305
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── C1 y C2 · El menú de Fecha tiene un solo título ──')
const q = await sesion(1440, 900)
await abrirProyecto(q)
await abrirCtrl(q, 'Filtrar')
await menu(q).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await q.waitForTimeout(400)
// #305c quitó el subtítulo "Relativas", que quedaba pegado al del campo.
// #305d fue más allá: el nombre del campo se fundió con la vuelta en una sola
// línea ("‹ Fecha"), así que dentro del menú solo queda el título que separa
// un grupo de verdad. Su detalle va en la sección D.
const titulosFecha = (await menu(q).locator('.filtro-menu__grupo').allInnerTexts()).map((t) => t.trim())
chk(
  titulosFecha.length === 1 && titulosFecha[0].toLowerCase() === 'rango fijo',
  'C1 dentro del menú de Fecha ya no hay títulos seguidos: solo queda "Rango fijo"',
  titulosFecha.join(' | '),
)
chk(
  !(await menu(q).innerText()).toLowerCase().includes('relativas'),
  'C1 el subtítulo "Relativas" desapareció',
)
const relativas = ['Hoy', 'Próximo día hábil', 'Esta semana', 'Próxima semana', 'Este mes']
const textoFecha = await menu(q).innerText()
chk(relativas.every((r) => textoFecha.includes(r)), 'C1 las cinco relativas siguen, bajo el nombre del campo')
chk((await menu(q).locator('input[type="date"]').count()) === 2, 'C1 "Rango fijo" sigue antes de los dos calendarios')

// C2 · las exclusiones no cambiaron.
await menu(q).locator('.filtro-op', { hasText: /^Con fecha$/ }).click()
await q.waitForTimeout(300)
await menu(q).locator('.filtro-op', { hasText: /^Sin fecha$/ }).click()
await q.waitForTimeout(300)
let on = (await menu(q).locator('.filtro-op--on').allInnerTexts()).map((t) => t.trim())
chk(on.join(',') === 'Sin fecha', 'C2 "Con fecha" y "Sin fecha" siguen siendo excluyentes', on.join(','))
await menu(q).locator('.filtro-op', { hasText: /^Con fecha$/ }).click()
await q.waitForTimeout(300)
await menu(q).locator('.filtro-op', { hasText: /^Esta semana$/ }).click()
await q.waitForTimeout(300)
on = (await menu(q).locator('.filtro-op--on').allInnerTexts()).map((t) => t.trim())
chk(on.join(',') === 'Esta semana', 'C2 elegir una relativa sigue apagando "Con fecha"', on.join(','))
chk(
  await menu(q).locator('.filtro-op', { hasText: 'En horizonte visible' }).isDisabled(),
  'C2 "En horizonte visible" sigue apagado desde la tabla',
)
await cerrarMenu(q)
await q.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x').click()
await q.waitForTimeout(400)

// ── C3 a C7 · El ícono de actualizar ───────────────────────────────────────
console.log('\n── C3 a C7 · El ícono de actualizar por vista ──')
async function ponerFiltro(pg, estado) {
  await abrirCtrl(pg, 'Filtrar')
  await menu(pg).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
  await pg.waitForTimeout(300)
  await opcion(pg, estado).click()
  await pg.waitForTimeout(300)
  await cerrarMenu(pg)
}
async function guardarVista(pg, nombre) {
  await abrirCtrl(pg, 'Vistas')
  await menu(pg).locator('.filtro-op--guardar').click()
  await pg.waitForTimeout(400)
  await pg.locator('.modal-card input').first().fill(nombre)
  await pg.getByRole('button', { name: 'Guardar', exact: true }).click()
  await pg.waitForTimeout(700)
}
const estadoIconos = (pg) =>
  pg.evaluate(() =>
    [...document.querySelectorAll('.filtro-menu--portal .filtro-guardado')].map((f) => ({
      nombre: f.querySelector('.filtro-guardado__aplicar').textContent.replace('✓', '').replace('*', '').trim(),
      activa: f.classList.contains('filtro-guardado--activa'),
      actualizarApagado: f.querySelector('.icon-btn').disabled,
      guardarApagado: document.querySelector('.filtro-op--guardar').disabled,
    })),
  )

for (const [i, nombre] of ['Vista uno', 'Vista dos', 'Vista tres'].entries()) {
  await ponerFiltro(q, ['Atrasada', 'Hecha', 'Pendiente'][i])
  await guardarVista(q, nombre)
  // Guardar deja DENTRO de la vista: se sale para crear la siguiente limpia.
  await q.locator('.controles-ctrl--vistas .controles-x').click()
  await q.waitForTimeout(400)
}

// C3 · con vistas guardadas y ninguna activa, un filtro no habilita ninguna.
await ponerFiltro(q, 'Atrasada')
await abrirCtrl(q, 'Vistas')
let iconos = await estadoIconos(q)
chk(iconos.length === 3, 'C3 terreno: tres vistas guardadas', iconos.map((i) => i.nombre).join(' · '))
chk(
  iconos.every((i) => i.actualizarApagado),
  'C3 sin vista activa, ningún ícono de actualizar se habilita',
  iconos.map((i) => `${i.nombre}:${i.actualizarApagado ? 'off' : 'ON'}`).join(' '),
)
chk(!iconos[0].guardarApagado, 'C7 "Guardar vista" sí se habilita con un filtro puesto, sin vista activa')

// C4 · activar una vista y modificarla: solo se habilita la suya.
await menu(q).locator('.filtro-guardado__aplicar', { hasText: 'Vista uno' }).click()
await q.waitForTimeout(500)
await cerrarMenu(q)
await abrirCtrl(q, 'Vistas')
iconos = await estadoIconos(q)
chk(
  iconos.every((i) => i.actualizarApagado),
  'C4 recién entrada a la vista, sin modificar, tampoco se habilita ninguno',
)
await cerrarMenu(q)
await ponerFiltro(q, 'Hecha')
chk(
  (await q.locator('.controles-btn', { hasText: 'Vistas' }).innerText()).includes('*'),
  'C4 al modificarla aparece el asterisco',
)
await abrirCtrl(q, 'Vistas')
iconos = await estadoIconos(q)
chk(
  iconos.filter((i) => !i.actualizarApagado).length === 1 && !iconos.find((i) => i.activa).actualizarApagado,
  'C4 y solo se habilita el ícono de ESA vista',
  iconos.map((i) => `${i.nombre}:${i.actualizarApagado ? 'off' : 'ON'}`).join(' '),
)

// C5 · tocarlo actualiza, el asterisco desaparece y vuelve a apagarse.
await menu(q).locator('.filtro-guardado--activa .icon-btn').first().click()
await q.waitForTimeout(700)
chk(
  !(await q.locator('.controles-btn', { hasText: 'Vistas' }).innerText()).includes('*'),
  'C5 al tocarlo la vista se actualiza y el asterisco desaparece',
)
iconos = await estadoIconos(q)
chk(
  iconos.every((i) => i.actualizarApagado),
  'C5 y el ícono vuelve a quedar apagado',
  iconos.map((i) => `${i.nombre}:${i.actualizarApagado ? 'off' : 'ON'}`).join(' '),
)
await cerrarMenu(q)

// C6 · salir con la × deja todo limpio y ningún ícono habilitado.
await q.locator('.controles-ctrl--vistas .controles-x').click()
await q.waitForTimeout(500)
await abrirCtrl(q, 'Vistas')
iconos = await estadoIconos(q)
chk(iconos.every((i) => i.actualizarApagado), 'C6 al salir de la vista, ningún ícono queda habilitado')
chk(iconos[0].guardarApagado, 'C7 y "Guardar vista" queda apagado cuando no hay nada que guardar')
// C8 · lo de #305 y #305b sigue en pie.
chk(
  (await menu(q).locator('.filtro-guardado .icon-btn').count()) === 9,
  'C8 los tres íconos de cada vista siguen presentes',
)
const opacidades = await q.evaluate(() =>
  [...document.querySelectorAll('.filtro-menu--portal .filtro-guardado .icon-btn')].map((e) => +getComputedStyle(e).opacity),
)
chk(opacidades.every((o) => o > 0), 'C8 y siguen visibles sin pasar el mouse', opacidades.join(' '))
await cerrarMenu(q)

// ═══════════════════════════════════════════════════════════════════════════
// #305d — Guardar vista, títulos de menú, rango de fechas y el globo del frente
// ═══════════════════════════════════════════════════════════════════════════

// ── D1 a D6 · El ícono de guardar sigue al asterisco ───────────────────────
// La reproducción exacta del pedido, con un criterio de ORDEN (no un filtro):
// es el caso donde la condición vieja —"hay algo puesto"— se apagaba por la
// razón equivocada.
console.log('\n── D1 a D6 · El ícono de guardar de cada vista ──')
const d = await sesion(1440, 900)
await abrirProyecto(d)

const senales = async () => {
  await abrirCtrl(d, 'Vistas')
  const r = await d.evaluate(() => ({
    asterisco: document.querySelector('.controles-ctrl--vistas .controles-btn').innerText.includes('*'),
    guardarVistaOff: document.querySelector('.filtro-op--guardar').disabled,
    filas: [...document.querySelectorAll('.filtro-menu--portal .filtro-guardado')].map((f) => ({
      nombre: f.querySelector('.filtro-guardado__aplicar').textContent.replace(/[✓*]/g, '').trim(),
      activa: f.classList.contains('filtro-guardado--activa'),
      encendido: !f.querySelector('.icon-btn').disabled,
    })),
  }))
  await cerrarMenu(d)
  return r
}
async function filtrarPor(pg, estado) {
  await abrirCtrl(pg, 'Filtrar')
  await menu(pg).locator('.filtro-op--campo', { hasText: 'Estado' }).click()
  await pg.waitForTimeout(300)
  await opcion(pg, estado).click()
  await pg.waitForTimeout(300)
  await cerrarMenu(pg)
}
async function ordenarPor(pg, i) {
  await abrirCtrl(pg, 'Ordenar')
  await menu(pg).locator('.orden-campo').nth(i).locator('.orden-campo__dir').first().click()
  await pg.waitForTimeout(400)
  await cerrarMenu(pg)
}
async function crearVista(pg, nombre) {
  await abrirCtrl(pg, 'Vistas')
  await menu(pg).locator('.filtro-op--guardar').click()
  await pg.waitForTimeout(400)
  await pg.locator('.modal-card input').first().fill(nombre)
  await pg.getByRole('button', { name: 'Guardar', exact: true }).click()
  await pg.waitForTimeout(800)
}

// Dos vistas guardadas, para comprobar que solo se enciende la de la activa.
await filtrarPor(d, 'Atrasada')
await crearVista(d, 'Vista A')
await d.locator('.controles-ctrl--vistas .controles-x').click()
await d.waitForTimeout(400)
await filtrarPor(d, 'Hecha')
await crearVista(d, 'Vista B')

let sn = await senales()
chk(
  !sn.asterisco && sn.filas.every((f) => !f.encendido),
  'D4 recién guardada: no hay asterisco y ningún ícono está encendido',
  sn.filas.map((f) => `${f.nombre}:${f.encendido ? 'ON' : 'off'}`).join(' '),
)

// D1 · agregar un criterio de ORDEN.
await ordenarPor(d, 0)
sn = await senales()
chk(sn.asterisco, 'D1 al agregar un orden aparece el asterisco')
chk(
  sn.filas.filter((f) => f.encendido).length === 1 && sn.filas.find((f) => f.activa)?.encendido,
  'D1/D5 y se enciende el ícono de ESA vista, solo el de ella',
  sn.filas.map((f) => `${f.nombre}:${f.encendido ? 'ON' : 'off'}`).join(' '),
)

// D2 · guardar: el asterisco desaparece y el ícono se apaga, AUNQUE el orden
// siga puesto. Con la condición vieja —"hay algo puesto"— seguía encendido.
await abrirCtrl(d, 'Vistas')
await menu(d).locator('.filtro-guardado--activa .icon-btn').first().click()
await d.waitForTimeout(800)
await cerrarMenu(d)
const ordenSigue = await d.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).count()
sn = await senales()
chk(ordenSigue === 1, 'D2 terreno: el orden sigue puesto después de guardar')
chk(!sn.asterisco, 'D2 el asterisco desaparece')
chk(
  sn.filas.every((f) => !f.encendido),
  'D2 y el ícono se apaga, aunque el orden siga puesto',
  sn.filas.map((f) => `${f.nombre}:${f.encendido ? 'ON' : 'off'}`).join(' '),
)

// D3 · quitar el orden: vuelve el asterisco y el ícono; guardar lo apaga.
await d.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).locator('.controles-x').click()
await d.waitForTimeout(500)
sn = await senales()
chk(
  sn.asterisco && sn.filas.find((f) => f.activa)?.encendido,
  'D3 al quitar el orden vuelven el asterisco y el ícono',
)
await abrirCtrl(d, 'Vistas')
await menu(d).locator('.filtro-guardado--activa .icon-btn').first().click()
await d.waitForTimeout(800)
await cerrarMenu(d)
sn = await senales()
chk(
  !sn.asterisco && sn.filas.every((f) => !f.encendido),
  'D3 y al guardar se apaga de nuevo',
)

// D6 · "Guardar vista" no cambia: depende de que haya filtro u orden puesto.
chk(!sn.guardarVistaOff, 'D6 "Guardar vista" sigue habilitado con un filtro puesto y una vista activa')
await d.locator('.controles-ctrl--vistas .controles-x').click()
await d.waitForTimeout(500)
sn = await senales()
chk(sn.guardarVistaOff, 'D6 y apagado cuando no queda nada que guardar')
await filtrarPor(d, 'Atrasada')
sn = await senales()
chk(!sn.guardarVistaOff, 'D6 se habilita con un filtro puesto aunque no haya vista activa')
chk(
  sn.filas.every((f) => !f.encendido),
  'D4 sin vista activa no hay ningún ícono encendido, aunque haya filtro',
)

// ── D7 a D9 · Los títulos que repetían el botón ────────────────────────────
console.log('\n── D7 a D9 · Los títulos de los menús ──')
await abrirCtrl(d, 'Filtrar')
let titulos = (await menu(d).locator('.filtro-menu__grupo').allInnerTexts()).map((t) => t.trim().toLowerCase())
chk(!titulos.includes('campos'), 'D7 al abrir Filtrar ya no dice "Campos"', titulos.join(' | '))
chk(titulos.includes('aplicado'), 'D7 y sí se conserva "Aplicado", que separa un grupo de verdad', titulos.join(' | '))
await menu(d).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await d.waitForTimeout(400)
const volver = (await menu(d).locator('.filtro-volver').innerText()).trim()
chk(volver === '‹ Fecha', 'D8 la cabecera del segundo nivel es una sola línea, "‹ Fecha"', volver)
chk(
  await menu(d).evaluate((m) => {
    const v = m.querySelector('.filtro-volver')
    const g = m.querySelector('.filtro-menu__grupo')
    return !g || g !== v.nextElementSibling
  }),
  'D8 y ya no hay un segundo renglón con el nombre del campo debajo',
)
await menu(d).locator('.filtro-volver').click()
await d.waitForTimeout(400)
chk(
  (await menu(d).locator('.filtro-op--campo').count()) > 0,
  'D8 y al tocarla vuelve al listado de campos',
)
await menu(d).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await d.waitForTimeout(400)
titulos = (await menu(d).locator('.filtro-menu__grupo').allInnerTexts()).map((t) => t.trim().toLowerCase())
chk(titulos.join('|') === 'rango fijo', 'D9 "Rango fijo" sigue estando', titulos.join(' | '))

// ── D10 a D12 · El rango de fechas cabe entero ─────────────────────────────
console.log('\n── D10 a D12 · Los dos campos de fecha ──')
const rangoFechas = await d.evaluate(() => {
  const m = document.querySelector('.filtro-menu--portal')
  const cs = getComputedStyle(m)
  const mr = m.getBoundingClientRect()
  const util = {
    izq: mr.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
    der: mr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
  }
  const ins = [...m.querySelectorAll('input[type=date]')].map((i) => {
    const r = i.getBoundingClientRect()
    return {
      izq: Math.round(r.left),
      der: Math.round(r.right),
      ancho: Math.round(r.width),
      // Si el navegador recorta el contenido del campo —y con él el ícono del
      // calendario— el campo desborda por dentro. Es EL límite del pedido.
      recorta: i.scrollWidth > i.clientWidth,
    }
  })
  return { anchoMenu: Math.round(mr.width), util: { izq: Math.round(util.izq), der: Math.round(util.der) }, ins }
})
chk(rangoFechas.ins.length === 2, 'D10 hay dos campos de fecha')
chk(
  rangoFechas.ins.every((i) => i.izq >= rangoFechas.util.izq - 1 && i.der <= rangoFechas.util.der + 1),
  'D10 los dos caben completos dentro del menú, sin cortarse por el borde',
  rangoFechas.ins.map((i) => `[${i.izq}-${i.der}]`).join(' ') + ` dentro de [${rangoFechas.util.izq}-${rangoFechas.util.der}]`,
)
chk(
  rangoFechas.ins.every((i) => !i.recorta),
  'D11 ninguno recorta su contenido: el ícono del calendario se ve entero',
  rangoFechas.ins.map((i) => `ancho=${i.ancho}`).join(' '),
)
// D12 · el rango sigue filtrando igual. Se mide el contador ANTES y DESPUÉS:
// en este punto ya hay un filtro de estado puesto, así que lo que prueba que
// el rango se aplicó es que el campo fecha sume su valor.
const nAntes = Number(
  (await d.locator('.controles-ctrl', { hasText: 'Filtrar' }).locator('.controles-btn__n').innerText().catch(() => '0')) || 0,
)
await menu(d).locator('input[type=date]').first().fill('2024-10-28')
await d.waitForTimeout(400)
await menu(d).locator('input[type=date]').nth(1).fill('2024-11-01')
await d.waitForTimeout(500)
await cerrarMenu(d)
await abrirCtrl(d, 'Filtrar')
const ficha = (await menu(d).locator('.filtro-ficha', { hasText: 'Fecha' }).innerText()).replace(/\s+/g, ' ')
chk(
  ficha.includes('2024-10-28') && ficha.includes('2024-11-01'),
  'D12 el rango de fechas queda puesto, con sus dos extremos',
  ficha,
)
const nDespues = Number(
  await d.locator('.controles-ctrl', { hasText: 'Filtrar' }).locator('.controles-btn__n').innerText(),
)
chk(
  nDespues === nAntes + 1,
  'D12 y el rango sigue filtrando: el campo fecha suma su valor al contador',
  `${nAntes} → ${nDespues}`,
)
await cerrarMenu(d)
await d.locator('.controles-ctrl--conx', { hasText: 'Filtrar' }).locator('.controles-x').click()
await d.waitForTimeout(400)

// ── D13 a D15 · El globo rápido del nombre ─────────────────────────────────
console.log('\n── D13 a D15 · El globo del nombre en la Gantt ──')
await verVista(d, 'Gantt')
for (const [sel, etiqueta] of [
  ['.gantt td.fija--frente .fija-tip', 'frente'],
  ['.gantt td.fija--sf .fija-tip', 'sub frente'],
]) {
  const el = d.locator(sel).first()
  await el.hover()
  // 120 ms: el globo del navegador tarda cerca de un segundo. Si a los 120 ms
  // ya está, no es el del navegador.
  await d.waitForTimeout(120)
  const globo = await d.evaluate((s) => {
    const e = document.querySelector(s)
    const st = getComputedStyle(e, '::after')
    const r = e.getBoundingClientRect()
    const sc = document.querySelector('.gantt-scroll').getBoundingClientRect()
    const ancho = parseFloat(st.width) || 0
    return {
      tip: e.getAttribute('data-tip'),
      titleNativo: e.getAttribute('title') ?? e.parentElement?.getAttribute('title') ?? null,
      contenido: st.content,
      // El globo se abre a la derecha: su borde derecho no puede pasarse del
      // scroll de la grilla, que es lo que recorta.
      entero: r.right + 6 + ancho <= sc.right,
    }
  }, sel)
  chk(!!globo.tip, `D13/D14 el nombre del ${etiqueta} tiene globo propio (data-tip)`, globo.tip ?? '')
  chk(globo.titleNativo === null, `D13/D14 y ya no usa el title del navegador, que es el lento`)
  chk(
    globo.contenido.includes(globo.tip ?? ' '),
    `D13/D14 el globo del ${etiqueta} aparece de inmediato al pasar el mouse`,
    globo.contenido,
  )
  chk(globo.entero, `D15 y se ve entero, sin cortarse contra el borde de la columna`, globo.contenido)
}
// La columna de tarea: su tarjeta ya lleva el título completo y es inmediata,
// así que no se le encima un segundo globo.
const tareaCel = d.locator('.gantt td.fija--tarea .tarea-cell__link, .gantt td.fija--tarea .inline-text').first()
await tareaCel.hover()
await d.waitForTimeout(120)
const tarjeta = await d.evaluate(() => {
  const hc = document.querySelector('.hovercard')
  return { hay: !!hc, titulo: hc?.querySelector('.hovercard__title')?.textContent?.trim() ?? null }
})
chk(tarjeta.hay, 'D14 en la columna de tarea la tarjeta aparece de inmediato')
chk(!!tarjeta.titulo, 'D14 y lleva el nombre completo de la tarea', tarjeta.titulo ?? '')
chk(
  (await d.locator('.gantt td.fija--tarea .fija-tip[data-tip]').count()) === 0,
  'D14 sin un segundo globo encima de la tarjeta',
)

// ── D16 · Los menús siguen midiendo todos lo mismo ─────────────────────────
console.log('\n── D16 · La caja de los menús ──')
const anchos = {}
for (const nombre of ['Filtrar', 'Ordenar', 'Rango']) {
  await abrirCtrl(d, nombre)
  anchos[nombre] = await menu(d).evaluate((e) => Math.round(e.getBoundingClientRect().width))
  await cerrarMenu(d)
}
await abrirCtrl(d, 'Filtrar')
await menu(d).locator('.filtro-op--campo', { hasText: 'Fecha' }).click()
await d.waitForTimeout(400)
anchos['Filtrar-Fecha'] = await menu(d).evaluate((e) => Math.round(e.getBoundingClientRect().width))
await cerrarMenu(d)
chk(
  new Set(Object.values(anchos)).size === 1 && Object.values(anchos)[0] === 280,
  'D16 los menús siguen midiendo todos lo mismo: la caja no cambia de tamaño',
  Object.entries(anchos).map(([k, v]) => `${k}=${v}`).join(' '),
)

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #321, #324, #305c y #305d — la Gantt ocupa lo que sobra, Mis Tareas tiene su encabezado y #305 queda cerrado')

