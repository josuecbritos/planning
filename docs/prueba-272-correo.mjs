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

// ── La tabla: cuatro columnas que caben en el ancho de un correo ──────────
// Los anchos NO se copian acá: se leen de la propia hoja de estilos que el
// correo emite y se comprueba que sumen lo que tienen que sumar.
console.log('\n── La tabla ──')
const conTodo = html(
  base({
    atrasadas: [
      t({
        titulo: 'Conseguir referencia CA',
        categoria: 'atrasada_replan',
        atraso: 24,
        replanificaciones: 3,
        colorProyecto: '#6a1b9a',
      }),
    ],
    vencenHoy: [t({ titulo: 'Enviar informe', fecha: HOY, categoria: 'pendiente' })],
    semana: 43,
  }),
)
// Los anchos se leen del atributo `width` de cada encabezado, que es donde
// viven ahora: varios clientes ignoran los de estilo, así que van en los dos.
const COLUMNAS = ['Tarea', 'Ubicación', 'Fecha Objetivo', 'Atraso']
const anchos = COLUMNAS.map((col) =>
  Number((conTodo.match(new RegExp(`<th width="(\\d+)"[^>]*>${col}</th>`)) ?? [])[1]),
)
console.log(`  columnas: ${COLUMNAS.map((c, i) => `${c}=${anchos[i]}`).join(' · ')}`)
chk(
  anchos.join(',') === '230,190,108,80',
  '#272-1 · las cuatro columnas miden 230 · 190 · 108 · 80',
  anchos.join(','),
)
chk(
  anchos.reduce((a, b) => a + b, 0) === 608,
  '#272-1 · y suman exactamente los 608 útiles',
  String(anchos.reduce((a, b) => a + b, 0)),
)
chk(
  /<table width="640"[^>]*style="width:640px/.test(conTodo),
  '#272-1 · dentro de una tarjeta de 640, que es lo que un correo muestra sin recortar',
)
chk(
  /<table width="608"[^>]*style="width:608px/.test(conTodo),
  '#272-1 · y la tabla declara sus 608 en el atributo y en el estilo',
)
// Los anchos van en los DOS sitios: hay clientes que ignoran los de estilo.
chk(
  ['230', '190', '108', '80'].every((w) => conTodo.includes(`<td width="${w}"`)),
  '#272-1 · cada celda repite su ancho en el atributo `width`',
)
chk(/table-layout:fixed/.test(conTodo), '#272-1 · con el ancho fijo, para que las columnas no se descuadren')

for (const col of ['Tarea', 'Ubicación', 'Fecha Objetivo', 'Atraso']) {
  chk(new RegExp(`>${col}</th>`).test(conTodo), `la columna ${col} está`)
}
const orden = ['Tarea', 'Ubicación', 'Fecha Objetivo', 'Atraso'].map((c) => conTodo.indexOf(`>${c}</th>`))
chk(orden.every((v, i) => i === 0 || v > orden[i - 1]), 'y en ese orden')
chk(!/>Estado</.test(conTodo), '#272-1 · la columna Estado ya NO está')
chk(!/estado-chip|108px;height:30px/.test(conTodo), '#272-1 · ni queda rastro de la pastilla')
chk(!/>Proyecto</.test(conTodo), 'NO hay columna Proyecto aparte')

