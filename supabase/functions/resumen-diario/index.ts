// Edge Function: resumen-diario (#272)
//
// Cada mañana a las 8:00 de Chile, un correo por persona con SUS tareas
// atrasadas y las que vencen ese día. Quien la despierta es el programador de
// la base (pg_cron + pg_net), que la llama CADA HORA; quien decide si es el
// momento es `resumen_diario_tomar_turno()`, en la base, mirando la zona
// `America/Santiago` por su nombre — el programador trabaja en UTC y Chile
// cambia de hora dos veces al año. Ver DEPLOY.md § "Resumen diario".
//
// El envío NO monta nada nuevo: mismo proveedor (Resend) y mismo remitente
// (`EMAIL_FROM`) que la invitación, que ya está validada de punta a punta. Lo
// único nuevo es la parte que corre sola.
//
// De ahí sale también cómo se obtiene la dirección de correo: EN EL SERVIDOR.
// La aplicación tiene prohibido leer el correo de terceros —solo se ve el
// propio (invariante 3)—, así que el destinatario no puede resolverse desde el
// navegador. Es la misma razón por la que la invitación se envía desde acá.
//
// Secrets requeridos (los mismos de `invitar-usuario`, ya configurados):
//   RESEND_API_KEY  — API key de Resend
//   EMAIL_FROM      — remitente verificado, ej. "Andotek Planning <planning@andotek.cl>"
//   SITE_URL        — URL publica de la app
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.)
//
// DOS USOS DE CREDENCIAL QUE NO COMPARTEN CLAVE. Confundirlos costó una corrida
// entera, así que queda escrito:
//
//   1. RECONOCER A QUIEN LLAMA — la cabecera `Authorization` del programador. Se
//      compara contra la lista de `credenciales.ts`, que acepta las claves
//      vigentes y también la anterior.
//   2. HABLAR CON LA BASE con permisos de servicio — `SUPABASE_SERVICE_ROLE_KEY`,
//      igual que las otras cuatro funciones del proyecto.
//
// Una credencial de la lista (1) NO sirve para (2): la base responde
// `Invalid API key` y la corrida muere antes de anotar nada.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { asunto, html, texto, type Resumen, type TareaCorreo } from './plantilla.ts'
import { autorizada, clavesAceptadas } from './credenciales.ts'

// SIN CORS, y es deliberado: a esta función no la llama ningún navegador. La
// llama el programador de la base con una clave del proyecto. Publicar cabeceras
// de CORS sería ofrecerle una puerta a un origen que no existe.

// Todo se lee UNA vez al arrancar.

/** Lo que falta para que la función pueda trabajar. Si sobra algo en esta lista,
 *  la función responde 503 y anota QUÉ falta — no se abre a medias ni se cae a
 *  otra credencial. */
