// #272 — El correo del resumen diario: asunto, cuerpo con formato y cuerpo en
// texto plano. Nada de esto toca la red ni la base: recibe los datos ya
// ordenados por `resumen_diario_datos()` y devuelve texto.
//
// Vive en su propio archivo y no dentro de `index.ts` por una razón práctica:
// así la prueba `docs/prueba-272-correo.mjs` puede importarlo y comprobar el
// correo DE VERDAD —el mismo que se envía— en vez de una copia del texto.
// `index.ts` lo importa con `./plantilla.ts`; al desplegar, la función lleva
// TRES archivos: este, `index.ts` y `credenciales.ts` (DEPLOY.md § "Resumen
// diario por correo").
//
// No usa ninguna API de Deno a propósito: se ejecuta igual en Deno y en Node.
//
// LOS ESTILOS VAN ESCRITOS EN CADA ELEMENTO, no en una hoja aparte. La primera
// versión los emitía en un bloque <style> y **Gmail lo descartó entero**: el
// correo llegó sin colores de fila, sin bordes, sin anchos de columna y sin
// tipografías. Medido en producción el 09-sep-2026 con una corrida forzada.
// Los valores son exactamente los mismos que se aprobaron.

/** Una tarea, tal como la entrega `resumen_diario_datos()`. */
export interface TareaCorreo {
  titulo: string
  proyecto: string
  frente: string
  subFrente: string
  /** ISO `YYYY-MM-DD`. */
  fecha: string
  categoria: 'atrasada' | 'atrasada_replan' | 'pendiente' | 'pendiente_replan'
  /** Días hábiles que la tarea se corrió hacia adelante. 0 = sin atraso. */
  atraso: number
  /** Cuántas veces se replanificó — el N del `↻ ×N`. 0 = no se muestra. */
  replanificaciones: number
  /** El color del proyecto, para el punto de Ubicación (migración 35). */
  colorProyecto: string
}

export interface Resumen {
  nombre: string
  atrasadas: TareaCorreo[]
  vencenHoy: TareaCorreo[]
  /** Cuántas más vencen de acá al domingo. 0 = la sección no aparece. */
  semana: number
  /** Hoy en Chile, ISO `YYYY-MM-DD`. */
  hoy: string
  /** La dirección pública de la aplicación (`SITE_URL`). */
  sitio: string
}

// ---------------------------------------------------------------------------
// Lo que el correo comparte con la aplicación
// ---------------------------------------------------------------------------

// Los colores del producto, en su versión CLARA: un correo no tiene tema, así
// que no hay variante oscura que elegir. Están escritos y no importados porque
// una función de servidor no puede leer `src/styles.css`; la prueba los compara
// contra la hoja de estilos para que no se separen.
//
// Se guardan RESUELTOS y no como `var(--x)`: Outlook de escritorio usa el motor
// de Word, que no entiende variables CSS, y ahí las filas quedarían blancas y
// la fecha vencida en negro.
const COLOR = {
  rojo: '#d32f2f',
  rojoSuave: '#fdecea',
  ambarTexto: '#8a6100',
  ambarSuave: '#fff6e0',
  moradoSuave: '#f0e4f7',
  grisBorde: '#c7c6ca',
  grisLinea: '#e4e4e7',
  grisTexto: '#71717a',
  superficie2: '#fafafa',
  texto: '#1a1c1d',
  naranja: '#f97316',
  enlace: '#1565c0',
}

/** Espejo de `colorTarea` (src/lib/derive.ts): el FONDO de la fila. Una tarea
 *  hecha nunca llega hasta acá, y una pendiente sin replanificar va en blanco
 *  — es la fila sin color del producto.
 *
 *  Antes esto era un mapa de CLASES. Con los estilos escritos en cada elemento
 *  la clase no sirve: lo que viaja es el color. */
const FONDO_FILA: Record<TareaCorreo['categoria'], string> = {
  atrasada: COLOR.rojoSuave,
  atrasada_replan: COLOR.moradoSuave,
  pendiente: '#ffffff',
  pendiente_replan: COLOR.ambarSuave,
}

