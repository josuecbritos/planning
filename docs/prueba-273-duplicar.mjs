// #273 — Duplicar tareas desde el menú del clic derecho.
//
// No se podía duplicar una tarea: para repetir una había que crearla de nuevo y
// volver a escribir el título y el responsable a mano.
//
// Duplicar **es crear con los campos de otra tarea ya puestos**, así que pasa
// por el MISMO camino que "Agregar tarea debajo" (#328) en vez de por uno
// propio: misma posición, mismos permisos, misma foto congelada (#333). Y por
// eso la copia **no existe hasta confirmar**: con Escape no se crea nada.
//
// **La copia nace limpia:** sin fecha, sin replanificaciones, sin color, sin
// comentarios y sin las marcas de hecha ni archivada. No es una omisión, es la
// definición — el historial y los comentarios son registro de lo que PASÓ con
// la original, no parte de qué es la tarea; y la fecha no se copia porque si
// viniera vencida la copia nacería atrasada y ensuciaría los contadores por algo
// recién creado.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-273-duplicar.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

const SEIS = ['Información', 'Renombrar', 'Agregar tarea debajo', 'Duplicar', 'Archivar', 'Eliminar']

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
const verVista = async (cual) => {
  await p.getByRole('button', { name: cual, exact: true }).first().click()
  await esperar(1200)
}
const opciones = () => p.locator('.menu-tarea__op').allInnerTexts()
/** Clic derecho sobre una fila; devuelve false si no hay celda de tarea —el
 *  control negativo deja el terreno distinto—, para que la prueba siga y
 *  reporte TODO en vez de detenerse en el primer paso que depende de él. */
const clicDerechoEn = async (fila) => {
  if ((await fila.count()) === 0) return false
  const celda = fila.locator('td.tarea-cell, td.fija--tarea').first()
  if ((await celda.count()) === 0) return false
  await celda.click({ button: 'right' })
  await esperar(450)
  return true
}
const elegir = async (texto, ms = 700) => {
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
/** Filtro de Estado: deja Pendientes y Atrasadas (congela la vista). */
const ponerFiltroEstado = async () => {
  await p.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
  await esperar(400)
  await p.locator('.filtro-op', { hasText: 'Estado' }).first().click()
  await esperar(400)
  await p.locator('.filtro-op', { hasText: 'Pendiente' }).first().click()
  await esperar(350)
  await p.locator('.filtro-op', { hasText: 'Atrasada' }).first().click()
  await esperar(350)
  await p.keyboard.press('Escape')
  await esperar(500)
}
const hayActualizarVista = async () =>
  (await p.locator('.controles-btn', { hasText: 'Actualizar vista' }).count()) > 0

/** Títulos de la tabla de un sub frente, por su índice. */
const tablaTitulos = (i = 0) =>
  p.evaluate((idx) => {
    const t = document.querySelectorAll('table.tareas')[idx]
    if (!t) return []
    return [...t.querySelectorAll('tbody tr')]
      .map((r) => r.querySelector('.tarea-cell__link, .tarea-cell .inline-text'))
      .filter(Boolean)
      .map((n) => n.textContent.trim())
  }, i)
/** Filas de tarea de la Gantt, con su sub frente. */
const ganttFilas = () =>
  p.evaluate(() => {
    const out = []
    let sub = '?'
    document.querySelectorAll('.gantt tbody tr').forEach((r) => {
      const rot = [...r.querySelectorAll('td.fija--rotula')]
      if (rot.length) sub = rot[rot.length - 1].textContent.trim().replace(/\+$/, '')
      const t = r.querySelector('td.fija--tarea .con-mas .fija-txt')
      if (t) out.push({ sub, titulo: t.textContent.trim() })
    })
    return out
  })
const ganttDe = async (sub) => (await ganttFilas()).filter((x) => x.sub.startsWith(sub)).map((x) => x.titulo)
/** Los cinco contadores del encabezado, sumados. */
const totalContadores = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.counters .counter__num')]
      .map((c) => parseInt(c.textContent.trim(), 10))
      .filter((n) => !Number.isNaN(n))
      .reduce((a, n) => a + n, 0),
  )
