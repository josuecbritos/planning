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
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { asunto, html, texto, type Resumen, type TareaCorreo } from './plantilla.ts'

// SIN CORS, y es deliberado: a esta función no la llama ningún navegador. La
// llama el programador de la base con la clave de servicio. Publicar cabeceras
// de CORS sería ofrecerle una puerta a un origen que no existe.

const CONFIGURADA = Boolean(
  Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM') && Deno.env.get('SITE_URL'),
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

  if (!CONFIGURADA) {
    registrar('configuración', 'faltan RESEND_API_KEY, EMAIL_FROM o SITE_URL')
    return responder(503, { error: 'El servicio no está configurado.' })
  }

  // Solo la clave de servicio. No hay ninguna persona detrás de esta llamada:
  // cualquier otra credencial —incluida la de un administrador con sesión— se
  // rechaza, porque esta función lee correos de terceros.
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization') !== `Bearer ${clave}`) {
    return responder(401, { error: 'Sin autorización' })
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, clave)
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