/** Espejo de `CATEGORIA_LABEL` (src/lib/derive.ts). Ya no hay columna Estado
 *  —la fila pintada y el título de la sección lo dicen dos veces, y era la
 *  única columna que obligaba a achicar la letra hasta volverla ilegible—,
 *  pero la versión en texto plano no tiene colores y sí la necesita. */
const ETIQUETA: Record<TareaCorreo['categoria'], string> = {
  atrasada: 'Atrasada',
  atrasada_replan: 'Atrasada replanificada',
  pendiente: 'Pendiente',
  pendiente_replan: 'Pendiente replanificada',
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Espejo de `formatoFecha` (src/lib/dates.ts): `08-sep-2026`. */
export function fecha(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}-${MES[Number(m) - 1]}-${a}`
}

/** Espejo de `textoAtraso` (src/lib/derive.ts): sin atraso, la columna va
 *  vacía con la misma raya de la aplicación. */
export function atraso(n: number): string {
  if (!n) return '—'
  return `${n} día${n === 1 ? '' : 's'}`
}

/** La ruta completa, SIN el proyecto: el proyecto va aparte, con su punto de
 *  color delante. En el correo no hay columna Proyecto — igual que hace Mis
 *  Tareas cuando el espacio es angosto. */
export function ubicacion(t: TareaCorreo): string {
  return `${t.proyecto} › ${t.frente} › ${t.subFrente}`
}

// Tipografías: NINGUNA se carga de la web —no hay `@font-face` ni `@import`—,
// así que se nombran las de marca primero y detrás va el respaldo del sistema.
// Lo que se replica, y es lo que se nota en una tabla, es el PESO y el TAMAÑO:
// la aplicación carga JetBrains Mono solo en 500 y 700, así que todo lo
// monoespaciado va en 500, y la fecha vencida y el ↻ ×N en 700.
const TIPO = 'Inter,system-ui,sans-serif'
const MONO = "'JetBrains Mono',ui-monospace,monospace"

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Asunto
// ---------------------------------------------------------------------------

/** `3 tareas atrasadas · 2 vencen hoy`, con los números de esa persona. Un
 *  bloque vacío no aparece en el asunto, igual que no aparece en el cuerpo. */
export function asunto(r: Resumen): string {
  const partes: string[] = []
  const a = r.atrasadas.length
  const h = r.vencenHoy.length
  if (a > 0) partes.push(`${a} ${a === 1 ? 'tarea atrasada' : 'tareas atrasadas'}`)
  if (h > 0) {
    // "tareas" solo cuando esta mitad va SOLA: con las dos, la palabra ya
    // apareció al principio y repetirla gasta caracteres de los pocos que el
    // programa de correo muestra.
    partes.push(
      a > 0
        ? `${h} vence${h === 1 ? '' : 'n'} hoy`
        : `${h} ${h === 1 ? 'tarea vence' : 'tareas vencen'} hoy`,
    )
  }
  return partes.join(' · ')
}

/** `Además, 43 tareas tuyas vencen esta semana.` — la línea de contexto, que
 *  va después de la última tabla. */
export function lineaSemana(n: number): string {
  return n === 1
    ? 'Además, 1 tarea tuya vence esta semana.'
    : `Además, ${n} tareas tuyas vencen esta semana.`
}

// ---------------------------------------------------------------------------
// Cuerpo con formato
// ---------------------------------------------------------------------------

// El ancho es 640, que es lo que un cliente de correo muestra sin recortar, y
// deja 608 útiles: las cuatro columnas suman exactamente eso.
//
// Tres cosas que la hoja de estilos hacía y en correo NO funcionan, así que
// acá están resueltas de otra forma:
//   · `display:flex` en la ruta → el punto va `inline-block` con su margen.
//   · `border-collapse:separate` → `collapse`, que es lo que respetan todos.
//   · los anchos solo en estilos → van TAMBIÉN en el atributo `width` de la
//     celda, porque varios clientes ignoran los de estilo.

const TIPO_CSS = `font-family:${TIPO};`
const MONO_CSS = `font-family:${MONO};`

/** Lo común a toda celda de la tabla: bordes, relleno, tamaño y alineación. */
const CELDA = `border-right:1px solid ${COLOR.grisBorde};border-bottom:1px solid ${COLOR.grisBorde};padding:4px 8px;font-size:13px;vertical-align:middle;`

/** Lo común a todo encabezado. */
const ENCABEZADO = `border-right:1px solid ${COLOR.grisBorde};border-bottom:1px solid ${COLOR.grisBorde};padding:4px 8px;background:${COLOR.superficie2};${MONO_CSS}font-size:10px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:${COLOR.grisTexto};`

/** Lo común a los párrafos del cuerpo. */
const PARRAFO = `${TIPO_CSS}font-size:14px;line-height:1.5;margin:0;color:${COLOR.texto};`

function filaHtml(t: TareaCorreo): string {
  const fondo = FONDO_FILA[t.categoria]
  // La fecha va en rojo y 700 SOLO si la tarea está atrasada; si no, en 500
  // como el resto de lo monoespaciado.
  const vencida = t.categoria === 'atrasada' || t.categoria === 'atrasada_replan'
  const estiloFecha =
    `${CELDA}${MONO_CSS}font-size:12px;text-align:center;white-space:nowrap;background:${fondo};` +
    (vencida ? `color:${COLOR.rojo};font-weight:700;` : 'font-weight:500;')

  // El ↻ ×N va pegado al nombre, dentro de la misma celda, y solo si la tarea
  // se movió alguna vez.
  const replan =
    t.replanificaciones > 0
      ? `<span style="${MONO_CSS}font-size:11px;font-weight:700;color:${COLOR.ambarTexto};background:rgba(0,0,0,.05);border-radius:4px;padding:1px 5px;white-space:nowrap;margin-left:8px;">&#8635; &times;${t.replanificaciones}</span>`
      : ''

  return `
      <tr>
        <td width="230" align="left" style="${CELDA}${TIPO_CSS}font-weight:500;color:${COLOR.texto};background:${fondo};">${esc(t.titulo)}${replan}</td>
        <td width="190" align="left" style="${CELDA}${TIPO_CSS}font-size:12px;color:${COLOR.grisTexto};background:${fondo};"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${esc(t.colorProyecto)};vertical-align:middle;margin-right:7px;"></span><span style="vertical-align:middle;">${esc(ubicacion(t))}</span></td>
        <td width="108" align="center" style="${estiloFecha}">${fecha(t.fecha)}</td>
        <td width="80" align="center" style="${CELDA}${MONO_CSS}font-size:12px;font-weight:500;text-align:center;white-space:nowrap;color:${COLOR.texto};background:${fondo};">${atraso(t.atraso)}</td>
      </tr>`
}

