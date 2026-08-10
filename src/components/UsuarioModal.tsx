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
  /**
   * #303: al EDITAR, ¿se puede cambiar el perfil? Es cierto solo cuando el
   * cambio es posible —un admin, sobre alguien que no es él mismo y que no es
   * administrador—. Cuando es falso, el perfil se muestra como dato y no como
   * campo. Quien decide es quien abre el formulario; la barrera de verdad
   * sigue siendo `cambiar_rol_usuario` en la base.
   */
  puedeCambiarPerfil?: boolean
  /**
   * #303: devolver `false` deja el formulario ABIERTO — es lo que ocurre
   * cuando la base rechaza el cambio de perfil y por eso no se aplica nada
   * más. Cualquier otra cosa (incluido no devolver nada) lo cierra.
   */
  onSubmit: (datos: { nombre: string; iniciales?: string; email: string; rol: Rol }) => void | Promise<boolean>
  onClose: () => void
}

const ROL_LABEL: Record<Rol, string> = { admin: 'Admin', consultor: 'Consultor', cliente: 'Cliente' }

const AYUDA_ROL: Record<Rol, string> = {
  admin: 'Ve y gestiona absolutamente todo. Puede haber varios admins.',
  consultor:
    'Gestiona SUS proyectos y los que se le asignen. Nace con: crear proyectos, archivar/eliminar los suyos e invitar clientes (configurar permisos queda en el admin).',
  cliente:
    'Solo ve los proyectos donde lo inviten. Nace con: crear tareas, fechas y hecho en las suyas, y asignar responsable en todas.',
}

export function UsuarioModal({ usuario, soloCliente, puedeCambiarPerfil = false, onSubmit, onClose }: Props) {
  const edicion = Boolean(usuario)
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [iniciales, setIniciales] = useState(usuario?.iniciales ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<Rol>(soloCliente ? 'cliente' : usuario?.rol ?? 'cliente')
  const valido = nombre.trim().length > 0 && /\S+@\S+\.\S+/.test(email)
  const [guardando, setGuardando] = useState(false)

  // #303: TODO se aplica al guardar, nunca al tocar el campo, y Cancelar
  // descarta todo —incluido el cambio de perfil—. Por eso el formulario no
  // dispara nada por su cuenta: junta los valores y los entrega al guardar.
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || guardando) return
    setGuardando(true)
    try {
      const aplicado = await onSubmit({
        nombre: nombre.trim(),
        iniciales: iniciales.trim() || undefined,
        email: email.trim(),
        rol,
      })
      // `false` = la base rechazó algo y no se aplicó nada: el formulario
      // queda abierto con lo escrito, para poder corregir.
      if (aplicado !== false) onClose()
    } finally {
      setGuardando(false)
    }
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
        ) : edicion && !puedeCambiarPerfil ? (
          /* #303: el perfil como DATO. Es lo que ve un admin sobre sí mismo o
             sobre otro administrador — el cambio no es posible ahí—, y evita
             ofrecer un campo que la base va a rechazar. */
          <label className="campo">
            <span>Perfil</span>
            <p className="campo__dato">
              <span className={`chip-rol chip-rol--${usuario?.rol}`}>{ROL_LABEL[usuario!.rol]}</span>
            </p>
            <small className="ayuda">
              {usuario?.rol === 'admin'
                ? 'El perfil de administrador no se cambia desde aquí.'
                : 'Nadie puede cambiar su propio perfil.'}
            </small>
          </label>
        ) : (
          <label className="campo">
            <span>{edicion ? 'Perfil' : 'Rol'}</span>
            {/* #303: al editar, el perfil se cambia ACÁ —donde el dueño lo fue
                a buscar— y solo entre consultor y cliente; administrador queda
                fuera en los dos sentidos. Al crear, la lista es la de siempre. */}
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="cliente">Cliente</option>
              <option value="consultor">Consultor</option>
              {!edicion && <option value="admin">Admin</option>}
            </select>
            <small className="ayuda">{AYUDA_ROL[rol]}</small>
          </label>
        )}
        <div className="modal-acciones">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={!valido || guardando}>
            {guardando ? 'Guardando…' : edicion ? 'Guardar' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
