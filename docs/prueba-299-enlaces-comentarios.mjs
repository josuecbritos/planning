// #299 — En el hilo de comentarios de una tarea, las direcciones web se ven
// como enlaces y se abren en una pestaña nueva.
//
// Cómo correrla:
//   npm run build && npx vite preview --port 4173 &
//   node docs/prueba-299-enlaces-comentarios.mjs
//
// Corre en modo Local (repo de memoria): no toca la base ni la producción.
import { chromium } from 'playwright-core'

const EXE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL_APP = process.env.URL ?? 'http://localhost:4173/'
const CLAVE_ESTADO = 'planificador.state.v1'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
// El entorno de prueba no tiene salida a internet: se responde cualquier
// petición externa con una página mínima, para poder comprobar que el clic
// abre la pestaña EN EL DESTINO correcto. Lo local no se intercepta.
await ctx.route(
  (u) => u.hostname !== 'localhost' && u.hostname !== '127.0.0.1',
  (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>destino</title>' }),
)
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())
const esperar = (ms) => p.waitForTimeout(ms)

async function entrarComo(nombre) {
  await p.getByText(nombre, { exact: true }).click()
  await esperar(900)
}

// Quien puede editar títulos abre el detalle por el ⓘ (el clic en el nombre
// edita en el lugar); quien no, abre por el propio nombre. Los dos caminos
// llevan al mismo panel.
async function abrirPrimeraTarea() {
  await p.getByText('Resumen', { exact: true }).first().click()
  await esperar(400)
  await p.locator('.resumen-card', { hasText: 'Plan PGP Arauco' }).first().click()
  await esperar(900)
  const info = p.locator('.col-acc .icon-btn').first()
  if (await info.count()) await info.click()
  else await p.locator('.tarea-cell__link').first().click()
  await esperar(600)
}

/** Publica un comentario y devuelve el texto de su enlace, si lo hay. */
async function comentar(texto) {
  const caja = p.locator('.comentario-nuevo textarea')
  await caja.fill(texto)
  await esperar(300)
  await p.locator('.comentario-nuevo button', { hasText: 'Comentar' }).click()
  await esperar(700)
}

/** Estado del último comentario del hilo: qué se ve y cómo está marcado. */
const ultimoComentario = () =>
  p.evaluate(() => {
    const ps = [...document.querySelectorAll('.comentario__texto')]
    const el = ps[ps.length - 1]
    if (!el) return null
    return {
      texto: el.textContent,
      enlaces: [...el.querySelectorAll('a')].map((a) => ({
        visible: a.textContent,
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
      })),
      menciones: [...el.querySelectorAll('.mencion')].map((s) => s.textContent),
    }
  })

await p.goto(URL_APP)
await p.evaluate(() => localStorage.clear())
await p.reload()
await esperar(700)
await entrarComo('Daniela Vera')
await abrirPrimeraTarea()

// ── C1 · https:// se ve como enlace y abre en pestaña nueva ─────────────────
await comentar('Propuesta aprobada: https://andotek.cl/planes')
let c = await ultimoComentario()
chk(c?.enlaces.length === 1 && c.enlaces[0].visible === 'https://andotek.cl/planes',
    'C1 una dirección https se ve como enlace', JSON.stringify(c?.enlaces))
chk(c?.enlaces[0]?.target === '_blank', 'C1 el enlace abre en pestaña nueva', `target=${c?.enlaces[0]?.target}`)
chk(/noopener/.test(c?.enlaces[0]?.rel ?? '') && /noreferrer/.test(c?.enlaces[0]?.rel ?? ''),
    'C1 se abre sin dar referencia a la ventana de origen', `rel=${c?.enlaces[0]?.rel}`)

// Que abra de verdad: se intercepta la pestaña nueva sin llegar a navegar.
const [pestana] = await Promise.all([
  ctx.waitForEvent('page'),
  p.locator('.comentario__texto a').last().click(),
])
chk(pestana.url().startsWith('https://andotek.cl/planes'), 'C1 al hacer clic abre una pestaña nueva en ese destino', pestana.url())
await pestana.close()

