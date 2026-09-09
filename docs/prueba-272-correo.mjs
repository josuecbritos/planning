// #272 — El correo del resumen diario: asunto, cuerpo con formato y cuerpo en
// texto plano.
//
// No hay ninguna copia del texto en esta prueba: importa `plantilla.ts`, que
// es EXACTAMENTE lo que la función de servidor envía. Si alguien edita el
// correo, esto lo ve.
//
// Lo que NO cubre, porque exige la plataforma: que Resend entregue, que el
// programador despierte a las 8:00 y cómo se ve en Outlook. Eso son los
// criterios 5 a 14 del pedido y se comprueban con correos reales tras
// desplegar (DEPLOY.md § "Resumen diario").
//
// Cómo correrla:  node docs/prueba-272-correo.mjs
import { readFileSync } from 'node:fs'
import { asunto, html, texto, fecha, atraso, lineaSemana } from '../supabase/functions/resumen-diario/plantilla.ts'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const SITIO = 'https://ejemplo-de-prueba.invalid'
const HOY = '2026-09-08'

const t = (o) => ({
  titulo: 'Tarea',
  proyecto: 'Proyecto',
  frente: 'Frente',
  subFrente: 'Sub',
  fecha: '2026-09-01',
  categoria: 'atrasada',
  atraso: 0,
  replanificaciones: 0,
  colorProyecto: '#607d8b',
  ...o,
})

const base = (o) => ({ nombre: 'Ana Pérez', atrasadas: [], vencenHoy: [], semana: 0, hoy: HOY, sitio: SITIO, ...o })

// ── Asunto (criterios 6 y 7) ───────────────────────────────────────────────
// Sin la marca al final: el remitente ya dice Andotek Planning y repetirlo
// gasta 17 de los pocos caracteres que el programa de correo muestra.
console.log('\n── Asunto ──')
const asuntoDe = (a, h) =>
  asunto(base({ atrasadas: Array.from({ length: a }, () => t({})), vencenHoy: Array.from({ length: h }, () => t({})) }))
for (const [a, h, esperado] of [
  [9, 2, '9 tareas atrasadas · 2 vencen hoy'],
  [9, 0, '9 tareas atrasadas'],
  [0, 2, '2 tareas vencen hoy'],
  [1, 0, '1 tarea atrasada'],
  [0, 1, '1 tarea vence hoy'],
]) {
  chk(asuntoDe(a, h) === esperado, `#272-6/7 · ${a} atrasadas + ${h} de hoy → "${esperado}"`, asuntoDe(a, h))
}
chk(!/Andotek Planning/.test(asuntoDe(9, 2)), '#272-6 · el asunto NO lleva "— Andotek Planning"')
chk(asuntoDe(9, 2).length <= 40, '#272-6 · y entra en los 40 caracteres que se ven', `${asuntoDe(9, 2).length}`)

// ── Los bloques (criterios 5, 7 y 12) ──────────────────────────────────────
console.log('\n── Los bloques ──')
const completo = html(
  base({
    atrasadas: [t({ titulo: 'Cerrar acta', atraso: 4, categoria: 'atrasada_replan' })],
    vencenHoy: [t({ titulo: 'Enviar informe', fecha: HOY, categoria: 'pendiente' })],
    semana: 43,
  }),
)
const BAJADA = 'A continuación un resumen de tus tareas pendientes hasta el día de hoy:'
const SEMANA = 'Además, 43 tareas tuyas vencen esta semana.'

chk(/>Atrasadas</.test(completo), 'la sección "Atrasadas" aparece')
chk(/>Vencen hoy</.test(completo), 'la sección "Vencen hoy" aparece')
chk(completo.indexOf('>Atrasadas<') < completo.indexOf('>Vencen hoy<'), 'y van en ese orden')
chk(/Hola Ana Pérez,/.test(completo), '#272-8 · el saludo dice "Hola {nombre}," con el nombre completo')
chk(completo.includes(BAJADA), '#272-8 · y debajo va la bajada, textual')
chk(
  completo.indexOf('Hola Ana Pérez,') < completo.indexOf(BAJADA) &&
    completo.indexOf(BAJADA) < completo.indexOf('>Atrasadas<'),
  '#272-8 · saludo, bajada y recién después los bloques',
)

const soloAtrasadas = html(base({ atrasadas: [t({})] }))
chk(!/>Vencen hoy</.test(soloAtrasadas), 'un bloque SIN tareas no aparece (Vencen hoy)')
const soloHoy = html(base({ vencenHoy: [t({ fecha: HOY })] }))
chk(!/>Atrasadas</.test(soloHoy), 'un bloque SIN tareas no aparece (Atrasadas)')

