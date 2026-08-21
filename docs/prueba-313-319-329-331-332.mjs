// #313 · #319 · #329 · #331 · #332 — Cinco cambios chicos, independientes.
//
// #313 · El orden por Estado usa la gravedad del modelo (hecha → pendiente →
// pendiente replanificada → atrasada → atrasada replanificada) y DENTRO de un
// mismo estado no desempataba nada: el sort es estable, así que las empatadas
// quedaban como venían. Ahora desempata el número de replanificaciones —el
// mismo ↻ ×N que ya se muestra—, en el sentido de la flecha del Estado, porque
// es una sola escala de gravedad: cuantas más veces se movió, más crítica.
//
// #319 · En Mis Tareas, Proyecto comparaba solo el nombre, así que TODAS las
// tareas de un proyecto empataban y quedaban revueltas, con frentes y sub
// frentes intercalados. Ahora agrupa por frente y sub frente, en el orden con
// el que están armados —el mismo que se ve al entrar al proyecto—, no
// alfabético.
//
// Ninguno de los dos agrega campos al menú de Ordenar: son la continuación del
// criterio que los trae, no criterios que se elijan.
//
// #329 · La separación entre sub frentes era 8 siempre. Contraído funciona
// —es lo que los agrupa—, desplegado no: entre la última fila de una tabla y
// el título del siguiente, 8 no alcanza. El desplegado pasa a separar 16.
//
// #331 · De las tres secciones fijas de la barra, a la franja contraída solo
// había llegado la campana (#159). Se suman Resumen y Mis Tareas, en el mismo
// orden que arriba.
//
// #332 · El selector de responsable llevaba la flecha DENTRO del botón,
// invisible en reposo pero ocupando su lugar, así que al centrar el botón el
// círculo quedaba corrido a la izquierda. La flecha sale del flujo.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-313-319-329-331-332.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'

/** Los campos del menú de Ordenar antes de este pedido. Ninguno se agrega. */
const CAMPOS_PROYECTO = ['Responsable', 'Estado', 'Fecha Objetivo', 'Atraso']
const CAMPOS_MIS_TAREAS = [...CAMPOS_PROYECTO, 'Proyecto']

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

const ctrl = (n) => p.locator('.controles-btn', { hasText: n }).first()
const menu = () => p.locator('.filtro-menu--portal')
const abrirOrdenar = async () => {
  await ctrl('Ordenar').click()
  await esperar(400)
}
const cerrarMenu = async () => {
  await p.keyboard.press('Escape')
  await esperar(450)
}
/** Marca un campo del menú de Ordenar en la dirección pedida (1 = ↑). */
const ordenarPor = async (label, dir) => {
  await abrirOrdenar()
  await menu()
    .locator('.orden-campo', { hasText: label })
    .first()
    .locator('.orden-campo__dir')
    .nth(dir === 1 ? 0 : 1)
    .click()
  await esperar(600)
  await cerrarMenu()
}
/** Apila dos criterios dejando `primero` como prioridad 1.
 *  El menú ANTEPONE cada criterio nuevo, así que el último que se toca es el
 *  que manda: para que mande `primero` hay que tocarlo al final. */
const apilar = async (segundo, primero, dir = 1) => {
  await ordenarPor(segundo, dir)
  await ordenarPor(primero, dir)
}

/** "02-oct-2024" → "2024-10-02", que sí se puede comparar como texto. Las
 *  fechas de la tabla salen formateadas y en orden lexicográfico "nov" va
 *  antes que "oct". */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const comparable = (txt) => {
  const m = /^(\d{2})-([a-zá]{3})-(\d{4})$/i.exec(txt.trim())
  if (!m) return null
  const mes = MESES.indexOf(m[2].toLowerCase())
  return mes < 0 ? null : `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1]}`
}

