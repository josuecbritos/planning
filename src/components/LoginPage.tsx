import { useEffect, useState } from 'react'
import type { Usuario } from '../types'
import { Wordmark } from './Wordmark'

// Pantalla de acceso. En Supabase: email + password. En modo Local: selector
// de usuario ("entrar como…") para demostrar los roles sin backend.

interface Props {
  modo: 'memoria' | 'supabase'
  /** En modo Local, usuarios activos entre los que se puede elegir. */
  usuariosDemo?: Usuario[]
  onLogin: (email: string, password?: string) => Promise<void>
}

export function LoginPage({ modo, usuariosDemo = [], onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => setError(null), [email, password])

  async function entrar(mail: string, pass?: string) {
    setCargando(true)
    setError(null)
    try {
      await onLogin(mail, pass)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <Wordmark />
          <small>Herramienta de Planificación de Proyectos</small>
        </div>

        {modo === 'supabase' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              entrar(email, password)
            }}
          >
            <label className="campo">
              <span>Email</span>
              <input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <div className="login__error">{error}</div>}
            <button className="btn btn--primary login__submit" disabled={cargando || !email || !password}>
              {cargando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        ) : (
          <>
            <p className="login__hint">
              Modo <b>Local</b> (sin backend): elige con quién entrar para probar los roles.
            </p>
            <div className="login__usuarios">
              {usuariosDemo.map((u) => (
                <button
                  key={u.id}
                  className="login__usuario"
                  disabled={cargando}
                  onClick={() => entrar(u.email)}
                >
                  <span className="resp-badge">{u.iniciales}</span>
                  <span className="login__usuario-info">
                    <b>{u.nombre}</b>
                    <small>{u.rol === 'admin' ? 'Admin' : u.rol === 'consultor' ? 'Consultor' : 'Cliente'} · {u.email}</small>
                  </span>
                </button>
              ))}
            </div>
            {error && <div className="login__error">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
