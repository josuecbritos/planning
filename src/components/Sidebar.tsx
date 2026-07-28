import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions, FrenteSel, Pantalla, SidebarModo, Tema } from '../App'
import { makeCan, puedeEditarProyecto, puedeEliminarProyecto, type Can } from '../lib/permisos'
import { TextPromptModal } from './TextPromptModal'
import { ProyectoModal } from './ProyectoModal'
import { Wordmark } from './Wordmark'

// Barra lateral (reestructurada por roles): cada quien ve sus proyectos
// (admin todos; consultor los suyos + asignados; cliente los invitados) y
// las acciones que su rol/permisos habilitan. La sesion vive en el pie.

interface Props {
  state: AppState
  /** Proyectos visibles para el usuario actual (ya filtrados por rol). */
  proyectos: Proyecto[]
  proyectoActivoId: string | null
  frenteSel: FrenteSel
  pantalla: Pantalla
  /** Módulo de Usuarios: admin (todo) o consultor (acotado a sus proyectos). */
  puedeVerUsuarios: boolean
  /** Mis Tareas: para el personal de la consultora (admins y consultores). */
  conMisTareas: boolean
  /** #137: cuántas notificaciones sin leer (contador naranja si > 0). */
  noLeidas: number
  /** #137: ¿el panel emergente de notificaciones está abierto? */
  notifAbierto: boolean
  /** #137: abre/cierra el panel de notificaciones (no cambia de pantalla). */
  onNotificaciones: () => void
  /** "+" de proyectos: admin o consultor con permiso crearProyectos. */
  puedeCrearProyecto: boolean
  /** #153: cuántos proyectos ve el usuario en Administración → Proyectos. */
  nProyectosAdmin: number
  /** #201: usuarios activos VISIBLES para quien mira (el consultor ve los suyos). */
  nUsuarios: number
  can: Can
  usuario: Usuario
  /** Punto 6: modo actual de la barra (fija / escondida) y su alternador. */
  sidebarModo: SidebarModo
  onToggleSidebar: () => void
  /** Punto 4: tema claro/oscuro (boton manual, persistente por usuario). */
  tema: Tema
  onToggleTema: () => void
  onSelectProyecto: (id: string) => void
  onSelectFrente: (f: FrenteSel) => void
  onSelectPantalla: (p: Pantalla) => void
  onLogout: () => void
  actions: Actions
}

type ModalState =
  | { tipo: 'proyecto-nuevo' }
  | { tipo: 'proyecto-editar'; id: string }
  // #189: "Agregar frente" vive en el menú ⋯ de CADA proyecto (no solo el
  // activo), así que el modal lleva su proyecto.
  | { tipo: 'frente-nuevo'; proyectoId: string }
  | { tipo: 'frente-editar'; id: string; nombre: string }
  | null

/** #187: chevron doble — comunica plegar/desplegar (no "fijar"). Mismo trazo
 *  que el resto de la iconografía de la barra (la campana es la referencia). */
