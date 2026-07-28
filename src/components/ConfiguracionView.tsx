import { useState } from 'react'
import type { Usuario } from '../types'
import type { Actions } from '../App'
import type { AuthService } from '../auth/auth'
import { mensajeError } from '../lib/errores'
import { REGLA_PASSWORD, passwordFuerte } from '../lib/password'
import { CampoPassword } from './CampoPassword'

// #207 — Configuración de la propia cuenta. Se entra desde el pie de la barra
// lateral, donde ya viven el nombre y el botón de salir.
//
// Qué se puede cambiar y qué no:
//   Nombre e iniciales → sí.
//   Contraseña        → sí, dando la actual (protege de una sesión ajena
//                       abierta). Mismas reglas que #204, del mismo módulo.
//   Email             → NO: es la llave de la cuenta y su cambio arrastra al
//                       inicio de sesión.
//   Rol / permisos / estado → NO: los gestiona el admin.
//
// La barrera dura no es esta pantalla: la RLS solo deja actualizar la propia
// fila y un trigger rechaza cualquier columna que no sea nombre o iniciales
// (migración 18). Aquí solo se decide qué se OFRECE.

const ROL_LABEL: Record<Usuario['rol'], string> = {
  admin: 'Admin',
  consultor: 'Consultor',
  cliente: 'Cliente',
}

interface Props {
  usuario: Usuario
  actions: Actions
  auth: AuthService
}

export function ConfiguracionView({ usuario, actions, auth }: Props) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [iniciales, setIniciales] = useState(usuario.iniciales)
  const [guardando, setGuardando] = useState(false)
  const [avisoPerfil, setAvisoPerfil] = useState<{ ok: boolean; texto: string } | null>(null)

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const [avisoPass, setAvisoPass] = useState<{ ok: boolean; texto: string } | null>(null)

  // Las iniciales que se verían si nadie las hubiera escrito a mano.
  const derivadas = nombre.trim().split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const siguenAlNombre = !iniciales.trim() || iniciales.trim().toUpperCase() === derivadas
  const perfilCambiado = nombre.trim() !== usuario.nombre || iniciales.trim().toUpperCase() !== usuario.iniciales
  const perfilValido = nombre.trim().length > 0

  async function guardarPerfil(e: React.FormEvent) {
    e.preventDefault()
    if (!perfilValido || !perfilCambiado) return
    setGuardando(true)
    setAvisoPerfil(null)
    try {
      // Iniciales vacías = "que sigan mi nombre": se limpia la marca de manual
      // y la base (o el repo local) las recalcula.
      const escritas = iniciales.trim().toUpperCase()
      // actualizarPerfil (y no updateUsuario): además de guardar, refresca la
      // sesión —si no, el pie de la barra seguiría con el nombre viejo— y
      // propaga el error para poder decirlo aquí mismo.
      await actions.actualizarPerfil({
        nombre: nombre.trim(),
        iniciales: escritas,
        inicialesManual: escritas.length > 0 && escritas !== derivadas,
      })
      setAvisoPerfil({ ok: true, texto: 'Listo, se guardó.' })
    } catch (err) {
      setAvisoPerfil({ ok: false, texto: mensajeError(err) })
    } finally {
      setGuardando(false)
    }
  }

  const passValida = passwordFuerte(nueva) && nueva === confirmar && actual.length > 0

  async function guardarPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!passValida) return
    setCambiando(true)
    setAvisoPass(null)
    try {
      await auth.cambiarPassword(actual, nueva)
      setActual('')
      setNueva('')
      setConfirmar('')
      setAvisoPass({ ok: true, texto: 'Contraseña actualizada. Úsala la próxima vez que entres.' })
    } catch (err) {
      setAvisoPass({ ok: false, texto: mensajeError(err) })
    } finally {
      setCambiando(false)
    }
  }

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Mi cuenta</h2>
          <p className="usuarios-sub">
            {usuario.email} · {ROL_LABEL[usuario.rol]}
          </p>
        </div>
      </div>

      <div className="config">
        <form className="config__bloque" onSubmit={guardarPerfil}>
          <h3>Perfil</h3>
          <label className="campo">
            <span>Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="campo">
            <span>Iniciales</span>
            <input
              maxLength={3}
              value={iniciales}
              onChange={(e) => setIniciales(e.target.value.toUpperCase())}
              placeholder={derivadas}
            />
          </label>
          <p className="config__nota">
            {siguenAlNombre ? (
              <>
                Tus iniciales siguen a tu nombre: si lo cambias, se recalculan.
                Escríbelas para fijarlas.
              </>
            ) : (
              <>
                Las fijaste a mano, así que se respetan aunque cambies tu nombre.
                Bórralas para que vuelvan a seguirlo (serían <b>{derivadas}</b>).
              </>
            )}
          </p>
          <div className="config__acciones">
            <button className="btn btn--primary" disabled={!perfilValido || !perfilCambiado || guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {avisoPerfil && (
              <span className={avisoPerfil.ok ? 'config__ok' : 'config__error'}>{avisoPerfil.texto}</span>
            )}
          </div>
        </form>

        <form className="config__bloque" onSubmit={guardarPassword}>
          <h3>Contraseña</h3>
          {/* #217: el interruptor único que mostraba los tres a la vez se
              reemplaza por un ojo dentro de cada campo, como en el resto de
              la aplicación. */}
          <CampoPassword
            etiqueta="Contraseña actual"
            autoComplete="current-password"
            valor={actual}
            onCambiar={setActual}
          />
          <CampoPassword
            etiqueta="Contraseña nueva (mínimo 10 caracteres, con letras y números)"
            autoComplete="new-password"
            valor={nueva}
            onCambiar={setNueva}
          />
          <CampoPassword
            etiqueta="Repite la nueva"
            autoComplete="new-password"
            valor={confirmar}
            onCambiar={setConfirmar}
          />
          {nueva && !passwordFuerte(nueva) && <div className="config__error">{REGLA_PASSWORD}</div>}
          {nueva && confirmar && nueva !== confirmar && (
            <div className="config__error">Las contraseñas no coinciden.</div>
          )}
          {auth.modo === 'memoria' && (
            <p className="config__nota">
              En modo <b>Local</b> no hay contraseñas reales: esto guarda una simulada en
              este navegador, solo para poder probar el flujo.
            </p>
          )}
          <div className="config__acciones">
            <button className="btn btn--primary" disabled={!passValida || cambiando}>
              {cambiando ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
            {avisoPass && (
              <span className={avisoPass.ok ? 'config__ok' : 'config__error'}>{avisoPass.texto}</span>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
