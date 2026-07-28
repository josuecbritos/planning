import { useEffect, useState } from 'react'
import type { Usuario } from '../types'
import { getClient, supabaseConfigured } from '../data/client'
import { mensajeError } from '../lib/errores'
import { CampoPassword } from './CampoPassword'
import { Wordmark } from './Wordmark'

// Pantalla de acceso. En Supabase: email + password. En modo Local: selector
// de usuario ("entrar como…") para demostrar los roles sin backend.
//
// #205: desde aquí se pide el enlace de recuperación. La respuesta distingue
// los casos en vez de dar el mensaje genérico de OWASP — decisión tomada en el
// pedido: sin registro público, con usuarios creados por el admin y pocos, se
// acepta la enumeración a cambio de que la persona entienda qué le pasa.

interface Props {
  modo: 'memoria' | 'supabase'
  /** En modo Local, usuarios activos entre los que se puede elegir. */
  usuariosDemo?: Usuario[]
  onLogin: (email: string, password?: string) => Promise<void>
  /** #244: por qué se cerró la sesión sola (sesión inválida o cuenta dada de
   *  baja). Se muestra al llegar, sin pedir nada. */
  aviso?: string | null
  /** Se llama al primer intento de entrar: el aviso ya cumplió su función. */
  onAvisoVisto?: () => void
}

export function LoginPage({ modo, usuariosDemo = [], onLogin, aviso, onAvisoVisto }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  // #205: modo "olvidé mi contraseña" dentro de la misma tarjeta.
  const [recuperando, setRecuperando] = useState(false)
  const [avisoRec, setAvisoRec] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => setError(null), [email, password])

  async function entrar(mail: string, pass?: string) {
    setCargando(true)
    setError(null)
    onAvisoVisto?.() // #244: el aviso de sesión caída se retira al reintentar
    try {
      await onLogin(mail, pass)
    } catch (e) {
      // #210: un "Failed to fetch" no le dice nada a nadie; los errores
      // informativos (contraseña incorrecta, usuario desactivado) pasan tal cual.
      setError(mensajeError(e))
    } finally {
      setCargando(false)
    }
  }

  async function pedirRecuperacion(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !supabaseConfigured) return
    setCargando(true)
    setAvisoRec(null)
    try {
      const { error } = await getClient().functions.invoke('recuperar-contrasena', {
        body: { email: email.trim() },
      })
      if (error) {
        let msg = error.message
        try {
          const ctx = await (error as { context?: Response }).context?.json()
          if (ctx?.error) msg = ctx.error
        } catch {
          /* sin cuerpo JSON: queda el mensaje genérico */
        }
        setAvisoRec({ ok: false, texto: mensajeError(new Error(msg)) })
        return
      }
      setAvisoRec({ ok: true, texto: 'Te enviamos las instrucciones a tu correo.' })
    } catch (err) {
      setAvisoRec({ ok: false, texto: mensajeError(err) })
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

        {/* #244: por qué la sesión se cerró sola. Va arriba de todo, antes de
            los campos: es lo primero que hay que entender al llegar acá sin
            haber pedido salir. */}
        {aviso && (
          <div className="login__aviso" role="status">
            {aviso}
          </div>
        )}

        {modo === 'supabase' && recuperando ? (
          /* #205: pedir el enlace. Solo hace falta el correo. */
          <form onSubmit={pedirRecuperacion}>
            <p className="login__hint">
              Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.
              Dura 1 hora y sirve una sola vez.
            </p>
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
            {avisoRec && (
              <div className={avisoRec.ok ? 'login__aviso' : 'login__error'}>{avisoRec.texto}</div>
            )}
            <button className="btn btn--primary login__submit" disabled={cargando || !email}>
              {cargando ? 'Enviando…' : 'Enviar instrucciones'}
            </button>
            <button
              type="button"
              className="link-btn login__link"
              onClick={() => {
                setRecuperando(false)
                setAvisoRec(null)
              }}
            >
              Volver a iniciar sesión
            </button>
          </form>
        ) : modo === 'supabase' ? (
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
            {/* #217: cada campo de contraseña lleva su propio ojo. */}
            <CampoPassword
              etiqueta="Contraseña"
              autoComplete="current-password"
              valor={password}
              onCambiar={setPassword}
            />
            {error && <div className="login__error">{error}</div>}
            <button className="btn btn--primary login__submit" disabled={cargando || !email || !password}>
              {cargando ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              className="link-btn login__link"
              onClick={() => {
                setRecuperando(true)
                setError(null)
              }}
            >
              ¿Olvidaste tu contraseña?
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
