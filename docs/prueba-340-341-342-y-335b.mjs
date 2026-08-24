// #340 · #341 · #342, y las dos correcciones de #335.
//
// #335b·1 — El velo de la fila resaltada era 10% de negro en claro, y sobre una
// celda blanca dejaba un gris casi idéntico al de las líneas de la grilla: las
// líneas desaparecían y la fila se leía como una franja gris maciza. Baja a 6%.
// En oscuro NO cambia —ahí el velo aclara y las líneas son oscuras—.
//
// #335b·2 — La fila sobre la que se abrió el menú queda resaltada MIENTRAS el
// menú está abierto: al ir a elegir una opción el mouse se va de la fila. Y
// mientras está abierto, el mouse deja de resaltar otras: si las dos quedaran
// iguales no se entendería sobre cuál está abierto.
//
// #340 — La tarjeta flotante de la tarea sale del producto. Casi todo lo que
// mostraba ya está a la vista —estado, responsable y fecha son columnas; la
// cadena de fechas ya está dibujada en la grilla—, y desde #335 además tapa la
// grilla justo cuando se está recorriendo una fila.
//
// #341 — La fila de creación se dibujaba con el verde suave de las tareas
// hechas. El verde significa "terminada" y esa fila es una tarea que todavía no
// existe: va sin color.
//
// #342 — Una tarea creada se colaba en un filtro que no cumple. Ver el informe
// en el CHANGELOG: lo forzado a la vista se soltaba en cuatro sitios para la
// tarea de una notificación y solo en "Actualizar vista" para las recién
// creadas.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-340-341-342-y-335b.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
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
const pasarMouse = async (loc, ms = 500) => {
  if ((await loc.count()) === 0) return false
  await loc.first().hover()
  await esperar(ms)
  return true
}
const pulsarSiEsta = async (loc, ms = 500) => {
  if ((await loc.count()) === 0) return false
  await loc.first().click()
  await esperar(ms)
  return true
}
const clicDerechoEn = async (fila) => {
  if ((await fila.count()) === 0) return false
  const celda = fila.locator('td.tarea-cell, td.fija--tarea').first()
  if ((await celda.count()) === 0) return false
  await celda.click({ button: 'right' })
  await esperar(500)
  return true
}
const elegir = async (texto, ms = 900) => {
  const op = p.locator('.menu-tarea__op', { hasText: texto }).first()
  if ((await op.count()) === 0) return false
  await op.click()
  await esperar(ms)
  return true
}
const filasTabla = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('table.tareas tbody tr')]
      .map((r) => {
        const n = r.querySelector('.tarea-cell__link, .tarea-cell .inline-text')
        return n
          ? {
              t: n.textContent.trim(),
              estado: r.querySelector('.col-estado')?.textContent.trim(),
              fecha: r.querySelector('.col-fecha')?.textContent.trim(),
              resp: r.querySelector('.col-resp')?.textContent.trim(),
            }
          : null
      })
      .filter(Boolean),
  )
const nombresGantt = () =>
  p.evaluate(() => [...document.querySelectorAll('.gantt td.fija--tarea .fija-txt')].map((x) => x.textContent.trim()))
const hayActualizarVista = async () =>
  (await p.locator('.controles-btn', { hasText: 'Actualizar vista' }).count()) > 0
/** Filtra por Estado con las categorías indicadas. */
const filtrarEstado = async (...cuales) => {
  await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
  await esperar(450)
  await p.locator('.filtro-op', { hasText: 'Estado' }).first().click()
  await esperar(450)
  for (const c of cuales) {
    await p.locator('.filtro-op', { hasText: c }).first().click()
    await esperar(350)
  }
  await p.keyboard.press('Escape')
  await esperar(700)
}
const limpiarFiltro = async () => {
  await pulsarSiEsta(p.locator('.controles-x[aria-label="Limpiar todos los filtros"]'), 800)
}
/** El velo y el acento de una fila. */
const medirFila = (sel, i = 0) =>
  p.evaluate(
    ([s, idx, naranja]) => {
      const r = document.querySelectorAll(s)[idx]
      if (!r) return null
      const tds = [...r.querySelectorAll('td')]
      return {
        celdas: tds.length,
        conVelo: tds.filter((td) => getComputedStyle(td).backgroundImage !== 'none').length,
        velo: getComputedStyle(tds[0]).backgroundImage,
        acento: tds.filter((td) => getComputedStyle(td).boxShadow.includes(naranja)).length,
      }
    },
    [sel, i, NARANJA],
  )

