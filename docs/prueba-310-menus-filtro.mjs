// #310 — Los menús de la barra de controles no se salen de la pantalla.
//
// Se mide la caja REAL de cada menú abierto contra la ventana: ningún borde
// puede quedar fuera, ni por los lados ni por abajo.
//
// #305 reordenó la barra: los campos de filtro dejaron de ser botones sueltos y
// viven dentro del control "Filtrar", a dos niveles. Los dos niveles se miden,
// porque el segundo trae contenido NUEVO —y por tanto un ancho nuevo— sin
// cerrar el menú: si no se volviera a medir, se recolocaría con el ancho viejo.
//
// Controles negativos comprobados:
//   · Con `left: r.left` sin tope y el alto al 80% de la pantalla —el cálculo
//     original— fallan C1 ("Estado" llega a 524 en una pantalla de 390), C2 y C4.
//   · Sin el tope izquierdo de la rama anclada por la derecha, falla C3:
//     "Vistas" queda en -163.7 a 320px, y en `izq=0` a 390px. Ese segundo caso
//     es el que una versión anterior de ESTA prueba dejaba pasar, por medir un
//     solo ancho y por conformarse con "que no se salga" en vez de exigir el
//     margen. De ahí el barrido de anchos y el criterio de `dentro()`.
//   · Sin la re-medición al cambiar de nivel (#305), el segundo nivel de
//     "Filtrar" hereda la colocación del primero y se sale por la derecha.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-310-menus-filtro.mjs
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
const MARGEN = 8

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })

/** Caja del menú abierto, medida contra la ventana. */
const cajaMenu = (p) =>
  p.evaluate(() => {
    const m = document.querySelector('.filtro-menu--portal')
    if (!m) return null
    const r = m.getBoundingClientRect()
    return {
      izq: +r.left.toFixed(1),
      der: +r.right.toFixed(1),
      arriba: +r.top.toFixed(1),
      abajo: +r.bottom.toFixed(1),
      ancho: +r.width.toFixed(1),
      opciones: m.querySelectorAll('button, label').length,
      // "Vistas" puede estar legítimamente sin opciones (sin vistas guardadas
      // todavía): ahí lo que importa es que muestre su mensaje.
      texto: m.innerText.trim().length,
      ventanaW: window.innerWidth,
      ventanaH: window.innerHeight,
      // ¿Todas las opciones se alcanzan? El menú puede desplazarse por dentro.
      desplazable: m.scrollHeight > m.clientHeight,
      // El tope de alto que se le aplicó, para comprobar la REGLA y no solo
      // el caso en que el contenido ya cabía.
      topeAlto: Math.round(parseFloat(getComputedStyle(m).maxHeight)),
    }
  })

/** Abre un control por su nombre y devuelve su caja. `null` si no está. */
async function medirControl(p, nombre) {
  const btn = p.locator('.controles-btn', { hasText: nombre }).first()
  if (!(await btn.count())) return null
  await btn.click()
  await p.waitForTimeout(400)
  const caja = await cajaMenu(p)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(250)
  return caja
}

/** Abre "Filtrar" y baja a uno de sus campos; devuelve la caja del 2º nivel. */
async function medirCampo(p, campo) {
  const btn = p.locator('.controles-btn', { hasText: 'Filtrar' }).first()
  if (!(await btn.count())) return null
  await btn.click()
  await p.waitForTimeout(400)
  const op = p.locator('.filtro-menu--portal .filtro-op--campo', { hasText: campo })
  if (!(await op.count())) {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(250)
    return null
  }
  await op.click()
  await p.waitForTimeout(450)
  const caja = await cajaMenu(p)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(250)
  return caja
}

// Se exige el MARGEN en los cuatro bordes, no solo "que no se salga". La
// primera versión de esta prueba solo comprobaba que el borde no fuera
// negativo, y "Vistas" pasaba con `izq=0` — pegado al borde, que es el caso
// justo anterior a salirse. Con un ancho un poco menor ya quedaba en -163.
const dentro = (c) =>
  c &&
  c.izq >= MARGEN - 0.5 &&
  c.der <= c.ventanaW - MARGEN + 0.5 &&
  c.arriba >= -0.5 &&
  c.abajo <= c.ventanaH + 0.5