/** Quita todos los criterios (la × del control). */
const limpiarOrden = async () => {
  const x = p.locator('.controles-ctrl--conx', { hasText: 'Ordenar' }).locator('.controles-x')
  if (await x.count()) {
    await x.first().click()
    await esperar(500)
  }
}
const camposDelMenu = async () => {
  await abrirOrdenar()
  const l = await menu().locator('.orden-campo__label').allInnerTexts()
  await cerrarMenu()
  return l.map((x) => x.trim())
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

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await p.getByText('Daniela Vera', { exact: true }).click()
await esperar(900)
await abrirProyecto()

// ═══════════════════════════════════════════════════════════════════════════
// #313 · Las replanificaciones desempatan dentro de cada estado
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #313 · 1 y 4 · Dentro de cada estado, por ↻ ×N ──')

/** Por sub frente: la lista de [estado, replanificaciones] tal como se ve. */
const porSubFrente = () =>
  p.evaluate(() => {
    const out = []
    for (const sub of document.querySelectorAll('.subfrente:not(.subfrente--nuevo)')) {
      const nombre = sub.querySelector('.subfrente__titulo')?.innerText?.split('\n')[0]?.trim() ?? '?'
      const filas = [...sub.querySelectorAll('table.tareas tbody tr')]
        .filter((tr) => tr.querySelector('.tarea-cell'))
        .map((tr) => ({
          estado: tr.querySelector('.estado-chip')?.textContent?.replace(/\s+/g, ' ').trim() ?? '?',
          replan: Number(tr.querySelector('.replan-count')?.textContent?.match(/\d+/)?.[0] ?? 0),
          fecha: tr.querySelector('td.col-fecha')?.textContent?.trim() ?? '',
        }))
      if (filas.length) out.push({ nombre, filas })
    }
    return out
  })

/** ¿Dentro de cada bloque de mismo estado, el ↻ va en el sentido esperado? */
const desempateOk = (grupos, dir) =>
  grupos.every(({ filas }) => {
    for (let i = 1; i < filas.length; i++) {
      if (filas[i].estado !== filas[i - 1].estado) continue
      const d = filas[i].replan - filas[i - 1].replan
      if (dir === 1 ? d < 0 : d > 0) return false
    }
    return true
  })
/** Cuántas parejas consecutivas del mismo estado tienen ↻ distinto: si es 0,
 *  la comprobación no prueba nada y hay que decirlo. */
const parejasQueDesempatan = (grupos) =>
  grupos.reduce(
    (n, { filas }) =>
      n +
      filas.filter((f, i) => i > 0 && f.estado === filas[i - 1].estado && f.replan !== filas[i - 1].replan).length,
    0,
  )

await ordenarPor('Estado', 1)
const asc = await porSubFrente()
const parejas = parejasQueDesempatan(asc)
chk(parejas > 0, '#313 terreno: hay tareas del mismo estado con distinto ↻ ×N', `${parejas} parejas`)
chk(
  desempateOk(asc, 1),
  '1 y 4 con Estado ↑, dentro de cada estado van primero las de menos replanificaciones',
  asc.map((g) => g.filas.map((f) => `${f.estado[0]}${f.replan}`).join(' ')).join(' | '),
)

await limpiarOrden()
await ordenarPor('Estado', -1)
const desc = await porSubFrente()
chk(
  desempateOk(desc, -1),
  '2 al invertir la flecha del Estado, el desempate también se invierte',
  desc.map((g) => g.filas.map((f) => `${f.estado[0]}${f.replan}`).join(' ')).join(' | '),
)
// Con ↑ el orden estable puede dejar por casualidad las de menos ↻ primero, así
// que "va en el sentido correcto" no prueba nada por sí solo. Lo que no puede
// pasar por casualidad es que la secuencia de ↻ dentro de cada estado se dé
// VUELTA al invertir la flecha.
const secuencia = (grupos) =>
  grupos.map(({ filas }) => filas.map((f) => `${f.estado}:${f.replan}`).join(',')).join(' | ')
const seqAsc = secuencia(asc)
const seqDesc = secuencia(desc)
chk(
  seqAsc !== seqDesc && seqDesc === secuencia(asc.map(({ filas }) => ({ filas: [...filas].reverse() }))),
  '1 y 2 la secuencia de ↻ dentro de cada estado se da vuelta al invertir la flecha',
  `↑ ${seqAsc}`,
)

// 5 · lo que se apila manda sobre el desempate.
console.log('\n── #313 · 5 · Apilado con otro criterio ──')
await limpiarOrden()
await apilar('Fecha Objetivo', 'Estado')
const apilado = await porSubFrente()
const fechaManda = apilado.every(({ filas }) => {
  for (let i = 1; i < filas.length; i++) {
    if (filas[i].estado !== filas[i - 1].estado) continue
    // Dentro del mismo estado, la fecha tiene que ir en orden; el ↻ solo
    // desempata cuando la fecha empata.
    const a = comparable(filas[i - 1].fecha)
    const b = comparable(filas[i].fecha)
    if (a && b && b < a) return false
  }
  return true
})
chk(fechaManda, '5 con Estado + Fecha Objetivo, la fecha manda sobre el desempate por ↻')

// 6 · el menú no cambia.
chk(
  JSON.stringify(await camposDelMenu()) === JSON.stringify(CAMPOS_PROYECTO),
  '6 el menú de Ordenar muestra los mismos campos que hoy',
  (await camposDelMenu()).join(' · '),
)

// 7 · lo mismo en la Gantt.
console.log('\n── #313 · 7 · En la Gantt ──')
await limpiarOrden()
await ordenarPor('Estado', 1)
await verVista('Gantt')
// El nombre y nada más: la celda de la Gantt lleva además el ⓘ y el "+", y
// hay filas de estructura (frente o sub frente vacíos) que no son tareas.
const enGantt = await p.evaluate(() =>
  [...document.querySelectorAll('.gantt tbody td.fija--tarea .fija-txt')]
    .map((x) => x.innerText.trim())
    .filter(Boolean),
)
await verVista('Tabla')
const enTabla = await p.evaluate(() =>
  [...document.querySelectorAll('table.tareas tbody .tarea-cell__link, table.tareas tbody .tarea-cell .inline-text')]
    .map((x) => x.innerText.trim())
    .filter(Boolean),
)
chk(
  enGantt.length > 0 && JSON.stringify(enGantt) === JSON.stringify(enTabla),
  '7 la Gantt del proyecto muestra el mismo orden que su tabla',
  `${enGantt.length} filas`,
)
await limpiarOrden()

// ═══════════════════════════════════════════════════════════════════════════
// #319 · Proyecto agrupa por frente y sub frente
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #319 · 1 y 2 · Agrupado y en el orden armado ──')
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(1000)

// #313 · 7 · el desempate también vale acá. Mis Tareas no separa por sub
// frente, así que la lista es una sola: se compara el tramo de cada estado.
const enMisTareas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('table.tareas tbody tr')]
      .filter((tr) => tr.querySelector('.tarea-cell'))
      .map((tr) => ({
        estado: tr.querySelector('.estado-chip')?.textContent?.replace(/\s+/g, ' ').trim() ?? '?',
        replan: Number(tr.querySelector('.replan-count')?.textContent?.match(/\d+/)?.[0] ?? 0),
      })),
  )