await entrarComo('Daniela Vera')
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// #341 · La fila de creación va sin color
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #341 · La fila de creación ──')
const verdeHecha = await p.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--verde-suave').trim(),
)
const superficie = await p.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim(),
)
// 1 · desde "+ Tarea".
await pulsarSiEsta(p.locator('table.tareas').first().locator('.fila-add button', { hasText: '+ Tarea' }), 600)
const bgMasTarea = await p.evaluate(() => {
  const td = document.querySelector('tr.fila-nueva td')
  return td ? getComputedStyle(td).backgroundColor : null
})
chk(
  bgMasTarea === 'rgb(255, 255, 255)',
  '#341·1 la fila de "+ Tarea" se ve en blanco, no en verde',
  `${bgMasTarea} · el verde de "hecha" es ${verdeHecha}, la superficie ${superficie}`,
)
// 6 · la fila "+ Tarea" en reposo no cambió.
await p.keyboard.press('Escape')
await esperar(500)
chk(
  (await p.locator('table.tareas').first().locator('.fila-add button', { hasText: '+ Tarea' }).count()) > 0,
  '#341·6 la fila "+ Tarea" en reposo sigue igual',
)
// 2 · desde "Agregar tarea abajo".
const filaTabla = p.locator('table.tareas tbody tr.fila-tarea')
await clicDerechoEn(filaTabla.nth(1))
await elegir('Agregar tarea abajo', 600)
const bgAbajo = await p.evaluate(() => {
  const td = document.querySelector('tr.fila-nueva td')
  return td ? getComputedStyle(td).backgroundColor : null
})
chk(bgAbajo === 'rgb(255, 255, 255)', '#341·2 y la de "Agregar tarea abajo" también', bgAbajo ?? 'sin fila')
// 7 · escribir, guardar y cancelar siguen funcionando.
const antes341 = await filasTabla()
if ((await p.locator('tr.fila-nueva input.inline-input').count()) > 0) {
  await p.locator('tr.fila-nueva input.inline-input').first().fill('Nueva sin color')
  await p.keyboard.press('Enter')
  await esperar(900)
}
const tras341 = await filasTabla()
const nueva341 = tras341.find((f) => f.t === 'Nueva sin color')
chk(
  tras341.length === antes341.length + 1 && !!nueva341,
  '#341·7 escribir y guardar con Enter sigue funcionando',
  `${antes341.length} → ${tras341.length} tareas`,
)
// 5 · la tarea nueva queda sin color.
const claseNueva = await p.evaluate(() => {
  const f = [...document.querySelectorAll('table.tareas tbody tr.fila-tarea')].find((r) =>
    r.textContent.includes('Nueva sin color'),
  )
  return f ? { clase: f.className, bg: getComputedStyle(f.querySelector('td')).backgroundColor } : null
})
// "Sin color" es que la celda no pone fondo: el blanco lo pone la tabla. Solo
// las cuatro categorías con color lo declaran.
chk(
  claseNueva && !/fila--/.test(claseNueva.clase) && claseNueva.bg === 'rgba(0, 0, 0, 0)',
  '#341·5 y al guardarla la tarea queda sin color, como cualquier pendiente sin fecha',
  claseNueva ? `clase "${claseNueva.clase}" · fondo ${claseNueva.bg}` : 'no está',
)
// 3 · el "+" de la Gantt.
await verVista('Gantt')
const filaG = p.locator('.gantt tbody tr.gfila-tarea')
await pasarMouse(filaG.first().locator('td.fija--tarea'), 350)
await pulsarSiEsta(filaG.first().locator('button[aria-label="Agregar tarea abajo"]'), 600)
const bgGantt = await p.evaluate(() => {
  const td = document.querySelector('.gantt td.fija--input')
  return td ? getComputedStyle(td).backgroundColor : null
})
chk(
  bgGantt !== null && !/230, 244, 234/.test(bgGantt),
  '#341·3 el campo del "+" de la Gantt tampoco se ve verde',
  bgGantt ?? 'sin campo',
)
await p.keyboard.press('Escape')
await esperar(500)
// 4 · sub frente y frente.
const rot = p.locator('.gantt tbody td.fija--sf').first()
await pasarMouse(rot, 350)
await pulsarSiEsta(rot.locator('.mas-btn'), 600)
const bgSub = await p.evaluate(() => {
  const i = document.querySelector('input.crear-inline')
  return i ? getComputedStyle(i.closest('td')).backgroundColor : null
})
chk(
  bgSub === null || !/230, 244, 234/.test(bgSub),
  '#341·4 la fila de crear un sub frente tampoco',
  bgSub ?? '(no tiene fila propia)',
)
await p.keyboard.press('Escape')
await esperar(500)

