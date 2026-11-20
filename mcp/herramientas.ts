// #350 — Las herramientas del MCP. Siete lecturas y seis escrituras; nada más.
//
// Las escrituras pasan por el MISMO repo que usa la aplicación (`Repo`, en
// `src/data/repo.ts`), con la sesión de quien autorizó: la RLS y los
// triggers de la base aplican tal cual —replanificación, historial, fecha de
// cierre, notificación de asignación—. Lo que la base NO exige y la aplicación
// sí (responsable miembro del proyecto, no tocar archivadas, fechas sin
// ambigüedad) se valida acá, antes de escribir.
//
// Después de cada escritura se RELEE el estado y se responde con lo que quedó
// guardado, no con lo que se pidió.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Repo } from '../src/data/repo.js'
import type { AppState, ISODate, Tarea, Usuario } from '../src/types.js'
import { cmp } from '../src/lib/dates.js'
import { mensajeError } from '../src/lib/errores.js'
import { nReplanificaciones } from '../src/lib/derive.js'
import {
  type Resolucion,
  cargaDePersona,
  cargaDeProyecto,
  describirTarea,
  historialDeTarea,
  hoyChile,
  listaDeProyectos,
  normalizar,
  planDeProyecto,
  rangoCarga,
  resolverFrente,
  resolverPersona,
  resolverProyecto,
  resolverResponsable,
  resolverSubFrente,
  resolverTarea,
  tareasDePersona,
  validarFecha,
} from './plan.js'

export interface Contexto {
  repo: Repo
  /** Quien autorizó el conector (ya verificado como administrador activo). */
  usuario: Usuario
  /** Solo para pruebas: fija "hoy". Por defecto, el día en Chile. */
  hoy?: () => ISODate
}

/** Instrucciones generales que el MCP entrega al conectarse. */
export const INSTRUCCIONES = [
  'Planificación de Andotek: proyectos › frentes › sub frentes › tareas.',
  'Las cosas se nombran por su ruta completa (proyecto › frente › sub frente › tarea). Si un nombre coincide con más de una, la herramienta no hace nada y devuelve los candidatos: pregunta al usuario cuál es, no elijas tú.',
  'Las personas se nombran por su nombre; si coincide más de una, pregunta.',
  'Las fechas van siempre en formato AAAA-MM-DD. "Hoy" es el día en Chile y viene en las respuestas de lectura: úsalo para traducir "el lunes" o "en dos semanas" a una fecha concreta, y confirma con el usuario si hay duda.',
  'Las herramientas de escritura modifican datos reales del plan, que ve todo el equipo. Las tareas archivadas no se leen ni se modifican.',
].join('\n')

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

type Respuesta = { content: { type: 'text'; text: string }[]; isError?: boolean }

function ok(datos: unknown): Respuesta {
  return { content: [{ type: 'text', text: JSON.stringify(datos, null, 1) }] }
}

/** Nada se hizo. `isError` para que el modelo no lo tome por un éxito. */
function sinCambios(mensaje: string, candidatos?: string[]): Respuesta {
  const texto = candidatos?.length ? `${mensaje}\nCandidatos:\n${candidatos.map((c) => `- ${c}`).join('\n')}` : mensaje
  return { content: [{ type: 'text', text: texto }], isError: true }
}

function noResuelto(r: Exclude<Resolucion<unknown>, { tipo: 'ok' }>): Respuesta {
  return r.tipo === 'ambiguo' ? sinCambios(r.mensaje, r.candidatos) : sinCambios(r.mensaje)
}

/**
 * Traduce un rechazo de la base a algo que se entienda. Los textos de los
 * triggers ya están en castellano (migraciones 27–29); acá se les agrega el
 * qué hacer.
 */
export function traducirRechazo(e: unknown): string {
  const msg = mensajeError(e)
  const m = msg.toLowerCase()
  if (m.includes('no puedes eliminar tareas que ya pasaron')) {
    return 'No se puede quitar la fecha: la tarea vence hoy o ya venció. Solo puede marcarse lista o moverse a otra fecha.'
  }
  if (m.includes('jwt expired') || m.includes('invalid jwt') || m.includes('jwt')) {
    return 'La sesión del conector venció. Vuelve a conectar Andotek Planning desde la configuración de conectores de Claude.'
  }
  if (m.includes('row-level security') || m.includes('permission denied') || m.startsWith('sin permiso')) {
    return `La base rechazó el cambio por permisos (${msg}). No se modificó nada.`
  }
  if (m.includes('tarea no encontrada')) return 'La tarea ya no existe en la base. No se modificó nada.'
  return `La base rechazó el cambio: ${msg}. No se modificó nada.`
}