// La línea de la semana dejó de ser una sección con título: es UNA línea de
// contexto, después de la última tabla.
chk(completo.includes(SEMANA), '#272-9 · la línea de la semana dice el número', SEMANA)
chk(!/>Esta semana</.test(completo), '#272-9 · y ya no lleva título de sección')
chk(
  completo.indexOf('>Vencen hoy<') < completo.indexOf(SEMANA),
  '#272-9 · va después de la última tabla',
)
chk(!/vencen esta semana/.test(soloAtrasadas), '#272-9 · sin ninguna, la línea desaparece')
chk(
  lineaSemana(1) === 'Además, 1 tarea tuya vence esta semana.',
  '#272-9 · y en singular concuerda',
  lineaSemana(1),
)

// ── La tabla, con el formato de Mis Tareas (criterio 5) ────────────────────
console.log('\n── La tabla ──')
for (const col of ['Tarea', 'Ubicación', 'Estado', 'Fecha Objetivo', 'Atraso']) {
  chk(new RegExp(`>${col}</th>`).test(completo), `la columna ${col} está`)
}
const orden = ['Tarea', 'Ubicación', 'Estado', 'Fecha Objetivo', 'Atraso'].map((c) =>
  completo.indexOf(`>${c}</th>`),
)
chk(orden.every((v, i) => i === 0 || v > orden[i - 1]), 'y en ese orden')
chk(!/>Proyecto</.test(completo), 'NO hay columna Proyecto aparte')
chk(
  /Proyecto › Frente › Sub/.test(completo),
  'Ubicación es la ruta completa Proyecto › Frente › Sub Frente',
)
chk(/>Atrasada replanificada</.test(completo), 'Estado es la pastilla con el nombre completo de la categoría')
chk(/08-sep-2026/.test(completo), 'la fecha va en el formato del producto', fecha(HOY))
chk(fecha('2026-01-05') === '05-ene-2026', 'y con el mes en el nombre corto de siempre', fecha('2026-01-05'))
chk(atraso(4) === '4 días' && atraso(1) === '1 día' && atraso(0) === '—', 'el atraso concuerda y el vacío es "—"')

// Los cinco colores del producto, medidos CONTRA la hoja de estilos: si
// alguien cambia la paleta en `styles.css`, esta prueba lo ve.
const css = readFileSync('src/styles.css', 'utf8')
const token = (n) => (css.match(new RegExp(`\\s--${n}:\\s*(#[0-9a-fA-F]{6});`)) ?? [])[1]
const fuente = readFileSync('supabase/functions/resumen-diario/plantilla.ts', 'utf8')
for (const [nombre, cual] of [
  ['verde-suave', 'fila hecha'],
  ['rojo-suave', 'fila atrasada'],
  ['ambar-suave', 'fila pendiente replanificada'],
  ['morado-suave', 'fila atrasada replanificada'],
]) {
  const v = token(nombre)
  chk(Boolean(v) && fuente.includes(v), `el color de la ${cual} es el del producto (--${nombre})`, v ?? 'sin token')
}
chk(
  completo.includes(`background:${token('morado-suave')}`),
  'y la fila COMPLETA va pintada con el color de su estado',
)

// ── Las cinco diferencias con Mis Tareas (criterios 1 a 5) ────────────────
// Cada una se mide CONTRA `src/styles.css`: los valores no se copian acá, se
// leen de la hoja de estilos del producto. Si la pantalla cambia, esto lo ve.
console.log('\n── Igual que Mis Tareas ──')

/** El valor de una propiedad dentro de una regla de `styles.css`. */
const regla = (selector) => {
  const m = css.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  return m ? m[1].replace(/\s+/g, ' ') : ''
}
const prop = (selector, nombre) => {
  const m = regla(selector).match(new RegExp(`(?:^|;|\\s)${nombre}:\\s*([^;]+)`))
  return m ? m[1].trim() : ''
}

const conTodo = html(
  base({
    atrasadas: [t({ titulo: 'Cerrar acta', atraso: 4, categoria: 'atrasada_replan', replanificaciones: 3, colorProyecto: '#8e44ad' })],
    vencenHoy: [t({ titulo: 'Enviar informe', fecha: HOY, categoria: 'pendiente' })],
  }),
)