// ═══════════════════════════════════════════════════════════════════════════
// #340 · La tarjeta flotante sale del producto
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #340 · La tarjeta flotante ──')
// 2 · en la Gantt, sobre el nombre y sobre la marca.
await pasarMouse(p.locator('.gantt td.fija--tarea .inline-text, .gantt td.fija--tarea .tarea-cell__link'), 900)
chk((await p.locator('.hovercard').count()) === 0, '#340·2 en la Gantt, el nombre no muestra ninguna tarjeta')
const marca = p.locator('.gantt .marca-wrap').first()
chk((await marca.count()) > 0, '#340·2 terreno: hay marcas en la grilla', `${await p.locator('.gantt .marca-wrap').count()}`)
await pasarMouse(marca, 900)
chk((await p.locator('.hovercard').count()) === 0, '#340·2 y la marca de la grilla tampoco')
// 4 · los globos de texto corto de #327 siguen.
await p.mouse.move(4, 4)
await esperar(400)
await pasarMouse(p.locator('.gantt td.fija--sf .fija-tip'), 900)
chk(
  (await p.locator('.globo-tip').count()) > 0,
  '#340·4 el globo del nombre del sub frente sigue funcionando',
)
await p.mouse.move(4, 4)
await esperar(400)
await pasarMouse(p.locator('.gantt td.fija--tarea .mas-btn'), 900)
chk((await p.locator('.globo-tip').count()) > 0, '#340·4 y la ayuda de los botones también')
await p.mouse.move(4, 4)
await esperar(500)
// 6 · la caja "Fecha anterior" de los contadores sigue.
chk(
  (await p.locator('.counters').innerText()).toLowerCase().includes('fecha anterior'),
  '#340·6 la fila de contadores conserva su caja "Fecha anterior"',
)
// 1 · en la tabla.
await verVista('Tabla')
await pasarMouse(p.locator('table.tareas tbody .tarea-cell .inline-text, table.tareas tbody .tarea-cell__link'), 900)
chk((await p.locator('.hovercard').count()) === 0, '#340·1 en la tabla, el nombre no muestra ninguna tarjeta')
// 5 · el panel de detalle sigue con la fecha original y el historial.
await pulsarSiEsta(p.locator('table.tareas tbody td.col-acc button[aria-label="Información"]'), 900)
const panel = await p.evaluate(() => {
  const a = document.querySelector('.panel-detalle')
  if (!a) return null
  return { texto: a.innerText, hist: !!a.querySelector('.panel-detalle__hist') }
})
chk(
  !!panel && panel.hist && /original/i.test(panel.texto),
  '#340·5 el panel de detalle sigue mostrando la fecha original y el historial',
)
await p.keyboard.press('Escape')
await esperar(500)
// 3 · en Mis Tareas, tabla y Gantt.
await irAMisTareas()
await pasarMouse(p.locator('table.tareas tbody .tarea-cell__link, table.tareas tbody .tarea-cell .inline-text'), 900)
chk((await p.locator('.hovercard').count()) === 0, '#340·3 en la tabla de Mis Tareas tampoco')
await verVista('Gantt')
await pasarMouse(p.locator('.gantt td.fija--tarea .inline-text, .gantt td.fija--tarea .tarea-cell__link'), 900)
chk((await p.locator('.hovercard').count()) === 0, '#340·3 y en su Gantt tampoco')
await p.mouse.move(4, 4)
await esperar(400)

