// #292 — Menú contextual con clic derecho sobre la tarea.
//
// Las acciones sobre una tarea existían SOLO en la columna de acciones de la
// tabla: Información, Archivar y Eliminar. **En la Gantt no había ninguna**, así
// que desde ahí no se podía archivar ni eliminar una tarea. Y renombrar no es un
// botón en ninguna parte: es un gesto, el clic sobre el nombre.
//
// El clic derecho sobre una tarea abre un menú con esas acciones, y la columna
// de acciones se queda como está. **No se crea ninguna acción nueva ni ningún
// permiso nuevo:** son las que ya existen, disponibles donde faltaban.
//
// Lo que decide qué opciones aparecen vive en UN solo lugar (`opcionesDeTarea`),
// así que la tabla y la Gantt no pueden separarse. Información no depende de
// ningún permiso: quien ve la tarea puede abrir su panel, así que el menú
// siempre tiene al menos una opción — a diferencia de la columna de acciones,
// que con cero permisos no se muestra.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-292-menu-contextual.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const TODAS = ['Información', 'Renombrar', 'Archivar', 'Eliminar']

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
// Se guardan los textos de confirmación para comprobarlos.
const dialogos = []
p.on('dialog', (d) => {
  dialogos.push(d.message())
  d.accept()
})
const esperar = (ms) => p.waitForTimeout(ms)

const opciones = () => p.locator('.menu-tarea__op').allInnerTexts()
/** Elige una opción del menú. Devuelve false si el menú no existe —el caso del
 *  control negativo—, para que la prueba siga y reporte TODO en vez de
 *  detenerse en el primer paso que depende de él. */
const elegir = async (texto, ms = 600) => {
  const op = p.locator('.menu-tarea__op', { hasText: texto }).first()
  if ((await op.count()) === 0) return false
  await op.click()
  await esperar(ms)
  return true
}
/** Clic derecho sobre una fila, si existe. Devuelve false si no está —el
 *  control negativo deja el terreno distinto—, para no detener la prueba. */
const clicDerechoEn = async (fila, celda = 'td.tarea-cell') => {
  if ((await fila.count()) === 0) return false
  await fila.locator(celda).click({ button: 'right' })
  await esperar(400)
  return true
}
/** Restaura la tarea archivada, si la hay. */
const restaurarArchivada = async () => {
  const bloque = p.locator('details.archivadas').first()
  if ((await bloque.count()) === 0) return false
  await bloque.locator('summary').click()
  await esperar(300)
  await bloque.locator('.link-btn', { hasText: 'Restaurar' }).first().click()
  await esperar(700)
  return true
}
const hayMenu = async () => (await p.locator('.menu-tarea').count()) > 0
/** Abre el menú de Filtrar, que es la vara de aspecto. */
const ctrlFiltrar = async () => {
  await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
  await esperar(500)
}
const cerrarMenu = async () => {
  await p.keyboard.press('Escape')
  await esperar(300)
}
const irAResumen = async () => {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(450)
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
const entrarComo = async (nombre) => {
  await p.goto(URL_APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await esperar(700)
  await p.getByText(nombre, { exact: true }).click()
  await esperar(1000)
}

await entrarComo('Daniela Vera')
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// 1 a 3 · En la tabla
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1 a 3 · El menú en la tabla ──')
const filaDe = (titulo) => p.locator('table.tareas tbody tr', { hasText: titulo }).first()
const PRIMERA = (await p.locator('table.tareas tbody .tarea-cell__link, table.tareas tbody .tarea-cell .inline-text').first().innerText()).trim()

await clicDerechoEn(filaDe(PRIMERA))
chk(await hayMenu(), '1 clic derecho sobre una fila de tarea abre el menú', PRIMERA)
chk(
  JSON.stringify(await opciones()) === JSON.stringify(TODAS),
  '1 con permisos completos muestra Información, Renombrar, Archivar y Eliminar',
  (await opciones()).join(' · '),
)
// El menú del navegador no aparece: el gesto queda consumido.
const consumido = await p.evaluate(() => {
  const td = document.querySelector('table.tareas tbody tr td.tarea-cell')
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })
  td.dispatchEvent(ev)
  return ev.defaultPrevented
})
chk(consumido, '1 y el menú del navegador no aparece: el gesto queda consumido')
await cerrarMenu()

