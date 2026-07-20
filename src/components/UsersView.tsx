import { useMemo, useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import {
  puedeConfigurarClientesEn,
  puedeInvitarClientesEn,
} from '../lib/permisos'
import { UsuarioModal } from './UsuarioModal'
import { PermisosModal } from './PermisosModal'
import { PermisosProyectoModal } from './PermisosProyectoModal'
import { supabaseConfigured, getClient } from '../data/client'

// Módulo de Usuarios (7.1, reestructurado por roles-y-permisos + pedido §3/§4).
//
// Admin: ve y gestiona a todos; asigna proyectos (incluye agregarse/sacarse a
// sí mismo como miembro, §3), configura permisos de proyecto del consultor
// (3.1) y el set de ocho por acceso (3.2).
//
// Consultor (§4): ve solo a la gente con acceso a SUS proyectos (dueño) —
// clientes y otros consultores; actúa solo sobre los CLIENTES de esos
// proyectos (invitar si tiene invitarClientes, configurar permisos si tiene
// configurarPermisosClientes). A los otros consultores los ve, no los edita.
// La interfaz solo expone lo que la RLS ya permite.

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

  const esAdminActor = usuarioActual.rol === 'admin'

  // Proyectos que el actor puede GESTIONAR (asignar gente, configurar): el
  // admin todos; el consultor solo los suyos (dueño).
  const gestionables = useMemo(
    () => (esAdminActor ? state.proyectos : state.proyectos.filter((p) => p.duenoId === usuarioActual.id)),
    [state.proyectos, esAdminActor, usuarioActual.id],
  )

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

  // Usuarios visibles. Admin: todos. Consultor (§4): solo la gente CON ACCESO a
  // sus proyectos (clientes y otros consultores); nunca admins ni ajenos.
  const usuarios = useMemo(() => {
    let lista = state.usuarios
    if (!esAdminActor) {
      const gestIds = new Set(gestionables.map((p) => p.id))
      const conAcceso = new Set(
        state.accesos.filter((a) => gestIds.has(a.proyectoId)).map((a) => a.usuarioId),
      )
      const conAlgunAcceso = new Set(state.accesos.map((a) => a.usuarioId))
      lista = state.usuarios.filter(
        (u) =>
          u.rol !== 'admin' &&
          u.id !== usuarioActual.id &&
          // Gente con acceso a sus proyectos (clientes y consultores) +
          // clientes recién creados aún sin asignar (para poder invitarlos).
          // La RLS garantiza que un consultor solo tenga en su estado clientes
          // suyos: los ajenos sin acceso compartido no le llegan.
          (conAcceso.has(u.id) || (u.rol === 'cliente' && !conAlgunAcceso.has(u.id))),
      )
    }
    return [...lista].sort((a, b) => {
      if (a.rol !== b.rol) return ROL_ORDEN[a.rol] - ROL_ORDEN[b.rol]
      return a.nombre.localeCompare(b.nombre)
    })
  }, [state.usuarios, state.accesos, esAdminActor, gestionables, usuarioActual.id])

  // El consultor solo puede crear usuarios si puede invitar clientes en algún
  // proyecto suyo (y solo como cliente).
  const puedeCrearUsuario =
    esAdminActor || gestionables.some((p) => puedeInvitarClientesEn(state, usuarioActual, p.id))

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <div>
          <h2>Usuarios</h2>
          <p className="usuarios-sub">
            {esAdminActor
              ? 'Admins: todo · Consultores: sus proyectos + asignados · Clientes: solo invitados. Los permisos nacen con el default del rol.'
              : 'Gente con acceso a tus proyectos. Puedes invitar y configurar a los clientes de tus proyectos; a los demás consultores los ves, no los editas.'}
          </p>
        </div>
        {puedeCrearUsuario && (
          <button className="btn btn--primary" onClick={() => setModal({ tipo: 'nuevo' })}>
            + {esAdminActor ? 'Usuario' : 'Cliente'}
          </button>
        )}
      </div>

      {avisoInvitacion && <p className="usuarios-aviso">{avisoInvitacion}</p>}

      {usuarios.length === 0 ? (
        <p className="vacio-inline">
          Aún no hay clientes ni consultores con acceso a tus proyectos. Invita a alguien con “+ Cliente”.
        </p>
      ) : (
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
                actor={usuarioActual}
                esAdminActor={esAdminActor}
                gestionables={gestionables}
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
      )}

      {modal?.tipo === 'nuevo' && (
        <UsuarioModal
          soloCliente={!esAdminActor}
          onSubmit={(d) => actions.createUsuario(d)}
          onClose={() => setModal(null)}
        />
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
  actor,
  esAdminActor,
  gestionables,
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
  actor: Usuario
  esAdminActor: boolean
  gestionables: Proyecto[]
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
  const targetEsCliente = usuario.rol === 'cliente'
  const targetEsAdmin = usuario.rol === 'admin'

  // Capacidades del ACTOR sobre este usuario, proyecto a proyecto.
  //  - asignar/quitar: admin siempre; consultor solo a CLIENTES de sus
  //    proyectos con permiso invitarClientes.
  //  - configurar permisos (🔑): admin a cualquier no-admin; consultor solo a
  //    CLIENTES con permiso configurarPermisosClientes. El admin no tiene
  //    permisos por acceso que configurar (control total): sin 🔑.
  const puedeAsignar = (p: Proyecto) =>
    esAdminActor || (targetEsCliente && puedeInvitarClientesEn(state, actor, p.id))
  const puedeConfig = (p: Proyecto) =>
    !targetEsAdmin &&
    (esAdminActor
      ? usuario.rol !== 'admin'
      : targetEsCliente && puedeConfigurarClientesEn(state, actor, p.id))

  // Dueño de (solo el admin ve los proyectos propios de otros como referencia).
  const propios = esAdminActor ? state.proyectos.filter((p) => p.duenoId === usuario.id) : []
  // Asignados dentro del alcance del actor (admin: todos; consultor: los suyos).
  const gestIds = new Set(gestionables.map((p) => p.id))
  const asignados = accesos
    .map((a) => state.proyectos.find((p) => p.id === a.proyectoId))
    .filter((p): p is Proyecto => Boolean(p) && gestIds.has(p!.id))
  // Disponibles para asignar: dentro del alcance, no propios, no ya asignados,
  // y que el actor pueda asignar.
  const disponibles = gestionables.filter(
    (p) =>
      p.duenoId !== usuario.id &&
      !accesos.some((a) => a.proyectoId === p.id) &&
      puedeAsignar(p),
  )

  // Acciones de administración de la cuenta (editar datos, permisos de
  // proyecto, activar/desactivar): SOLO el admin. El consultor no edita cuentas.
  const puedeAdministrarCuenta = esAdminActor
  // Invitación por correo: admin a cualquiera; consultor a los clientes que
  // puede invitar (la Edge Function reconfirma la autorización).
  const puedeInvitarCorreo = esAdminActor || (targetEsCliente && disponibles.length + asignados.length > 0)

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
        <div className="asignaciones">
          {propios.map((p) => (
            <span key={p.id} className="asignacion asignacion--propia" title="Dueño: control total, sin permisos que configurar">
              <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
              {p.nombre}
              <span className="chip-dueno">Dueño</span>
            </span>
          ))}
          {asignados.map((p) => (
            <span key={p.id} className="asignacion">
              <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
              {p.nombre}
              {puedeConfig(p) && (
                <button
                  className="icon-btn"
                  title={`Permisos en ${p.nombre}`}
                  onClick={() => onPermisosAcceso(p)}
                >
                  🔑
                </button>
              )}
              {puedeAsignar(p) && (
                <button
                  className="icon-btn"
                  title={esYo ? 'Salir del proyecto' : 'Quitar acceso'}
                  onClick={() => actions.quitarAcceso(usuario.id, p.id)}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {disponibles.length > 0 && (
            <select
              className="asignar-select"
              value=""
              onChange={(e) => {
                if (e.target.value) actions.asignarAcceso(usuario.id, e.target.value)
              }}
            >
              <option value="">{esYo ? '+ Unirme a proyecto…' : '+ Asignar proyecto…'}</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}
          {propios.length === 0 && asignados.length === 0 && disponibles.length === 0 && (
            <span className="usuarios-sin">Sin proyectos</span>
          )}
        </div>
      </td>
      <td className="col-acc">
        {puedeAdministrarCuenta && (
          <button className="icon-btn" title="Editar" onClick={onEditar}>✎</button>
        )}
        {puedeAdministrarCuenta && usuario.rol === 'consultor' && (
          <button className="icon-btn" title="Permisos de proyecto (3.1)" onClick={onPermisosProyecto}>🔧</button>
        )}
        {supabaseConfigured && !usuario.authId && usuario.activo && puedeInvitarCorreo && (
          <button
            className="icon-btn"
            title={invitando ? 'Enviando…' : 'Enviar / reenviar invitacion por correo'}
            disabled={invitando}
            onClick={onInvitar}
          >
            ✉
          </button>
        )}
        {puedeAdministrarCuenta && !esYo && (
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
