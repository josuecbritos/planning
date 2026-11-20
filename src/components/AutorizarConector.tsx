import { useEffect, useState } from 'react'
import type { Usuario } from '../types'
import { getClient, supabaseConfigured } from '../data/client'
import { mensajeError } from '../lib/errores'
import { MENSAJE_SOLO_ADMIN, puedeUsarConector } from '../lib/conector'
import { Wordmark } from './Wordmark'

// #350 — Pantalla de autorización del conector (Claude u otro cliente MCP).
// Supabase Auth trae acá al usuario con `?authorization_id=…`; se muestra
// quién pide acceso y se Autoriza o Rechaza. Sin sesión, App muestra antes el
// login de siempre y vuelve a esta ruta. Supabase hace la redirección final
// de vuelta al cliente en los dos casos.

type Detalle = { cliente: string; sitio?: string; destino: string }

type Fase =
  | { tipo: 'cargando' }
  | { tipo: 'pedir'; detalle: Detalle }
  | { tipo: 'enviando'; detalle: Detalle }
  | { tipo: 'error'; texto: string }

function hostDe(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function AutorizarConector({ sesion }: { sesion: Usuario }) {
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  const id = new URLSearchParams(window.location.search).get('authorization_id') ?? ''
  const permitido = puedeUsarConector(sesion)

  useEffect(() => {
    if (!supabaseConfigured) {
      setFase({ tipo: 'error', texto: 'La autorización de conectores requiere la base de datos real.' })
      return
    }
    if (!id) {
      setFase({ tipo: 'error', texto: 'Falta la solicitud de autorización. Vuelve a conectar desde Claude.' })
      return
    }
    let vigente = true
    getClient()
      .auth.oauth.getAuthorizationDetails(id)
      .then(({ data, error }) => {
        if (!vigente) return
        if (error || !data) {
          setFase({ tipo: 'error', texto: 'La solicitud venció o no es válida. Vuelve a conectar desde Claude.' })
          return
        }
        // Ya autorizado antes: Supabase entrega directo la vuelta al cliente.
        if (!('authorization_id' in data)) {
          window.location.href = data.redirect_url
          return
        }
        setFase({
          tipo: 'pedir',
          detalle: {
            cliente: data.client.name || 'Una aplicación',
            sitio: data.client.uri ? hostDe(data.client.uri) : undefined,
            destino: hostDe(data.redirect_uri),
          },
        })
      })
      .catch((e) => vigente && setFase({ tipo: 'error', texto: mensajeError(e) }))
    return () => {
      vigente = false
    }
  }, [id])

  async function decidir(autorizar: boolean, detalle: Detalle) {
    setFase({ tipo: 'enviando', detalle })
    try {
      const oauth = getClient().auth.oauth
      // Por defecto, Supabase redirige solo al cliente con el resultado.
      const { error } = autorizar ? await oauth.approveAuthorization(id) : await oauth.denyAuthorization(id)
      if (error) throw error
    } catch (e) {
      setFase({ tipo: 'error', texto: mensajeError(e) })
    }
  }

  return (
    <div className="login">
      <div className="login__card autorizar">
        <div className="login__brand">
          <Wordmark />
          <small>Autorizar conector</small>
        </div>
        {fase.tipo === 'cargando' && <p className="login__hint">Cargando…</p>}
        {fase.tipo === 'error' && <div className="login__error">{fase.texto}</div>}
        {(fase.tipo === 'pedir' || fase.tipo === 'enviando') && (
          <>
            <p className="autorizar__pide">
              <strong>{fase.detalle.cliente}</strong> pide acceso a Andotek Planning con tu cuenta.
            </p>
            <dl className="autorizar__datos">
              <dt>Cuenta</dt>
              <dd>{sesion.nombre}</dd>
              {fase.detalle.sitio && (
                <>
                  <dt>Aplicación</dt>
                  <dd>{fase.detalle.sitio}</dd>
                </>
              )}
              <dt>Vuelve a</dt>
              <dd>{fase.detalle.destino}</dd>
            </dl>
            {permitido ? (
              <p className="login__hint">
                Podrá leer tus proyectos y planificar: crear frentes, sub frentes y tareas, cambiar fechas, asignar
                responsables y marcar tareas listas. No puede borrar ni archivar.
              </p>
            ) : (
              <div className="login__error">{MENSAJE_SOLO_ADMIN}</div>
            )}
            <div className="autorizar__acciones">
              <button
                type="button"
                className="btn"
                disabled={fase.tipo === 'enviando'}
                onClick={() => decidir(false, fase.detalle)}
              >
                Rechazar
              </button>
              {permitido && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={fase.tipo === 'enviando'}
                  onClick={() => decidir(true, fase.detalle)}
                >
                  Autorizar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
