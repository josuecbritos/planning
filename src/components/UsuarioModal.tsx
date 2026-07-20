import { useState } from 'react'
import type { Rol, Usuario } from '../types'
import { Modal } from './Modal'

// Crear / editar usuario (Modulo 7.1, reestructurado). Tres roles, sin
// limite de admins (1). El usuario nace con los permisos por DEFECTO de su
// rol (4), ajustables despues: consultor → permisos de proyecto (🔧);
// clientes y consultores invitados → set de ocho por acceso (🔑).

interface Props {
  usuario?: Usuario
  /** §4: el consultor solo puede crear CLIENTES; fija el rol y oculta el selector. */
  soloCliente?: boolean
  onSubmit: (datos: { nombre: string; iniciales?: string; email: string; rol: Rol }) => void
  onClose: () => void
}

const AYUDA_ROL: Record<Rol, string> = {
  admin: 'Ve y gestiona absolutamente todo. Puede haber varios admins.',
  consultor:
    'Gestiona SUS proyectos y los que se le asignen. Nace con: crear proyectos, archivar/eliminar los suyos e invitar clientes (configurar permisos queda en el admin).',
  cliente:
    'Solo ve los proyectos donde lo inviten. Nace con: crear tareas, fechas y hecho en las suyas, y asignar responsable en todas.',
}

export function UsuarioModal({ usuario, soloCliente, onSubmit, onClose }: Props) {
  const edicion = Boolean(usuario)
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [iniciales, setIniciales] = useState(usuario?.iniciales ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<Rol>(soloCliente ? 'cliente' : usuario?.rol ?? 'cliente')
  const valido = nombre.trim().length > 0 && /\S+@\S+\.\S+/.test(email)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    onSubmit({ nombre: nombre.trim(), iniciales: iniciales.trim() || undefined, email: email.trim(), rol })
    onClose()
  }

  return (
    <Modal titulo={edicion ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="campo">
          <span>Nombre completo</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="campo">
          <span>Iniciales (para el badge)</span>
          <input maxLength={3} value={iniciales} onChange={(e) => setIniciales(e.target.value.toUpperCase())} placeholder="Se derivan del nombre si se omite" />
        </label>
        <label className="campo">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={edicion} />
          {edicion && <small className="ayuda">El email se usa para el login y no se edita.</small>}
        </label>
        {soloCliente ? (
          <p className="ayuda">Se creará como <b>Cliente</b>. {AYUDA_ROL.cliente}</p>
        ) : (
          <label className="campo">
            <span>Rol</span>
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={edicion}>
              <option value="cliente">Cliente</option>
              <option value="consultor">Consultor</option>
              <option value="admin">Admin</option>
            </select>
            {!edicion && <small className="ayuda">{AYUDA_ROL[rol]}</small>}
          </label>
        )}
        <div className="modal-acciones">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={!valido}>
            {edicion ? 'Guardar' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