// ═══════════════════════════════════════════════════════════════════════════
// #335b · 1 a 4 · El velo más suave
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #335b · 1 a 4 · El velo más suave ──')
await abrirProyecto()
await verVista('Gantt')
const velos = await p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return { menu: cs.getPropertyValue('--velo').trim(), fila: cs.getPropertyValue('--velo-fila').trim() }
})
chk(
  /0?\.06\b/.test(velos.fila),
  '#335b·1 el velo de modo claro baja a 6%',
  `menú ${velos.menu} · fila ${velos.fila}`,
)
// 1 · las líneas de la grilla se siguen viendo dentro de la fila resaltada.
await pasarMouse(p.locator('.gantt tbody tr.gfila-tarea').nth(3))
const grilla = await p.evaluate(() => {
  const r = document.querySelectorAll('.gantt tbody tr.gfila-tarea')[3]
  const celda = r?.querySelector('td.celda')
  if (!celda) return null
  const cs = getComputedStyle(celda)
  // El velo se aplica sobre el blanco de la tabla: el compuesto es 255*(1-a).
  const a = parseFloat((cs.backgroundImage.match(/rgba\(0, 0, 0, ([\d.]+)\)/) ?? [])[1] ?? '0')
  const compuesto = Math.round(255 * (1 - a))
  const linea = parseInt((cs.borderRightColor.match(/rgb\((\d+)/) ?? [])[1] ?? '0', 10)
  return { alfa: a, compuesto, linea, separacion: Math.abs(compuesto - linea) }
})
chk(
  !!grilla && grilla.separacion >= 8,
  '#335b·1 dentro de la fila resaltada, la línea de la grilla se sigue distinguiendo del fondo',
  grilla
    ? `fondo compuesto ${grilla.compuesto} · línea ${grilla.linea} · separación ${grilla.separacion} (al 10% era 2)`
    : 'sin celda',
)
// 3 · las cuatro categorías conservan su color.
await verVista('Tabla')
for (const [clase, etiqueta] of [
  ['fila--rojo', 'roja'],
  ['fila--verde', 'verde'],
  ['fila--ambar', 'ámbar'],
  ['fila--morado', 'morada'],
]) {
  const fila = p.locator(`table.tareas tbody tr.${clase}`).first()
  if ((await fila.count()) === 0) {
    chk(false, `#335b·3 terreno: no hay ninguna fila ${etiqueta}`)
    continue
  }
  const antes = await p.evaluate((c) => {
    const r = document.querySelector(`table.tareas tbody tr.${c}`)
    return getComputedStyle(r.querySelector('td')).backgroundColor
  }, clase)
  await pasarMouse(fila, 350)
  const con = await p.evaluate((c) => {
    const r = document.querySelector(`table.tareas tbody tr.${c}`)
    const td = r.querySelector('td')
    return { bg: getComputedStyle(td).backgroundColor, velo: getComputedStyle(td).backgroundImage !== 'none' }
  }, clase)
  chk(
    con.velo && con.bg === antes,
    `#335b·3 la fila ${etiqueta} se resalta y conserva su color`,
    `${antes} → ${con.bg}`,
  )
}
// 4 · en oscuro todo igual que antes.
await p.locator('.sesion__tema').first().click()
await esperar(800)
const veloOscuro = await p.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--velo-fila').trim(),
)
chk(
  /0?\.14\b/.test(veloOscuro),
  '#335b·4 en modo oscuro el velo NO cambia: sigue en 14% de blanco',
  veloOscuro,
)
await p.locator('.sesion__tema').first().click()
await esperar(700)