// 1 · La pastilla: ancho, alto, tamaño de letra, mayúsculas y monoespaciada,
//     todo tomado de `.estado-chip` (la regla base y la que la pasa a mono).
const anchoPastilla = prop('.estado-chip', 'width')
const altoPastilla = prop('.estado-chip', 'height')
chk(anchoPastilla === '108px' && altoPastilla === '30px', 'terreno: `.estado-chip` mide 108×30', `${anchoPastilla}×${altoPastilla}`)
chk(
  conTodo.includes(`width:${anchoPastilla};height:${altoPastilla}`),
  '#272-1 · la pastilla del correo tiene el MISMO ancho y alto que la de Mis Tareas',
)
chk(/text-transform:uppercase/.test(conTodo), '#272-1 · va en mayúsculas')
chk(/font-size:8\.5px;font-weight:700;letter-spacing:\.04em/.test(conTodo), '#272-1 · con su tamaño, peso y tracking')
chk(
  new RegExp(`border:1px solid ${token('morado-suave') ? '#d5bfe0' : 'X'};border-radius:4px`).test(conTodo),
  '#272-1 · y el borde del color de su estado, con las esquinas de 4px',
)
// `border-radius:10px` a secas también lo tiene la tarjeta del correo entera,
// así que se busca la FIRMA de la píldora vieja y no el valor suelto.
chk(
  !/border-radius:10px;font-size:11px;font-weight:600/.test(conTodo),
  '#272-1 · ya no es la píldora redondeada y en negrita de antes',
)

// 2 · ↻ ×N junto al nombre, con la anatomía de `.replan-count`.
chk(/↻ ×3/.test(conTodo), '#272-2 · una tarea replanificada muestra ↻ ×N con su número')
chk(
  conTodo.indexOf('↻ ×3') - conTodo.indexOf('Cerrar acta') < 200 &&
    conTodo.indexOf('↻ ×3') > conTodo.indexOf('Cerrar acta'),
  '#272-2 · y va JUNTO al nombre de la tarea',
)
chk(
  conTodo.includes(`color:${token('ambar-texto')}`),
  '#272-2 · con el ámbar de `.replan-count`',
  token('ambar-texto'),
)
chk(!/↻ ×0|↻ ×undefined/.test(conTodo), '#272-2 · y no aparece cuando la tarea nunca se movió')

// 3 · El punto de color del proyecto, al principio de Ubicación.
const puntoW = prop('.nav-proyecto__dot', 'width')
const puntoR = prop('.nav-proyecto__dot', 'border-radius')
chk(puntoW === '10px' && puntoR === '3px', 'terreno: `.nav-proyecto__dot` mide 10px con esquinas de 3px', `${puntoW}/${puntoR}`)
chk(
  conTodo.includes(`width:${puntoW};height:${puntoW};border-radius:${puntoR};background:#8e44ad`),
  '#272-3 · cada fila lleva el punto con el color de SU proyecto, con la forma del producto',
)
chk(
  conTodo.indexOf('#8e44ad') < conTodo.indexOf('Proyecto › Frente › Sub'),
  '#272-3 · y va al PRINCIPIO de la ubicación',
)

// 4 · La fecha de una atrasada, en rojo y negrita como `.fecha-vencida`.
const rojo = token('rojo')
chk(prop('.fecha-vencida', 'color') === 'var(--rojo)', 'terreno: `.fecha-vencida` usa --rojo')
chk(
  new RegExp(`color:${rojo};font-weight:700;">01-sep-2026`).test(conTodo),
  '#272-4 · en el bloque de atrasadas la fecha objetivo va en rojo',
  rojo,
)
chk(
  !new RegExp(`color:${rojo};font-weight:700;">08-sep-2026`).test(conTodo),
  '#272-4 · y la de una que vence hoy, no',
)