// ── C2 · http:// ────────────────────────────────────────────────────────────
await comentar('El interno viejo: http://intranet.andotek.cl/doc')
c = await ultimoComentario()
chk(c?.enlaces.length === 1 && c.enlaces[0].href?.startsWith('http://intranet.andotek.cl/doc'),
    'C2 una dirección http se ve como enlace', JSON.stringify(c?.enlaces))

// ── C3 · www. con https antepuesto ──────────────────────────────────────────
await comentar('Ver www.andotek.cl')
c = await ultimoComentario()
chk(c?.enlaces.length === 1 && c.enlaces[0].visible === 'www.andotek.cl',
    'C3 www. se ve como enlace, con el texto tal cual se escribió', JSON.stringify(c?.enlaces))
chk(c?.enlaces[0]?.href?.startsWith('https://www.andotek.cl'),
    'C3 al abrirlo se le antepone https://', c?.enlaces[0]?.href)

// ── C4 · una palabra con punto, sin www., queda texto plano ─────────────────
await comentar('Escribime a andotek.cl cuando puedas')
c = await ultimoComentario()
chk(c?.enlaces.length === 0, 'C4 "andotek.cl" a secas queda como texto plano', JSON.stringify(c?.enlaces))

// ── C5 · frases y abreviaturas no se vuelven enlace ─────────────────────────
await comentar('Cerramos la fase 1. Falta la doc. y el acta. Etc.')
c = await ultimoComentario()
chk(c?.enlaces.length === 0, 'C5 puntos de frase y abreviaturas no se vuelven enlace', JSON.stringify(c?.enlaces))

// ── C9 · esquema que no es http/https → texto plano ─────────────────────────
// El caso de seguridad. Se comprueba con el usuario de la sesión y, más abajo,
// otra vez como cliente invitado, que es quien lo escribiría en la práctica.
for (const raro of ['javascript:alert(1)', 'ftp://archivos.andotek.cl/x', 'data:text/html,hola']) {
  await comentar(`Ojo con esto: ${raro}`)
  c = await ultimoComentario()
  chk(c?.enlaces.length === 0, `C9 "${raro}" no se vuelve enlace`, JSON.stringify(c?.enlaces))
}

// ── Bordes del reconocimiento ───────────────────────────────────────────────
// Pegado a otra palabra no cuenta: si no, media palabra se volvería enlace.
await comentar('Nota interna xhttps://andotek.cl no es una dirección')
c = await ultimoComentario()
chk(c?.enlaces.length === 0, 'Borde: "https://" pegado a otra palabra no se vuelve enlace', JSON.stringify(c?.enlaces))

// El punto final de la frase no forma parte de la dirección…
await comentar('Está todo en https://andotek.cl/acta.')
c = await ultimoComentario()
chk(c?.enlaces.length === 1 && c.enlaces[0].visible === 'https://andotek.cl/acta',
    'Borde: el punto final de la frase queda fuera del enlace', JSON.stringify(c?.enlaces))

// …pero un paréntesis que sí es parte de la dirección se conserva.
await comentar('Fuente: https://es.wikipedia.org/wiki/Chile_(pais)')
c = await ultimoComentario()
chk(c?.enlaces.length === 1 && c.enlaces[0].visible.endsWith('Chile_(pais)'),
    'Borde: un paréntesis propio de la dirección se conserva', JSON.stringify(c?.enlaces))

// ── C7 · mención y enlace conviven ──────────────────────────────────────────
const caja = p.locator('.comentario-nuevo textarea')
await caja.fill('@Josue')
await esperar(500)
const sugerencias = await p.locator('.mencion-lista button').count()
chk(sugerencias > 0, 'C10 el autocompletado de menciones sigue funcionando', `${sugerencias} sugerencias`)
await p.locator('.mencion-lista button').first().click()
await esperar(300)
await caja.press('End')
await caja.type(' revisá https://andotek.cl/acta')
await esperar(300)
await p.locator('.comentario-nuevo button', { hasText: 'Comentar' }).click()
await esperar(800)
c = await ultimoComentario()
chk(c?.menciones.length === 1 && c.menciones[0].startsWith('@') && !c.menciones[0].includes('alguien'),
    'C7 la mención sigue resolviendo a la persona', JSON.stringify(c?.menciones))
