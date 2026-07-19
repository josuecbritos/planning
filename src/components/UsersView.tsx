import { useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import { UsuarioModal } from './UsuarioModal'
import { PermisosModal } from './PermisosModal'
import { PermisosProyectoModal } from './PermisosProyectoModal'
import { supabaseConfigured, getClient } from '../data/client'

// Modulo de Usuarios (7.1, reestructurado por roles-y-permisos). Solo para
// Admins: listar, crear, editar y desactivar usuarios; asignar proyectos a
// consultores y clientes (6); configurar permisos de proyecto del consultor
// (3.1) y el set de ocho POR ACCESO (3.2, mismo componente para ambos roles).

interface Props {
  state: AppState
  usuarioActual: Usuario
  actions: Actions
}

type ModalState =
  | { tipo: 'nuevo' }
  | { tipo: 'editar'; usuario: Usuario }
  | { tipo: 'permisos-acceso'; usuario: Usuario; proyecto: Proyecto }
  | { tipo: 'permisos-proyecto'; usuario: Usuario }
  | null

const ROL_ORDEN: Record<Usuario['rol'], number> = { admin: 0, consultor: 1, cliente: 2 }
const ROL_LABEL: Record<Usuario['rol'], string> = { admin: 'Admin', consultor: 'Consultor', cliente: 'Cliente' }

export function UsersView({ state, usuarioActual, actions }: Props) {
  const [modal, setModal] = useState<ModalState>(null)
  const [invitandoId, setInvitandoId] = useState<string | null>(null)
  const [avisoInvitacion, setAvisoInvitacion] = useState<string | null>(null)

  // §8: envia (o reenvia) la invitacion por correo via Edge Function.
  async function invitar(u: Usuario) {
    if (!supabaseConfigured) return
    setInvitandoId(u.id)
    setAvisoInvitacion(null)
    try {
      const { error } = await getClient().functions.invoke('invitar-usuario', {
        body: { usuarioId: u.id },
      })
      if (error) throw new Error(error.message)
      setAvisoInvitacion(`Invitacion enviada a ${u.email} (caduca en 7 dias).`)
    } catch (e) {
      setAvisoInvitacion(`No se pudo enviar la invitacion: ${(e as Error).message}`)
    } finally {
      setInvitandoId(null)
    }
  }

  const usuarios = [...state.usuarios].sort((a, b) => {
    if (a.rol !== b.rol) return ROL_ORDEN[a.rol] - ROL_ORDEN[b.rol]
    return a.nombre.localeCompare(b.nombre)
  })

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Usuarios</h2>
          <p className="usuarios-sub">
            Admins: todo · Consultores: sus proyectos + asignados · Clientes: solo invitados.
            Los permisos nacen con el default del rol.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setModal({ tipo: 'nuevo' })}>
          + Usuario
        </button>
      </div>

      {avisoInvitacion && <p className="usuarios-aviso">{avisoInvitacion}</p>}

      <table className="tareas usuarios-tabla">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Proyectos</th>
            <th className="col-acc"></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <UsuarioFila
              key={u.id}
              usuario={u}
              esYo={u.id === usuarioActual.id}
              state={state}
              actions={actions}
              onEditar={() => setModal({ tipo: 'editar', usuario: u })}
              onPermisosAcceso={(proyecto) => setModal({ tipo: 'permisos-acceso', usuario: u, proyecto })}
              onPermisosProyecto={() => setModal({ tipo: 'permisos-proyecto', usuario: u })}
              onInvitar={() => invitar(u)}
              invitando={invitandoId === u.id}
            />
          ))}
        </tbody>
      </table>

      {modal?.tipo === 'nuevo' && (
        <UsuarioModal onSubmit={(d) => actions.createUsuario(d)} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'permisos-acceso' && (
        <PermisosModal
          nombre={modal.usuario.nombre}
          contexto={modal.proyecto.nombre}
          permisos={
            state.accesos.find(
              (a) => a.usuarioId === modal.usuario.id && a.proyectoId === modal.proyecto.id,
            )?.permisos ?? {}
          }
          onGuardar={(permisos) =>
            actions.updateAccesoPermisos(modal.usuario.id, modal.proyecto.id, permisos)
          }
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'permisos-proyecto' && (
        <PermisosProyectoModal
          usuario={modal.usuario}
          onGuardar={(permisosProyecto) =>
            actions.updateUsuario(modal.usuario.id, { permisosProyecto })
          }
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'editar' && (
        <UsuarioModal
          usuario={modal.usuario}
          onSubmit={(d) => actions.updateUsuario(modal.usuario.id, { nombre: d.nombre, iniciales: d.iniciales })}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function UsuarioFila({
  usuario,
  esYo,
  state,
  actions,
  onEditar,
  onPermisosAcceso,
  onPermisosProyecto,
  onInvitar,
  invitando,
}: {
  usuario: Usuario
  esYo: boolean
  state: AppState
  actions: Actions
  onEditar: () => void
  onPermisosAcceso: (proyecto: Proyecto) => void
  onPermisosProyecto: () => void
  onInvitar: () => void
  invitando: boolean
}) {
  const accesos = state.accesos.filter((a) => a.usuarioId === usuario.id)
  const proyectosAsignados = accesos
    .map((a) => state.proyectos.find((p) => p.id === a.proyectoId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  // Dueño de (consultores): control total, sin permisos que configurar.
  const proyectosPropios = state.proyectos.filter((p) => p.duenoId === usuario.id)
  // Asignables: cualquier proyecto que no sea suyo ni este ya asignado (6).
  const proyectosDisponibles = state.proyectos.filter(
    (p) => p.duenoId !== usuario.id && !accesos.some((a) => a.proyectoId === p.id),
  )

  return (
    <tr className={usuario.activo ? '' : 'usuario-inactivo'}>
      <td>
        <span className="usuario-nombre">
          <span className="resp-badge">{usuario.iniciales}</span>
          {usuario.nombre}
          {esYo && <span className="chip-yo">tu</span>}
        </span>
      </td>
      <td>{usuario.email}</td>
      <td>
        <span className={`chip-rol chip-rol--${usuario.rol}`}>{ROL_LABEL[usuario.rol]}</span>
      </td>
      <td>{usuario.activo ? 'Activo' : 'Inactivo'}</td>
      <td>
        {usuario.rol === 'admin' ? (
          <span className="usuarios-todos">Todos (Admin)</span>
        ) : (
          <div className="asignaciones">
            {proyectosPropios.map((p) => (
              <span key={p.id} className="asignacion asignacion--propia" title="Dueño: control total, sin permisos que configurar">
                <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                {p.nombre}
                <span className="chip-dueno">Dueño</span>
              </span>
            ))}
            {proyectosAsignados.map((p) => (
              <span key={p.id} className="asignacion">
                <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                {p.nombre}
                <button
                  className="icon-btn"
                  title={`Permisos en ${p.nombre}`}
                  onClick={() => onPermisosAcceso(p)}
                >
                  🔑
                </button>
                <button
                  className="icon-btn"
                  title="Quitar acceso"
                  onClick={() => actions.quitarAcceso(usuario.id, p.id)}
                >
                  ✕
                </button>
              </span>
            ))}
            {proyectosDisponibles.length > 0 && (
              <select
                className="asignar-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) actions.asignarAcceso(usuario.id, e.target.value)
                }}
              >
                <option value="">+ Asignar proyecto…</option>
                {proyectosDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
            {proyectosPropios.length === 0 &&
              proyectosAsignados.length === 0 &&
              proyectosDisponibles.length === 0 && (
                <span className="usuarios-sin">Sin proyectos</span>
              )}
          </div>
        )}
      </td>
      <td className="col-acc">
        <button className="icon-btn" title="Editar" onClick={onEditar}>✎</button>
        {usuario.rol === 'consultor' && (
          <button className="icon-btn" title="Permisos de proyecto (3.1)" onClick={onPermisosProyecto}>🔧</button>
        )}
        {supabaseConfigured && !usuario.authId && usuario.activo && (
          <button
            className="icon-btn"
            title={invitando ? 'Enviando…' : 'Enviar / reenviar invitacion por correo'}
            disabled={invitando}
            onClick={onInvitar}
          >
            ✉
          </button>
        )}
        {!esYo && (
          <button
            className="icon-btn"
            title={usuario.activo ? 'Desactivar' : 'Reactivar'}
            onClick={() => actions.updateUsuario(usuario.id, { activo: !usuario.activo })}
          >
            {usuario.activo ? '⏻' : '↺'}
          </button>
        )}
      </td>
    </tr>
  )
}