await ordenarPor('Estado', 1)
const mtAsc = [{ filas: await enMisTareas() }]
await limpiarOrden()
await ordenarPor('Estado', -1)
const mtDesc = [{ filas: await enMisTareas() }]
await limpiarOrden()
chk(
  desempateOk(mtAsc, 1) && desempateOk(mtDesc, -1),
  '7 en Mis Tareas el desempate por ↻ también funciona, en los dos sentidos',
  mtAsc[0].filas.map((f) => `${f.estado[0]}${f.replan}`).join(' '),
)

const rutas = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('table.tareas tbody tr')]
      .filter((tr) => tr.querySelector('.tarea-cell'))
      .map((tr) => tr.querySelector('td.col-ruta')?.textContent?.trim() ?? ''),
  )
/** ¿Cada valor aparece en UN solo tramo contiguo? Eso es "quedan juntas". */
const contiguas = (lista, clave) => {
  const vistos = new Set()
  let previo = null
  for (const x of lista) {
    const k = clave(x)
    if (k === previo) continue
    if (vistos.has(k)) return false
    vistos.add(k)
    previo = k
  }
  return true
}
const partes = (r) => r.split('›').map((s) => s.trim())

const revueltas = await rutas()
chk(revueltas.length > 3, '#319 terreno: Mis Tareas tiene varias tareas', `${revueltas.length}`)
chk(
  !contiguas(revueltas, (r) => partes(r)[2]),
  '#319 terreno: sin ordenar, los sub frentes vienen intercalados',
  revueltas.slice(0, 4).map((r) => partes(r)[2]).join(' · '),
)

