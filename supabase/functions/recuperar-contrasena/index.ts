// Edge Function: recuperar-contrasena (#205)
//
// Dos operaciones en una sola función, distinguidas por el cuerpo:
//   { email }           → PEDIR el enlace (genera token y manda el correo)
//   { token, password } → CONSUMIR el enlace (cambia la contraseña)
//
// Por qué una función propia y no el "reset password" de Supabase Auth:
//   1. Supabase manda el correo con SUS plantillas; aquí todo sale por Resend
//      con el dominio propio, con la misma identidad que la invitación.
//   2. Su verificación es "¿existe este correo en Auth?". No distingue entre
//      un usuario activo, uno desactivado y uno eliminado — y aquí sí importa:
//      un usuario dado de baja no debe poder volver a entrar por esta puerta.
//
// El enlace dura 1 HORA (la invitación dura 7 días: son cosas distintas) y es
// de un solo uso. Los tokens viven en la tabla `recuperacion`, NUNCA en
// `invitacion`: esa tabla significa "esta persona aceptó su invitación" y de
// eso depende el trigger que enlaza auth.users con usuario (invariante 2).
//
// El registro público sigue apagado y esta función no lo abre: solo cambia la
// contraseña de una cuenta que YA existe (exige `usuario.auth_id`); nunca
// llama a createUser.
//
// Secrets requeridos (los mismos que invitar-usuario):
//   RESEND_API_KEY · EMAIL_FROM · SITE_URL

import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS por LISTA de orígenes permitidos (invariante 8: acotado, nunca '*').
// `SITE_URL` es la app en producción. `SITE_URLS` es opcional y admite orígenes
// extra separados por coma — sirve para las URL de preview de Vercel, que son
// de otro dominio y sin esto reciben un bloqueo del navegador que la app
// reporta como si fuera un problema de conexión.
const PERMITIDOS = [
  Deno.env.get('SITE_URL'),
  ...(Deno.env.get('SITE_URLS') ?? '').split(',').map((o) => o.trim()),
].filter((o): o is string => Boolean(o))