/** En mobile la barra lateral vive tras el botón flotante ☰. */
async function abrirBarra(p) {
  const menu = p.locator('button.movil-menu[aria-label="Abrir menú"]')
  if (await menu.isVisible().catch(() => false)) {
    await menu.click()
    await p.waitForTimeout(400)
  }
}

async function abrirProyecto(p) {
  await abrirBarra(p)
  await p.getByText('Resumen', { exact: true }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
  await p.waitForTimeout(900)
}

async function sesion(ancho, alto) {
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

// ── C1 y C3 · TODOS los menús, en VARIOS anchos de teléfono ────────────────
// Un solo ancho no alcanza: a 390 "Vistas" caía justo en el borde y parecía
// bien; a 320 se salía 164 píxeles por la izquierda. El barrido es la prueba.
const ANCHOS = [320, 360, 390, 412, 430]
let movil = null
for (const W of ANCHOS) {
  console.log(`\n── Teléfono ${W}×844 · pantalla de proyecto ──`)
  const p = await sesion(W, 844)
  await abrirProyecto(p)
  for (const nombre of ['Filtrar', 'Ordenar', 'Vistas']) {
    const c = await medirControl(p, nombre)
    if (!c) {
      console.log(`SKIP  "${nombre}" no está en esta pantalla`)
      continue
    }
    // "Vistas" es el anclado por la DERECHA: su criterio es el mismo (C3).
    const criterio = nombre === 'Vistas' ? 'C3' : 'C1'
    chk(dentro(c), `${criterio} ${W}px · "${nombre}" queda dentro, con margen a los dos lados`,
        `izq=${c.izq} der=${c.der}/${c.ventanaW}`)
    chk(
      c.opciones > 0 || c.texto > 0,
      `${criterio} ${W}px · "${nombre}" muestra su contenido`,
      `${c.opciones} opciones, ${c.texto} caracteres`,
    )
  }
  // #305: el segundo nivel de Filtrar es contenido nuevo con otro ancho.
  for (const campo of ['Fecha', 'Responsable', 'Estado']) {
    const c = await medirCampo(p, campo)
    if (!c) {
      console.log(`SKIP  campo "${campo}" no está en esta pantalla`)
      continue
    }
    chk(dentro(c), `C1 ${W}px · el campo "${campo}" (2º nivel) queda dentro`,
        `izq=${c.izq} der=${c.der}/${c.ventanaW}`)
  }
  if (W === 390) movil = p
  else await p.context().close()
}

// ── C4 · Menú largo con la barra abajo: no se pasa por el borde inferior ───
console.log('\n── Teléfono bajo 390×420 · la barra queda en la mitad de abajo ──')
const bajo = await sesion(390, 420)
await abrirProyecto(bajo)
for (const campo of ['Responsable', 'Fecha', 'Estado']) {
  const c = await medirCampo(bajo, campo)
  if (!c) continue
  chk(dentro(c), `C4 con poco alto, el campo "${campo}" no se pasa por abajo`,
      `arriba=${c.arriba} abajo=${c.abajo}/${c.ventanaH}`)
  // La REGLA, no solo el caso: el tope de alto es el espacio que queda DESDE
  // el menú hasta el borde inferior, no una fracción de la pantalla completa.
  // Con el cálculo anterior (80% de la pantalla) este número sería mayor y el
  // menú podría pasarse; acá se comprueba directo.
  const esperado = Math.round(c.ventanaH - c.arriba - MARGEN)
  chk(
    Math.abs(c.topeAlto - esperado) <= 1,
    `C4 "${campo}": el tope de alto se mide desde el menú hasta el borde inferior`,
    `tope=${c.topeAlto} esperado=${esperado} (80% de la pantalla habría sido ${Math.round(c.ventanaH * 0.8)})`,
  )
  chk(
    !c.desplazable || c.abajo <= c.ventanaH + 0.5,
    `C4 "${campo}": si no cabe entero, se recorre por dentro`,
    `desplazable=${c.desplazable}`,
  )
}

// ── C2 · Mis Tareas, donde además está el campo Proyecto ───────────────────
console.log('\n── Teléfono 390×844 · Mis Tareas ──')
await abrirBarra(movil)
await movil.getByText('Mis Tareas', { exact: true }).first().click()
await movil.waitForTimeout(900)
for (const nombre of ['Filtrar', 'Ordenar', 'Vistas']) {
  const c = await medirControl(movil, nombre)
  if (!c) continue
  chk(dentro(c), `C2 "${nombre}" en Mis Tareas queda dentro`, `der=${c.der}/${c.ventanaW} abajo=${c.abajo}/${c.ventanaH}`)
}
for (const campo of ['Proyecto', 'Fecha', 'Estado']) {
  const c = await medirCampo(movil, campo)
  if (!c) {
    console.log(`SKIP  C2 campo "${campo}" no está en Mis Tareas`)
    continue
  }
  chk(dentro(c), `C2 el campo "${campo}" en Mis Tareas queda dentro`, `der=${c.der}/${c.ventanaW}`)
}

// ── C5 · En escritorio no se mueven: siguen pegados al borde del botón ─────
console.log('\n── Escritorio 1440×900 ──')
const escritorio = await sesion(1440, 900)
await abrirProyecto(escritorio)
for (const nombre of ['Filtrar', 'Ordenar']) {
  const bordeBoton = await escritorio.evaluate((t) => {
    const btn = [...document.querySelectorAll('.controles-btn')].find((b) => b.textContent.includes(t))
    return btn ? +btn.getBoundingClientRect().left.toFixed(1) : null
  }, nombre)
  const c = await medirControl(escritorio, nombre)
  chk(
    c && bordeBoton !== null && Math.abs(c.izq - bordeBoton) <= 0.5,
    `C5 "${nombre}" sigue pegado al borde izquierdo de su botón`,
    `menú=${c?.izq} botón=${bordeBoton}`,
  )
}
// #305: "Rango" solo existe en Gantt, y es el control más a la derecha de los
// anclados por la izquierda.
await escritorio.getByRole('button', { name: 'Gantt', exact: true }).first().click()
await escritorio.waitForTimeout(900)
const cr = await medirControl(escritorio, 'Rango')
chk(dentro(cr), 'C5 "Rango" (solo en Gantt) queda dentro', `izq=${cr?.izq} der=${cr?.der}/${cr?.ventanaW}`)

// ── C6 · Con el menú abierto, desplazar: sigue anclado y sin salirse ───────
console.log('\n── Desplazar con el menú abierto ──')
await abrirProyecto(movil)
await movil.locator('.controles-btn', { hasText: 'Filtrar' }).first().click()
await movil.waitForTimeout(400)
const antes = await movil.evaluate(() => {
  const m = document.querySelector('.filtro-menu--portal')
  const btn = [...document.querySelectorAll('.controles-btn')].find((b) => b.textContent.includes('Filtrar'))
  return { menuTop: m.getBoundingClientRect().top, btnBottom: btn.getBoundingClientRect().bottom }
})
await movil.mouse.wheel(0, 200)
await movil.waitForTimeout(500)
const despues = await movil.evaluate(() => {
  const m = document.querySelector('.filtro-menu--portal')
  if (!m) return null
  const btn = [...document.querySelectorAll('.controles-btn')].find((b) => b.textContent.includes('Filtrar'))
  const r = m.getBoundingClientRect()
  return {
    menuTop: r.top,
    btnBottom: btn ? btn.getBoundingClientRect().bottom : null,
    izq: r.left, der: r.right, arriba: r.top, abajo: r.bottom,
    ventanaW: window.innerWidth, ventanaH: window.innerHeight,
  }
})
if (despues) {
  chk(
    Math.abs((despues.menuTop - despues.btnBottom) - (antes.menuTop - antes.btnBottom)) <= 1,
    'C6 tras desplazar, el menú sigue pegado a su botón',
    `separación antes=${(antes.menuTop - antes.btnBottom).toFixed(1)} después=${(despues.menuTop - despues.btnBottom).toFixed(1)}`,
  )
  chk(dentro(despues), 'C6 y sigue sin salirse de la pantalla',
      `izq=${despues.izq.toFixed(1)} der=${despues.der.toFixed(1)}/${despues.ventanaW}`)
} else {
  console.log('SKIP  C6 el menú se cerró al desplazar')
}

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #310 — los menús de la barra de controles no se salen de la pantalla')