await ordenarPor('Proyecto', 1)
const agrupadas = await rutas()
chk(
  contiguas(agrupadas, (r) => partes(r)[0]),
  '1 con Proyecto ↑, las tareas de un mismo proyecto quedan juntas',
)
chk(
  contiguas(agrupadas, (r) => partes(r)[1]),
  '1 y dentro del proyecto, las de un mismo frente quedan juntas',
  [...new Set(agrupadas.map((r) => partes(r)[1]))].join(' · '),
)
chk(
  contiguas(agrupadas, (r) => partes(r)[2]),
  '1 y dentro del frente, las de un mismo sub frente quedan juntas',
  [...new Set(agrupadas.map((r) => partes(r)[2]))].join(' · '),
)

// 2 · el orden de los frentes es el ARMADO, no el alfabético.
const frentesVistos = [...new Set(agrupadas.map((r) => partes(r)[1]))]
const frentesAlfabeticos = [...frentesVistos].sort((a, b) => a.localeCompare(b))
// El orden ARMADO se lee donde se ve: la lista de frentes de la barra lateral
// al entrar al proyecto. No sirve leer `localStorage`, porque el repo de
// memoria solo escribe ahí cuando hay una mutación.
const frentesDelProyecto = await (async () => {
  await abrirProyecto()
  const l = await p.locator('.nav-frentes .nav-frente--flex > span').allInnerTexts()
  await p.getByText('Mis Tareas', { exact: true }).first().click()
  await esperar(1000)
  return l.map((x) => x.trim())
})()
const esperado = frentesDelProyecto.filter((f) => frentesVistos.includes(f))
chk(
  JSON.stringify(frentesVistos) === JSON.stringify(esperado),
  '2 el orden de los frentes es el que tienen armado en su proyecto',
  `visto ${frentesVistos.join(' · ')} · armado ${esperado.join(' · ')}`,
)
chk(
  JSON.stringify(frentesVistos) !== JSON.stringify(frentesAlfabeticos),
  '2 y NO es el alfabético',
  `alfabético sería ${frentesAlfabeticos.join(' · ')}`,
)

// 3 · invertir la flecha invierte el agrupamiento.
console.log('\n── #319 · 3 a 6 · Invertir, apilar y la Gantt ──')
await limpiarOrden()
await ordenarPor('Proyecto', -1)
const invertidas = await rutas()
chk(
  JSON.stringify([...new Set(invertidas.map((r) => partes(r)[1]))]) ===
    JSON.stringify([...frentesVistos].reverse()),
  '3 al invertir la flecha, el agrupamiento interno también se invierte',
  [...new Set(invertidas.map((r) => partes(r)[1]))].join(' · '),
)

// 4 · lo que se apila manda DENTRO del sub frente.
await limpiarOrden()
await apilar('Fecha Objetivo', 'Proyecto')
const apiladas = await p.evaluate(() =>
  [...document.querySelectorAll('table.tareas tbody tr')]
    .filter((tr) => tr.querySelector('.tarea-cell'))
    .map((tr) => ({
      ruta: tr.querySelector('td.col-ruta')?.textContent?.trim() ?? '',
      fecha: tr.querySelector('td.col-fecha')?.textContent?.trim() ?? '',
    })),
)
chk(
  contiguas(apiladas.map((x) => x.ruta), (r) => partes(r)[2]),
  '4 al apilar Fecha Objetivo, el agrupamiento por sub frente se mantiene',
)
chk(
  apiladas.every((x, i) => {
    if (i === 0 || partes(x.ruta)[2] !== partes(apiladas[i - 1].ruta)[2]) return true
    const a = comparable(apiladas[i - 1].fecha)
    const b = comparable(x.fecha)
    return !a || !b || b >= a
  }),
  '4 y dentro del sub frente manda la fecha',
)

