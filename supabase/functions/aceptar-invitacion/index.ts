// Edge Function: aceptar-invitacion (§8.32 + correcciones de seguridad)
// El invitado abre el enlace, define su contraseña y aca se crea su cuenta
// de Auth (el trigger vincular_usuario_auth la enlaza a su fila de usuario
// por email SOLO si la invitacion quedo marcada como usada). Valida token
// vigente (7 dias) y de un solo uso.

import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS acotado al origen de la app (punto 8). Fallback '*' si no hay SITE_URL.
const ORIGEN = Deno.env.get('SITE_URL') ?? '*'
const cors = {
  'Access-Control-Allow-Origin': ORIGEN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin',
}

// Rate limiting best-effort (punto 9): en memoria del contenedor (efimero),
// como defensa en profundidad. El token UUID v4 ya hace impracticable
// adivinarlo; esto acota abusos repetidos desde una misma IP.
const LIMITE = 10 // intentos
const VENTANA_MS = 60_000 // por minuto
const golpes = new Map<string, number[]>()
function limitado(ip: string): boolean {
  const ahora = Date.now()
  const previos = (golpes.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS)
  previos.push(ahora)
  golpes.set(ip, previos)
  return previos.length > LIMITE
}

// Politica de contrasena (punto 4): minimo 10 y mezcla de letras y numeros.
function contrasenaValida(p: unknown): p is string {
  if (typeof p !== 'string' || p.length < 10) return false
  return /[a-zA-Z]/.test(p) && /[0-9]/.test(p)
}
const REGLA_PASSWORD = 'La contraseña debe tener al menos 10 caracteres e incluir letras y números.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const responder = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida'
  if (limitado(ip)) return responder(429, { error: 'Demasiados intentos. Espera un momento y reintenta.' })

  try {
    const { token, password } = await req.json()
    if (!token) return responder(400, { error: 'Falta el token de invitación' })
    if (!contrasenaValida(password)) return responder(400, { error: REGLA_PASSWORD })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: inv } = await admin
      .from('invitacion')
      .select('id, usuario_id, expira, usada')
      .eq('token', token)
      .maybeSingle()
    if (!inv) return responder(404, { error: 'Invitación no encontrada' })
    if (inv.usada) return responder(409, { error: 'Esta invitación ya fue usada' })
    if (new Date(inv.expira) < new Date()) {
      return responder(410, { error: 'La invitación expiró (7 días). Pide que te la reenvíen.' })
    }

    const { data: usuario } = await admin
      .from('usuario')
      .select('id, email, activo, auth_id')
      .eq('id', inv.usuario_id)
      .maybeSingle()
    if (!usuario || !usuario.activo) return responder(404, { error: 'Usuario no encontrado o inactivo' })
    if (usuario.auth_id) return responder(409, { error: 'La cuenta ya está activa: inicia sesión' })

    // Defensa de C1: marcar la invitación como USADA ANTES de crear la cuenta.
    // El trigger vincular_usuario_auth solo enlaza cuentas cuya invitación
    // quedo consumida; así, una cuenta creada por otra vía no se apropia de la
    // fila `usuario`. El update condicional (usada is null) evita doble uso.
    const { data: reclamada } = await admin
      .from('invitacion')
      .update({ usada: new Date().toISOString() })
      .eq('id', inv.id)
      .is('usada', null)
      .select('id')
    if (!reclamada || reclamada.length === 0) {
      return responder(409, { error: 'Esta invitación ya fue usada' })
    }

    // Crea la cuenta con el email ya confirmado (el enlace por correo es la
    // verificacion). El trigger enlaza usuario.auth_id por email.
    const { error: errAuth } = await admin.auth.admin.createUser({
      email: usuario.email,
      password,
      email_confirm: true,
    })
    if (errAuth) {
      // Revertir el reclamo para que el invitado pueda reintentar.
      await admin.from('invitacion').update({ usada: null }).eq('id', inv.id)
      return responder(500, { error: errAuth.message })
    }

    return responder(200, { ok: true, email: usuario.email })
  } catch (e) {
    return responder(500, { error: (e as Error).message })
  }
})
