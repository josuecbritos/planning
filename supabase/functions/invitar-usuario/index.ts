// Edge Function: invitar-usuario (§8.32-34)
// El admin autenticado invita (o reinvita) a un usuario: se genera un token
// con caducidad de 7 dias y se envia el correo con el enlace via Resend.
//
// Secrets requeridos (supabase secrets set):
//   RESEND_API_KEY  — API key de Resend
//   EMAIL_FROM      — remitente verificado, ej. "Andotek Planning <planning@andotek.cl>"
//   SITE_URL        — URL publica de la app, ej. https://planning-andotek.vercel.app
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const responder = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) El invocador debe ser un admin activo.
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return responder(401, { error: 'Sin sesion' })
    const { data: quien } = await admin.auth.getUser(jwt)
    if (!quien.user) return responder(401, { error: 'Sesion invalida' })
    const { data: perfil } = await admin
      .from('usuario')
      .select('id, rol, activo')
      .eq('auth_id', quien.user.id)
      .maybeSingle()
    if (!perfil || perfil.rol !== 'admin' || !perfil.activo) {
      return responder(403, { error: 'Solo los admins pueden invitar' })
    }

    // 2) Usuario a invitar.
    const { usuarioId } = await req.json()
    const { data: usuario } = await admin
      .from('usuario')
      .select('id, nombre, email, activo, auth_id')
      .eq('id', usuarioId)
      .maybeSingle()
    if (!usuario || !usuario.activo) return responder(404, { error: 'Usuario no encontrado o inactivo' })
    if (usuario.auth_id) return responder(409, { error: 'El usuario ya tiene cuenta activa' })

    // 3) Token nuevo con caducidad de 7 dias (reenviar reemplaza el anterior).
    const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: inv, error: errInv } = await admin
      .from('invitacion')
      .upsert(
        { usuario_id: usuario.id, token: crypto.randomUUID(), expira, usada: null, creada: new Date().toISOString() },
        { onConflict: 'usuario_id' },
      )
      .select()
      .single()
    if (errInv) return responder(500, { error: errInv.message })

    // 4) Correo con el enlace.
    const enlace = `${Deno.env.get('SITE_URL')}/#invitacion=${inv.token}`
    const correo = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM'),
        to: [usuario.email],
        subject: 'Invitacion a Andotek Planning',
        html: `
          <p>Hola ${usuario.nombre},</p>
          <p>Te invitaron a <b>Andotek Planning</b>. Para activar tu cuenta,
          define tu contraseña en el siguiente enlace:</p>
          <p><a href="${enlace}">${enlace}</a></p>
          <p>El enlace caduca en 7 dias. Si expira, pide que te reenvien la invitacion.</p>
        `,
      }),
    })
    if (!correo.ok) {
      const detalle = await correo.text()
      return responder(502, { error: `Fallo el envio del correo: ${detalle}` })
    }

    return responder(200, { ok: true, expira })
  } catch (e) {
    return responder(500, { error: (e as Error).message })
  }
})