// 5 · el menú de Mis Tareas tampoco cambia.
chk(
  JSON.stringify(await camposDelMenu()) === JSON.stringify(CAMPOS_MIS_TAREAS),
  '5 el menú de Ordenar de Mis Tareas muestra los mismos campos que hoy',
  (await camposDelMenu()).join(' · '),
)

// 6 · la Gantt de Mis Tareas muestra el mismo orden.
await limpiarOrden()
await ordenarPor('Proyecto', 1)
const tablaMT = await rutas()
await verVista('Gantt')
const ganttMT = await p.evaluate(() =>
  [...document.querySelectorAll('.gantt tbody tr')]
    .filter((tr) => tr.querySelector('td.fija--tarea'))
    .map((tr) => tr.querySelector('td.fija--sf')?.innerText?.trim())
    .filter(Boolean),
)
chk(
  ganttMT.length > 0 && contiguas(ganttMT, (x) => x),
  '6 en la Gantt de Mis Tareas los sub frentes también quedan juntos',
  `${tablaMT.length} filas en tabla · ${ganttMT.length} rótulas en Gantt`,
)
await verVista('Tabla')
await limpiarOrden()

// ═══════════════════════════════════════════════════════════════════════════
// #329 · El sub frente desplegado separa más
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #329 · La separación entre sub frentes ──')
await abrirProyecto()

/** Lo que el ojo mide: del final visible de un sub frente al título del
 *  siguiente, y del último sub frente de un frente al título del frente que
 *  viene. */
const separaciones = () =>
  p.evaluate(() => {
    const r = (x) => x.getBoundingClientRect()
    const bloques = [...document.querySelectorAll('.frente-bloque')]
    const subs = [...bloques[0].querySelectorAll('.subfrente:not(.subfrente--nuevo)')]
    const titulo = (s) => s.querySelector('.subfrente__titulo')
    const finVisible = (s) => {
      const pie = s.querySelector('.fila-add') ?? [...s.querySelectorAll('table.tareas tbody tr')].pop()
      return r(pie ?? titulo(s)).bottom
    }
    const tituloFrente2 = bloques[1]?.querySelector('.frente-titulo')
    const linea = bloques[0].querySelector('.subfrente-add-linea')
    return {
      entreSubs: subs.length > 1 ? Math.round(r(titulo(subs[1])).top - finVisible(subs[0])) : null,
      entreFrentes: tituloFrente2
        ? Math.round(r(tituloFrente2).top - finVisible(subs[subs.length - 1]))
        : null,
      ultimoSubALinea: linea ? Math.round(r(linea).top - r(subs[subs.length - 1]).bottom) : null,
      alto: Math.round(document.querySelector('.frente-bloque').getBoundingClientRect().height),
    }
  })
/** Pliega o despliega TODOS los sub frentes del primer frente. */
const alternarSubs = async () => {
  const subs = p.locator('.frente-bloque').first().locator('.subfrente:not(.subfrente--nuevo)')
  const n = await subs.count()
  for (let i = 0; i < n; i++) {
    await subs.nth(i).locator('.subfrente__titulo .colapso-btn').first().click()
    await esperar(200)
  }
  await esperar(350)
}

const desplegado = await separaciones()
chk(
  desplegado.entreSubs === 16,
  '1 con los sub frentes desplegados, entre uno y el siguiente hay 16 (antes 8)',
  `${desplegado.entreSubs}`,
)
chk(
  desplegado.entreFrentes > desplegado.entreSubs * 1.5,
  '4 y la separación entre frentes se sigue viendo claramente mayor',
  `frentes ${desplegado.entreFrentes} contra sub frentes ${desplegado.entreSubs}`,
)
chk(
  desplegado.ultimoSubALinea === 4,
  '#306b sigue en pie: "+ Sub Frente" sigue pegado al último sub frente',
  `${desplegado.ultimoSubALinea}`,
)

