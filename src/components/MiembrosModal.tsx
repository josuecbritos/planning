import { useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import {
  puedeConfigurarClientesEn,
  puedeInvitarClientesEn,
} from '../lib/permisos'
import { IconoLlave } from './Iconos'
import { Modal } from './Modal'
import { Avatar } from './RespPicker'
import { PermisosModal } from './PermisosModal'

// Miembros de un proyecto (roles punto 7). El dueño ve QUIENES estan
// asignados, pero NO sus permisos: la configuracion solo la ve quien puede
// configurarla (admin siempre; el dueño solo a los CLIENTES de su proyecto
// y solo si tiene el permiso configurarPermisosClientes). Invitar/quitar
// clientes exige el permiso invitarClientes. A los consultores asignados
// los gestiona unicamente el admin (punto 6).

interface Props {
  state: AppState
  proyecto: Proyecto
  sesion: Usuario
  actions: Actions
  onClose: () => void
}

const ROL_LABEL: Record<Usuario['rol'], string> = {
  admin: 'Admin',
  consultor: 'Consultor',
  cliente: 'Cliente',
}

export function MiembrosModal({ state, proyecto, sesion, actions, onClose }: Props) {
  const esAdmin = sesion.rol === 'admin'
  const puedeInvitar = puedeInvitarClientesEn(state, sesion, proyecto.id)
  const puedeConfigurar = puedeConfigurarClientesEn(state, sesion, proyecto.id)
  const [permisosDe, setPermisosDe] = useState<Usuario | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')

  const dueno = state.usuarios.find((u) => u.id === proyecto.duenoId)
  const accesos = state.accesos.filter((a) => a.proyectoId === proyecto.id)
  // #167: solo miembros ACTIVOS (los desactivados no aparecen; los eliminados
  // ya los oculta usuario_visible). Incluye al propio usuario si es miembro.
  const miembros = accesos
    .map((a) => state.usuarios.find((u) => u.id === a.usuarioId))
    .filter((u): u is Usuario => Boolean(u) && u!.activo)
    .sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol.localeCompare(b.rol)))

  // #164: el admin puede sumar a cualquiera, INCLUIDO él mismo (para unirse y
  // que el proyecto aparezca en su barra). El consultor dueño, SOLO clientes.
  const yaDentro = new Set([proyecto.duenoId, ...accesos.map((a) => a.usuarioId)])
  const agregables = state.usuarios.filter(
    (u) => u.activo && !yaDentro.has(u.id) && (esAdmin || u.rol === 'cliente'),
  )

  // El acceso configurable: solo CLIENTES para el dueño; cualquiera para admin.
  const puedeConfigurarA = (u: Usuario) =>
    esAdmin || (puedeConfigurar && u.rol === 'cliente')
  const puedeQuitarA = (u: Usuario) => esAdmin || (puedeInvitar && u.rol === 'cliente')

  async function crearCliente(e: React.FormEvent) {
    e.preventDefault()
    const nombre = nuevoNombre.trim()
    const email = nuevoEmail.trim()
    if (!nombre || !/\S+@\S+\.\S+/.test(email)) return
    // El alta + acceso: el cliente nace con el default de su rol (4.2).
    await actions.createUsuario({ nombre, email, rol: 'cliente' })
    // El id recien creado no llega por Actions: se resuelve por email en el
    // proximo render; para asignar de inmediato lo buscamos via callback.
    setCreando(false)
    setNuevoNombre('')
    setNuevoEmail('')
  }

  return (
    <Modal titulo={`Miembros de ${proyecto.nombre}`} onClose={onClose} ancho>
      <div className="miembros">
        <ul className="miembros-lista">
          {/* #167: el dueño se muestra solo si está activo (coincide con el
              conteo de la tabla). */}
          {dueno && dueno.activo && (
            <li className="miembro">
              <Avatar usuario={dueno} />
              <span className="miembro__info">
                <b>{dueno.nombre}{dueno.id === sesion.id && <span className="chip-yo">tú</span>}</b>
                <small>{dueno.email}</small>
              </span>
              <span className={`chip-rol chip-rol--${dueno.rol}`}>{ROL_LABEL[dueno.rol]}</span>
              <span className="chip-dueno" title="Creador del proyecto: control total">Dueño</span>
            </li>
          )}
          {/* #164: la lista incluye a uno mismo si es miembro; desde aquí uno
              puede salirse (quitarse). El dueño no aparece aquí (no se quita). */}
          {miembros.map((u) => {
            const esYo = u.id === sesion.id
            return (
            <li key={u.id} className="miembro">
              <Avatar usuario={u} />
              <span className="miembro__info">
                <b>{u.nombre}{esYo && <span className="chip-yo">tú</span>}</b>
                <small>{u.email}</small>
              </span>
              <span className={`chip-rol chip-rol--${u.rol}`}>{ROL_LABEL[u.rol]}</span>
              <span className="miembro__acciones">
                {puedeConfigurarA(u) && (
                  <button
                    className="icon-btn"
                    data-tip="Permisos en este proyecto"
                    aria-label={`Permisos de ${u.nombre}`}
                    onClick={() => setPermisosDe(u)}
                  >
                    <IconoLlave />
                  </button>
                )}
                {puedeQuitarA(u) && (
                  <button
                    className="icon-btn"
                    data-tip={esYo ? 'Salir del proyecto' : 'Quitar del proyecto'}
                    aria-label={esYo ? 'Salir del proyecto' : `Quitar a ${u.nombre}`}
                    onClick={() => {
                      const msg = esYo
                        ? `¿Salir de "${proyecto.nombre}"? Dejará de aparecer en tu barra lateral.`
                        : `¿Quitar a ${u.nombre} de ${proyecto.nombre}?`
                      if (confirm(msg)) actions.quitarAcceso(u.id, proyecto.id)
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
            )
          })}
          {miembros.length === 0 && (
            <li className="miembros-vacio">Nadie más tiene acceso a este proyecto.</li>
          )}
        </ul>

        {puedeInvitar && (
          <div className="miembros-agregar">
            {agregables.length > 0 && (
              <select
                className="asignar-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) actions.asignarAcceso(e.target.value, proyecto.id)
                }}
              >
                <option value="">{esAdmin ? '+ Agregar usuario…' : '+ Invitar cliente…'}</option>
                {agregables.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({ROL_LABEL[u.rol]})
                  </option>
                ))}
              </select>
            )}
            {!creando ? (
              <button className="btn btn--ghost btn--sm" onClick={() => setCreando(true)}>
                + Crear cliente nuevo
              </button>
            ) : (
              <form className="miembros-nuevo" onSubmit={crearCliente}>
                <input
                  autoFocus
                  placeholder="Nombre"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="email@cliente.cl"
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                />
                <button className="btn btn--primary btn--sm" type="submit">Crear</button>
                <button className="btn btn--sm" type="button" onClick={() => setCreando(false)}>
                  Cancelar
                </button>
              </form>
            )}
            <p className="miembros-nota">
              El acceso nace con los permisos por defecto del rol; ajustables con el botón de permisos.
            </p>
          </div>
        )}
      </div>

      {permisosDe && (
        <PermisosModal
          nombre={permisosDe.nombre}
          contexto={proyecto.nombre}
          permisos={
            state.accesos.find((a) => a.usuarioId === permisosDe.id && a.proyectoId === proyecto.id)
              ?.permisos ?? {}
          }
          onGuardar={(permisos) => actions.updateAccesoPermisos(permisosDe.id, proyecto.id, permisos)}
          onClose={() => setPermisosDe(null)}
        />
      )}
    </Modal>
  )
}