/** La fila que sigue a la de `titulo` en la tabla: la copia recién creada. */
const filaDespuesDe = (titulo) =>
  p.evaluate((t) => {
    const filas = [...document.querySelectorAll('table.tareas tbody tr')].filter((r) =>
      r.querySelector('.tarea-cell__link, .tarea-cell .inline-text'),
    )
    const i = filas.findIndex(
      (r) => r.querySelector('.tarea-cell__link, .tarea-cell .inline-text').textContent.trim() === t,
    )
    const f = i >= 0 ? filas[i + 1] : null
    if (!f) return null
    return {
      titulo: f.querySelector('.tarea-cell__link, .tarea-cell .inline-text').textContent.trim(),
      clase: f.className,
      estado: f.querySelector('.col-estado')?.textContent.trim(),
      fecha: f.querySelector('.col-fecha')?.textContent.trim(),
      replan: f.querySelector('.replan-count')?.textContent.trim() ?? null,
    }
  }, titulo)
/** El estado guardado del repo de memoria. Escribe SOLO al mutar, así que hay
 *  que haber tocado algo antes de leerlo. */
const estadoGuardado = () =>
  p.evaluate(() => {
    const raw = localStorage.getItem('planificador.state.v1')
    return raw ? JSON.parse(raw) : null
  })

await entrarComo('Daniela Vera')
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// 13 · Las seis opciones, en su orden
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 13 · El menú, con seis opciones ──')
const filaTabla = (titulo) => p.locator('table.tareas tbody tr', { hasText: titulo }).first()
const antes = await tablaTitulos(0)

await clicDerechoEn(filaTabla(antes[1]))
const ops = await opciones()
chk(JSON.stringify(ops) === JSON.stringify(SEIS), '13 el menú muestra las seis opciones en su orden', ops.join(' · '))
chk(
  (await p.locator('.menu-tarea__linea').count()) === 1,
  '13 sigue habiendo UNA sola línea, y Duplicar queda arriba de ella, junto a "Agregar tarea debajo"',
)

// ═══════════════════════════════════════════════════════════════════════════
// 1 a 5 · Duplicar en la tabla
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1 a 5 · Duplicar en la tabla ──')
// La segunda tarea del primer sub frente tiene responsable y fecha.
const original = await p.evaluate(() => {
  const f = document.querySelectorAll('table.tareas')[0].querySelectorAll('tbody tr')[1]
  return {
    titulo: f.querySelector('.tarea-cell__link, .tarea-cell .inline-text').textContent.trim(),
    resp: f.querySelector('.col-resp')?.textContent.trim(),
    fecha: f.querySelector('.col-fecha')?.textContent.trim(),
  }
})
chk(
  !!original.resp && original.fecha !== 'Planificar',
  '1 terreno: la tarea elegida tiene responsable y fecha',
  `${original.titulo} · ${original.resp} · ${original.fecha}`,
)
chk((await opciones()).includes('Duplicar'), '1 el menú de esa tarea muestra Duplicar')

// 5 · Escape no crea nada. Se comprueba ANTES para que el terreno sea el mismo.
await elegir('Duplicar', 600)
const abierta = await p.locator('tr.fila-nueva input.inline-input').count()
await p.keyboard.press('Escape')
await esperar(800)
const trasEscape = await tablaTitulos(0)
chk(
  abierta > 0 && JSON.stringify(trasEscape) === JSON.stringify(antes),
  '5 con Escape la copia NO se crea y la lista queda como estaba',
  `${trasEscape.length} tareas (antes ${antes.length})`,
)

// 2 · el título copiado, en edición y seleccionado; el mismo responsable.
await clicDerechoEn(filaTabla(antes[1]))
await elegir('Duplicar', 600)
const campo = await p.evaluate(() => {
  const i = document.querySelector('tr.fila-nueva input.inline-input')
  if (!i) return null
  const tr = i.closest('tr')
  const tabla = tr.closest('table')
  return {
    valor: i.value,
    seleccion: [i.selectionStart, i.selectionEnd],
    indice: [...tabla.querySelectorAll('tbody tr')].indexOf(tr),
    resp: tr.querySelector('.col-resp')?.textContent.trim(),
  }
})
chk(campo?.valor === original.titulo, '2 el campo arranca con el título de la original', campo?.valor ?? 'sin campo')
chk(
  campo && campo.seleccion[0] === 0 && campo.seleccion[1] === original.titulo.length,
  '2 y llega SELECCIONADO: se ajusta escribiendo, o se deja igual con Enter',
  campo ? `${campo.seleccion[0]}–${campo.seleccion[1]} de ${original.titulo.length}` : 'sin campo',
)
chk(campo?.indice === 2, '2 la fila aparece justo debajo de la original', `índice ${campo?.indice}`)
chk(campo?.resp === original.resp, '2 con el mismo responsable', `${campo?.resp} vs ${original.resp}`)

