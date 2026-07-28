import { useEffect, useState } from 'react'
import { getClient, supabaseConfigured } from '../data/client'
import { mensajeError } from '../lib/errores'
import { REGLA_PASSWORD, passwordFuerte } from '../lib/password'
import { CampoPassword } from './CampoPassword'

// #204 — UNA sola pantalla para los dos flujos que definen una contraseña por
// enlace: activar la invitación y restablecerla. Son el mismo flujo con
// distinta puerta de entrada; lo único que cambia es el texto. Duplicarlos
// significaba dos validaciones que mantener sincronizadas.
//
// #206 — Si el enlace venció o ya se usó, no se muestra un error técnico
// debajo del formulario: se explica qué pasó y cuál es el siguiente paso. El
// token se comprueba AL ENTRAR (modo `verificar` de la Edge Function, que no
// lo consume), así nadie escribe una contraseña que va a ser rechazada.
//
// El reenvío sigue siendo del admin, desde el botón ✉ del módulo de Usuarios:
// no hay ningún botón de auto-reenvío aquí. Es el patrón del mercado (Adobe,
// IBM, Jira, Shopify) y evita que un enlace filtrado se renueve solo.

export type FlujoPassword = 'invitacion' | 'recuperacion'

interface Props {
  flujo: FlujoPassword
  token: string
  onListo: () => void
}

const TEXTOS = {
  invitacion: {
    funcion: 'aceptar-invitacion',
    rotulo: 'Activación de cuenta',
    titulo: 'Te damos la bienvenida',
    bajada: 'Define tu contraseña para entrar por primera vez.',
    boton: 'Activar cuenta',
    cargando: 'Activando…',
    listo: 'quedó activa. Ya puedes iniciar sesión con tu contraseña.',
    caducado: 'Este enlace de invitación ya no sirve: caduca a los 7 días y solo se puede usar una vez.',
    siguiente: 'Pídele a tu administrador que te reenvíe la invitación desde el módulo de Usuarios.',
  },
  recuperacion: {
    funcion: 'recuperar-contrasena',
    rotulo: 'Restablecer contraseña',
    titulo: 'Elige una contraseña nueva',
    bajada: 'Al guardarla se cerrarán todas tus sesiones abiertas.',
    boton: 'Guardar contraseña',
    cargando: 'Guardando…',
    listo: 'tiene una contraseña nueva. Ya puedes iniciar sesión.',
    caducado: 'Este enlace ya no sirve: dura 1 hora y solo se puede usar una vez.',
    siguiente: 'Vuelve a "¿Olvidaste tu contraseña?" en la pantalla de inicio para pedir uno nuevo.',
  },
} as const

/** Lee el detalle que la Edge Function devuelve en el cuerpo de la respuesta. */
async function detalleDe(error: unknown): Promise<{ mensaje: string; status?: number }> {
  const err = error as { message?: string; context?: Response }
  let mensaje = err.message ?? 'Error'
  const status = err.context?.status
  try {
    const cuerpo = await err.context?.json()
    if (cuerpo?.error) mensaje = cuerpo.error
  } catch {
    /* sin cuerpo JSON: queda el mensaje genérico */
  }
  return { mensaje, status }
}

export function DefinirPassword({ flujo, token, onListo }: Props) {
  const t = TEXTOS[flujo]
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  // 'verificando' mientras se comprueba el token; 'invalido' = vencido o usado.
  const [estado, setEstado] = useState<'verificando' | 'valido' | 'invalido'>('verificando')
  const [motivo, setMotivo] = useState<string | null>(null)

  const fuerte = passwordFuerte(password)
  const valido = fuerte && password === confirmar

  // #206: comprobación del enlace al entrar, sin consumirlo.
  useEffect(() => {
    let vigente = true
    if (!supabaseConfigured) {
      setEstado('valido')
      return
    }
    ;(async () => {
      try {
        const { error } = await getClient().functions.invoke(t.funcion, {
          body: { token, verificar: true },
        })
        if (!vigente) return
        if (!error) {
          setEstado('valido')
          return
        }
        const { mensaje, status } = await detalleDe(error)
        // 404/409/410 = el enlace no sirve (no existe, ya se usó, expiró).
        if (status && [404, 409, 410].includes(status)) {
          setMotivo(mensaje)
          setEstado('invalido')
        } else {
          // Un fallo de red no significa que el enlace esté mal: se deja pasar
          // al formulario, donde el envío volverá a intentarlo.
          setEstado('valido')
        }
      } catch {
        if (vigente) setEstado('valido')
      }
    })()
    return () => {
      vigente = false
    }
  }, [t.funcion, token])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || !supabaseConfigured) return
    setCargando(true)
    setError(null)
    try {
      const { data, error } = await getClient().functions.invoke(t.funcion, {
        body: { token, password },
      })
      if (error) {
        const { mensaje, status } = await detalleDe(error)
        if (status && [404, 409, 410].includes(status)) {
          setMotivo(mensaje)
          setEstado('invalido')
          return
        }
        throw new Error(mensaje)
      }
      setOk(data?.email ?? '')
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          Andotek Planning
          <small>{t.rotulo}</small>
        </div>

        {!supabaseConfigured ? (
          <p className="login__hint">Este flujo requiere el modo Supabase.</p>
        ) : estado === 'verificando' ? (
          <p className="login__hint">Comprobando el enlace…</p>
        ) : estado === 'invalido' ? (
          <>
            {/* #206: qué pasó y qué hacer, sin jerga técnica. */}
            <h3 className="login__titulo">El enlace ya no sirve</h3>
            <p className="login__hint">{t.caducado}</p>
            <p className="login__hint">{t.siguiente}</p>
            {motivo && <p className="login__detalle">{motivo}</p>}
            <button className="btn login__submit" onClick={onListo}>
              Ir a iniciar sesión
            </button>
          </>
        ) : ok !== null ? (
          <>
            <p className="login__hint">
              ✅ Tu cuenta {ok && <b>({ok})</b>} {t.listo}
            </p>
            <button className="btn btn--primary login__submit" onClick={onListo}>
              Ir a iniciar sesión
            </button>
          </>
        ) : (
          <form onSubmit={enviar}>
            <h3 className="login__titulo">{t.titulo}</h3>
            <p className="login__hint">{t.bajada}</p>
            {/* #217: un ojo por campo, independientes entre sí. */}
            <CampoPassword
              etiqueta="Contraseña (mínimo 10 caracteres, con letras y números)"
              autoFocus
              autoComplete="new-password"
              valor={password}
              onCambiar={setPassword}
            />
            <CampoPassword
              etiqueta="Repite la contraseña"
              autoComplete="new-password"
              valor={confirmar}
              onCambiar={setConfirmar}
            />
            {password && !fuerte && <div className="login__error">{REGLA_PASSWORD}</div>}
            {password && confirmar && password !== confirmar && (
              <div className="login__error">Las contraseñas no coinciden.</div>
            )}
            {error && <div className="login__error">{error}</div>}
            <button className="btn btn--primary login__submit" disabled={!valido || cargando}>
              {cargando ? t.cargando : t.boton}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