function seccionHtml(titulo: string, tareas: TareaCorreo[]): string {
  if (tareas.length === 0) return ''
  return `
  <div style="padding:16px 16px 0;">
    <h3 style="${TIPO_CSS}font-size:15px;font-weight:700;margin:0 0 8px;color:${COLOR.texto};">${titulo}</h3>
    <table width="608" cellpadding="0" cellspacing="0" border="0" style="width:608px;border-collapse:collapse;table-layout:fixed;background:#ffffff;border-left:1px solid ${COLOR.grisBorde};border-top:1px solid ${COLOR.grisBorde};">
      <thead><tr>
        <th width="230" align="left" style="${ENCABEZADO}">Tarea</th>
        <th width="190" align="left" style="${ENCABEZADO}">Ubicación</th>
        <th width="108" align="center" style="${ENCABEZADO}text-align:center;white-space:nowrap;">Fecha Objetivo</th>
        <th width="80" align="center" style="${ENCABEZADO}text-align:center;white-space:nowrap;">Atraso</th>
      </tr></thead>
      <tbody>${tareas.map(filaHtml).join('')}
      </tbody>
    </table>
  </div>`
}

/** El cuerpo con formato. */
export function html(r: Resumen): string {
  // El enlace vive en el párrafo de la línea de la semana. Cuando no queda
  // ninguna tarea para la semana desaparece la FRASE, no el párrafo: si no, el
  // correo se quedaría sin lo único que lleva de vuelta a la herramienta.
  const semana = r.semana > 0 ? `${lineaSemana(r.semana)} ` : ''
  return `
<div style="background:#e9e9ec;padding:16px 0;${TIPO_CSS}color:${COLOR.texto};">
<table width="640" cellpadding="0" cellspacing="0" border="0" align="center" style="width:640px;max-width:100%;margin:0 auto;background:#ffffff;border:1px solid ${COLOR.grisLinea};border-radius:8px;border-collapse:separate;">
<tr><td>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:1px solid ${COLOR.grisLinea};">
    <tr>
      <td align="left" style="padding:13px 16px;${TIPO_CSS}font-size:15px;font-weight:700;letter-spacing:-.01em;color:${COLOR.texto};">Ando<span style="color:${COLOR.naranja};">tek</span><span style="${MONO_CSS}font-weight:500;color:${COLOR.grisTexto};margin-left:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;">Planning</span></td>
      <td align="right" style="padding:13px 16px;${MONO_CSS}font-size:11px;font-weight:500;color:${COLOR.grisTexto};">${fecha(r.hoy)}</td>
    </tr>
  </table>

  <p style="${PARRAFO}padding:15px 16px 0;">Hola ${esc(r.nombre)},</p>
  <p style="${PARRAFO}padding:5px 16px 0;">A continuación un resumen de tus tareas pendientes hasta el día de hoy:</p>${seccionHtml('Atrasadas', r.atrasadas)}${seccionHtml('Vencen hoy', r.vencenHoy)}
  <p style="${PARRAFO}padding:16px 16px 0;line-height:1.55;">${semana}<a href="${r.sitio}/#mis-tareas" style="color:${COLOR.enlace};">Ver mis tareas</a></p>
  <div style="border-top:1px solid ${COLOR.grisLinea};margin-top:16px;padding:12px 16px 15px;${TIPO_CSS}font-size:11.5px;color:${COLOR.grisTexto};line-height:1.5;">Recibes este correo porque tienes activado el resumen diario.
    <a href="${r.sitio}/#mi-cuenta" style="color:${COLOR.grisTexto};">Gestionar correos</a></div>

</td></tr>
</table>
</div>`
}

