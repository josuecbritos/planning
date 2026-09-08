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
  ...o,
})

const base = (o) => ({ nombre: 'Ana Pérez', atrasadas: [], vencenHoy: [], semana: 0, hoy: HOY, sitio: SITIO, ...o })

// ── Asunto (criterios 5 y 7) ───────────────────────────────────────────────
console.log('\n── Asunto ──')
chk(
  asunto(base({ atrasadas: [t({}), t({}), t({})], vencenHoy: [t({}), t({})] })) ===
    '3 atrasadas · 2 vencen hoy — Andotek Planning',
  'con las dos cosas, los DOS números',
  asunto(base({ atrasadas: [t({}), t({}), t({})], vencenHoy: [t({}), t({})] })),
)
chk(
  asunto(base({ atrasadas: [t({}), t({}), t({})] })) === '3 atrasadas — Andotek Planning',
  'solo atrasadas: el asunto lleva solo ese número',
)
chk(
  asunto(base({ vencenHoy: [t({}), t({})] })) === '2 vencen hoy — Andotek Planning',
  'solo de hoy: el asunto lleva solo ese número',
)
chk(asunto(base({ atrasadas: [t({})] })) === '1 atrasada — Andotek Planning', 'singular: "1 atrasada"')
chk(asunto(base({ vencenHoy: [t({})] })) === '1 vence hoy — Andotek Planning', 'singular: "1 vence hoy"')

// ── Los bloques (criterios 5, 7 y 12) ──────────────────────────────────────
console.log('\n── Los bloques ──')
const completo = html(
  base({
    atrasadas: [t({ titulo: 'Cerrar acta', atraso: 4, categoria: 'atrasada_replan' })],
    vencenHoy: [t({ titulo: 'Enviar informe', fecha: HOY, categoria: 'pendiente' })],
    semana: 43,
  }),
)
chk(/>Atrasadas</.test(completo), 'la sección "Atrasadas" aparece')
chk(/>Vencen hoy</.test(completo), 'la sección "Vencen hoy" aparece')
chk(/>Esta semana</.test(completo), 'la sección "Esta semana" aparece')
chk(
  completo.indexOf('>Atrasadas<') < completo.indexOf('>Vencen hoy<') &&
    completo.indexOf('>Vencen hoy<') < completo.indexOf('>Esta semana<'),
  'y van en ese orden',
)
chk(/Hola Ana Pérez,/.test(completo), 'el saludo dice "Hola {nombre},"')
chk(completo.indexOf('Hola Ana Pérez,') < completo.indexOf('>Atrasadas<'), 'el saludo va antes de los bloques')

const soloAtrasadas = html(base({ atrasadas: [t({})] }))
chk(!/>Vencen hoy</.test(soloAtrasadas), 'un bloque SIN tareas no aparece (Vencen hoy)')
const soloHoy = html(base({ vencenHoy: [t({ fecha: HOY })] }))
chk(!/>Atrasadas</.test(soloHoy), 'un bloque SIN tareas no aparece (Atrasadas)')

chk(!/>Esta semana</.test(soloAtrasadas), 'sin nada más en la semana, la sección desaparece')
chk(/43 tareas más vencen esta semana\./.test(completo), 'la línea de la semana dice el número')
chk(lineaSemana(1) === '1 tarea más vence esta semana.', 'y en singular concuerda', lineaSemana(1))

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
chk(/1 tarea más vence esta semana\./.test(plano), 'la línea de la semana')
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