function IconoPlegar({ plegar }: { plegar: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={plegar ? undefined : { transform: 'rotate(180deg)' }}
    >
      <path
        d="m11 6-6 6 6 6M18 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Sidebar({
  state,
  proyectos,
  proyectoActivoId,
  frenteSel,
  pantalla,
  puedeVerUsuarios,
  conMisTareas,
  noLeidas,
  notifAbierto,
  onNotificaciones,
  puedeCrearProyecto,
  nProyectosAdmin,
  nUsuarios,
  can,
  usuario,
  sidebarModo,
  onToggleSidebar,
  tema,
  onToggleTema,
  onSelectProyecto,
  onSelectFrente,
  onSelectPantalla,
  onLogout,
  actions,
}: Props) {
  const [modal, setModal] = useState<ModalState>(null)
  // #178/#184: menú ⋯ del proyecto abierto (id) o null, con su posición para
  // renderizarlo como popover FUERA del sidebar (portal fijo, a la derecha).
  // Se cierra al hacer clic fuera, al hacer scroll o al elegir una opción.
  const [menuProyecto, setMenuProyecto] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const cerrarMenu = () => {
    setMenuProyecto(null)
    setMenuPos(null)
  }
  useEffect(() => {
    if (!menuProyecto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.nav-proyecto__menu') && !t.closest('.nav-proyecto__menu-btn')) cerrarMenu()
    }
    const onScroll = () => cerrarMenu()
    const id = setTimeout(() => document.addEventListener('mousedown', fuera), 0)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [menuProyecto])

  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoActivoId)
    .sort((a, b) => a.orden - b.orden)

  // #188: los proyectos y los frentes ya no muestran contador de tareas (era
  // ruido: no se usa para navegar). Los contadores de Administración
  // (Usuarios / Proyectos) SÍ se conservan — cuentan activos.

  // #189: ¿puede agregar frentes EN ESE proyecto? El ⋯ es por proyecto (no
  // solo el activo), así que el permiso se resuelve por proyecto.
  const puedeCrearFrentesEn = (proyectoId: string) => makeCan(state, usuario, proyectoId).crearFrentes

  const proyectoEnEdicion =
    modal?.tipo === 'proyecto-editar' ? proyectos.find((p) => p.id === modal.id) : undefined

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <Wordmark claro />
        <button
          className="sidebar__plegar"
          title={
            sidebarModo === 'fija'
              ? 'Esconder la barra (queda una franja con iconos; se despliega al pasar el mouse)'
              : 'Fijar la barra lateral'
          }
          aria-label={sidebarModo === 'fija' ? 'Esconder barra lateral' : 'Fijar barra lateral'}
          onClick={onToggleSidebar}
        >
          <IconoPlegar plegar={sidebarModo === 'fija'} />
        </button>
      </div>

      <div className="nav-proyectos nav-pantallas">
        {/* #137: primera de las tres. Sin campana; el contador va en naranja
            solo si hay avisos sin leer. Abre el panel emergente (no cambia de
            pantalla); la vista completa "Notificaciones" se llega con "Ver
            todas". */}
        <button
          className={`nav-frente nav-pantalla${
            pantalla === 'notificaciones' || notifAbierto ? ' nav-frente--activo' : ''
          }`}
          onClick={onNotificaciones}
        >
          <span>Notificaciones</span>
          {noLeidas > 0 && <span className="nav-frente__count nav-frente__count--alerta">{noLeidas}</span>}
        </button>
        <button
          className={`nav-frente nav-pantalla${pantalla === 'resumen' ? ' nav-frente--activo' : ''}`}
          onClick={() => onSelectPantalla('resumen')}
        >
          <span>Resumen</span>
        </button>
        {conMisTareas && (
          <button
            className={`nav-frente nav-pantalla${pantalla === 'mipanel' ? ' nav-frente--activo' : ''}`}
            onClick={() => onSelectPantalla('mipanel')}
          >
            <span>Mis Tareas</span>
          </button>
        )}
      </div>

      <div className="sidebar__section">
        <span>Proyectos</span>
        {puedeCrearProyecto && (
          <button className="icon-btn" title="Nuevo proyecto" onClick={() => setModal({ tipo: 'proyecto-nuevo' })}>+</button>
        )}
      </div>

      <div className="nav-proyectos">
        {proyectos.map((p) => {
          const activo = p.id === proyectoActivoId && pantalla === 'proyectos'
          return (
            <div key={p.id} className={`nav-proyecto${activo ? ' nav-proyecto--activo' : ''}`}>
              {/* #178: "Todos los frentes" es el default — clic en el nombre
                  abre esa vista directamente. Editar/Archivar viven en el ⋯. */}
              <div className="nav-proyecto__fila">
                <button className="nav-proyecto__title" onClick={() => onSelectProyecto(p.id)}>
                  <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                  <span className="nav-proyecto__nombre">{p.nombre}</span>
                </button>
                {/* #189: el ⋯ aparece si hay AL MENOS una opción disponible
                    (editar/archivar o agregar frente). */}
                {(puedeEditarProyecto(state, usuario, p.id) || puedeCrearFrentesEn(p.id)) && (
                  <button
                    className="nav-proyecto__menu-btn"
                    aria-label={`Opciones de ${p.nombre}`}
                    aria-expanded={menuProyecto === p.id}
                    onClick={(e) => {
                      if (menuProyecto === p.id) {
                        cerrarMenu()
                        return
                      }
                      // #196: la posición se ACOTA al viewport. Antes era
                      // siempre `r.right + 8`, que en una pantalla angosta
                      // dejaba el menú 66px fuera y cortaba el texto de las
                      // opciones. Si no cabe a la derecha, se ancla pegado al
                      // borde; el alto también se limita para no salirse abajo.
                      const r = e.currentTarget.getBoundingClientRect()
                      const ANCHO = 180
                      const MARGEN = 8
                      const left = Math.max(
                        MARGEN,
                        Math.min(r.right + MARGEN, window.innerWidth - ANCHO - MARGEN),
                      )
                      const top = Math.min(r.top, window.innerHeight - 150)
                      setMenuPos({ top: Math.max(MARGEN, top), left })
                      setMenuProyecto(p.id)
                    }}
                  >
                    ⋯
                  </button>
                )}
              </div>

              {activo && (
                <div className="nav-frentes">
                  {frentes.map((f) => (
                    <div key={f.id} className={`nav-frente-row${frenteSel === f.id ? ' nav-frente-row--activo' : ''}`}>
                      <button className="nav-frente nav-frente--flex" onClick={() => onSelectFrente(f.id)}>
                        <span>{f.nombre}</span>
                      </button>
                      {can.editarEstructura && (
                        <span className="nav-frente__tools">
                          <button className="icon-btn" title="Renombrar" onClick={() => setModal({ tipo: 'frente-editar', id: f.id, nombre: f.nombre })}>✎</button>
                          <button
                            className="icon-btn"
                            title="Eliminar frente"
                            onClick={() => {
                              if (confirm(`¿Eliminar el frente "${f.nombre}" y sus sub frentes y tareas?`)) actions.deleteFrente(f.id)
                            }}
                          >🗑</button>
                        </span>
                      )}
                    </div>
                  ))}
                  {/* #189: "+ Frente" salió de la lista — ahora vive en el ⋯
                      del proyecto. La lista contiene solo frentes. */}
                </div>
              )}
            </div>
          )
        })}
        {proyectos.length === 0 && <div className="nav-vacio">Sin proyectos.</div>}
      </div>

      {puedeVerUsuarios && (
        <>
          <div className="sidebar__section">
            <span>{usuario.rol === 'admin' ? 'Administración' : 'Equipo'}</span>
          </div>
          <div className="nav-proyectos">
            <button
              className={`nav-frente${pantalla === 'usuarios' ? ' nav-frente--activo' : ''}`}
              style={{ paddingLeft: 12 }}
              onClick={() => onSelectPantalla('usuarios')}
            >
              <span>Usuarios</span>
              {/* #182/#201: cuenta solo activos (ni desactivados ni eliminados).
                  #201: ya no se condiciona al rol admin — el consultor también
                  ve esta entrada (con su lista acotada) y quedaba sin contador
                  mientras "Proyectos", que nunca estuvo condicionado, sí lo
                  mostraba. Ambas entradas cuentan lo que su dueño puede ver:
                  el número lo calcula App con usuariosVisiblesPara, la misma
                  regla que arma la tabla. */}
              <span className="nav-frente__count">{nUsuarios}</span>
            </button>
            {/* #132: Proyectos — hermano de Usuarios. Dueño de la relación
                usuario↔proyecto y del ciclo de vida (archivar/eliminar). */}
            <button
              className={`nav-frente${pantalla === 'admin-proyectos' ? ' nav-frente--activo' : ''}`}
              style={{ paddingLeft: 12 }}
              onClick={() => onSelectPantalla('admin-proyectos')}
            >
              <span>Proyectos</span>
              {/* #153: contador con el mismo patrón que Usuarios. */}
              <span className="nav-frente__count">{nProyectosAdmin}</span>
            </button>
          </div>
        </>
      )}

      <div className="sidebar__footer">
        {/* #207: el pie ya mostraba quién eres; ahora es además la entrada a
            tu configuración. Es donde la gente la busca, y no hace falta una
            entrada más en la navegación. */}
        <button
          className={`sesion sesion--boton${pantalla === 'configuracion' ? ' sesion--activa' : ''}`}
          title="Mi cuenta: nombre, iniciales y contraseña"
          onClick={() => onSelectPantalla('configuracion')}
        >
          <span className="resp-badge">{usuario.iniciales}</span>
          <span className="sesion__info">
            <b>{usuario.nombre}</b>
            <small>{usuario.rol === 'admin' ? 'Admin' : usuario.rol === 'consultor' ? 'Consultor' : 'Cliente'}</small>
          </span>
        </button>
        <span className="sesion__acciones">
          <button
            className="sidebar__plegar sesion__tema"
            title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            onClick={onToggleTema}
          >
            {tema === 'oscuro' ? '☀' : '🌙'}
          </button>
          <button className="link-btn sesion__salir" onClick={onLogout}>Salir</button>
        </span>
      </div>

      {/* #184: menú ⋯ del proyecto como popover FUERA del sidebar (portal
          fijo, a la derecha del botón), sobre el contenido — no desplaza nada
          dentro de la barra. */}
      {menuProyecto &&
        menuPos &&
        (() => {
          const p = proyectos.find((x) => x.id === menuProyecto)
          if (!p) return null
          return createPortal(
            <div
              className="nav-proyecto__menu nav-proyecto__menu--portal"
              style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
              role="menu"
            >
              {puedeEditarProyecto(state, usuario, p.id) && (
                <button
                  className="nav-proyecto__menu-op"
                  onClick={() => {
                    setModal({ tipo: 'proyecto-editar', id: p.id })
                    cerrarMenu()
                  }}
                >
                  Editar proyecto
                </button>
              )}
              {/* #189: creación de frentes, según el permiso en ESE proyecto.
                  Abre el mismo flujo que la antigua opción "+ Frente". */}
              {puedeCrearFrentesEn(p.id) && (
                <button
                  className="nav-proyecto__menu-op"
                  onClick={() => {
                    setModal({ tipo: 'frente-nuevo', proyectoId: p.id })
                    cerrarMenu()
                  }}
                >
                  Agregar frente
                </button>
              )}
              {puedeEliminarProyecto(state, usuario, p.id) && (
                <button
                  className="nav-proyecto__menu-op"
                  onClick={() => {
                    cerrarMenu()
                    if (confirm(`¿Archivar "${p.nombre}"? Saldrá de la barra lateral, de Resumen y de Mis Tareas. Queda en Administración → Proyectos.`)) {
                      actions.updateProyecto(p.id, { estado: 'archivado' })
                    }
                  }}
                >
                  Archivar
                </button>
              )}
            </div>,
            document.body,
          )
        })()}

      {modal?.tipo === 'proyecto-nuevo' && (
        <ProyectoModal
          onSubmit={(d) => actions.createProyecto(d)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'proyecto-editar' && proyectoEnEdicion && (
        <ProyectoModal
          proyecto={proyectoEnEdicion}
          onSubmit={(d) => actions.updateProyecto(proyectoEnEdicion.id, d)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'frente-nuevo' && (
        <TextPromptModal
          titulo="Nuevo frente"
          label="Nombre del frente"
          textoBoton="Crear"
          onSubmit={(nombre) => actions.createFrente({ proyectoId: modal.proyectoId, nombre })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'frente-editar' && (
        <TextPromptModal
          titulo="Renombrar frente"
          label="Nombre del frente"
          valorInicial={modal.nombre}
          onSubmit={(nombre) => actions.updateFrente(modal.id, { nombre })}
          onClose={() => setModal(null)}
        />
      )}
    </nav>
  )
}