// ---------------------------------------------------------------------------
// Esquemas de entrada compartidos
// ---------------------------------------------------------------------------

const rutaTareaSchema = {
  proyecto: z.string().optional().describe('Nombre del proyecto.'),
  frente: z.string().optional().describe('Nombre del frente.'),
  sub_frente: z.string().optional().describe('Nombre del sub frente.'),
  tarea: z.string().optional().describe('Nombre de la tarea.'),
  tarea_id: z
    .string()
    .optional()
    .describe('Id de la tarea, tal como lo entregan las lecturas. Si viene, manda sobre los nombres.'),
}

const rangoSchema = {
  desde: z.string().optional().describe('Primer día, AAAA-MM-DD. Por defecto, hoy.'),
  hasta: z.string().optional().describe('Último día, AAAA-MM-DD. Por defecto, 4 semanas desde "desde". Máximo 120 días.'),
}

const LECTURA = { readOnlyHint: true, openWorldHint: false } as const
const CREA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
const MODIFICA = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const

const AVISO_ESCRITURA = 'MODIFICA DATOS REALES del plan, que ve todo el equipo.'

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export function registrarHerramientas(server: McpServer, ctx: Contexto): void {
  const hoy = () => (ctx.hoy ? ctx.hoy() : hoyChile())
  const yo = ctx.usuario
  ctx.repo.setActor(yo.id)
  const estado = () => ctx.repo.loadState()

  /** Corre la escritura; si la base la rechaza, responde sin cambios. */
  async function escribir(accion: () => Promise<unknown>): Promise<Respuesta | null> {
    try {
      await accion()
      return null
    } catch (e) {
      return sinCambios(traducirRechazo(e))
    }
  }

  // ---- Lecturas ----------------------------------------------------------

  server.registerTool(
    'listar_proyectos',
    {
      title: 'Listar proyectos',
      description:
        'Proyectos del usuario (de los que es miembro y no están archivados), con sus contadores de tareas y sus miembros. Incluye la fecha de hoy en Chile.',
      inputSchema: {},
      annotations: LECTURA,
    },
    async () => {
      const s = await estado()
      return ok({ hoy: hoy(), usuario: yo.nombre, proyectos: listaDeProyectos(s, yo.id, hoy()) })
    },
  )

  server.registerTool(
    'ver_plan',
    {
      title: 'Ver el plan de un proyecto',
      description:
        'Plan completo de un proyecto: frentes, sub frentes y todas sus tareas (no solo las propias), en el orden de la aplicación. Cada tarea trae responsable, estado, fecha objetivo, fecha original, atraso en días hábiles y número de replanificaciones.',
      inputSchema: { proyecto: z.string().describe('Nombre del proyecto.') },
      annotations: LECTURA,
    },
    async ({ proyecto }) => {
      const s = await estado()
      const r = resolverProyecto(s, yo.id, proyecto)
      if (r.tipo !== 'ok') return noResuelto(r)
      return ok(planDeProyecto(s, r.item, hoy()))
    },
  )

  server.registerTool(
    'ver_tareas_de_persona',
    {
      title: 'Ver las tareas de una persona',
      description:
        'Tareas de una persona en los proyectos del usuario, como las muestra Mis Tareas: lo más crítico primero, luego por fecha objetivo. Sin "persona", las del propio usuario.',
      inputSchema: { persona: z.string().optional().describe('Nombre de la persona. Por defecto, el propio usuario.') },
      annotations: LECTURA,
    },
    async ({ persona }) => {
      const s = await estado()
      const p = personaO(s, persona)
      if ('tipo' in p) return noResuelto(p)
      return ok(tareasDePersona(s, yo.id, p, hoy()))
    },
  )

  server.registerTool(
    'ver_carga_proyecto',
    {
      title: 'Ver la carga diaria de un proyecto',
      description:
        'Carga diaria por persona de un proyecto, con la regla de la Gantt: cada tarea cuenta una vez en su fecha vigente, hechas y no hechas; más "sin responsable" y el total de cada día. Solo aparecen los días con algo.',
      inputSchema: { proyecto: z.string().describe('Nombre del proyecto.'), ...rangoSchema },
      annotations: LECTURA,
    },
    async ({ proyecto, desde, hasta }) => {
      const s = await estado()
      const r = resolverProyecto(s, yo.id, proyecto)
      if (r.tipo !== 'ok') return noResuelto(r)
      const rango = rangoCarga(hoy(), desde, hasta)
      if (!rango.ok) return sinCambios(rango.error)
      return ok(cargaDeProyecto(s, r.item, rango.desde, rango.hasta))
    },
  )

  server.registerTool(
    'ver_carga_persona',
    {
      title: 'Ver la carga diaria de una persona',
      description:
        'Carga diaria de una persona sumando todos los proyectos del usuario, con la regla de la Gantt, y el desglose por proyecto. Sin "persona", la del propio usuario.',
      inputSchema: { persona: z.string().optional().describe('Nombre de la persona. Por defecto, el propio usuario.'), ...rangoSchema },
      annotations: LECTURA,
    },
    async ({ persona, desde, hasta }) => {
      const s = await estado()
      const p = personaO(s, persona)
      if ('tipo' in p) return noResuelto(p)
      const rango = rangoCarga(hoy(), desde, hasta)
      if (!rango.ok) return sinCambios(rango.error)
      return ok(cargaDePersona(s, yo.id, p, rango.desde, rango.hasta))
    },
  )

  server.registerTool(
    'ver_historial',
    {
      title: 'Ver el historial de replanificaciones de una tarea',
      description:
        'Replanificaciones de una tarea: fecha anterior, fecha nueva, quién la movió y cuándo. Solo quedan registrados los movimientos de fechas que vencían hoy o ya habían vencido.',
      inputSchema: rutaTareaSchema,
      annotations: LECTURA,
    },
    async (ruta) => {
      const s = await estado()
      const r = resolverTarea(s, yo.id, ruta)
      if (r.tipo !== 'ok') return noResuelto(r)
      return ok(historialDeTarea(s, r.item.tarea, hoy()))
    },
  )

  function personaO(s: AppState, texto?: string): Usuario | Exclude<Resolucion<Usuario>, { tipo: 'ok' }> {
    if (!texto || !texto.trim()) return yo
    const r = resolverPersona(s, texto)
    return r.tipo === 'ok' ? r.item : r
  }

  // ---- Escrituras --------------------------------------------------------

  server.registerTool(
    'crear_frente',
    {
      title: 'Crear un frente',
      description: `Crea un frente al final de un proyecto. ${AVISO_ESCRITURA}`,
      inputSchema: {
        proyecto: z.string().describe('Nombre del proyecto.'),
        nombre: z.string().describe('Nombre del frente nuevo.'),
      },
      annotations: CREA,
    },
    async ({ proyecto, nombre }) => {
      const limpio = nombre.trim()
      if (!limpio) return sinCambios('El frente necesita un nombre.')
      const s = await estado()
      const r = resolverProyecto(s, yo.id, proyecto)
      if (r.tipo !== 'ok') return noResuelto(r)
      const repetido = s.frentes.some((f) => f.proyectoId === r.item.id && normalizar(f.nombre) === normalizar(limpio))
      let id = ''
      const fallo = await escribir(async () => {
        id = (await ctx.repo.createFrente({ proyectoId: r.item.id, nombre: limpio })).id
      })
      if (fallo) return fallo
      const s2 = await estado()
      const f = s2.frentes.find((x) => x.id === id)
      if (!f) return sinCambios('La base no devolvió el frente creado; revisa el proyecto en la aplicación.')
      return ok({
        hecho: `Frente creado: ${r.item.nombre} › ${f.nombre}`,
        ...(repetido ? { aviso: `Ya existía otro frente con ese nombre en ${r.item.nombre}; ahora hay dos.` } : {}),
      })
    },
  )

  server.registerTool(
    'crear_sub_frente',
    {
      title: 'Crear un sub frente',
      description: `Crea un sub frente al final de un frente. ${AVISO_ESCRITURA}`,
      inputSchema: {
        proyecto: z.string().describe('Nombre del proyecto.'),
        frente: z.string().describe('Nombre del frente.'),
        nombre: z.string().describe('Nombre del sub frente nuevo.'),
      },
      annotations: CREA,
    },
    async ({ proyecto, frente, nombre }) => {
      const limpio = nombre.trim()
      if (!limpio) return sinCambios('El sub frente necesita un nombre.')
      const s = await estado()
      const r = resolverFrente(s, yo.id, { proyecto, frente })
      if (r.tipo !== 'ok') return noResuelto(r)
      const repetido = s.subFrentes.some(
        (sf) => sf.frenteId === r.item.frente.id && normalizar(sf.nombre) === normalizar(limpio),
      )
      let id = ''
      const fallo = await escribir(async () => {
        id = (await ctx.repo.createSubFrente({ frenteId: r.item.frente.id, nombre: limpio })).id
      })
      if (fallo) return fallo
      const s2 = await estado()
      const sf = s2.subFrentes.find((x) => x.id === id)
      if (!sf) return sinCambios('La base no devolvió el sub frente creado; revisa el proyecto en la aplicación.')
      return ok({
        hecho: `Sub frente creado: ${r.item.proyecto.nombre} › ${r.item.frente.nombre} › ${sf.nombre}`,
        ...(repetido ? { aviso: `Ya existía otro sub frente con ese nombre en ese frente; ahora hay dos.` } : {}),
      })
    },
  )

  server.registerTool(
    'crear_tarea',
    {
      title: 'Crear una tarea',
      description: `Crea una tarea al final de un sub frente. Puede nacer sin fecha y sin responsable. El responsable debe ser miembro del proyecto. ${AVISO_ESCRITURA}`,
      inputSchema: {
        proyecto: z.string().describe('Nombre del proyecto.'),
        frente: z.string().describe('Nombre del frente.'),
        sub_frente: z.string().describe('Nombre del sub frente.'),
        titulo: z.string().describe('Nombre de la tarea nueva.'),
        responsable: z.string().optional().describe('Nombre de un miembro del proyecto.'),
        fecha_objetivo: z.string().optional().describe('AAAA-MM-DD.'),
        descripcion: z.string().optional(),
      },
      annotations: CREA,
    },
    async ({ proyecto, frente, sub_frente, titulo, responsable, fecha_objetivo, descripcion }) => {
      const limpio = titulo.trim()
      if (!limpio) return sinCambios('La tarea necesita un nombre.')
      let fecha: ISODate | undefined
      if (fecha_objetivo !== undefined && fecha_objetivo.trim() !== '') {
        const v = validarFecha(fecha_objetivo)
        if (!v.ok) return sinCambios(v.error)
        fecha = v.fecha
      }
      const s = await estado()
      const r = resolverSubFrente(s, yo.id, { proyecto, frente, sub_frente })
      if (r.tipo !== 'ok') return noResuelto(r)
      let responsableId: string | undefined
      if (responsable !== undefined && responsable.trim() !== '') {
        const p = resolverResponsable(s, r.item.proyecto, responsable)
        if (p.tipo !== 'ok') return noResuelto(p)
        responsableId = p.item.id
      }
      let id = ''
      const fallo = await escribir(async () => {
        id = (
          await ctx.repo.createTarea({
            subFrenteId: r.item.subFrente.id,
            titulo: limpio,
            descripcion: descripcion?.trim() || undefined,
            responsableId,
            fechaObjetivo: fecha,
          })
        ).id
      })
      if (fallo) return fallo
      return releerTarea(id, 'Tarea creada')
    },
  )

  server.registerTool(
    'cambiar_fecha',
    {
      title: 'Cambiar la fecha objetivo de una tarea',
      description:
        `Pone, mueve o quita (fecha = null) la fecha objetivo de una tarea, con las reglas de la aplicación: mover una fecha que vence hoy o ya venció queda registrado como replanificación; mover una fecha futura no. Una tarea que vence hoy o ya venció no puede quedar sin fecha. ${AVISO_ESCRITURA}`,
      inputSchema: {
        ...rutaTareaSchema,
        fecha: z.string().nullable().describe('Fecha nueva AAAA-MM-DD, o null para quitar la fecha.'),
      },
      annotations: MODIFICA,
    },
    async ({ fecha, ...ruta }) => {
      // Solo `null` quita la fecha: un texto vacío es un error, no una orden.
      let nueva: ISODate | null = null
      if (fecha !== null) {
        const v = validarFecha(fecha)
        if (!v.ok) return sinCambios(v.error)
        nueva = v.fecha
      }
      const s = await estado()
      const r = resolverTarea(s, yo.id, ruta)
      if (r.tipo !== 'ok') return noResuelto(r)
      const t = r.item.tarea
      const ruta1 = describirTarea(s, t, hoy()).ruta
      const h = hoy()
      if (nueva === null) {
        if (!t.fechaObjetivo) return sinCambios(`${ruta1} ya está sin fecha. No hice nada.`)
        if (!t.hecha && cmp(t.fechaObjetivo, h) <= 0) {
          return sinCambios(
            `${ruta1} vence ${t.fechaObjetivo === h ? 'hoy' : `el ${t.fechaObjetivo} (ya venció)`}: no puede quedar sin fecha. Puede marcarse lista o moverse a otra fecha. No hice nada.`,
          )
        }
      } else if (nueva === t.fechaObjetivo) {
        return sinCambios(`${ruta1} ya tiene fecha ${nueva}. No hice nada.`)
      }
      const antes = nReplanificaciones(s, t.id)
      const fechaAntes = t.fechaObjetivo ?? null
      const fallo = await escribir(() => ctx.repo.cambiarFechaObjetivo(t.id, nueva, yo.id, h))
      if (fallo) return fallo
      return releerTarea(t.id, nueva === null ? 'Fecha quitada' : 'Fecha cambiada', (s2, t2) => {
        const despues = nReplanificaciones(s2, t2.id)
        if (despues > antes) return `Quedó registrada como replanificación: la fecha anterior (${fechaAntes}) vencía hoy o ya había vencido.`
        if (despues < antes) return `Se deshizo la última replanificación: la tarea volvió a su fecha anterior (${t2.fechaObjetivo ?? 'sin fecha'}).`
        if (fechaAntes === null) return 'Era una tarea sin fecha: esta es su primera fecha, y también su fecha original.'
        return 'La fecha anterior era futura: es planificación, no replanificación, y no queda en el historial.'
      })
    },
  )

  server.registerTool(
    'asignar_responsable',
    {
      title: 'Asignar el responsable de una tarea',
      description: `Asigna (o cambia) el responsable de una tarea. Debe ser un miembro activo del proyecto. La persona recibe una notificación. ${AVISO_ESCRITURA}`,
      inputSchema: { ...rutaTareaSchema, persona: z.string().describe('Nombre de un miembro del proyecto.') },
      annotations: MODIFICA,
    },
    async ({ persona, ...ruta }) => {
      const s = await estado()
      const r = resolverTarea(s, yo.id, ruta)
      if (r.tipo !== 'ok') return noResuelto(r)
      const p = resolverResponsable(s, r.item.proyecto, persona)
      if (p.tipo !== 'ok') return noResuelto(p)
      const t = r.item.tarea
      if (t.responsableId === p.item.id) {
        return sinCambios(`${describirTarea(s, t, hoy()).ruta} ya tiene como responsable a ${p.item.nombre}. No hice nada.`)
      }
      const fallo = await escribir(() => ctx.repo.updateTarea(t.id, { responsableId: p.item.id }))
      if (fallo) return fallo
      return releerTarea(t.id, 'Responsable asignado')
    },
  )

  server.registerTool(
    'marcar_lista',
    {
      title: 'Marcar una tarea como lista (o desmarcarla)',
      description:
        `Marca una tarea como hecha (lista = true) o la vuelve a abrir (lista = false). Una tarea con fecha queda cerrada en su última fecha planificada; una sin fecha queda con la fecha de hoy. ${AVISO_ESCRITURA}`,
      inputSchema: { ...rutaTareaSchema, lista: z.boolean().describe('true = hecha; false = volver a abrirla.') },
      annotations: MODIFICA,
    },
    async ({ lista, ...ruta }) => {
      const s = await estado()
      const r = resolverTarea(s, yo.id, ruta)
      if (r.tipo !== 'ok') return noResuelto(r)
      const t = r.item.tarea
      if (t.hecha === lista) {
        return sinCambios(`${describirTarea(s, t, hoy()).ruta} ya está ${lista ? 'hecha' : 'abierta'}. No hice nada.`)
      }
      // El mismo patch que el check de la aplicación (`toggleHecha`).
      const fallo = await escribir(() =>
        ctx.repo.updateTarea(t.id, lista ? { hecha: true, fechaReal: hoy() } : { hecha: false }),
      )
      if (fallo) return fallo
      return releerTarea(t.id, lista ? 'Tarea marcada hecha' : 'Tarea abierta de nuevo')
    },
  )

  /** Relee y responde con la tarea tal como quedó en la base. */
  async function releerTarea(
    id: string,
    hecho: string,
    nota?: (s: AppState, t: Tarea) => string,
  ): Promise<Respuesta> {
    const s = await estado()
    const t = s.tareas.find((x) => x.id === id)
    if (!t) return sinCambios(`${hecho}, pero no pude releerla. Revísala en la aplicación.`)
    const d = describirTarea(s, t, hoy())
    return ok({ hecho: `${hecho}: ${d.ruta}`, ...(nota ? { nota: nota(s, t) } : {}), tarea: d })
  }
}