// ═══════════════════════════════════════════════════════════════════════════
// #335b · 5 a 8 · La fila del menú abierto
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #335b · 5 a 8 · La fila queda marcada con el menú abierto ──')
await clicDerechoEn(p.locator('table.tareas tbody tr.fila-tarea').nth(1))
await pasarMouse(p.locator('.menu-tarea__op').first(), 500)
const conMenu = await medirFila('tr.fila-tarea--menu')
chk(
  !!conMenu && conMenu.conVelo === conMenu.celdas && conMenu.acento === 1,
  '#335b·5 con el mouse dentro del menú, la fila sigue resaltada, con velo y línea',
  conMenu ? `${conMenu.conVelo} de ${conMenu.celdas} celdas · ${conMenu.acento} acento` : 'ninguna fila marcada',
)
// 7 · pasar el mouse por otra fila: solo la del menú queda resaltada.
//
// Ojo: se mueve el mouse a mano y no con `.hover()`. Playwright desplaza el
// elemento a la vista antes de posarse encima, y el menú se cierra al detectar
// scroll —a propósito, para no quedar flotando lejos de lo que lo abrió—, así
// que `.hover()` cerraba justo lo que se quiere comprobar.
const otra = await p.locator('table.tareas tbody tr.fila-tarea').nth(3).boundingBox()
if (otra) await p.mouse.move(otra.x + otra.width / 2, otra.y + otra.height / 2)
await esperar(450)
const resaltadas = await p.evaluate(
  (naranja) =>
    [...document.querySelectorAll('tr.fila-tarea, tr.gfila-tarea')].filter((r) =>
      [...r.querySelectorAll('td')].some((td) => getComputedStyle(td).boxShadow.includes(naranja)),
    ).length,
  NARANJA,
)
const esLaDelMenu = await p.evaluate(
  (naranja) => {
    const marcada = [...document.querySelectorAll('tr.fila-tarea')].find((r) =>
      [...r.querySelectorAll('td')].some((td) => getComputedStyle(td).boxShadow.includes(naranja)),
    )
    return !!marcada && marcada.className.includes('fila-tarea--menu')
  },
  NARANJA,
)
chk(
  resaltadas === 1 && esLaDelMenu,
  '#335b·7 con el menú abierto, pasar el mouse por otra fila NO la resalta: se entiende sobre cuál está abierto',
  `${resaltadas} filas resaltadas`,
)
// 6 · los tres modos de cerrar el menú sueltan el resaltado fijo.
await p.keyboard.press('Escape')
await esperar(500)
chk((await p.locator('tr.fila-tarea--menu').count()) === 0, '#335b·6 con Escape el resaltado deja de estar fijo')
await clicDerechoEn(p.locator('table.tareas tbody tr.fila-tarea').nth(1))
await p.mouse.click(700, 60)
await esperar(600)
chk((await p.locator('tr.fila-tarea--menu').count()) === 0, '#335b·6 con un clic fuera también')
await clicDerechoEn(p.locator('table.tareas tbody tr.fila-tarea').nth(1))
await elegir('Información', 900)
chk((await p.locator('tr.fila-tarea--menu').count()) === 0, '#335b·6 y eligiendo una opción también')
await p.keyboard.press('Escape')
await esperar(500)
// 8 · lo mismo en la Gantt y en Mis Tareas.
await verVista('Gantt')
await clicDerechoEn(p.locator('.gantt tbody tr.gfila-tarea').nth(2))
await pasarMouse(p.locator('.menu-tarea__op').first(), 500)
const conMenuG = await medirFila('tr.gfila-tarea--menu')
chk(
  !!conMenuG && conMenuG.conVelo === conMenuG.celdas && conMenuG.acento === 1,
  '#335b·8 en la Gantt igual',
  conMenuG ? `${conMenuG.conVelo} de ${conMenuG.celdas} celdas` : 'ninguna fila marcada',
)
await p.keyboard.press('Escape')
await esperar(500)
await irAMisTareas()
await clicDerechoEn(p.locator('table.tareas tbody tr.fila-tarea').first())
await pasarMouse(p.locator('.menu-tarea__op').first(), 500)
const conMenuMT = await medirFila('tr.fila-tarea--menu')
chk(
  !!conMenuMT && conMenuMT.conVelo === conMenuMT.celdas && conMenuMT.acento === 1,
  '#335b·8 y en Mis Tareas también',
  conMenuMT ? `${conMenuMT.conVelo} de ${conMenuMT.celdas} celdas` : 'ninguna fila marcada',
)
await p.keyboard.press('Escape')
await esperar(500)

// ═══════════════════════════════════════════════════════════════════════════
// #342 · Lo creado no se cuela en un filtro puesto DESPUÉS
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #342 · Crear, y filtrar después ──')
const SIN_FECHA = (f) => f.fecha === 'Planificar'

// 1 · duplicar sin filtro, y filtrar después por un estado que la copia no cumple.
await entrarComo('Daniela Vera')
await abrirProyecto()
const antes342 = await filasTabla()
await clicDerechoEn(p.locator('table.tareas tbody tr.fila-tarea').nth(1))
await elegir('Duplicar tarea', 1000)
const tras342 = await filasTabla()
chk(
  tras342.length === antes342.length + 1,
  '#342·1 terreno: la copia se creó, pendiente y sin fecha',
  tras342[2] ? `${tras342[2].t} · ${tras342[2].estado} · ${tras342[2].fecha}` : '',
)
await filtrarEstado('Atrasada')
const conEstado = await filasTabla()
chk(
  conEstado.length > 0 && !conEstado.some(SIN_FECHA),
  '#342·1 al filtrar por "Atrasada" DESPUÉS, la copia no aparece',
  conEstado.map((f) => `${f.t}/${f.estado}`).join(' · '),
)
chk(!(await hayActualizarVista()), '#342·1 y "Actualizar vista" no se enciende por ella')
// 5 · tocar "Actualizar vista" con un filtro puesto deja solo lo que cumple.
await limpiarFiltro()

