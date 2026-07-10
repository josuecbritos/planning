import { useState } from 'react'
import type { AppState, Usuario } from '../types'
import type { Actions } from '../App'
import { UsuarioModal } from './UsuarioModal'

// Modulo de Usuarios (7.1). Solo accesible para Admins:
// listar, crear, editar, desactivar usuarios y asignar proyectos a Clientes.

interface Props {
  state: AppState
  usuarioActual: Usuario
  actions: Actions
}

type ModalState = { tipo: 'nuevo' } | { tipo: 'editar'; usuario: Usuario } | null

export function UsersView({ state, usuarioActual, actions }: Props) {
  const [modal, setModal] = useState<ModalState>(null)

  const adminsActivos = state.usuarios.filter((u) => u.rol === 'admin' && u.activo).length
  const adminsCompletos = adminsActivos >= 2

  const usuarios = [...state.usuarios].sort((a, b) => {
    if (a.rol !== b.rol) return a.rol === 'admin' ? -1 : 1
    return a.nombre.localeCompare(b.nombre)
  })

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Usuarios</h2>
          <p className="usuarios-sub">
            {adminsActivos}/2 admins activos · Los clientes solo ven los proyectos que se les asignen.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setModal({ tipo: 'nuevo' })}>
          + Usuario
        </button>
      </div>

      <table className="tareas usuarios-tabla">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Proyectos asignados</th>
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
            />
          ))}
        </tbody>
      </table>

      {modal?.tipo === 'nuevo' && (
        <UsuarioModal
          adminsCompletos={adminsCompletos}
          onSubmit={(d) => actions.createUsuario(d)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'editar' && (
        <UsuarioModal
          usuario={modal.usuario}
          adminsCompletos={adminsCompletos}
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
}: {
  usuario: Usuario
  esYo: boolean
  state: AppState
  actions: Actions
  onEditar: () => void
}) {
  const accesos = state.accesos.filter((a) => a.usuarioId === usuario.id)
  const proyectosAsignados = accesos
    .map((a) => state.proyectos.find((p) => p.id === a.proyectoId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const proyectosDisponibles = state.proyectos.filter(
    (p) => !accesos.some((a) => a.proyectoId === p.id),
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
        <span className={`chip-rol chip-rol--${usuario.rol}`}>
          {usuario.rol === 'admin' ? 'Admin' : 'Cliente'}
        </span>
      </td>
      <td>{usuario.activo ? 'Activo' : 'Inactivo'}</td>
      <td>
        {usuario.rol === 'admin' ? (
          <span className="usuarios-todos">Todos (Admin)</span>
        ) : (
          <div className="asignaciones">
            {proyectosAsignados.map((p) => (
              <span key={p.id} className="asignacion">
                <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                {p.nombre}
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
            {proyectosAsignados.length === 0 && proyectosDisponibles.length === 0 && (
              <span className="usuarios-sin">Sin proyectos</span>
            )}
          </div>
        )}
      </td>
      <td className="col-acc">
        <button className="icon-btn" title="Editar" onClick={onEditar}>✎</button>
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