function corsDe(req: Request): Record<string, string> {
  const origen = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': PERMITIDOS.includes(origen) ? origen : (PERMITIDOS[0] ?? '*'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

// Rate limiting por IP, best-effort y en memoria del contenedor, igual que en
// aceptar-invitacion. El límite POR CUENTA —el que impide llenarle la bandeja
// a alguien— es el de más abajo, y ese sí es persistente.
const LIMITE_IP = 10
const VENTANA_MS = 60_000
const golpes = new Map<string, number[]>()
function limitado(ip: string): boolean {
  const ahora = Date.now()
  const previos = (golpes.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS)
  previos.push(ahora)
  golpes.set(ip, previos)
  return previos.length > LIMITE_IP
}

// Límite por cuenta: como máximo 3 correos de recuperación por hora para el
// mismo usuario. Se cuenta contra la tabla, así que sobrevive al reciclaje del
// contenedor y no depende de desde dónde se pida.
const LIMITE_CUENTA = 3
const VENTANA_CUENTA_MS = 60 * 60 * 1000

// Duración del enlace: 1 hora.
const VIGENCIA_MS = 60 * 60 * 1000

// Misma política que aceptar-invitacion (invariante 7). Vive duplicada en las
// dos funciones porque son despliegues independientes; el front la comparte en
// un solo lugar (lib/password.ts).
function contrasenaValida(p: unknown): p is string {
  if (typeof p !== 'string' || p.length < 10) return false
  return /[a-zA-Z]/.test(p) && /[0-9]/.test(p)
}
const REGLA_PASSWORD = 'La contraseña debe tener al menos 10 caracteres e incluir letras y números.'

// Decisión tomada en el pedido: NO se usa el mensaje genérico de OWASP. La
// aplicación no tiene registro público, los usuarios los crea el admin por
// invitación y son pocos; se acepta la enumeración a cambio de que la persona
// entienda qué le pasa. Un solo mensaje para los tres casos negativos (no
// existe / desactivado / eliminado): al usuario no le sirve la diferencia y
// así no se anuncia quién existe pero está de baja.
const SIN_CUENTA = 'No hay una cuenta activa con ese correo. Contacta a tu administrador.'

Deno.serve(async (req) => {
  const cors = corsDe(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const responder = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida'
  if (limitado(ip)) return responder(429, { error: 'Demasiados intentos. Espera un momento y reintenta.' })

  try {
    const cuerpo = await req.json()
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ---------------------------------------------------------------
    // (2) CONSUMIR el enlace: { token, password }
    // ---------------------------------------------------------------
    if (cuerpo.token) {
      // `verificar` (#206): comprueba el token sin consumirlo, para que la
      // pantalla explique de entrada que venció o que ya se usó.
      if (!cuerpo.verificar && !contrasenaValida(cuerpo.password)) {
        return responder(400, { error: REGLA_PASSWORD })
      }

      const { data: rec } = await admin
        .from('recuperacion')
        .select('id, usuario_id, expira, usada')
        .eq('token', cuerpo.token)
        .maybeSingle()
      if (!rec) return responder(404, { error: 'Enlace no encontrado' })
      if (rec.usada) return responder(409, { error: 'Este enlace ya se usó' })
      if (new Date(rec.expira) < new Date()) {
        return responder(410, { error: 'El enlace expiró (dura 1 hora). Pide uno nuevo.' })
      }

      const { data: usuario } = await admin
        .from('usuario')
        .select('id, email, activo, eliminado, auth_id')
        .eq('id', rec.usuario_id)
        .maybeSingle()
      // La cuenta pudo desactivarse DESPUÉS de pedir el enlace: se revalida.
      if (!usuario || !usuario.activo || usuario.eliminado || !usuario.auth_id) {
        return responder(403, { error: SIN_CUENTA })
      }

      // Todo lo anterior es solo lectura: si únicamente se pedía verificar, se
      // responde sin consumir el enlace.
      if (cuerpo.verificar) return responder(200, { ok: true, verificado: true })

      // Se marca usado ANTES de cambiar la contraseña, con update condicional:
      // dos peticiones simultáneas con el mismo token, y solo una avanza.
      const { data: reclamado } = await admin
        .from('recuperacion')
        .update({ usada: new Date().toISOString() })
        .eq('id', rec.id)
        .is('usada', null)
        .select('id')
      if (!reclamado || reclamado.length === 0) {
        return responder(409, { error: 'Este enlace ya se usó' })
      }

      const { error: errPass } = await admin.auth.admin.updateUserById(usuario.auth_id, {
        password: cuerpo.password,
      })
      if (errPass) {
        // Devolver el token al ruedo para que se pueda reintentar.
        await admin.from('recuperacion').update({ usada: null }).eq('id', rec.id)
        return responder(500, { error: errPass.message })
      }

      // Cierra TODAS las sesiones abiertas de esa cuenta. Si alguien recupera
      // su clave porque sospecha que se la robaron, la sesión del atacante
      // muere aquí y no cuando expire su token.
      await admin.auth.admin.signOut(usuario.auth_id, 'global').catch(() => {
        /* el cambio de contraseña ya está hecho; no se revierte por esto */
      })

      return responder(200, { ok: true, email: usuario.email })
    }

    // ---------------------------------------------------------------
    // (1) PEDIR el enlace: { email }
    // ---------------------------------------------------------------
    const email = String(cuerpo.email ?? '').trim().toLowerCase()
    if (!email) return responder(400, { error: 'Falta el correo' })

    const { data: usuario } = await admin
      .from('usuario')
      .select('id, nombre, email, activo, eliminado, auth_id')
      .ilike('email', email)
      .maybeSingle()

    // Sin cuenta creada (invitado que nunca aceptó), desactivado, eliminado o
    // inexistente: mismo mensaje y NINGÚN correo. Su camino es que el admin le
    // reenvíe la invitación.
    if (!usuario || !usuario.activo || usuario.eliminado || !usuario.auth_id) {
      return responder(404, { error: SIN_CUENTA })
    }

    const desde = new Date(Date.now() - VENTANA_CUENTA_MS).toISOString()
    const { count } = await admin
      .from('recuperacion')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', usuario.id)
      .gte('creada', desde)
    if ((count ?? 0) >= LIMITE_CUENTA) {
      return responder(429, {
        error: 'Ya pediste varios enlaces en la última hora. Revisa tu correo o espera un momento.',
      })
    }

    const token = crypto.randomUUID()
    const expira = new Date(Date.now() + VIGENCIA_MS).toISOString()
    const { error: errIns } = await admin
      .from('recuperacion')
      .insert({ usuario_id: usuario.id, token, expira })
    if (errIns) return responder(500, { error: errIns.message })

    const enlace = `${Deno.env.get('SITE_URL')}/#recuperar=${token}`
    const correo = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM'),
        to: [usuario.email],
        subject: 'Restablecer tu contraseña — Andotek Planning',
        html: `
          <p>Hola ${usuario.nombre},</p>
          <p>Pediste restablecer tu contraseña de <b>Andotek Planning</b>.
          Elige una nueva en el siguiente enlace:</p>
          <p><a href="${enlace}">${enlace}</a></p>
          <p>El enlace caduca en 1 hora y sirve una sola vez. Al cambiarla se
          cerrarán todas tus sesiones abiertas.</p>
          <p>Si no fuiste tú, puedes ignorar este correo: tu contraseña actual
          sigue funcionando.</p>
        `,
      }),
    })
    if (!correo.ok) {
      const detalle = await correo.text()
      return responder(502, { error: `Falló el envío del correo: ${detalle}` })
    }

    return responder(200, { ok: true })
  } catch (e) {
    return responder(500, { error: (e as Error).message })
  }
})
