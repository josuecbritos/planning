// Edge Function: aceptar-invitacion (§8.32)
// El invitado abre el enlace, define su contraseña y aca se crea su cuenta
// de Auth (el trigger vincular_usuario_auth la enlaza a su fila de usuario
// por email). Valida token vigente (7 dias) y de un solo uso.

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
    const { token, password } = await req.json()
    if (!token || !password || String(password).length < 8) {
      return responder(400, { error: 'La contraseña debe tener al menos 8 caracteres' })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: inv } = await admin
      .from('invitacion')
      .select('id, usuario_id, expira, usada')
      .eq('token', token)
      .maybeSingle()
    if (!inv) return responder(404, { error: 'Invitacion no encontrada' })
    if (inv.usada) return responder(409, { error: 'Esta invitacion ya fue usada' })
    if (new Date(inv.expira) < new Date()) {
      return responder(410, { error: 'La invitacion expiro (7 dias). Pide que te la reenvien.' })
    }

    const { data: usuario } = await admin
      .from('usuario')
      .select('id, email, activo, auth_id')
      .eq('id', inv.usuario_id)
      .maybeSingle()
    if (!usuario || !usuario.activo) return responder(404, { error: 'Usuario no encontrado o inactivo' })
    if (usuario.auth_id) return responder(409, { error: 'La cuenta ya esta activa: inicia sesion' })

    // Crea la cuenta con el email ya confirmado (el enlace por correo es la
    // verificacion). El trigger de BD enlaza usuario.auth_id por email.
    const { error: errAuth } = await admin.auth.admin.createUser({
      email: usuario.email,
      password,
      email_confirm: true,
    })
    if (errAuth) return responder(500, { error: errAuth.message })

    await admin.from('invitacion').update({ usada: new Date().toISOString() }).eq('id', inv.id)

    return responder(200, { ok: true, email: usuario.email })
  } catch (e) {
    return responder(500, { error: (e as Error).message })
  }
})