await alternarSubs()
const contraido = await separaciones()
chk(
  contraido.entreSubs === 8,
  '2 con los sub frentes contraídos, la separación sigue siendo 8',
  `${contraido.entreSubs}`,
)
chk(
  contraido.entreFrentes > contraido.entreSubs * 1.5,
  '4 y ahí el contraste con la separación entre frentes es aún mayor',
  `frentes ${contraido.entreFrentes} contra sub frentes ${contraido.entreSubs}`,
)

// 3 · uno desplegado y el siguiente contraído: manda el desplegado.
await p
  .locator('.frente-bloque')
  .first()
  .locator('.subfrente:not(.subfrente--nuevo)')
  .first()
  .locator('.subfrente__titulo .colapso-btn')
  .first()
  .click()
await esperar(500)
const mixto = await separaciones()
chk(
  mixto.entreSubs === 16,
  '3 con el primero desplegado y el siguiente contraído, la separación es la del desplegado',
  `${mixto.entreSubs}`,
)

// 5 · con todo contraído la pantalla no gana aire. Se comprueba en la causa y
// no en el alto total —que depende de cuántas tareas haya—: el aire de más es
// un relleno, y el contraído no lo lleva.
await p
  .locator('.frente-bloque')
  .first()
  .locator('.subfrente:not(.subfrente--nuevo)')
  .first()
  .locator('.subfrente__titulo .colapso-btn')
  .first()
  .click()
await esperar(500)
const relleno = await p.evaluate(() => {
  const subs = [...document.querySelectorAll('.subfrente:not(.subfrente--nuevo)')]
  const de = (s) => Math.round(parseFloat(getComputedStyle(s).paddingBottom))
  return {
    contraidos: subs.filter((s) => s.classList.contains('subfrente--colapsado')).map(de),
    desplegados: subs.filter((s) => !s.classList.contains('subfrente--colapsado')).map(de),
  }
})
chk(
  relleno.contraidos.length > 0 && relleno.contraidos.every((x) => x === 0),
  '5 el sub frente contraído no gana nada de aire: sigue como hoy',
  `contraídos ${relleno.contraidos.join(',')} · desplegados ${relleno.desplegados.join(',')}`,
)

// ═══════════════════════════════════════════════════════════════════════════
// #331 · Resumen y Mis Tareas en la franja contraída
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #331 · La franja de íconos ──')
await p.locator('.sidebar__plegar').first().click()
await esperar(700)

const franja = () =>
  p.evaluate(() => {
    const tira = document.querySelector('.sidebar-mini')
    if (!tira) return null
    const svg = (sel) => tira.querySelector(`${sel} svg`)
    const medida = (s) =>
      s
        ? {
            w: s.getAttribute('width'),
            color: getComputedStyle(s.parentElement).color,
            // La campana declara el trazo en sus paths; los nuevos, en el svg.
            trazo:
              s.getAttribute('stroke-width') ??
              s.querySelector('path')?.getAttribute('stroke-width') ??
              null,
          }
        : null
    return {
      orden: [...tira.children].map((c) => c.getAttribute('title') ?? c.className.split(' ')[0]),
      activos: [...tira.querySelectorAll('.sidebar-mini__seccion--activo')].map((x) => x.getAttribute('title')),
      campana: medida(svg('[title="Notificaciones"]')),
      resumen: medida(svg('[title="Resumen"]')),
      misTareas: medida(svg('[title="Mis Tareas"]')),
      badge: !!tira.querySelector('.sidebar-mini__badge'),
      proyectos: tira.querySelectorAll('.sidebar-mini__proy').length,
      fijar: !!tira.querySelector('.sidebar-mini__btn'),
    }
  })

const f = await franja()
chk(f !== null, '#331 terreno: con la barra plegada aparece la franja')
chk(
  JSON.stringify(f.orden.slice(0, 4)) ===
    JSON.stringify(['Fijar barra lateral', 'Notificaciones', 'Resumen', 'Mis Tareas']),
  '1 la franja muestra fijar · campana · Resumen · Mis Tareas · los proyectos',
  f.orden.join(' · '),
)
chk(f.proyectos > 0, '1 y los proyectos van después', `${f.proyectos} proyecto(s)`)
const mismo = (campo) =>
  !!f.resumen && !!f.misTareas && f.resumen[campo] === f.campana[campo] && f.misTareas[campo] === f.campana[campo]