// 5 · El nombre de la tarea, con el peso de `.tarea-cell`.
const pesoNombre = prop('.tarea-cell', 'font-weight')
chk(pesoNombre === '500', 'terreno: `.tarea-cell` pesa 500', pesoNombre)
chk(conTodo.includes(`font-weight:${pesoNombre};">Cerrar acta`), '#272-5 · el nombre de la tarea NO va en negrita')
chk(!/font-weight:600;">Cerrar acta/.test(conTodo), '#272-5 · ya no pesa 600')

// ── Tipografías (criterio 13) ──────────────────────────────────────────────
console.log('\n── Tipografías ──')
chk(!/fonts\.googleapis|fonts\.gstatic|@font-face|@import/.test(completo), 'el correo no carga ninguna tipografía de la web')
chk(!/Inter|JetBrains/.test(completo), 'no menciona las de marca, que un cliente bloquearía')
chk(/font-family:Arial/.test(completo), 'el texto usa una tipografía común')
const monoEnFecha = /font-family:'Courier New', Courier, monospace;white-space:nowrap;">08-sep/.test(completo)
chk(monoEnFecha, 'la fecha va en monoespaciada común, para que quede alineada')
chk(
  (completo.match(/'Courier New'/g) ?? []).length >= 3,
  'y también el atraso y la fecha del encabezado',
  `${(completo.match(/'Courier New'/g) ?? []).length} usos`,
)

// ── Encabezado, enlaces y pie (criterio 13c) ───────────────────────────────
console.log('\n── Encabezado, enlaces y pie ──')
chk(/Ando<span style="color:#f97316;">tek<\/span>/.test(completo), 'el encabezado lleva el wordmark, con el naranja de la marca')
chk(/Planning/.test(completo), 'y la palabra Planning')
chk(completo.indexOf('08-sep-2026') > completo.indexOf('Andotek') || /text-align:right[^>]*>08-sep-2026/.test(completo), 'con la fecha de hoy a la derecha')
chk(/>Ver mis tareas</.test(completo), 'el enlace se llama "Ver mis tareas"')
chk(completo.includes(`href="${SITIO}/#mis-tareas"`), 'y apunta a Mis Tareas')
chk(
  /Recibes este correo porque tienes activado el resumen diario\./.test(completo),
  'el pie dice por qué llega el correo',
)
chk(/>Gestionar correos</.test(completo), 'y termina con el enlace "Gestionar correos"')
chk(completo.includes(`href="${SITIO}/#mi-cuenta"`), 'que lleva a Mi cuenta')
// "Ningún enlace del correo muestra la dirección escrita": el texto visible
// —lo que queda al quitar las etiquetas— no puede contener ninguna dirección.
const visible = completo.replace(/<[^>]+>/g, ' ')
chk(!/https?:\/\//.test(visible), 'ningún enlace muestra la dirección escrita')

// La dirección NO está fija: se pasa una distinta a propósito y el correo la
// sigue. Si estuviera escrita, el resultado no cambiaría.
const otro = html(base({ atrasadas: [t({})], sitio: 'https://otra-direccion.invalid' }))
chk(otro.includes('https://otra-direccion.invalid/#mi-cuenta'), 'la dirección sale de la configuración, no está escrita fija')

// ── Texto plano (criterio 13b) ─────────────────────────────────────────────
console.log('\n── Texto plano ──')
const plano = texto(
  base({
    atrasadas: [t({ titulo: 'Cerrar acta', atraso: 4, categoria: 'atrasada_replan' })],
    vencenHoy: [t({ titulo: 'Enviar informe', fecha: HOY, categoria: 'pendiente' })],
    semana: 1,
  }),
)
console.log(plano.split('\n').map((l) => `  │ ${l}`).join('\n'))
chk(!/<[a-z]/i.test(plano), 'no lleva ninguna etiqueta')
chk(/ATRASADAS/.test(plano) && /VENCEN HOY/.test(plano), 'lleva los dos bloques')
chk(/Cerrar acta/.test(plano) && /Enviar informe/.test(plano), 'con sus tareas')
chk(/Proyecto › Frente › Sub/.test(plano), 'cada tarea con su ruta')
chk(/Atrasada replanificada · 01-sep-2026 · atraso 4 días/.test(plano), 'con su estado, su fecha y su atraso')
chk(
  plano.includes('Además, 1 tarea tuya vence esta semana.'),
  '#272-11 · la línea de la semana, con el texto nuevo',
)
chk(plano.includes(BAJADA), '#272-11 · la bajada también va en texto plano')
chk(!/ESTA SEMANA/.test(plano), '#272-11 · y sin el título de sección, igual que en el cuerpo con formato')
chk(
  /Cerrar acta \(replanificada ×3\)/.test(
    texto(base({ atrasadas: [t({ titulo: 'Cerrar acta', replanificaciones: 3 })] })),
  ),
  '#272-11 · el ↻ ×N llega también acá, escrito con palabras',
)
chk(plano.includes(`${SITIO}/#mis-tareas`), 'el enlace, acá sí con la dirección escrita')
chk(
  /Recibes este correo porque tienes activado el resumen diario\./.test(plano) &&
    plano.includes(`Gestionar correos: ${SITIO}/#mi-cuenta`),
  'y el pie con su enlace',
)

// ── Lo que el correo NO hace ───────────────────────────────────────────────
console.log('\n── Lo que el correo NO hace ──')
chk(
  !/List-Unsubscribe/i.test(fuente) && !/darse de baja|Cancelar suscripción/i.test(completo),
  '#272 §6c · no lleva cabecera de baja (evaluado y descartado por ahora)',
)
// El orden es de la base y de nadie más: las reglas del pedido —mayor atraso
// primero, y el orden que el dueño le dio a frentes y sub frentes— viven en
// `resumen_diario_datos()`. Si la plantilla ordenara por su cuenta, habría dos
// verdades y una se quedaría atrás.
chk(
  !/\.sort\(|\.reverse\(/.test(fuente),
  'el correo no ordena nada: recibe las listas ya ordenadas por la base',
)
