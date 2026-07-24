import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import { puedeInvitarClientesEn } from '../lib/permisos'
import { UsuarioModal } from './UsuarioModal'
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
  /** #135: el popup "+N" enlaza a Administración → Proyectos, donde vive la
   *  gestión de la relación usuario↔proyecto. */
  onIrAProyectos: () => void
}

type ModalState =
  | { tipo: 'nuevo' }
  | { tipo: 'editar'; usuario: Usuario }
  | { tipo: 'permisos-proyecto'; usuario: Usuario }
  | null

const ROL_ORDEN: Record<Usuario['rol'], number> = { admin: 0, consultor: 1, cliente: 2 }
const ROL_LABEL: Record<Usuario['rol'], string> = { admin: 'Admin', consultor: 'Consultor', cliente: 'Cliente' }

export function UsersView({ state, usuarioActual, actions, onIrAProyectos }: Props) {
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
      setAvisoInvitacion(`Invitación enviada a ${u.email} (caduca en 7 días).`)
    } catch (e) {
      setAvisoInvitacion(`No se pudo enviar la invitación: ${(e as Error).message}`)
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
        <h2>Usuarios</h2>
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
                onIrAProyectos={onIrAProyectos}
                onEditar={() => setModal({ tipo: 'editar', usuario: u })}
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
  onIrAProyectos,
  onEditar,
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
  onIrAProyectos: () => void
  onEditar: () => void
  onPermisosProyecto: () => void
  onInvitar: () => void
  invitando: boolean
}) {
  const accesos = state.accesos.filter((a) => a.usuarioId === usuario.id)
  const targetEsCliente = usuario.rol === 'cliente'

  // #135: la columna de proyectos es de SOLO LECTURA (dueño + asignados dentro
  // del alcance del actor). Asignar/quitar/permisos vive en Administración →
  // Proyectos (#132). Dueño primero, luego asignados; ambos como chips.
  const gestIds = new Set(gestionables.map((p) => p.id))
  const propios = (esAdminActor ? state.proyectos.filter((p) => p.duenoId === usuario.id) : []).map(
    (p) => ({ p, dueno: true }),
  )
  const asignados = accesos
    .map((a) => state.proyectos.find((p) => p.id === a.proyectoId))
    .filter((p): p is Proyecto => Boolean(p) && gestIds.has(p!.id))
    .map((p) => ({ p, dueno: false }))
  const proyectosUsuario = [...propios, ...asignados]

  // Acciones de administración de la cuenta (editar datos, permisos de
  // proyecto, activar/desactivar, eliminar): SOLO el admin. El consultor no
  // edita cuentas.
  const puedeAdministrarCuenta = esAdminActor
  // Invitación por correo: admin a cualquiera; consultor a los clientes que
  // puede invitar en alguno de sus proyectos (la Edge Function reconfirma).
  const puedeInvitarCorreo =
    esAdminActor ||
    (targetEsCliente && gestionables.some((p) => puedeInvitarClientesEn(state, actor, p.id)))

  return (
    <tr className={usuario.activo ? '' : 'usuario-inactivo'}>
      <td>
        <span className="usuario-nombre">
          <span className="resp-badge">{usuario.iniciales}</span>
          {usuario.nombre}
          {esYo && <span className="chip-yo">tú</span>}
        </span>
      </td>
      <td>{usuario.email}</td>
      <td>
        <span className={`chip-rol chip-rol--${usuario.rol}`}>{ROL_LABEL[usuario.rol]}</span>
      </td>
      <td>{usuario.activo ? 'Activo' : 'Inactivo'}</td>
      <td className="col-proy">
        <ProyectosCell items={proyectosUsuario} onIrAProyectos={onIrAProyectos} />
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
            title={invitando ? 'Enviando…' : 'Enviar / reenviar invitación por correo'}
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
        {/* #136: eliminar = desactivar + invisible (no hay borrado físico). */}
        {puedeAdministrarCuenta && !esYo && (
          <button
            className="icon-btn"
            title="Eliminar usuario"
            onClick={() => {
              if (
                confirm(
                  `¿Eliminar a "${usuario.nombre}"? Perderá el acceso y desaparecerá de la lista. ` +
                    'Podrás recuperarlo dándole de alta con el mismo correo.',
                )
              ) {
                actions.eliminarUsuario(usuario.id)
              }
            }}
          >
            🗑
          </button>
        )}
      </td>
    </tr>
  )
}

// #135: celda de proyectos de solo lectura. Muestra los primeros chips y, si
// hay más, un "+N" que abre un popover con la lista completa y el enlace a la
// gestión (Administración → Proyectos).
function ProyectosCell({
  items,
  onIrAProyectos,
}: {
  items: { p: Proyecto; dueno: boolean }[]
  onIrAProyectos: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const MAX_VISIBLES = 2

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const id = setTimeout(() => document.addEventListener('mousedown', fuera), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', fuera)
    }
  }, [abierto])

  if (items.length === 0) return <span className="usuarios-sin">Sin proyectos</span>

  const visibles = items.slice(0, MAX_VISIBLES)
  const resto = items.slice(MAX_VISIBLES)

  const chip = ({ p, dueno }: { p: Proyecto; dueno: boolean }) => (
    <span key={p.id} className="asignacion asignacion--ro" title={p.nombre}>
      <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
      <span className="asignacion__nombre">{p.nombre}</span>
      {dueno && <span className="chip-dueno">Dueño</span>}
    </span>
  )

  return (
    <div className="proy-col" ref={ref}>
      {visibles.map(chip)}
      {resto.length > 0 && (
        <div className="proy-mas">
          <button className="chip-mas" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
            +{resto.length}
          </button>
          {abierto && (
            <div className="proy-pop" role="dialog">
              <div className="proy-pop__lista">{items.map(chip)}</div>
              <button className="link-btn" onClick={onIrAProyectos}>
                Gestionar en Proyectos →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
