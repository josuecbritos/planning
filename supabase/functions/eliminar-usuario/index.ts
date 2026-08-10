// Edge Function: eliminar-usuario (#301)
//
// Eliminar CORTA: además del borrado lógico en la base, revoca la CUENTA DE
// ACCESO. Vive acá y no en una función de Postgres porque tocar `auth.users`
// por SQL sería saltarse el sistema de autenticación: la vía que corresponde
// es el Admin API, y el Admin API solo corre con `service_role`, que nunca
// llega al navegador.
//
// El orden importa. Primero la BASE, después la revocación:
//   1. RPC `eliminar_usuario` — con el JWT de QUIEN LLAMA, para que la
//      autorización la decida la propia función (`es_admin()`), igual que
//      cuando el cliente la invocaba directo. No se replica la regla acá.
//   2. `auth.admin.deleteUser` — con `service_role`.
// Si el paso 2 falla, la persona ya quedó eliminada en la base y el login la
// rechaza igual (exige un perfil activo), así que el modo de fallo es seguro
// y la operación se puede reintentar. Al revés —revocar primero— dejaría una
// cuenta sin acceso y un usuario que la interfaz sigue mostrando activo.
//
// Secrets: los inyecta la plataforma (SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY). SITE_URL / SITE_URLS gobiernan el CORS, igual
// que en las otras tres funciones.

import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS por LISTA de orígenes permitidos (invariante 8: acotado, nunca '*').
const PERMITIDOS = [
  Deno.env.get('SITE_URL'),
  ...(Deno.env.get('SITE_URLS') ?? '').split(',').map((o) => o.trim()),
].filter((o): o is string => Boolean(o))

// #249: sin ningún origen configurado la función NO se abre a cualquiera.
const CONFIGURADA = PERMITIDOS.length > 0

function corsDe(req: Request): Record<string, string> {
  const origen = req.headers.get('Origin') ?? ''
  const cabeceras: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
  const permitido = PERMITIDOS.includes(origen) ? origen : PERMITIDOS[0]
  if (permitido) cabeceras['Access-Control-Allow-Origin'] = permitido
  return cabeceras
}

// #249: el detalle técnico va a los logs; al cliente le llega español.
const ERROR_INTERNO =
  'No pudimos completar la operación. Reintenta en un momento; si el problema sigue, avisa a tu administrador.'
const ERROR_CONFIG = 'El servicio no está configurado. Avisa a tu administrador.'
// El borrado en la base SÍ se hizo; lo que falló es revocar la cuenta. La
// persona ya no puede entrar (el login exige perfil activo), pero conviene
// que quien mira la pantalla sepa que quedó algo a medias.
const ERROR_REVOCAR =
  'El usuario fue eliminado, pero no pudimos revocar su cuenta de acceso. Vuelve a intentarlo o avisa a tu administrador.'

function registrar(etiqueta: string, detalle: unknown) {
  console.error(`[eliminar-usuario] ${etiqueta}:`, detalle instanceof Error ? detalle.message : detalle)
}

Deno.serve(async (req) => {
  const cors = corsDe(req)

  const responder = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  if (!CONFIGURADA) {
    registrar('configuración', 'falta SITE_URL (o SITE_URLS): sin orígenes permitidos se rechaza la petición')
    return responder(503, { error: ERROR_CONFIG })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return responder(401, { error: 'Sin sesión' })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    // Cliente que actúa COMO QUIEN LLAMA: la RPC decide si puede o no.
    const comoUsuario = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )

    const { usuarioId } = await req.json()
    if (!usuarioId) return responder(400, { error: 'Falta el usuario a eliminar' })

    // El `auth_id` se lee ANTES: la RPC lo pone a null, y después de llamarla
    // ya no habría a quién revocar.
    const { data: usuario, error: errLeer } = await admin
      .from('usuario')
      .select('id, auth_id, eliminado')
      .eq('id', usuarioId)
      .maybeSingle()
    if (errLeer) {
      registrar('lectura del usuario', errLeer)
      return responder(500, { error: ERROR_INTERNO })
    }
    if (!usuario) return responder(404, { error: 'El usuario no existe' })
    const authId: string | null = usuario.auth_id

    // 1) Base. Su propia autorización (`es_admin()`) es la barrera: si quien
    // llama no es admin, la RPC levanta y no se toca nada de Auth.
    const { error: errRpc } = await comoUsuario.rpc('eliminar_usuario', { p_usuario: usuarioId })
    if (errRpc) {
      registrar('rpc eliminar_usuario', errRpc)
      // Los mensajes de la RPC son deliberadamente legibles ("Sin permiso
      // para eliminar usuarios", "El usuario no existe"): esos SÍ le sirven a
      // quien está mirando la pantalla, como en `invitar-usuario`.
      return responder(403, { error: errRpc.message })
    }

    // 2) Revocar la cuenta de acceso. Sin `auth_id` no hay nada que revocar
    // (nunca completó el registro, o ya se había eliminado antes).
    if (authId) {
      const { error: errAuth } = await admin.auth.admin.deleteUser(authId)
      if (errAuth) {
        registrar('deleteUser', errAuth)
        return responder(502, { error: ERROR_REVOCAR, eliminado: true, revocado: false })
      }
    }

    return responder(200, { ok: true, revocado: Boolean(authId) })
  } catch (e) {
    registrar('excepción', e)
    return responder(500, { error: ERROR_INTERNO })
  }
})