// ---------------------------------------------------------------------------
// Cuerpo en texto plano
// ---------------------------------------------------------------------------

/** La misma información, sin formato. El programa de correo elige cuál
 *  mostrar; casi siempre muestra la de arriba. Esta se usa cuando no puede o
 *  no quiere —un reloj, un lector de pantalla, un correo corporativo que
 *  bloquea el formato—: sin ella, esa gente ve el correo vacío.
 *
 *  Es la ÚNICA parte del correo donde las direcciones van escritas: en texto
 *  plano no hay enlace que tocar. */
export function texto(r: Resumen): string {
  const bloque = (titulo: string, tareas: TareaCorreo[]) =>
    tareas.length === 0
      ? []
      : [
          '',
          titulo.toUpperCase(),
          ...tareas.map(
            (t) =>
              `- ${t.titulo}${t.replanificaciones > 0 ? ` (replanificada ×${t.replanificaciones})` : ''}` +
              `\n  ${ubicacion(t)}` +
              `\n  ${ETIQUETA[t.categoria]} · ${fecha(t.fecha)} · atraso ${atraso(t.atraso)}`,
          ),
        ]

  return [
    `Andotek Planning · ${fecha(r.hoy)}`,
    '',
    `Hola ${r.nombre},`,
    'A continuación un resumen de tus tareas pendientes hasta el día de hoy:',
    ...bloque('Atrasadas', r.atrasadas),
    ...bloque('Vencen hoy', r.vencenHoy),
    ...(r.semana > 0 ? ['', lineaSemana(r.semana)] : []),
    '',
    `Ver mis tareas: ${r.sitio}/#mis-tareas`,
    '',
    `Recibes este correo porque tienes activado el resumen diario.`,
    `Gestionar correos: ${r.sitio}/#mi-cuenta`,
  ].join('\n')
}
