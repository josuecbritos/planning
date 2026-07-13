import { useState } from 'react'
import { getClient, supabaseConfigured } from '../data/client'

// §8: pantalla del enlace de invitacion (#invitacion=TOKEN). El invitado
// define su propia contraseña; la Edge Function valida el token (7 dias,
// un solo uso) y crea la cuenta. Luego se lo lleva al login.

interface Props {
  token: string
  onListo: () => void
}

export function AceptarInvitacion({ token, onListo }: Props) {
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const valido = password.length >= 8 && password === confirmar

  async function activar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || !supabaseConfigured) return
    setCargando(true)
    setError(null)
    try {
      const { data, error } = await getClient().functions.invoke('aceptar-invitacion', {
        body: { token, password },
      })
      if (error) {
        // El detalle viene en el cuerpo de la respuesta de la funcion.
        let msg = error.message
        try {
          const ctx = await (error as { context?: Response }).context?.json()
          if (ctx?.error) msg = ctx.error
        } catch { /* usa el mensaje generico */ }
        throw new Error(msg)
      }
      setOk(data?.email ?? '')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          Andotek Planning
          <small>Activacion de cuenta</small>
        </div>

        {!supabaseConfigured ? (
          <p className="login__hint">Las invitaciones requieren el modo Supabase.</p>
        ) : ok !== null ? (
          <>
            <p className="login__hint">
              ✅ Tu cuenta {ok && <b>({ok})</b>} quedo activa. Ya puedes iniciar sesion con tu contraseña.
            </p>
            <button className="btn btn--primary login__submit" onClick={onListo}>
              Ir a iniciar sesion
            </button>
          </>
        ) : (
          <form onSubmit={activar}>
            <p className="login__hint">Define tu contraseña para activar la cuenta.</p>
            <label className="campo">
              <span>Contraseña (minimo 8 caracteres)</span>
              <input
                type="password"
                autoFocus
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Repite la contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
              />
            </label>
            {password && confirmar && password !== confirmar && (
              <div className="login__error">Las contraseñas no coinciden.</div>
            )}
            {error && <div className="login__error">{error}</div>}
            <button className="btn btn--primary login__submit" disabled={!valido || cargando}>
              {cargando ? 'Activando…' : 'Activar cuenta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
