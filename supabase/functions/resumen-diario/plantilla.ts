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
// la fecha vencida en negro. Las reglas son las mismas; lo único que cambia es
// que el valor va escrito donde se usa.
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

/** Espejo de `colorTarea` (src/lib/derive.ts): la clase de la fila. Una tarea
 *  hecha nunca llega hasta acá, y una pendiente sin replanificar no lleva
 *  clase — es la fila sin color del producto. */
const CLASE_FILA: Record<TareaCorreo['categoria'], string> = {
  atrasada: 'fila--rojo',
  atrasada_replan: 'fila--morado',
  pendiente: '',
  pendiente_replan: 'fila--ambar',
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

/** `3 atrasadas · 2 vencen hoy — Andotek Planning`, con los números de esa
 *  persona. Un bloque vacío no aparece en el asunto, igual que no aparece en
 *  el cuerpo. */
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

/** La hoja de estilos del correo. Va tal como quedó resuelta y aprobada, con
 *  UN cambio mecánico: los `var(--x)` quedan escritos con su valor. Outlook de
 *  escritorio usa el motor de Word, que no entiende variables CSS — con ellas,
 *  las filas quedarían blancas y la fecha vencida en negro, que es justo lo
 *  contrario de la regla de oro del producto.
 *
 *  El ancho es 640, que es lo que un cliente de correo muestra sin recortar, y
 *  deja 608 útiles: las cuatro columnas suman exactamente eso. */
const ESTILOS = `<style>
*{box-sizing:border-box}
body{margin:0;background:#e9e9ec;font-family:${TIPO};color:${COLOR.texto}}
.tarjeta{width:640px;max-width:100%;margin:0 auto;background:#fff;border:1px solid ${COLOR.grisLinea};border-radius:8px;overflow:hidden}
.marca{padding:13px 16px;border-bottom:1px solid ${COLOR.grisLinea};display:flex;align-items:baseline;justify-content:space-between}
.wordmark{font-size:15px;font-weight:700;letter-spacing:-.01em}
.wordmark .tek{color:${COLOR.naranja}}
.wordmark .plan{font-family:${MONO};font-weight:500;color:${COLOR.grisTexto};margin-left:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.fechahoy{font-family:${MONO};font-size:11px;font-weight:500;color:${COLOR.grisTexto}}
.saludo{padding:15px 16px 0;font-size:14px;line-height:1.5;margin:0}
.bajada{padding:5px 16px 0;font-size:14px;line-height:1.5;margin:0}
.secc{padding:16px 16px 0}
.secc h3{font-size:15px;font-weight:700;margin:0 0 8px}
table.tareas{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-left:1px solid ${COLOR.grisBorde};border-top:1px solid ${COLOR.grisBorde};table-layout:fixed}
table.tareas th,table.tareas td{border-right:1px solid ${COLOR.grisBorde};border-bottom:1px solid ${COLOR.grisBorde};padding:4px 8px;text-align:left;font-size:13px;vertical-align:middle}
table.tareas th{background:${COLOR.superficie2};font-family:${MONO};font-size:10px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:${COLOR.grisTexto}}
.col-tarea{width:230px}
.col-ruta{width:190px}
.col-fecha{width:108px;white-space:nowrap}
.col-desv{width:80px;white-space:nowrap}
table.tareas .col-fecha,table.tareas .col-desv{text-align:center}
table.tareas td.col-fecha,table.tareas td.col-desv{font-family:${MONO};font-size:12px;font-weight:500}
tr.fila--rojo>td{background:${COLOR.rojoSuave}}
tr.fila--morado>td{background:${COLOR.moradoSuave}}
tr.fila--ambar>td{background:${COLOR.ambarSuave}}
.tarea-cell{font-weight:500}
.replan{font-family:${MONO};font-size:11px;font-weight:700;color:${COLOR.ambarTexto};background:rgba(0,0,0,.05);border-radius:4px;padding:1px 5px;white-space:nowrap;margin-left:8px}
.ruta{display:flex;align-items:center;gap:7px;font-size:12px;color:${COLOR.grisTexto}}
.dot{width:10px;height:10px;border-radius:3px;flex:none}
.fecha-vencida{color:${COLOR.rojo};font-weight:700}
.linea-sem{padding:16px 16px 0;font-size:14px;line-height:1.55;margin:0}
.linea-sem a{color:${COLOR.enlace}}
.pie{border-top:1px solid ${COLOR.grisLinea};margin-top:16px;padding:12px 16px 15px;font-size:11.5px;color:${COLOR.grisTexto};line-height:1.5}
.pie a{color:${COLOR.grisTexto}}
</style>`

function filaHtml(t: TareaCorreo): string {
  const clase = CLASE_FILA[t.categoria]
  // La fecha va en rojo SOLO si la tarea está atrasada.
  const vencida = t.categoria === 'atrasada' || t.categoria === 'atrasada_replan'
  // El ↻ ×N va pegado al nombre, dentro de la misma celda, y solo si la tarea
  // se movió alguna vez. La separación la pone el `margin-left` de `.replan`.
  const replan =
    t.replanificaciones > 0
      ? `<span class="replan">&#8635; &times;${t.replanificaciones}</span>`
      : ''
  return `
      <tr${clase ? ` class="${clase}"` : ''}>
        <td class="tarea-cell">${esc(t.titulo)}${replan}</td>
        <td><span class="ruta"><span class="dot" style="background:${esc(t.colorProyecto)}"></span><span>${esc(ubicacion(t))}</span></span></td>
        <td class="col-fecha${vencida ? ' fecha-vencida' : ''}">${fecha(t.fecha)}</td>
        <td class="col-desv">${atraso(t.atraso)}</td>
      </tr>`
}

function seccionHtml(titulo: string, tareas: TareaCorreo[]): string {
  if (tareas.length === 0) return ''
  return `
  <div class="secc">
    <h3>${titulo}</h3>
    <table class="tareas">
      <thead><tr>
        <th class="col-tarea">Tarea</th><th class="col-ruta">Ubicación</th>
        <th class="col-fecha">Fecha Objetivo</th><th class="col-desv">Atraso</th>
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
  return `${ESTILOS}
<div class="tarjeta">
  <div class="marca">
    <span class="wordmark">Ando<span class="tek">tek</span><span class="plan">Planning</span></span>
    <span class="fechahoy">${fecha(r.hoy)}</span>
  </div>
  <p class="saludo">Hola ${esc(r.nombre)},</p>
  <p class="bajada">A continuación un resumen de tus tareas pendientes hasta el día de hoy:</p>${seccionHtml('Atrasadas', r.atrasadas)}${seccionHtml('Vencen hoy', r.vencenHoy)}
  <p class="linea-sem">${semana}<a href="${r.sitio}/#mis-tareas">Ver mis tareas</a></p>
  <div class="pie">Recibes este correo porque tienes activado el resumen diario.
    <a href="${r.sitio}/#mi-cuenta">Gestionar correos</a></div>
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