const detalle = (campo) =>
  `campana ${f.campana?.[campo]} · resumen ${f.resumen?.[campo] ?? 'no existe'} · mis tareas ${f.misTareas?.[campo] ?? 'no existe'}`
chk(mismo('w'), '5 los dos íconos miden lo mismo que la campana', detalle('w'))
chk(mismo('trazo'), '5 y llevan el mismo trazo', detalle('trazo'))
chk(mismo('color'), '5 y toman el mismo color', detalle('color'))
chk(f.badge && f.fijar, '7 el contador de la campana y el botón de fijar siguen ahí')

// 2 y 3 · llevan a su pantalla y se marcan activos. Si los botones no existen
// —el defecto que este pedido corrige— no se puede seguir por acá: se avisa y
// se salta, para que el resto de la prueba igual corra.
const hayBotones = (await p.locator('.sidebar-mini__seccion[title="Resumen"]').count()) > 0
if (!hayBotones) {
  chk(false, '2 y 3 los botones de Resumen y Mis Tareas no están en la franja')
} else {
await p.locator('.sidebar-mini__seccion[title="Resumen"]').click()
await esperar(900)
const enResumen = await franja()
chk(
  (await p.locator('.resumen-card').count()) > 0,
  '2 tocar el de Resumen lleva a Resumen',
)
chk(
  JSON.stringify(enResumen.activos) === JSON.stringify(['Resumen']),
  '3 y su ícono queda marcado como activo, y solo el suyo',
  enResumen.activos.join(' · '),
)
await p.locator('.sidebar-mini__seccion[title="Mis Tareas"]').click()
await esperar(1000)
const enMisTareas = await franja()
chk(
  (await p.locator('table.tareas').count()) > 0,
  '2 tocar el de Mis Tareas lleva a Mis Tareas',
)
chk(
  JSON.stringify(enMisTareas.activos) === JSON.stringify(['Mis Tareas']),
  '3 se marca el suyo y el de Resumen deja de estarlo',
  enMisTareas.activos.join(' · '),
)

// 4 · el nombre en globo, igual que la campana (las tres usan el `title`).
const globos = await p.evaluate(() => {
  const tira = document.querySelector('.sidebar-mini')
  return ['Notificaciones', 'Resumen', 'Mis Tareas'].map(
    (t) => tira.querySelector(`[title="${t}"]`)?.getAttribute('title') ?? null,
  )
})
chk(
  globos.every(Boolean),
  '4 los tres llevan su nombre en globo al pasar el mouse, del mismo modo',
  globos.join(' · '),
)

// 6 · con la barra desplegada por hover, la franja sigue clicable.
await p.locator('.sidebar-zona').hover()
await esperar(700)
await p.locator('.sidebar-mini__seccion[title="Resumen"]').click({ force: true })
await esperar(900)
chk(
  (await p.locator('.resumen-card').count()) > 0,
  '6 con la barra desplegada, los botones de la franja siguen funcionando',
)
}
await p.locator('.sidebar-zona').hover()
await esperar(600)
await p.locator('.sidebar__plegar').first().click()
await esperar(700)

// ═══════════════════════════════════════════════════════════════════════════
// #332 · El círculo del responsable, centrado
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── #332 · El responsable en su columna ──')
await abrirProyecto()

/** Desvío del centro del círculo respecto del centro de su celda. */
const desvios = (sel) =>
  p.evaluate((s) => {
    const r = (x) => x.getBoundingClientRect()
    const celdas = [...document.querySelectorAll(s)].filter((td) => td.querySelector('.resp-picker'))
    return celdas.map((c) => {
      const av = c.querySelector('.avatar, .avatar--vacio')
      const rc = r(c)
      const ra = r(av)
      return Math.round(rc.left + rc.width / 2 - (ra.left + ra.width / 2))
    })
  }, sel)