const FALTAN = (
  [
    ['RESEND_API_KEY', Deno.env.get('RESEND_API_KEY')],
    ['EMAIL_FROM', Deno.env.get('EMAIL_FROM')],
    ['SITE_URL', Deno.env.get('SITE_URL')],
    ['SUPABASE_URL', Deno.env.get('SUPABASE_URL')],
    ['SUPABASE_SERVICE_ROLE_KEY', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')],
  ] as const
)
  .filter(([, valor]) => !(valor ?? '').trim())
  .map(([nombre]) => nombre)

/** Uso 2: la credencial con la que se HABLA CON LA BASE. Es la misma que usan
 *  las otras cuatro funciones del proyecto, y no admite reemplazo: si falta, la
 *  función responde 503. */
const CLAVE_SERVICIO = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

/** Uso 1: las credenciales que se ACEPTAN de quien llama. Solo para la puerta. */
const CLAVES = clavesAceptadas(
  Deno.env.get('SUPABASE_SECRET_KEYS'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
)

function registrar(etiqueta: string, detalle: unknown) {
  console.error(`[resumen-diario] ${etiqueta}:`, detalle instanceof Error ? detalle.message : detalle)
}

/** Hoy en Chile, `YYYY-MM-DD`, por NOMBRE de zona — nunca con un desfase fijo.
 *  Es el mismo día que calcula `hoy_chile()` en la base (#291). */
function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  const responder = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido' })

  if (FALTAN.length > 0) {
    registrar('configuración', `falta configurar: ${FALTAN.join(', ')}`)
    return responder(503, { error: 'El servicio no está configurado.' })
  }

  // Sin ninguna clave configurada no hay forma de saber quién es legítimo, y
  // abrirse "por si acaso" sería peor que no responder (#249).
  if (CLAVES.length === 0) {
    registrar('configuración', 'no hay ninguna clave del proyecto en el entorno (SUPABASE_SECRET_KEYS)')
    return responder(503, { error: 'El servicio no está configurado.' })
  }

  // Solo una clave del proyecto. No hay ninguna persona detrás de esta llamada:
  // cualquier otra credencial —incluida la de un administrador con sesión— se
  // rechaza, porque esta función lee correos de terceros. Se aceptan TODAS las
  // vigentes, no una sola: comparar contra una cadena fija convierte cualquier
  // rotación de clave en una caída silenciosa, que es exactamente lo que pasó.
  if (!autorizada(req.headers.get('Authorization'), CLAVES)) {
    // Se deja constancia: sin esta línea, el 401 solo se ve en el registro del
    // borde y no hay forma de distinguirlo del que pone la plataforma.
    registrar('autorización', 'la credencial recibida no es ninguna de las claves del proyecto')
    return responder(401, { error: 'Sin autorización' })
  }

  try {
    // Con la clave de SERVICIO, no con la de la puerta: son dos usos distintos
    // y no comparten credencial. Construirlo con una de la lista de arriba
    // dejaba la función respondiendo 500 con `Invalid API key`.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, CLAVE_SERVICIO)
    const sitio = Deno.env.get('SITE_URL')!

    // `forzar` existe para VERIFICAR desde el dashboard: saltea el día y la
    // hora, y nada más — los mismos destinatarios y las mismas tareas.
    let forzar = false
    try {
      forzar = Boolean((await req.json())?.forzar)
    } catch {
      /* sin cuerpo: corrida normal */
    }

    // El turno se toma ANTES de enviar. Si el envío revienta, la corrida del
    // día ya quedó anotada y el programador no vuelve a intentarlo: "una
    // corrida que falla no se reintenta".
    const { data: turno, error: errTurno } = await admin.rpc('resumen_diario_tomar_turno', {
      p_forzar: forzar,
    })
    if (errTurno) {
      registrar('tomar turno', errTurno)
      return responder(500, { error: 'No se pudo tomar el turno' })
    }
    if (turno !== true) return responder(200, { ok: true, saltado: true })

    const hoy = hoyChile()
    const { data: filas, error: errDatos } = await admin.rpc('resumen_diario_datos')
    if (errDatos) {
      registrar('datos', errDatos)
      await admin
        .from('resumen_diario_corrida')
        .update({ terminada: new Date().toISOString(), detalle: `datos: ${errDatos.message}` })
        .eq('fecha', hoy)
      return responder(500, { error: 'No se pudieron reunir los datos' })
    }

    const destinatarios = (filas ?? []) as {
      usuario_id: string
      nombre: string
      email: string
      atrasadas: TareaCorreo[]
      vencen_hoy: TareaCorreo[]
      semana: number
    }[]

    let enviados = 0
    const fallos: string[] = []

    for (const d of destinatarios) {
      const resumen: Resumen = {
        nombre: d.nombre,
        atrasadas: d.atrasadas ?? [],
        vencenHoy: d.vencen_hoy ?? [],
        semana: d.semana ?? 0,
        hoy,
        sitio,
      }
      try {
        // El mensaje viaja con las DOS versiones adentro: la de formato y la
        // de texto. El programa de correo elige cuál mostrar.
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Deno.env.get('EMAIL_FROM'),
            to: [d.email],
            subject: asunto(resumen),
            html: html(resumen),
            text: texto(resumen),
          }),
        })
        if (r.ok) enviados++
        else fallos.push(`${d.usuario_id}: ${r.status} ${(await r.text()).slice(0, 200)}`)
      } catch (e) {
        fallos.push(`${d.usuario_id}: ${e instanceof Error ? e.message : String(e)}`)
      }
      // Resend limita a 2 peticiones por segundo en el plan en uso. Se envía
      // de a uno, con pausa: son unas pocas personas y así un rechazo por
      // ritmo no se lleva puesta la corrida entera.
      await espera(600)
    }

    if (fallos.length > 0) registrar('envíos fallidos', fallos.join(' | '))
    await admin
      .from('resumen_diario_corrida')
      .update({
        terminada: new Date().toISOString(),
        enviados,
        fallidos: fallos.length,
        detalle: fallos.length > 0 ? fallos.join(' | ').slice(0, 4000) : null,
      })
      .eq('fecha', hoy)

    return responder(200, { ok: true, enviados, fallidos: fallos.length })
  } catch (e) {
    registrar('excepción', e)
    return responder(500, { error: 'No pudimos completar la corrida.' })
  }
})