// El menú vive fuera de la tabla, en su propia capa.
await clicDerechoEn(filaDe(PRIMERA), 'td.col-fecha')
chk(
  JSON.stringify(await opciones()) === JSON.stringify(TODAS),
  '1 se abre en CUALQUIERA de las celdas de la fila',
  'probado en la celda de fecha',
)
chk(
  await p.evaluate(() => document.querySelector('.menu-tarea')?.parentElement?.tagName === 'BODY'),
  '1 y se dibuja en una capa aparte, fuera de la tabla con scroll',
)
await cerrarMenu()

// 2 · la columna de acciones sigue como estaba.
const acciones = await p.evaluate(() => {
  const th = [...document.querySelectorAll('table.tareas thead th')].map((x) => x.textContent.trim())
  // Acotado a la PRIMERA tabla: hay una por sub frente y si no, se cuentan
  // los botones de todas.
  const fila = document.querySelector('table.tareas tbody tr')
  const btns = [...(fila?.querySelectorAll('td.col-acc button') ?? [])].map((x) => x.getAttribute('aria-label'))
  return { tieneColumna: th.includes('Acciones'), btns }
})
chk(acciones.tieneColumna, '2 la columna de acciones sigue estando')
chk(
  JSON.stringify(acciones.btns) === JSON.stringify(['Información', 'Archivar', 'Eliminar']),
  '2 y conserva sus tres botones',
  acciones.btns.join(' · '),
)