// 2 · lo mismo filtrando por fecha y por responsable.
await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
await esperar(450)
await p.locator('.filtro-op', { hasText: 'Fecha' }).first().click()
await esperar(450)
await p.locator('.filtro-op', { hasText: 'Con fecha' }).first().click()
await esperar(500)
await p.keyboard.press('Escape')
await esperar(700)
const conFecha = await filasTabla()
chk(
  !conFecha.some(SIN_FECHA),
  '#342·2 filtrando por "Con fecha", la copia sin fecha tampoco aparece',
  `${conFecha.length} tareas, ninguna sin fecha`,
)
chk(!(await hayActualizarVista()), '#342·2 y "Actualizar vista" sigue apagado')
await limpiarFiltro()

// 4 · crear con "Agregar tarea abajo" y con el "+" de la Gantt.
await clicDerechoEn(p.locator('table.tareas tbody tr.fila-tarea').nth(1))
await elegir('Agregar tarea abajo', 600)
if ((await p.locator('tr.fila-nueva input.inline-input').count()) > 0) {
  await p.locator('tr.fila-nueva input.inline-input').first().fill('Creada abajo')
  await p.keyboard.press('Enter')
  await esperar(900)
}
await filtrarEstado('Atrasada')
const trasAbajo = await filasTabla()
chk(
  !trasAbajo.some((f) => f.t === 'Creada abajo'),
  '#342·4 con "Agregar tarea abajo" pasa lo mismo: no se cuela',
  trasAbajo.map((f) => f.t).join(' · '),
)
chk(!(await hayActualizarVista()), '#342·4 y "Actualizar vista" tampoco se enciende')
await limpiarFiltro()
await verVista('Gantt')
await pasarMouse(p.locator('.gantt tbody tr.gfila-tarea').first().locator('td.fija--tarea'), 350)
await pulsarSiEsta(p.locator('.gantt tbody tr.gfila-tarea').first().locator('button[aria-label="Agregar tarea abajo"]'), 600)
if ((await p.locator('input.crear-inline').count()) > 0) {
  await p.locator('input.crear-inline').first().fill('Creada en la grilla')
  await p.keyboard.press('Enter')
  await esperar(900)
}
await filtrarEstado('Atrasada')
chk(
  !(await nombresGantt()).includes('Creada en la grilla'),
  '#342·4 y con el "+" de la Gantt tampoco',
  (await nombresGantt()).join(' · '),
)
chk(!(await hayActualizarVista()), '#342·4 y "Actualizar vista" tampoco')

// 3 · crear CON el filtro ya puesto sigue funcionando como define #320/#333.
console.log('\n── #342 · 3 · Crear CON el filtro ya puesto no cambia ──')
const visiblesAntes = await nombresGantt()
chk(visiblesAntes.length > 0, '#342·3 terreno: con el filtro puesto quedan tareas a la vista', `${visiblesAntes.length}`)
await clicDerechoEn(p.locator('.gantt tbody tr.gfila-tarea').first())
await elegir('Duplicar tarea', 1000)
const visiblesTras = await nombresGantt()
chk(
  visiblesTras.length === visiblesAntes.length + 1 && visiblesTras[1] === visiblesAntes[0],
  '#342·3 duplicar CON el filtro puesto deja la copia visible, debajo de la original',
  visiblesTras.slice(0, 3).join(' · '),
)
chk(await hayActualizarVista(), '#342·3 y "Actualizar vista" se enciende, como define #320 y #333')
// 5 · tocar "Actualizar vista" deja solo lo que cumple.
await pulsarSiEsta(p.locator('.controles-btn', { hasText: 'Actualizar vista' }), 900)
const trasActualizar = await nombresGantt()
chk(
  trasActualizar.length === visiblesAntes.length && !(await hayActualizarVista()),
  '#342·5 tocar "Actualizar vista" recalcula y deja solo lo que cumple',
  `${visiblesTras.length} → ${trasActualizar.length} tareas`,
)

await b.close()