// 4 · Enter sin escribir nada: las dos conviven con el mismo nombre.
await p.keyboard.press('Enter')
await esperar(1000)
const trasEnter = await tablaTitulos(0)
chk(
  trasEnter[1] === original.titulo && trasEnter[2] === original.titulo,
  '4 Enter sin escribir deja la copia con el mismo título, y las dos conviven',
  trasEnter.slice(0, 4).join(' · '),
)

// 3 · la copia nace limpia.
const copia = await p.evaluate(() => {
  const f = document.querySelectorAll('table.tareas')[0].querySelectorAll('tbody tr')[2]
  return {
    clase: f.className,
    fecha: f.querySelector('.col-fecha')?.textContent.trim(),
    estado: f.querySelector('.col-estado')?.textContent.trim(),
    replan: f.querySelector('.replan-count')?.textContent.trim() ?? null,
    atraso: f.querySelector('.col-desv')?.textContent.trim(),
  }
})
chk(copia.fecha === 'Planificar', '3 la copia no tiene fecha objetivo', copia.fecha)
chk(
  !/fila--/.test(copia.clase) && copia.replan === null,
  '3 y no tiene color ni muestra ↻ ×N',
  `clase "${copia.clase}" · replan ${copia.replan ?? '(ninguno)'} · estado ${copia.estado} · atraso ${copia.atraso}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 8 · Los contadores suman una
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 8 · Los contadores ──')
const totalDespues = await totalContadores()
await clicDerechoEn(filaTabla(antes[3]))
await elegir('Duplicar', 600)
await p.keyboard.press('Enter')
await esperar(1000)
const totalMas = await totalContadores()
chk(totalMas === totalDespues + 1, '8 los contadores suman una tarea', `${totalDespues} → ${totalMas}`)
const categoria = await filaDespuesDe(antes[3])
chk(
  categoria?.titulo === antes[3] && categoria.estado === 'Pendiente' && !/fila--/.test(categoria.clase),
  '8 y la nueva cae en la categoría sin color',
  categoria ? `${categoria.estado} · clase "${categoria.clase}"` : 'no está la copia',
)

// ═══════════════════════════════════════════════════════════════════════════
// 7 · Duplicar una tarea hecha
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 7 · Una tarea hecha ──')
const hechas = await p.evaluate(() => {
  const out = []
  document.querySelectorAll('table.tareas tbody tr').forEach((r) => {
    const c = r.querySelector('.check-hecha')
    const n = r.querySelector('.tarea-cell__link, .tarea-cell .inline-text')
    if (c && n && (c.checked || c.getAttribute('aria-checked') === 'true' || r.className.includes('verde'))) {
      out.push(n.textContent.trim())
    }
  })
  return out
})
chk(hechas.length > 0, '7 terreno: hay al menos una tarea hecha', hechas.slice(0, 2).join(' · '))
if (hechas.length > 0) {
  await clicDerechoEn(filaTabla(hechas[0]))
  await elegir('Duplicar', 600)
  await p.keyboard.press('Enter')
  await esperar(1000)
  const dosIguales = await p.evaluate((titulo) => {
    const filas = [...document.querySelectorAll('table.tareas tbody tr')].filter((r) => {
      const n = r.querySelector('.tarea-cell__link, .tarea-cell .inline-text')
      return n && n.textContent.trim() === titulo
    })
    return filas.map((r) => {
      const c = r.querySelector('.check-hecha')
      return { marcada: !!c && (c.checked || c.getAttribute('aria-checked') === 'true'), clase: r.className }
    })
  }, hechas[0])
  chk(
    dosIguales.length === 2 && dosIguales.some((x) => !x.marcada),
    '7 la copia de una tarea hecha NO queda marcada como hecha',
    dosIguales.map((x) => (x.marcada ? 'marcada' : 'sin marcar')).join(' · '),
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 · Comentarios, historial y descripción
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 6 · Comentarios, historial y descripción ──')
// La descripción existe en la tarea pero HOY no se escribe desde ninguna
// pantalla, así que se inyecta en el estado guardado. El repo de memoria
// escribe solo al mutar, y a esta altura ya se mutó de sobra.
const inyectado = await p.evaluate(() => {
  const raw = localStorage.getItem('planificador.state.v1')
  if (!raw) return null
  const s = JSON.parse(raw)
  const t = s.tareas.find((x) => x.titulo.startsWith('Análisis de cuentas'))
  if (!t) return null
  t.descripcion = 'Descripción de la original'
  localStorage.setItem('planificador.state.v1', JSON.stringify(s))
  return {
    id: t.id,
    titulo: t.titulo,
    comentarios: s.comentarios.filter((c) => c.tareaId === t.id).length,
    replan: (s.historial ?? []).filter((h) => h.tareaId === t.id).length,
  }
})
chk(
  !!inyectado && inyectado.comentarios > 0 && inyectado.replan > 0,
  '6 terreno: la tarea elegida tiene comentarios e historial de replanificaciones',
  inyectado ? `${inyectado.titulo}: ${inyectado.comentarios} comentarios · ${inyectado.replan} replanificaciones` : 'sin estado guardado',
)
// El repo de memoria escribe SOLO al mutar. En la corrida normal ya se duplicó
// varias veces; en el control contra `main` no se pudo duplicar nada, así que no
// hay estado que leer y esta sección no tiene terreno donde correr.
if (inyectado) {
await p.reload()
await esperar(1400)
// La recarga no conserva la pantalla: hay que volver a entrar al proyecto.
await abrirProyecto()
const duplicoConDesc = await clicDerechoEn(filaTabla(inyectado.titulo))
chk(duplicoConDesc, '6 terreno: la tarea con comentarios sigue a la vista tras recargar')
await elegir('Duplicar', 600)
await p.keyboard.press('Enter')
await esperar(1000)

const tras = await estadoGuardado()
const orig = tras?.tareas.find((t) => t.id === inyectado.id)
const nueva = tras?.tareas.find(
  (t) => t.titulo === inyectado.titulo && t.id !== inyectado.id && t.subFrenteId === orig.subFrenteId,
)
chk(!!nueva, '6 terreno: la copia existe en el estado guardado', nueva?.id ?? 'no está')
chk(
  nueva?.descripcion === 'Descripción de la original',
  '6 la descripción SÍ se copia',
  nueva?.descripcion ?? '(vacía)',
)
chk(
  nueva && nueva.responsableId === orig.responsableId && !nueva.fechaObjetivo && !nueva.hecha && !nueva.archivada,
  '6 y la copia nace sin fecha, sin marca de hecha y sin archivar, con el mismo responsable',
  nueva ? `resp ${nueva.responsableId} · fecha ${nueva.fechaObjetivo ?? '(ninguna)'} · hecha ${!!nueva.hecha} · archivada ${!!nueva.archivada}` : '',
)
const nuevosComentarios = tras?.comentarios.filter((c) => c.tareaId === nueva?.id).length ?? -1
const nuevoHistorial = (tras?.historial ?? []).filter((h) => h.tareaId === nueva?.id).length
chk(
  nuevosComentarios === 0 && nuevoHistorial === 0,
  '6 la copia no tiene ni comentarios ni historial',
  `${nuevosComentarios} comentarios · ${nuevoHistorial} replanificaciones`,
)
const origComentarios = tras?.comentarios.filter((c) => c.tareaId === inyectado.id).length ?? -1
const origHistorial = (tras?.historial ?? []).filter((h) => h.tareaId === inyectado.id).length
chk(
  origComentarios === inyectado.comentarios && origHistorial === inyectado.replan,
  '6 y la original conserva los suyos intactos',
  `${origComentarios} comentarios · ${origHistorial} replanificaciones`,
)
// Y lo mismo visto desde el panel, que es como lo mira una persona. Se abre con
// el ⓘ de su fila y NO con el clic sobre el nombre: en la tabla de un proyecto
// ese clic edita el título (el detalle vive en el ⓘ, y desde #292 también en el
// menú).
const filasIguales = p.locator('table.tareas tbody tr', { hasText: inyectado.titulo })
chk((await filasIguales.count()) === 2, '6 terreno: la original y su copia conviven en la tabla')
if ((await filasIguales.count()) > 1) {
  await filasIguales.nth(1).locator('td.col-acc button[aria-label="Información"]').first().click()
  await esperar(900)
}
const panel = await p.evaluate(() => {
  const a = document.querySelector('.panel-detalle')
  if (!a) return null
  return {
    hist: a.querySelector('.panel-detalle__hist')?.textContent.trim().slice(0, 40),
    comentarios: a.querySelector('.comentario-vacio')?.textContent.trim() ?? null,
    desc: a.querySelector('.panel-detalle__desc')?.textContent.trim() ?? null,
  }
})
chk(
  panel?.comentarios === 'Sin comentarios aún.' && /Sin replanificaciones/.test(panel?.hist ?? ''),
  '6 el panel de la copia no muestra ni comentarios ni replanificaciones',
  `${panel?.comentarios ?? 'sin panel'} · ${panel?.hist ?? ''}`,
)
chk(
  panel?.desc === 'Descripción de la original',
  '6 y sí muestra la descripción heredada',
  panel?.desc ?? '(ninguna)',
)
await p.keyboard.press('Escape')
await esperar(500)
}

// ═══════════════════════════════════════════════════════════════════════════
// 9 · Lo mismo desde la Gantt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 9 · Duplicar desde la Gantt ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await verVista('Gantt')
const filaGantt = (titulo) =>
  p.locator('.gantt tbody tr', { has: p.locator('td.fija--tarea .con-mas') }).filter({ hasText: titulo }).first()
const SUB_G = 'Procesos Financieros'
const antesG = await ganttDe(SUB_G)
await clicDerechoEn(filaGantt(antesG[1]))
const opsG = await opciones()
chk(JSON.stringify(opsG) === JSON.stringify(SEIS), '9 el menú de la Gantt muestra las mismas seis', opsG.join(' · '))
await elegir('Duplicar', 600)
const campoG = await p.evaluate(() => {
  const i = document.querySelector('input.crear-inline')
  return i ? { valor: i.value, seleccion: [i.selectionStart, i.selectionEnd] } : null
})
chk(
  campoG?.valor === antesG[1] && campoG.seleccion[1] === antesG[1].length,
  '9 el campo de la Gantt también arranca con el título de la original, seleccionado',
  campoG ? `"${campoG.valor}" ${campoG.seleccion[0]}–${campoG.seleccion[1]}` : 'sin campo',
)
await p.keyboard.press('Enter')
await esperar(1000)
const trasG = await ganttDe(SUB_G)
chk(
  trasG[2] === antesG[1],
  '9 la copia aparece justo debajo de la original',
  trasG.slice(0, 4).join(' · '),
)
const marcasCopia = await p.evaluate((titulo) => {
  const filas = [...document.querySelectorAll('.gantt tbody tr')].filter((r) => {
    const t = r.querySelector('td.fija--tarea .con-mas .fija-txt')
    return t && t.textContent.trim() === titulo
  })
  return filas.map((r) => r.querySelectorAll('td.celda .marca, td.celda [class*="mk-"]').length)
}, antesG[1])
chk(
  marcasCopia.length === 2 && marcasCopia[1] === 0,
  '9 y sin ninguna marca en la grilla',
  marcasCopia.join(' · '),
)
// 5 en la Gantt: Escape tampoco crea. Acá importa más que en la tabla, porque
// el campo llega con texto y el guardado por foco-fuera sí crearía.
const cuantasG = (await ganttDe(SUB_G)).length
await clicDerechoEn(filaGantt(antesG[0]))
await elegir('Duplicar', 600)
await p.keyboard.press('Escape')
await esperar(900)
chk(
  (await ganttDe(SUB_G)).length === cuantasG,
  '5 en la Gantt, Escape tampoco crea la copia',
  `${(await ganttDe(SUB_G)).length} tareas (antes ${cuantasG})`,
)

// ═══════════════════════════════════════════════════════════════════════════
// 12 · Con un filtro puesto
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 12 · Con un filtro puesto ──')
await entrarComo('Daniela Vera')
await abrirProyecto()
await verVista('Gantt')
await ponerFiltroEstado()
chk(!(await hayActualizarVista()), '12 terreno: con el filtro recién puesto, "Actualizar vista" está apagado')
const conFiltro = await ganttFilas()
const cuentas = {}
for (const f of conFiltro) cuentas[f.sub] = (cuentas[f.sub] ?? 0) + 1
const SUB_F = Object.keys(cuentas).find((s) => cuentas[s] >= 3)
const visiblesF = await ganttDe(SUB_F)
chk(!!SUB_F, '12 terreno: hay un sub frente con tres o más tareas visibles', `${SUB_F}: ${visiblesF.length}`)
await clicDerechoEn(filaGantt(visiblesF[1]))
await elegir('Duplicar', 600)
await p.keyboard.press('Enter')
await esperar(1000)
const trasF = await ganttDe(SUB_F)
chk(
  trasF[2] === visiblesF[1] && trasF[1] === visiblesF[1],
  '12 con filtro puesto, la copia aparece justo debajo de la original',
  trasF.join(' · '),
)
chk(await hayActualizarVista(), '12 y "Actualizar vista" queda encendido')

// ═══════════════════════════════════════════════════════════════════════════
// 11 · Mis Tareas
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 11 · Mis Tareas ──')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(1200)
await clicDerechoEn(p.locator('table.tareas tbody tr').first())
const opsMT = await opciones()
chk(!opsMT.includes('Duplicar'), '11 la tabla de Mis Tareas NO muestra Duplicar', opsMT.join(' · '))
await cerrarMenu()
await verVista('Gantt')
await clicDerechoEn(p.locator('.gantt tbody tr', { has: p.locator('td.fija--tarea .con-mas') }).first())
const opsMTG = await opciones()
chk(!opsMTG.includes('Duplicar'), '11 y su Gantt tampoco', opsMTG.join(' · '))
await cerrarMenu()

// ═══════════════════════════════════════════════════════════════════════════
// 10 · Sin permiso de crear tareas
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 10 · Sin permiso de crear tareas ──')
await entrarComo('Cliente Arauco')
await abrirProyecto()
await clicDerechoEn(p.locator('table.tareas tbody tr').first())
const opsCliente = await opciones()
chk(
  !opsCliente.includes('Duplicar') && opsCliente.includes('Información'),
  '10 sin permiso de crear tareas, Duplicar no aparece',
  opsCliente.join(' · '),
)
await cerrarMenu()

// Y con el permiso dado —pero sin control total—, sí aparece: lo que la gobierna
// es crear tareas, el mismo permiso que el "+" de la Gantt.
await entrarComo('Daniela Vera')
await abrirProyecto()
await p.getByRole('button', { name: 'Miembros' }).first().click()
await esperar(600)
await p.locator('.miembro', { hasText: 'Cliente Arauco' }).locator('button[aria-label^="Permisos"]').click()
await esperar(600)
await p.locator('.permiso-item', { hasText: 'Crear tareas' }).locator('button', { hasText: 'Sí' }).first().click()
await esperar(400)
await p.locator('.modal-acciones button', { hasText: 'Guardar permisos' }).click()
await esperar(700)
await p.keyboard.press('Escape')
await esperar(500)
// Se cambia de usuario SIN limpiar el almacenamiento: el permiso vive ahí.
await p.locator('.sesion__salir').first().click()
await esperar(900)
await p.getByText('Cliente Arauco', { exact: true }).click()
await esperar(1100)
await abrirProyecto()
await clicDerechoEn(p.locator('table.tareas tbody tr').first())
const opsConPermiso = await opciones()
chk(
  opsConPermiso.includes('Duplicar'),
  '10 con el permiso de crear tareas —y sin control total— Duplicar sí aparece',
  opsConPermiso.join(' · '),
)
// Y sin control total la copia queda al final, como cualquier creación suya.
const antesC = await tablaTitulos(0)
await elegir('Duplicar', 600)
await p.keyboard.press('Enter')
await esperar(1000)
const trasC = await tablaTitulos(0)
chk(
  trasC[trasC.length - 1] === antesC[0] && trasC.length === antesC.length + 1,
  '10 y sin control total la copia queda al final, igual que cualquier creación suya',
  trasC.slice(-2).join(' · '),
)

await b.close()