// 3 · Información abre el mismo panel que el ⓘ.
await clicDerechoEn(filaDe(PRIMERA))
await elegir('Información')
const porMenu = await p.evaluate(() => document.querySelector('.panel-detalle__titulo')?.textContent?.trim() ?? null)
await p.keyboard.press('Escape')
await esperar(400)
if ((await filaDe(PRIMERA).count()) > 0) {
  await filaDe(PRIMERA).locator('td.col-acc button[aria-label="Información"]').click()
  await esperar(600)
}
const porBoton = await p.evaluate(() => document.querySelector('.panel-detalle__titulo')?.textContent?.trim() ?? null)
await p.keyboard.press('Escape')
await esperar(400)
chk(
  porMenu !== null && porMenu === porBoton,
  '3 Información abre el mismo panel que el ⓘ de esa fila',
  `${porMenu}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// Aspecto · La vara es el menú de Filtrar
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Aspecto · Igual que el menú de Filtrar ──')
/** Lo que tiene que coincidir entre los dos menús, del contenedor y de una
 *  opción. Se comparan los valores CALCULADOS, no los declarados: así da igual
 *  cómo estén escritos, lo que se exige es que se vean iguales. */
const aspectoDe = (selMenu, selOp) =>
  p.evaluate(
    ([sm, so]) => {
      const m = document.querySelector(sm)
      if (!m) return null
      const op = m.querySelector(so)
      const c = getComputedStyle(m)
      const o = op ? getComputedStyle(op) : null
      return {
        caja: [
          c.backgroundColor,
          c.borderTopWidth,
          c.borderTopColor,
          c.borderRadius,
          c.padding,
          c.boxShadow,
          c.animationName,
          c.animationDuration,
        ].join(' | '),
        op: o ? [o.fontSize, o.padding, o.borderRadius, o.gap, o.color].join(' | ') : null,
      }
    },
    [selMenu, selOp],
  )

await ctrlFiltrar()
const varaFiltrar = await aspectoDe('.filtro-menu--portal', '.filtro-op')
await cerrarMenu()
await clicDerechoEn(filaDe(PRIMERA))
const elMenu = await aspectoDe('.menu-tarea', '.menu-tarea__op')
chk(
  varaFiltrar !== null && elMenu !== null && varaFiltrar.caja === elMenu.caja,
  '1 y 2 la caja se ve igual que la del menú de Filtrar, animación de entrada incluida',
  elMenu?.caja ?? 'sin menú',
)
chk(
  varaFiltrar?.op === elMenu?.op,
  '1 y 3 y cada opción también: mismo tamaño, mismo aire, mismo realce',
  elMenu?.op ?? 'sin opción',
)

// 4 · cada opción con su ícono, todos del mismo tamaño.
const iconos = await p.evaluate(() => {
  const svgs = [...document.querySelectorAll('.menu-tarea__icono svg')]
  return {
    cuantos: svgs.length,
    medidas: [...new Set(svgs.map((s) => `${s.getAttribute('width')}/${s.getAttribute('stroke-width')}`))],
    // Todos alineados entre sí: el mismo borde izquierdo.
    izquierdas: [...new Set(svgs.map((s) => Math.round(s.getBoundingClientRect().left)))],
  }
})
chk(
  iconos.cuantos === (await opciones()).length,
  '4 cada opción muestra su ícono a la izquierda',
  `${iconos.cuantos} íconos para ${(await opciones()).length} opciones`,
)
chk(
  iconos.medidas.length === 1 && iconos.izquierdas.length === 1,
  '4 todos del mismo tamaño y alineados entre sí',
  `${iconos.medidas.join(' · ')} · borde izquierdo ${iconos.izquierdas.join(',')}`,
)

// 5 · una sola línea, entre Renombrar y Archivar.
const bloques = () =>
  p.evaluate(() => {
    const m = document.querySelector('.menu-tarea')
    if (!m) return null
    return {
      hijos: [...m.children].map((x) => (x.className.includes('linea') ? '—' : x.textContent.trim())),
      lineas: m.querySelectorAll('.menu-tarea__linea').length,
    }
  })
const conTodo = await bloques()
chk(
  conTodo?.lineas === 1 &&
    JSON.stringify(conTodo.hijos) === JSON.stringify(['Información', 'Renombrar', '—', 'Archivar', 'Eliminar']),
  '5 hay UNA línea separadora, entre Renombrar y Archivar',
  conTodo?.hijos?.join(' ') ?? 'sin menú',
)

// 6 · Eliminar en rojo, Archivar no.
const colores = await p.evaluate(() => {
  const m = document.querySelector('.menu-tarea')
  const de = (t) => [...m.querySelectorAll('.menu-tarea__op')].find((x) => x.textContent.includes(t))
  const eliminar = de('Eliminar')
  const archivar = de('Archivar')
  const rojo = getComputedStyle(document.documentElement).getPropertyValue('--rojo').trim()
  const aRgb = (c) => {
    const d = document.createElement('span')
    d.style.color = c
    document.body.appendChild(d)
    const v = getComputedStyle(d).color
    d.remove()
    return v
  }
  const svgEliminar = eliminar?.querySelector('svg')
  return {
    textoEliminar: eliminar ? getComputedStyle(eliminar).color : null,
    // Sin ícono no hay nada que comparar: se devuelve null y la comprobación
    // falla con su motivo, en vez de romper la prueba.
    iconoEliminar: svgEliminar ? getComputedStyle(svgEliminar).color : null,
    textoArchivar: archivar ? getComputedStyle(archivar).color : null,
    rojoPaleta: aRgb(rojo),
    textoNormal: getComputedStyle(document.body).color,
  }
})
chk(
  colores.textoEliminar === colores.rojoPaleta && colores.iconoEliminar === colores.rojoPaleta,
  '6 Eliminar se ve en el rojo de la paleta, texto e ícono',
  `texto ${colores.textoEliminar} · ícono ${colores.iconoEliminar ?? 'no tiene'}`,
)
chk(
  colores.textoArchivar !== colores.rojoPaleta,
  '6 y Archivar no: se puede restaurar',
  colores.textoArchivar,
)
await cerrarMenu()

// ═══════════════════════════════════════════════════════════════════════════
// 4 · Renombrar
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 4 · Renombrar ──')
const renombrarDesdeMenu = async (fila) => {
  if (!(await clicDerechoEn(fila))) return false
  return elegir('Renombrar', 500)
}
await renombrarDesdeMenu(filaDe(PRIMERA))
// Ojo: mientras se edita, el nombre vive en el `value` del input y no en el
// texto de la fila, así que buscar la fila POR SU NOMBRE ya no la encuentra.
const editando = await p.evaluate(() => {
  const inp = document.querySelector('table.tareas .inline-input')
  return inp ? { valor: inp.value, enCeldaDeNombre: !!inp.closest('td.tarea-cell') } : null
})
chk(
  editando?.enCeldaDeNombre === true && editando.valor === PRIMERA,
  '4 Renombrar deja el nombre en modo edición, en el mismo lugar',
  editando ? `"${editando.valor}"` : 'sin input',
)
// Escape cancela.
await p.keyboard.press('Escape')
await esperar(400)
chk(
  (await p.locator('table.tareas tbody tr', { hasText: PRIMERA }).count()) > 0,
  '4 y Escape cancela: el nombre queda como estaba',
  PRIMERA,
)
// Enter guarda.
const NUEVO = `${PRIMERA} (renombrada)`
await renombrarDesdeMenu(filaDe(PRIMERA))
if (await p.locator('table.tareas .inline-input').count()) {
  await p.locator('table.tareas .inline-input').first().fill(NUEVO)
  await p.keyboard.press('Enter')
  await esperar(600)
}
chk(
  (await p.locator('table.tareas tbody tr', { hasText: NUEVO }).count()) > 0,
  '4 y Enter guarda el nombre nuevo',
  NUEVO,
)
// Se deja como estaba.
await renombrarDesdeMenu(filaDe(NUEVO))
if (await p.locator('table.tareas .inline-input').count()) {
  await p.locator('table.tareas .inline-input').first().fill(PRIMERA)
  await p.keyboard.press('Enter')
  await esperar(600)
}

// 13 · el menú se cierra al elegir, al hacer clic fuera y con Escape.
console.log('\n── 13 · Cómo se cierra ──')
await clicDerechoEn(filaDe(PRIMERA))
await elegir('Información', 500)
chk(!(await hayMenu()), '13 se cierra al elegir una opción')
await p.keyboard.press('Escape')
await esperar(400)
await clicDerechoEn(filaDe(PRIMERA))
await p.mouse.click(700, 120)
await esperar(400)
chk(!(await hayMenu()), '13 se cierra al hacer clic fuera')
await clicDerechoEn(filaDe(PRIMERA))
await p.keyboard.press('Escape')
await esperar(400)
chk(!(await hayMenu()), '13 y con Escape')

// 12 · contra el borde de abajo y de la derecha.
console.log('\n── 12 · Contra los bordes de la pantalla ──')
const abrirEn = async (x, y) => {
  await p.evaluate(
    ([px, py]) => {
      const td = document.querySelector('table.tareas tbody tr td.tarea-cell')
      td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: px, clientY: py }))
    },
    [x, y],
  )
  await esperar(400)
  return p.evaluate(() => {
    const m = document.querySelector('.menu-tarea')
    if (!m) return null
    const r = m.getBoundingClientRect()
    return {
      entero: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    }
  })
}
const esquina = await abrirEn(1438, 898)
chk(
  esquina?.entero,
  '12 abierto pegado al borde inferior derecho, se corre y se ve entero',
  esquina?.rect?.join(',') ?? 'sin menú',
)
await cerrarMenu()
const arribaIzq = await abrirEn(2, 2)
chk(arribaIzq?.entero, '12 y pegado al borde superior izquierdo también', arribaIzq?.rect?.join(',') ?? 'sin menú')
await cerrarMenu()

// ═══════════════════════════════════════════════════════════════════════════
// 5 · Archivar y Eliminar, con su confirmación
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 5 · Archivar y Eliminar ──')
/** El texto que pide la columna de acciones, para compararlo con el del menú. */
dialogos.length = 0
if ((await filaDe(PRIMERA).count()) > 0) {
  await filaDe(PRIMERA).locator('td.col-acc button[aria-label="Archivar"]').click()
  await esperar(700)
}
const textoBoton = dialogos[0] ?? ''
// Se restaura desde el bloque de archivadas.
await restaurarArchivada()
// Esta comprobación encontró un defecto real: la fila restaurada se REMONTA, y
// si el pulso de "Renombrar" sigue encendido de un rato antes, vuelve con el
// nombre en modo edición sola. El pulso se atiende una vez (ver `InlineText`).
chk(
  (await p.locator('table.tareas tbody tr', { hasText: PRIMERA }).count()) > 0 &&
    (await p.locator('table.tareas .inline-input').count()) === 0,
  '4 una tarea renombrada antes, al archivarse y restaurarse, NO vuelve en modo edición',
  `${await p.locator('table.tareas .inline-input').count()} campos abiertos`,
)

dialogos.length = 0
await clicDerechoEn(filaDe(PRIMERA))
await elegir('Archivar', 700)
chk(
  dialogos[0] === textoBoton,
  '5 Archivar pide EXACTAMENTE la misma confirmación que el botón de la tabla',
  dialogos[0] ?? 'sin confirmación',
)
chk(
  (await p.locator('details.archivadas').count()) > 0,
  '5 y hace lo mismo: la tarea queda archivada',
)
await restaurarArchivada()

// Eliminar: sobre una tarea creada para eso.
await p.locator('.fila-add button, .fila-add .btn').first().click()
await esperar(400)
await p.locator('input[placeholder^="Título de la tarea"]').first().fill('Tarea para eliminar')
await p.keyboard.press('Enter')
await esperar(900)
await p.keyboard.press('Escape')
await esperar(400)
dialogos.length = 0
await clicDerechoEn(filaDe('Tarea para eliminar'))
await elegir('Eliminar', 800)
chk(
  /Eliminar definitivamente/.test(dialogos[0] ?? ''),
  '5 Eliminar pide la confirmación de siempre',
  dialogos[0] ?? 'sin confirmación',
)
chk(
  (await p.locator('table.tareas tbody tr', { hasText: 'Tarea para eliminar' }).count()) === 0,
  '5 y la tarea desaparece',
)

// ═══════════════════════════════════════════════════════════════════════════
// 6 a 9 · En la Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 6 a 9 · El menú en la Gantt ──')
await verVista('Gantt')
const celdaNombre = p.locator('.gantt tbody td.fija--tarea').first()
await celdaNombre.click({ button: 'right' })
await esperar(400)
chk(
  JSON.stringify(await opciones()) === JSON.stringify(TODAS),
  '6 clic derecho sobre el nombre de una tarea abre el mismo menú',
  (await opciones()).join(' · '),
)
await cerrarMenu()

// 6 · archivar funciona desde la Gantt — que es donde no existía.
const nombreGantt = (await p.locator('.gantt tbody td.fija--tarea .fija-txt').first().innerText()).trim()
dialogos.length = 0
await celdaNombre.click({ button: 'right' })
await esperar(400)
await elegir('Archivar', 800)
chk(
  /Archivar la tarea/.test(dialogos[0] ?? ''),
  '6 y archivar funciona desde la Gantt, donde antes no existía',
  dialogos[0] ?? 'sin confirmación',
)
chk(
  (await p.locator('.gantt tbody td.fija--tarea .fija-txt', { hasText: nombreGantt }).count()) === 0,
  '6 la tarea archivada sale de la grilla',
  nombreGantt,
)
await verVista('Tabla')
await restaurarArchivada()
await verVista('Gantt')

// 7 · sobre una marca: marca como lista, sin abrir el menú.
// Tiene que ser una marca ACCIONABLE: la de "fecha anterior" es solo rastro y
// el clic derecho ahí no hace nada, así que no probaría nada.
const marca = p.locator('.gantt tbody td.celda .marca-wrap--click:has(.mark--pendiente)').first()
const antesDeMarca = await p.evaluate(() => document.querySelectorAll('.gantt .mark--hecha').length)
await marca.click({ button: 'right' })
await esperar(600)
chk(!(await hayMenu()), '7 clic derecho sobre una marca NO abre el menú')
const despuesDeMarca = await p.evaluate(() => document.querySelectorAll('.gantt .mark--hecha').length)
chk(
  despuesDeMarca !== antesDeMarca,
  '7 y sigue marcando la tarea como lista, igual que hoy',
  `${antesDeMarca} → ${despuesDeMarca} marcas de hecha`,
)
await marca.click({ button: 'right' })
await esperar(600)

// 8 · sobre una celda vacía de la grilla: nada.
const vacia = p.locator('.gantt tbody td.celda:not(:has(.marca-wrap))').first()
await vacia.click({ button: 'right' })
await esperar(400)
chk(!(await hayMenu()), '8 clic derecho sobre una celda vacía de la grilla no abre nada')

// 9 · frente, sub frente y filas de carga.
for (const [etiqueta, sel] of [
  ['9 el frente', '.gantt tbody td.fija--frente'],
  ['9 el sub frente', '.gantt tbody td.fija--sf'],
  ['9 una fila de carga por persona', '.gantt tr.carga-fila td.fija--tarea'],
]) {
  const loc = p.locator(sel).first()
  if ((await loc.count()) === 0) {
    chk(false, `${etiqueta}: terreno — no está en pantalla`)
    continue
  }
  await loc.click({ button: 'right' })
  await esperar(400)
  chk(!(await hayMenu()), `${etiqueta} no abre el menú`)
  await cerrarMenu()
}

// ═══════════════════════════════════════════════════════════════════════════
// 14 · Mis Tareas
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 14 · En Mis Tareas ──')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(1000)
await p.locator('table.tareas tbody tr').first().locator('td.tarea-cell').click({ button: 'right' })
await esperar(400)
chk(
  JSON.stringify(await opciones()) === JSON.stringify(['Información', 'Archivar', 'Eliminar']),
  '14 en la tabla de Mis Tareas trae las acciones, sin Renombrar',
  (await opciones()).join(' · '),
)
// Y el motivo: en esta tabla el nombre NO es editable —abre el panel—, así que
// ofrecer Renombrar prometería algo que no pasaría.
chk(
  (await p.locator('table.tareas tbody .tarea-cell .inline-text').count()) === 0 &&
    (await p.locator('table.tareas tbody .tarea-cell__link').count()) > 0,
  '14 terreno: en la tabla de Mis Tareas el nombre abre el panel, no la edición',
)
// 8 · sin Renombrar, la línea no queda suelta: sigue separando lo destructivo.
const sinRenombrar = await bloques()
chk(
  sinRenombrar?.lineas === 1 &&
    JSON.stringify(sinRenombrar.hijos) === JSON.stringify(['Información', '—', 'Archivar', 'Eliminar']),
  '8 sin Renombrar la línea sigue en su sitio, sin quedar suelta',
  sinRenombrar?.hijos?.join(' ') ?? 'sin menú',
)
await cerrarMenu()
await verVista('Gantt')
await p.locator('.gantt tbody td.fija--tarea').first().click({ button: 'right' })
await esperar(400)
chk(
  JSON.stringify(await opciones()) === JSON.stringify(TODAS),
  '14 y en su Gantt también',
  (await opciones()).join(' · '),
)
await cerrarMenu()

// ═══════════════════════════════════════════════════════════════════════════
// 7 · En modo oscuro
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 7 · En modo oscuro ──')
await abrirProyecto()
// El conmutador Tabla/Gantt se recuerda, y el bloque anterior lo dejó en Gantt.
await verVista('Tabla')
await p.locator('.sesion__tema').first().click()
await esperar(800)
await clicDerechoEn(filaDe(PRIMERA))
const oscuro = await p.evaluate(() => {
  const m = document.querySelector('.menu-tarea')
  if (!m) return null
  const de = (t) => [...m.querySelectorAll('.menu-tarea__op')].find((x) => x.textContent.includes(t))
  const linea = m.querySelector('.menu-tarea__linea')
  const c = getComputedStyle(m)
  const rojo = getComputedStyle(document.documentElement).getPropertyValue('--rojo').trim()
  const aRgb = (col) => {
    const d = document.createElement('span')
    d.style.color = col
    document.body.appendChild(d)
    const v = getComputedStyle(d).color
    d.remove()
    return v
  }
  const luz = (col) => col.match(/\d+/g).slice(0, 3).reduce((a, n) => a + Number(n), 0)
  return {
    fondoMenu: luz(c.backgroundColor),
    fondoPagina: luz(getComputedStyle(document.body).backgroundColor),
    textoNormal: luz(getComputedStyle(de('Archivar')).color),
    rojoEliminar: getComputedStyle(de('Eliminar')).color,
    rojoPaleta: aRgb(rojo),
    lineaVisible: !!linea && luz(getComputedStyle(linea).backgroundColor) !== luz(c.backgroundColor),
  }
})
chk(oscuro !== null, '7 terreno: en modo oscuro el menú sigue abriéndose')
chk(
  !!oscuro && oscuro.fondoMenu < 250 && oscuro.textoNormal > 400,
  '7 el menú toma el fondo oscuro y su texto se lee claro sobre él',
  `fondo ${oscuro.fondoMenu} · texto ${oscuro.textoNormal}`,
)
chk(
  !!oscuro && oscuro.rojoEliminar === oscuro.rojoPaleta,
  '7 y Eliminar usa el rojo de la paleta, que tiene su propio valor en oscuro',
  oscuro?.rojoEliminar ?? 'sin menú',
)
chk(oscuro?.lineaVisible === true, '7 la línea separadora se distingue del fondo')
await cerrarMenu()
// Se vuelve al modo claro para lo que sigue.
await p.locator('.sesion__tema').first().click()
await esperar(800)

// ═══════════════════════════════════════════════════════════════════════════
// 15 · En mobile no existe
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 15 · En mobile ──')
// De vuelta al proyecto: la columna de acciones que este criterio mira es la
// suya, no la de Mis Tareas.
await verVista('Tabla')
await abrirProyecto()
await p.setViewportSize({ width: 420, height: 820 })
await esperar(900)
await p.locator('table.tareas tbody tr').first().locator('td.tarea-cell').click({ button: 'right' })
await esperar(500)
chk(!(await hayMenu()), '15 en mobile, el clic derecho o la pulsación larga no abren ningún menú')
const accMovil = await p.evaluate(() => {
  const fila = document.querySelector('table.tareas tbody tr')
  const btns = [...(fila?.querySelectorAll('td.col-acc button') ?? [])]
  return btns
    .filter((x) => getComputedStyle(x).display !== 'none')
    .map((x) => x.getAttribute('aria-label'))
})
chk(
  JSON.stringify(accMovil) === JSON.stringify(['Información']),
  '15 y la columna de acciones se ve igual que hoy: solo Información',
  accMovil.length ? accMovil.join(' · ') : 'ninguno',
)
await p.setViewportSize({ width: 1440, height: 900 })
await esperar(700)

// ═══════════════════════════════════════════════════════════════════════════
// 10 y 11 · Según los permisos
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 11 · Un usuario sin permisos sobre tareas ──')
await entrarComo('Cliente Arauco')
await abrirProyecto()
const sinColumna = await p.evaluate(() =>
  [...document.querySelectorAll('table.tareas thead th')].map((x) => x.textContent.trim()).includes('Acciones'),
)
chk(!sinColumna, '11 terreno: a este usuario la columna de acciones no se le muestra')
await p.locator('table.tareas tbody tr').first().locator('td.tarea-cell').click({ button: 'right' })
await esperar(400)
chk(await hayMenu(), '11 el menú SÍ se abre, aunque no tenga ningún permiso')
chk(
  JSON.stringify(await opciones()) === JSON.stringify(['Información']),
  '11 y muestra Información sola',
  (await opciones()).join(' · '),
)
const soloInfo = await bloques()
chk(
  soloInfo?.lineas === 0,
  '8 con Información sola no hay ninguna línea: no sobra al principio ni al final',
  soloInfo?.hijos?.join(' ') ?? 'sin menú',
)
await cerrarMenu()

// 10 · con permiso de marcar hechas y nada más.
console.log('\n── 10 · Un usuario que solo puede marcar hechas ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await p.getByRole('button', { name: 'Miembros' }).first().click()
await esperar(600)
await p.locator('.miembro', { hasText: 'Cliente Arauco' }).locator('button[aria-label^="Permisos"]').click()
await esperar(600)
// Los permisos sobre tareas no son Sí/No: son No · Solo asignadas · Todas.
await p
  .locator('.permiso-item', { hasText: 'Marcar como hechas' })
  .locator('button', { hasText: 'Todas' })
  .first()
  .click()
await esperar(600)
const puestos = await p.evaluate(() =>
  [...document.querySelectorAll('.permiso-item')].map((x) => {
    const l = x.querySelector('.permiso-item__label')?.firstChild?.textContent?.trim() ?? '?'
    const on = [...x.querySelectorAll('button')].find((b) => b.getAttribute('aria-checked') === 'true')
    return `${l}:${on?.textContent?.trim()}`
  }),
)
// El modal NO guarda solo: hay que pulsar "Guardar permisos". Con Escape el
// cambio se descartaba y el cliente seguía sin ningún permiso, así que este
// caso no se distinguía del 11.
await p.locator('.modal-acciones button', { hasText: 'Guardar permisos' }).click()
await esperar(700)
await p.keyboard.press('Escape')
await esperar(500)
chk(
  puestos.some((x) => /Marcar como hechas:Todas/.test(x)),
  '10 terreno: al cliente se le da SOLO el permiso de marcar hechas',
  puestos.join(' · '),
)

// Se cambia de usuario SIN limpiar el almacenamiento: el permiso recién dado
// vive ahí, y `entrarComo` lo borraría.
await p.locator('.sesion__salir').first().click()
await esperar(900)
await p.getByText('Cliente Arauco', { exact: true }).click()
await esperar(1100)
await abrirProyecto()
await p.locator('table.tareas tbody tr').first().locator('td.tarea-cell').click({ button: 'right' })
await esperar(400)
chk(
  JSON.stringify(await opciones()) === JSON.stringify(['Información']),
  '10 con permiso de marcar hechas y nada más, el menú muestra Información y no muestra Archivar ni Eliminar',
  (await opciones()).join(' · '),
)
const casillas = await p.evaluate(() => {
  const b = [...document.querySelectorAll('table.tareas tbody .check-hecha')]
  return { total: b.length, habilitadas: b.filter((x) => !x.disabled).length }
})
chk(
  casillas.habilitadas > 0,
  '10 terreno: y ese usuario sí puede marcar hechas, así que el permiso llegó',
  `${casillas.habilitadas} de ${casillas.total} casillas habilitadas`,
)
await cerrarMenu()

await b.close()
console.log(
  process.exitCode
    ? '\n⛔ HAY FALLAS'
    : '\n✅ #292 — el clic derecho abre las acciones de la tarea en las dos vistas, con las mismas reglas',
)
