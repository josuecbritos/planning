// #272 — El correo del resumen diario: asunto, cuerpo con formato y cuerpo en
// texto plano. Nada de esto toca la red ni la base: recibe los datos ya
// ordenados por `resumen_diario_datos()` y devuelve texto.
//
// Vive en su propio archivo y no dentro de `index.ts` por una razón práctica:
// así la prueba `docs/prueba-272-resumen-diario.mjs` puede importarlo y
// comprobar el correo DE VERDAD —el mismo que se envía— en vez de una copia
// del texto. `index.ts` lo importa con `./plantilla.ts`; al desplegar, la
// función lleva los DOS archivos (DEPLOY.md § "Resumen diario").
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

// Los cinco colores del producto, en su versión CLARA: un correo no tiene
// tema, así que no hay variante oscura que elegir. Están escritos y no
// importados porque una función de servidor no puede leer `src/styles.css`;
// la prueba los compara contra la hoja de estilos para que no se separen.
const COLOR: Record<string, { fila: string; texto: string; borde: string }> = {
  verde: { fila: '#e6f4ea', texto: '#1b7f3b', borde: '#bfdcc4' },
  rojo: { fila: '#fdecea', texto: '#d32f2f', borde: '#f0c4c0' },
  ambar: { fila: '#fff6e0', texto: '#8a6100', borde: '#ecd9a0' },
  morado: { fila: '#f0e4f7', texto: '#5e1690', borde: '#d5bfe0' },
  ninguno: { fila: '#ffffff', texto: '#71717a', borde: '#e4e4e7' },
}

/** Espejo de `colorTarea` (src/lib/derive.ts) para las categorías que puede
 *  traer el correo — una hecha nunca llega hasta acá. */
const COLOR_DE: Record<TareaCorreo['categoria'], keyof typeof COLOR> = {
  atrasada: 'rojo',
  atrasada_replan: 'morado',
  pendiente: 'ninguno',
  pendiente_replan: 'ambar',
}

/** Espejo de `CATEGORIA_LABEL` (src/lib/derive.ts). */
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

/** La ruta completa. En el correo NO hay columna Proyecto aparte: va adentro
 *  de Ubicación, igual que hace Mis Tareas en el teléfono. */
export function ubicacion(t: TareaCorreo): string {
  return `${t.proyecto} › ${t.frente} › ${t.subFrente}`
}

// Tipografías: NINGUNA se carga de la web. Outlook y varios clientes bloquean
// las que se cargan de fuera, así que la de marca no se puede garantizar. Lo
// que sí se conserva —y es lo que se nota en una tabla— es que las fechas y el
// atraso vayan en monoespaciada y queden alineados.
const TIPO = "Arial, 'Helvetica Neue', Helvetica, sans-serif"
const MONO = "'Courier New', Courier, monospace"

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
  if (a > 0) partes.push(`${a} atrasada${a === 1 ? '' : 's'}`)
  if (h > 0) partes.push(`${h} vence${h === 1 ? '' : 'n'} hoy`)
  return `${partes.join(' · ')} — Andotek Planning`
}

/** `43 tareas más vencen esta semana.` — la línea de contexto. */
export function lineaSemana(n: number): string {
  return n === 1 ? '1 tarea más vence esta semana.' : `${n} tareas más vencen esta semana.`
}

// ---------------------------------------------------------------------------
// Cuerpo con formato
// ---------------------------------------------------------------------------

function filaHtml(t: TareaCorreo): string {
  const c = COLOR[COLOR_DE[t.categoria]]
  const celda = `padding:8px 10px;border-bottom:1px solid ${c.borde};font-size:13px;color:#1a1c1d;`
  return `
          <tr style="background:${c.fila};">
            <td style="${celda}font-weight:600;">${esc(t.titulo)}</td>
            <td style="${celda}color:#71717a;">${esc(ubicacion(t))}</td>
            <td style="${celda}white-space:nowrap;">
              <span style="display:inline-block;padding:2px 8px;border:1px solid ${c.borde};border-radius:10px;font-size:11px;font-weight:600;color:${c.texto};background:#ffffff;">${ETIQUETA[t.categoria]}</span>
            </td>
            <td style="${celda}font-family:${MONO};white-space:nowrap;">${fecha(t.fecha)}</td>
            <td style="${celda}font-family:${MONO};white-space:nowrap;text-align:right;">${atraso(t.atraso)}</td>
          </tr>`
}