const enTablaResp = await desvios('table.tareas td')
chk(enTablaResp.length > 0, '#332 terreno: la tabla tiene columna de responsable', `${enTablaResp.length} filas`)
chk(
  enTablaResp.every((d) => Math.abs(d) <= 1),
  '3 en la tabla, los círculos quedan centrados en su columna',
  `desvío máximo ${Math.max(...enTablaResp.map(Math.abs))}`,
)
// 2 · con el mouse encima aparece la flecha y el círculo no se mueve.
const antes = (await desvios('table.tareas td'))[0]
await p.locator('table.tareas .resp-picker').first().hover()
await esperar(350)
const conMouse = await p.evaluate(() => {
  const b = document.querySelector('table.tareas .resp-picker')
  const caret = b.querySelector('.resp-picker__caret')
  const rb = b.getBoundingClientRect()
  const rc = caret.getBoundingClientRect()
  return {
    visible: Number(getComputedStyle(caret).opacity) > 0.5,
    fueraDelFlujo: getComputedStyle(caret).position === 'absolute',
    aLaDerecha: rc.left >= rb.right - 2,
  }
})
const despues = (await desvios('table.tareas td'))[0]
chk(conMouse.visible, '2 al pasar el mouse aparece la flecha')
chk(conMouse.aLaDerecha && conMouse.fueraDelFlujo, '2 a la derecha del círculo y fuera del flujo')
chk(antes === despues, '2 y el círculo no se mueve', `${antes} → ${despues}`)

// 6 · una tarea sin responsable se ve centrada igual.
const sinResp = await p.evaluate(() => {
  const r = (x) => x.getBoundingClientRect()
  const vacio = document.querySelector('table.tareas .avatar--vacio')
  if (!vacio) return null
  const c = vacio.closest('td')
  return Math.round(r(c).left + r(c).width / 2 - (r(vacio).left + r(vacio).width / 2))
})
chk(
  sinResp === null || Math.abs(sinResp) <= 1,
  '6 una tarea sin responsable muestra su marca centrada igual',
  sinResp === null ? 'no hay ninguna en pantalla' : `desvío ${sinResp}`,
)

// 5 · el menú sigue abriendo y se puede elegir.
await p.locator('table.tareas .resp-picker').first().click()
await esperar(500)
chk((await p.locator('.resp-menu').count()) > 0, '5 tocar el círculo sigue abriendo el menú de responsables')
await p.keyboard.press('Escape')
await esperar(400)

// 1 · lo mismo en la Gantt.
await verVista('Gantt')
const enGanttResp = await desvios('.gantt td.fija--resp')
chk(enGanttResp.length > 0, '1 terreno: la Gantt tiene columna de responsable', `${enGanttResp.length} filas`)
chk(
  enGanttResp.every((d) => Math.abs(d) <= 1),
  '1 en la Gantt, los círculos quedan centrados respecto del título de la columna',
  `desvío máximo ${Math.max(...enGanttResp.map(Math.abs))}`,
)

// 4 · y en Mis Tareas, tabla y Gantt.
await p.getByText('Mis Tareas', { exact: true }).first().click()
await esperar(1000)
const mtTabla = await desvios('table.tareas td')
await verVista('Gantt')
const mtGantt = await desvios('.gantt td.fija--resp')
chk(
  mtTabla.every((d) => Math.abs(d) <= 1) && mtGantt.every((d) => Math.abs(d) <= 1),
  '4 en Mis Tareas, tabla y Gantt, también quedan centrados',
  `tabla ${mtTabla.length} filas · gantt ${mtGantt.length} filas`,
)

// 8 · en mobile la flecha no se dibuja y la columna se ve igual que hoy.
await p.setViewportSize({ width: 420, height: 820 })
await esperar(800)
const enMovil = await p.evaluate(() => {
  const caret = document.querySelector('.resp-picker__caret')
  return caret ? getComputedStyle(caret).display : 'sin flecha'
})
chk(enMovil === 'none' || enMovil === 'sin flecha', '8 en mobile la flecha no se dibuja', enMovil)
await p.setViewportSize({ width: 1440, height: 900 })
await esperar(600)

await b.close()
console.log(
  process.exitCode
    ? '\n⛔ HAY FALLAS'
    : '\n✅ #313 · #319 · #329 · #331 · #332 — el orden desempata, agrupa, los sub frentes respiran, la franja tiene sus dos secciones y el responsable está centrado',
)
