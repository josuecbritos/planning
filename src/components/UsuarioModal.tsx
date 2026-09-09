import { useState } from 'react'
import type { Rol, Usuario } from '../types'
import { Modal } from './Modal'
import { Selector } from './Selector'
import { ComboOrganizacion } from './ComboOrganizacion'
import { Seg } from './PermisosModal'

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
  /**
   * #339: las organizaciones QUE YA ESTÁN EN USO. No hay pantalla de
   * administración de organizaciones: la lista se llena sola a medida que se
   * asigna gente, y una organización que se queda sin ningún usuario deja de
   * aparecer. Por eso llega calculada desde la lista de usuarios y no de una
   * tabla propia. #353: se calcula solo sobre CONSULTORES.
   */
  organizaciones?: string[]
  /**
   * #339: ¿este formulario puede asignar organización? Solo quien ya puede
   * configurar usuarios —el administrador—, la misma regla que el resto de la
   * configuración. Un consultor creando un cliente no lo ve. La barrera de
   * verdad es el trigger `validar_autoedicion_usuario` en la base.
   */
  puedeOrganizacion?: boolean
  /**
   * #272: ¿este formulario puede cambiar el resumen diario? Solo el
   * administrador, y solo AL EDITAR: el usuario nuevo nace encendido —lo
   * decide el default de la base— y ofrecer la decisión en el alta sería
   * ofrecer una que ya está tomada. La barrera de verdad es la política
   * `usuario_update`, que no deja tocar la fila de otro.
   */
  puedeResumen?: boolean
  onSubmit: (datos: {
    nombre: string
    iniciales?: string
    email: string
    rol: Rol
    organizacion?: string
    resumenDiario?: boolean
  }) => void | Promise<boolean>
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

export function UsuarioModal({
  usuario,
  soloCliente,
  puedeCambiarPerfil = false,
  organizaciones = [],
  puedeOrganizacion = false,
  puedeResumen = false,
  onSubmit,
  onClose,
}: Props) {
  const edicion = Boolean(usuario)
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [iniciales, setIniciales] = useState(usuario?.iniciales ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<Rol>(soloCliente ? 'cliente' : usuario?.rol ?? 'cliente')
  // #353: se escribe directo, sin declarar antes que se va a escribir algo
  // nuevo (ver `ComboOrganizacion`). La que ya tiene la persona entra en la
  // lista aunque no venga en ella: al editar hay que poder dejarla como está.
  const [organizacion, setOrganizacion] = useState<string | undefined>(usuario?.organizacion)
  const opciones = [...new Set([...organizaciones, usuario?.organizacion].filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b),
  )
  // #353: la organización SOLO existe para consultores. Se ofrecía para
  // cualquier perfil, también para clientes, donde no hace nada: la regla solo
  // une consultores. Y sigue al PERFIL ELEGIDO, no al guardado — al cambiar el
  // perfil a consultor en este mismo formulario, el campo aparece.
  const ofreceOrganizacion = puedeOrganizacion && rol === 'consultor'
  // #272: se ofrece solo al EDITAR. El alta no lo muestra porque el usuario
  // nuevo nace encendido y no hay nada que decidir todavía.
  const ofreceResumen = puedeResumen && edicion
  const [resumenDiario, setResumenDiario] = useState(usuario?.resumenDiario === true)
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
        // #339/#353: solo viaja si este formulario puede asignarla Y el perfil
        // es consultor. Al pasar a alguien a cliente viaja vacía, que es lo que
        // corresponde: guardada e invisible, volver a ponerlo como consultor le
        // activaría sola una organización que nadie decidió.
        ...(puedeOrganizacion ? { organizacion: rol === 'consultor' ? organizacion : undefined } : {}),
        // #272: viaja en el mismo guardado que el nombre, y solo si este
        // formulario pudo ofrecerlo — igual que la organización.
        ...(ofreceResumen ? { resumenDiario } : {}),
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
        {/* #339/#353: la lista se llena sola con las que ya están en uso —solo
            de consultores, que son a quienes les hace algo— y se escribe
            directo: si lo escrito no existe, la última opción ofrece crearlo.
            La normalización sigue viviendo en la base, así que "Andotek" y
            "Andotek " no pueden convertirse en dos organizaciones distintas
            por ningún camino. */}
        {ofreceOrganizacion && (
          <label className="campo">
            <span>Organización</span>
            <ComboOrganizacion valor={organizacion} organizaciones={opciones} onCambiar={setOrganizacion} />
            <small className="ayuda">
              Opcional. Dos consultores con la misma organización se ven entre sí y pueden sumarse a sus proyectos.
            </small>
          </label>
        )}
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
            {/* #353: el desplegable del producto. Mismo contenido y mismo
                efecto; lo que cambia es cómo se ve. */}
            <Selector
              ariaLabel="Perfil"
              valor={rol}
              opciones={[
                { valor: 'cliente', etiqueta: 'Cliente' },
                { valor: 'consultor', etiqueta: 'Consultor' },
                ...(edicion ? [] : [{ valor: 'admin', etiqueta: 'Admin' }]),
              ]}
              onCambiar={(v) => setRol(v as Rol)}
            />
            <small className="ayuda">{AYUDA_ROL[rol]}</small>
          </label>
        )}
        {/* #272: AL FINAL, después de Perfil. Es el MISMO interruptor de Mi
            cuenta, con la misma nota y el mismo marcado: la nota va también
            acá porque el administrador está decidiendo por otra persona y
            necesita saber qué le va a llegar. */}
        {ofreceResumen && (
          <div className="campo">
            <div className="permisos-lista">
              <div className="permiso-item">
                <span className="permiso-item__label">
                  Resumen diario
                  <small>Cada mañana, tus tareas atrasadas y las que vencen ese día.</small>
                </span>
                <Seg
                  ariaLabel="Resumen diario"
                  opciones={[
                    { v: false, label: 'No' },
                    { v: true, label: 'Sí' },
                  ]}
                  valor={resumenDiario}
                  onChange={setResumenDiario}
                />
              </div>
            </div>
          </div>
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