function tablaHtml(titulo: string, tareas: TareaCorreo[]): string {
  if (tareas.length === 0) return ''
  const th =
    'padding:6px 10px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#71717a;border-bottom:1px solid #e4e4e7;'
  return `
      <h2 style="margin:26px 0 10px;font-size:15px;font-weight:700;color:#1a1c1d;">${titulo}</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">
        <thead>
          <tr>
            <th style="${th}">Tarea</th>
            <th style="${th}">Ubicación</th>
            <th style="${th}">Estado</th>
            <th style="${th}">Fecha Objetivo</th>
            <th style="${th}text-align:right;">Atraso</th>
          </tr>
        </thead>
        <tbody>${tareas.map(filaHtml).join('')}
        </tbody>
      </table>`
}

/** El cuerpo con formato. Un solo archivo, con los estilos en cada etiqueta:
 *  los clientes de correo descartan las hojas de estilo. */
export function html(r: Resumen): string {
  const enlace = `${r.sitio}/#mis-tareas`
  const cuenta = `${r.sitio}/#mi-cuenta`
  return `<div style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:${TIPO};">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;padding:26px 28px 22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:17px;font-weight:700;letter-spacing:-0.02em;color:#1a1c1d;">Ando<span style="color:#f97316;">tek</span>
          <span style="font-family:${MONO};font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:#71717a;">&nbsp;Planning</span>
        </td>
        <td style="text-align:right;font-family:${MONO};font-size:12px;color:#71717a;">${fecha(r.hoy)}</td>
      </tr>
    </table>
    <p style="margin:22px 0 0;font-size:14px;color:#1a1c1d;">Hola ${esc(r.nombre)},</p>
${tablaHtml('Atrasadas', r.atrasadas)}${tablaHtml('Vencen hoy', r.vencenHoy)}${
    r.semana > 0
      ? `
      <h2 style="margin:26px 0 10px;font-size:15px;font-weight:700;color:#1a1c1d;">Esta semana</h2>
      <p style="margin:0;font-size:13px;color:#71717a;">${lineaSemana(r.semana)}</p>`
      : ''
  }
    <p style="margin:26px 0 0;"><a href="${enlace}" style="display:inline-block;padding:9px 16px;background:#1a1a1b;color:#ffffff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">Ver mis tareas</a></p>
    <p style="margin:24px 0 0;padding-top:14px;border-top:1px solid #e4e4e7;font-size:11.5px;color:#71717a;">
      Recibes este correo porque tienes activado el resumen diario.
      <a href="${cuenta}" style="color:#71717a;">Gestionar correos</a>
    </p>
  </div>
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
              `- ${t.titulo}\n  ${ubicacion(t)}\n  ${ETIQUETA[t.categoria]} · ${fecha(t.fecha)} · atraso ${atraso(t.atraso)}`,
          ),
        ]

  return [
    `Andotek Planning · ${fecha(r.hoy)}`,
    '',
    `Hola ${r.nombre},`,
    ...bloque('Atrasadas', r.atrasadas),
    ...bloque('Vencen hoy', r.vencenHoy),
    ...(r.semana > 0 ? ['', 'ESTA SEMANA', lineaSemana(r.semana)] : []),
    '',
    `Ver mis tareas: ${r.sitio}/#mis-tareas`,
    '',
    `Recibes este correo porque tienes activado el resumen diario.`,
    `Gestionar correos: ${r.sitio}/#mi-cuenta`,
  ].join('\n')
}
