import { useState } from 'react'
import type { Rol, Usuario } from '../types'
import { Modal } from './Modal'

// Crear / editar usuario (Modulo 7.1). El rol solo se elige al crear; el
// limite de 2 admins deshabilita esa opcion cuando ya hay 2 activos.

interface Props {
  usuario?: Usuario
  /** true si ya existen 2 admins activos (deshabilita crear otro). */
  adminsCompletos: boolean
  onSubmit: (datos: { nombre: string; iniciales?: string; email: string; rol: Rol }) => void
  onClose: () => void
}

export function UsuarioModal({ usuario, adminsCompletos, onSubmit, onClose }: Props) {
  const edicion = Boolean(usuario)
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [iniciales, setIniciales] = useState(usuario?.iniciales ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'cliente')
  const valido = nombre.trim().length > 0 && /\S+@\S+\.\S+/.test(email)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    onSubmit({ nombre: nombre.trim(), iniciales: iniciales.trim() || undefined, email: email.trim(), rol })
    onClose()
  }

  const bloquearAdmin = !edicion && adminsCompletos

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
        <label className="campo">
          <span>Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={edicion}>
            <option value="cliente">Cliente</option>
            <option value="admin" disabled={bloquearAdmin}>
              Admin{bloquearAdmin ? ' (ya hay 2 activos)' : ''}
            </option>
          </select>
          {!edicion && (
            <small className="ayuda">El sistema admite exactamente 2 usuarios Admin activos.</small>
          )}
        </label>
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