// Criterios 2 y 3: los encabezados y las dos columnas de números, en una línea
// y centrados.
// Dos secciones, así que cada uno de los dos encabezados aparece dos veces.
chk(
  (conTodo.match(/white-space:nowrap;">(?:Fecha Objetivo|Atraso)</g) ?? []).length === 4,
  '#272-2 · "Fecha Objetivo" y "Atraso" no se parten en dos líneas, en las dos secciones',
  String((conTodo.match(/white-space:nowrap;">(?:Fecha Objetivo|Atraso)</g) ?? []).length),
)
chk(
  (conTodo.match(/<th width="(?:108|80)" align="center"/g) ?? []).length === 4 &&
    (conTodo.match(/<td width="(?:108|80)" align="center"/g) ?? []).length === 4,
  '#272-3 · las dos van centradas, encabezado incluido',
)

// ── Igual que Mis Tareas ──────────────────────────────────────────────────
// Cada valor se mide CONTRA `src/styles.css`: no se copia acá. Si la pantalla
// cambia de paleta o de medidas, el correo deja de coincidir y esto lo dice.
console.log('\n── Igual que Mis Tareas ──')
const css = readFileSync('src/styles.css', 'utf8')
const token = (n) => (css.match(new RegExp(`\\s--${n}:\\s*(#[0-9a-fA-F]{6});`)) ?? [])[1]
const fuente = readFileSync('supabase/functions/resumen-diario/plantilla.ts', 'utf8')
const regla = (selector) => {
  const m = css.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  return m ? m[1].replace(/\s+/g, ' ') : ''
}
const prop = (selector, nombre) => {
  const m = regla(selector).match(new RegExp(`(?:^|;|\\s)${nombre}:\\s*([^;]+)`))
  return m ? m[1].trim() : ''
}

// 4 · El ↻ ×N, pegado al nombre y dentro de su misma celda.
chk(/&#8635; &times;3/.test(conTodo), '#272-4 · una tarea replanificada muestra ↻ ×N con su número')
const marcaReplan = (conTodo.match(/Conseguir referencia CA<span style="([^"]*)">&#8635;/) ?? [])[1] ?? ''
chk(marcaReplan !== '', '#272-4 · pegado a la última palabra del nombre, sin nada en medio')
chk(
  /margin-left:8px/.test(marcaReplan) && /white-space:nowrap/.test(marcaReplan),
  '#272-4 · con su separación y sin partirse',
)
chk(
  marcaReplan.includes("font-family:'JetBrains Mono',ui-monospace,monospace") &&
    /font-size:11px/.test(marcaReplan) &&
    /font-weight:700/.test(marcaReplan) &&
    marcaReplan.includes(`color:${token('ambar-texto')}`),
  '#272-4 · monoespaciada en 700 y con el ámbar del producto',
  token('ambar-texto'),
)
chk(!/&times;0\b/.test(conTodo), '#272-4 · y no aparece cuando la tarea nunca se movió')

// 5 · El punto de color del proyecto.
chk(prop('.nav-proyecto__dot', 'width') === '10px', 'terreno: `.nav-proyecto__dot` mide 10px')
// `display:flex` no existe en Outlook: el punto va en línea, con su margen.
const marcaPunto = (conTodo.match(/<span style="(display:inline-block[^"]*)"><\/span>/) ?? [])[1] ?? ''
chk(
  /width:10px;height:10px;border-radius:3px/.test(marcaPunto),
  '#272-5 · el punto tiene la forma del producto',
  marcaPunto,
)
chk(!/display:flex/.test(conTodo), '#272-5 · y va en línea, sin `display:flex`, que Outlook no entiende')
chk(
  /background:#6a1b9a;[^"]*"><\/span><span[^>]*>Proyecto › /.test(conTodo),
  '#272-5 · lleva el color de SU proyecto y abre la ubicación',
)

// 6 · La fecha de una atrasada, en rojo y negrita.
chk(prop('.fecha-vencida', 'color') === 'var(--rojo)', 'terreno: `.fecha-vencida` usa --rojo')
// La atrasada del ejemplo vence el 01-sep; la otra, hoy. El estilo se lee de
// la celda misma: ya no hay clase a la que mirar.
// Se exige el `width` de la columna: la fecha de hoy aparece TAMBIÉN en el
// encabezado del correo, y sin esto se mediría esa celda en vez de la de la
// tarea — que fue exactamente lo que pasó la primera vez.
const estiloDe = (ancho, texto) =>
  (conTodo.match(new RegExp(`<td width="${ancho}"[^>]*style="([^"]*)">${texto}<`)) ?? [])[1] ?? ''
const estiloVencida = estiloDe(108, '01-sep-2026')
const estiloHoy = estiloDe(108, fecha(HOY))
chk(
  estiloVencida.includes(`color:${token('rojo')};font-weight:700;`),
  '#272-6 · el rojo de la fecha vencida es el del producto, y va en 700',
  token('rojo'),
)
chk(
  estiloVencida !== '' && /white-space:nowrap/.test(estiloVencida),
  '#272-6 · la fecha de una atrasada la lleva',
)
chk(
  estiloHoy !== '' && !estiloHoy.includes(token('rojo')) && /font-weight:500/.test(estiloHoy),
  '#272-6 · la de una que vence hoy, no: va en 500 como el resto',
)

// 7 · El grosor de fecha y atraso: la aplicación carga JetBrains Mono solo en
//     500 y 700, así que nada monoespaciado va en 400.
chk(
  estiloHoy.includes("font-family:'JetBrains Mono',ui-monospace,monospace") &&
    /font-size:12px/.test(estiloHoy) &&
    estiloDe(80, '24 días').includes('font-size:12px;font-weight:500'),
  '#272-7 · fecha y atraso van en monoespaciada de 12px y peso 500, como en la pantalla',
)
chk(
  !/font-weight:400/.test(conTodo),
  '#272-7 · nada monoespaciado queda en 400, que es un peso que la marca no tiene',
)
chk(prop('.tarea-cell', 'font-weight') === '500', 'terreno: `.tarea-cell` pesa 500')
chk(
  /<td width="230"[^>]*font-weight:500;/.test(conTodo),
  '#272-7 · y el nombre de la tarea pesa lo mismo que en la tabla',
)

// 8 · La fila, pintada con el color de su estado.
// Sin hoja de estilos no hay clase que valga: lo que viaja es el color, en
// CADA celda de la fila.
const fuentePlantilla = readFileSync('supabase/functions/resumen-diario/plantilla.ts', 'utf8')
for (const [categoria, tokenNombre] of [
  ['atrasada', 'rojo-suave'],
  ['atrasada_replan', 'morado-suave'],
  ['pendiente_replan', 'ambar-suave'],
]) {
  const c = token(tokenNombre)
  const emitido = html(base({ atrasadas: [t({ titulo: 'X', categoria })] }))
  chk(
    (emitido.match(new RegExp(`background:${c};`, 'g')) ?? []).length === 4,
    `#272-8 · ${categoria} pinta sus CUATRO celdas con el color del producto (--${tokenNombre})`,
    c,
  )
}
chk(
  (conTodo.match(new RegExp(`background:${token('morado-suave')};`, 'g')) ?? []).length === 4,
  '#272-8 · y la fila atrasada replanificada la lleva puesta',
)
// Solo las CELDAS: el blanco lo llevan también la tarjeta y la tabla.
const celdasBlancas = (
  html(base({ vencenHoy: [t({ titulo: 'X', categoria: 'pendiente', fecha: HOY })] })).match(
    /<td width="\d+"[^>]*background:#ffffff;/g,
  ) ?? []
).length
chk(
  celdasBlancas === 4,
  '#272-8 · una pendiente sin replanificar va en blanco, que es la fila sin color',
  String(celdasBlancas),
)
chk(!/class="/.test(conTodo), '#272-8 · y no queda ninguna clase, que sin hoja de estilos no sirve de nada')
// Los colores van RESUELTOS: Outlook de escritorio no entiende variables CSS y
// ahí las filas quedarían blancas.
chk(!/var\(--/.test(conTodo), '#272-8 · ningún estilo depende de una variable CSS')
// EL DEFECTO QUE ESTA RONDA CIERRA: los estilos iban en un bloque <style> y
// Gmail lo descartó entero — el correo llegó sin colores, sin bordes, sin
// anchos y sin tipografías. Medido en producción el 09-sep-2026.
chk(!/<style/i.test(conTodo), '#272-2 · no hay ningún bloque <style>: Gmail lo descarta entero')
chk(
  (conTodo.match(/ style="/g) ?? []).length > 20,
  '#272-2 · los estilos van escritos en cada elemento',
  `${(conTodo.match(/ style="/g) ?? []).length} elementos con estilo`,
)

// ── Tipografías (criterio 9) ──────────────────────────────────────────────
console.log('\n── Tipografías ──')
chk(
  !/@font-face|@import|fonts\.googleapis|fonts\.gstatic|<link/.test(conTodo),
  '#272-9 · el correo no CARGA ninguna tipografía de la web',
)
// Nombrarlas no es cargarlas: van primero por si el lector ya las tiene, y
// detrás va el respaldo del sistema. Lo que se replica es el peso y el tamaño.
chk(
  /font-family:Inter,system-ui,sans-serif/.test(conTodo),
  '#272-9 · las nombra con respaldo del sistema detrás',
)
chk(
  /'JetBrains Mono',ui-monospace,monospace/.test(conTodo),
  '#272-9 · y la monoespaciada, igual',
)
chk(
  (conTodo.match(/'JetBrains Mono'/g) ?? []).length >= 4,
  '#272-9 · en el encabezado de tabla, la fecha, el atraso y el ↻ ×N',
  `${(conTodo.match(/'JetBrains Mono'/g) ?? []).length} usos`,
)

// ── Encabezado, enlaces y pie ─────────────────────────────────────────────
console.log('\n── Encabezado, enlaces y pie ──')
chk(
  new RegExp(`Ando<span style="color:${token('naranja')};">tek</span><span [^>]*>Planning</span>`).test(conTodo),
  'el encabezado lleva el wordmark, con el naranja de la marca',
  token('naranja'),
)
chk(
  new RegExp(`<td align="right"[^>]*>${fecha(HOY)}</td>`).test(conTodo),
  'y la fecha de hoy a la derecha',
)

chk(/>Ver mis tareas</.test(conTodo), 'el enlace se llama "Ver mis tareas"')
chk(conTodo.includes(`href="${SITIO}/#mis-tareas"`), 'y apunta a Mis Tareas')
chk(
  conTodo.indexOf(SEMANA) < conTodo.indexOf('Ver mis tareas'),
  'va en el mismo párrafo que la línea de la semana, detrás de ella',
)
// Sin tareas para la semana desaparece la FRASE, no el párrafo: el correo no
// puede quedarse sin lo único que lleva de vuelta a la herramienta.
const sinSemana = html(base({ atrasadas: [t({})] }))
chk(!/vencen esta semana/.test(sinSemana), 'sin tareas para la semana, la frase no está')
chk(/<p style="[^"]*"><a href/.test(sinSemana), 'pero el enlace sí, solo en su párrafo')

chk(
  /Recibes este correo porque tienes activado el resumen diario\./.test(conTodo),
  'el pie dice por qué llega el correo',
)
chk(/>Gestionar correos</.test(conTodo), 'y termina con el enlace "Gestionar correos"')
chk(conTodo.includes(`href="${SITIO}/#mi-cuenta"`), 'que lleva a Mi cuenta')
// Ningún enlace muestra la dirección escrita: el texto visible —lo que queda
// al quitar las etiquetas— no puede contener ninguna.
chk(!/https?:\/\//.test(conTodo.replace(/<[^>]+>/g, ' ')), 'ningún enlace muestra la dirección escrita')
// Y la dirección NO está fija: se pasa una distinta y el correo la sigue.
chk(
  html(base({ atrasadas: [t({})], sitio: 'https://otra-direccion.invalid' })).includes(
    'https://otra-direccion.invalid/#mi-cuenta',
  ),
  'la dirección sale de la configuración, no está escrita fija',
)

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
