// #304 — Los correos dicen dónde entrar.
//
// Qué comprueba: el CUERPO REAL de los dos correos. No hay copia del texto en
// esta prueba — se extrae la plantilla del propio `index.ts` de cada función y
// se evalúa con valores de mentira. Si alguien edita el correo, esto lo ve.
//
// Lo que NO cubre, porque exige la plataforma: que Resend entregue, y que el
// enlace de un solo uso funcione de punta a punta. Eso son los criterios 1 a 5
// del pedido y se comprueban con correos reales tras desplegar.
//
// Cómo correrla:  node docs/prueba-304-correos.mjs
import { readFileSync } from 'node:fs'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

/**
 * Saca el cuerpo del correo del código fuente y lo arma con valores de
 * mentira. `sitio` se pasa distinto del real a propósito: si el texto tuviera
 * la dirección escrita fija, el resultado no lo seguiría y se nota.
 */
function render(archivo, { sitio, enlace, nombre }) {
  const fuente = readFileSync(archivo, 'utf8')
  const m = fuente.match(/html: `([\s\S]*?)`,\n/)
  if (!m) throw new Error(`no se encontró la plantilla del correo en ${archivo}`)
  const plantilla = m[1]
  // Se evalúa la plantilla tal cual, con las mismas variables que usa el
  // código: `usuario`, `enlace` y `sitio`.
  // eslint-disable-next-line no-new-func
  const armar = new Function('usuario', 'enlace', 'sitio', `return \`${plantilla}\``)
  return { html: armar({ nombre }, enlace, sitio), fuente }
}

/** Párrafos visibles, sin etiquetas ni comentarios HTML. */
const parrafos = (html) =>
  [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) =>
    x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  )

const SITIO = 'https://ejemplo-de-prueba.invalid'

// ── Invitación ─────────────────────────────────────────────────────────────
console.log('\n── Invitación ──')
const inv = render('supabase/functions/invitar-usuario/index.ts', {
  sitio: SITIO,
  enlace: `${SITIO}/#invitacion=TOKEN`,
  nombre: 'Ana Pérez',
})
const pInv = parrafos(inv.html)
console.log(pInv.map((t, i) => `  ${i + 1}. ${t}`).join('\n'))

chk(/crea tu contraseña/.test(inv.html), 'C2 dice "crea tu contraseña"')
chk(!/define tu contraseña/.test(inv.html), 'C2 ya no dice "define tu contraseña"')
chk(
  pInv.at(-1) ===
    `Una vez activada tu cuenta, entra en ${SITIO} con este mismo correo y la contraseña que acabas de crear.`,
  'C1 la frase nueva es el ÚLTIMO párrafo, con la dirección completa',
  JSON.stringify(pInv.at(-1)),
)
chk(
  pInv.at(-2).includes('caduca en 7 días'),
  'C1 la frase nueva va DESPUÉS del aviso de caducidad',
  JSON.stringify(pInv.at(-2)),
)
chk(
  inv.html.includes(`<a href="${SITIO}">${SITIO}</a>`),
  'C1 la dirección va como enlace y a la vista, con https://',
)

// ── Restablecer contraseña ─────────────────────────────────────────────────
console.log('\n── Restablecer contraseña ──')
const rec = render('supabase/functions/recuperar-contrasena/index.ts', {
  sitio: SITIO,
  enlace: `${SITIO}/#recuperar=TOKEN`,
  nombre: 'Ana Pérez',
})
const pRec = parrafos(rec.html)
console.log(pRec.map((t, i) => `  ${i + 1}. ${t}`).join('\n'))

chk(/Crea una nueva/.test(rec.html), 'C4 dice "Crea una nueva"')
chk(!/Elige una nueva/.test(rec.html), 'C4 ya no dice "Elige una nueva"')
chk(/Si no solicitaste el cambio/.test(rec.html), 'C4 dice "Si no solicitaste el cambio"')
chk(!/Si no fuiste tú/.test(rec.html), 'C4 ya no dice "Si no fuiste tú"')
chk(
  pRec.at(-1).startsWith('Si no solicitaste el cambio'),
  'C4 el aviso de seguridad sigue siendo el ÚLTIMO párrafo',
  JSON.stringify(pRec.at(-1)),
)
chk(
  pRec.at(-2) === `Una vez guardada, entra en ${SITIO} con este mismo correo y tu contraseña nueva.`,
  'C4 la frase nueva va JUSTO ANTES del aviso de seguridad',
  JSON.stringify(pRec.at(-2)),
)
chk(
  rec.html.includes(`<a href="${SITIO}">${SITIO}</a>`),
  'C4 la dirección va como enlace y a la vista, con https://',
)

// ── La dirección NO está escrita fija ──────────────────────────────────────
console.log('\n── La dirección sigue a la configuración ──')
for (const [nombre, r] of [['invitación', inv], ['restablecer', rec]]) {
  chk(
    !/planning\.andotek\.cl/.test(r.fuente),
    `${nombre}: el dominio real no aparece escrito en el código`,
  )
}
// Se rearma con OTRA dirección: el texto tiene que seguirla.
const OTRO = 'https://otra-direccion.invalid'
const invOtro = render('supabase/functions/invitar-usuario/index.ts', {
  sitio: OTRO, enlace: `${OTRO}/#invitacion=T`, nombre: 'Ana',
})
const recOtro = render('supabase/functions/recuperar-contrasena/index.ts', {
  sitio: OTRO, enlace: `${OTRO}/#recuperar=T`, nombre: 'Ana',
})
chk(
  invOtro.html.includes(OTRO) && !invOtro.html.includes(SITIO),
  'la invitación sigue la configuración: cambia la dirección, cambia el texto',
)
chk(
  recOtro.html.includes(OTRO) && !recOtro.html.includes(SITIO),
  'restablecer sigue la configuración: cambia la dirección, cambia el texto',
)

console.log(process.exitCode ? '\n⛔ HAY FALLAS' : '\n✅ #304 — los correos dicen dónde entrar')