chk(c?.enlaces.length === 1 && c.enlaces[0].visible === 'https://andotek.cl/acta',
    'C7 el enlace del mismo comentario también funciona', JSON.stringify(c?.enlaces))

// ── C8 · un enlace muy largo no desborda el panel ───────────────────────────
const largo = 'https://andotek.cl/' + 'segmento-largo-sin-espacios'.repeat(8)
await comentar(`Informe completo: ${largo}`)
const medidas = await p.evaluate(() => {
  const panel = document.querySelector('.panel-detalle')
  const ps = [...document.querySelectorAll('.comentario__texto')]
  const a = ps[ps.length - 1].querySelector('a')
  return {
    anchoPanel: +panel.getBoundingClientRect().width.toFixed(1),
    desbordaPanel: panel.scrollWidth > panel.clientWidth + 1,
    enlaceDentro: a.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 1,
    desbordaPagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})
chk(!medidas.desbordaPanel && medidas.enlaceDentro && medidas.desbordaPagina === 0,
    'C8 un enlace muy largo no rompe el ancho del panel', JSON.stringify(medidas))

// ── C6 · retroactivo: un comentario guardado ANTES del cambio ───────────────
// Se escribe directo en el estado guardado —como si llevara ahí desde antes— y
// se recarga la aplicación. No se toca nada más.
await p.evaluate((clave) => {
  const e = JSON.parse(localStorage.getItem(clave))
  // Sobre la MISMA tarea que se está mirando: el último comentario del hilo
  // es uno de los que acaba de publicar esta prueba.
  const ultimo = e.comentarios[e.comentarios.length - 1]
  e.comentarios.push({
    id: 'c-viejo-299',
    tareaId: ultimo.tareaId,
    autorId: ultimo.autorId,
    texto: 'Adjunto lo pedido en https://andotek.cl/informe-2024',
    timestamp: '2024-10-01T10:00:00Z',
  })
  localStorage.setItem(clave, JSON.stringify(e))
}, CLAVE_ESTADO)
await p.reload()
await esperar(900)
await abrirPrimeraTarea()
const viejo = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.comentario__texto')]
    .find((x) => x.textContent.includes('informe-2024'))
  return el ? [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')) : null
})
chk(viejo?.length === 1 && viejo[0].startsWith('https://andotek.cl/informe-2024'),
    'C6 un comentario ya escrito se ve como enlace, sin tocar sus datos', JSON.stringify(viejo))

// ── C9 (como cliente invitado) + C10 ────────────────────────────────────────
await p.evaluate(() => localStorage.removeItem('planificador.sesion.v1'))
await p.reload()
await esperar(900)
await entrarComo('Cliente Arauco')
await abrirPrimeraTarea()
const puedeComentar = await p.locator('.comentario-nuevo textarea').count()
chk(puedeComentar === 1, 'C9 el cliente invitado puede comentar')
if (puedeComentar) {
  await comentar('Mi enlace: javascript:alert(document.cookie)')
  c = await ultimoComentario()
  chk(c?.enlaces.length === 0 && c.texto.includes('javascript:alert(document.cookie)'),
      'C9 como cliente invitado, un esquema que no es http/https queda texto plano',
      JSON.stringify(c?.enlaces))

  await comentar('Y este sí: https://cliente.example.org/doc')
  c = await ultimoComentario()
  chk(c?.enlaces.length === 1, 'C9 el cliente invitado sí obtiene enlace con https', JSON.stringify(c?.enlaces))

  // C10: el cuadro se comporta igual — se vacía al publicar y autocompleta.
  const vacia = await p.locator('.comentario-nuevo textarea').inputValue()
  chk(vacia === '', 'C10 el cuadro se vacía al publicar, como antes', JSON.stringify(vacia))
}

await b.close()
console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #299 — los enlaces de los comentarios se ven como enlaces')
