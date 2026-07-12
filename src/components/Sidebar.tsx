import { useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions, FrenteSel, Pantalla } from '../App'
import { TextPromptModal } from './TextPromptModal'
import { ProyectoModal } from './ProyectoModal'

// Barra lateral. Los clientes ven solo sus proyectos asignados y sin ninguna
// accion de edicion; los admins tienen CRUD, Mi Panel y Administracion.
// La sesion (usuario + salir) vive en el pie, visible en toda pantalla.

interface Props {
  state: AppState
  /** Proyectos visibles para el usuario actual (ya filtrados por rol). */
  proyectos: Proyecto[]
  proyectoActivoId: string | null
  frenteSel: FrenteSel
  pantalla: Pantalla
  esAdmin: boolean
  usuario: Usuario
  onSelectProyecto: (id: string) => void
  onSelectFrente: (f: FrenteSel) => void
  onSelectPantalla: (p: Pantalla) => void
  onLogout: () => void
  actions: Actions
}

type ModalState =
  | { tipo: 'proyecto-nuevo' }
  | { tipo: 'proyecto-editar'; id: string }
  | { tipo: 'frente-nuevo' }
  | { tipo: 'frente-editar'; id: string; nombre: string }
  | null

export function Sidebar({
  state,
  proyectos,
  proyectoActivoId,
  frenteSel,
  pantalla,
  esAdmin,
  usuario,
  onSelectProyecto,
  onSelectFrente,
  onSelectPantalla,
  onLogout,
  actions,
}: Props) {
  const [modal, setModal] = useState<ModalState>(null)

  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoActivoId)
    .sort((a, b) => a.orden - b.orden)

  function tareasEnFrente(frenteId: string): number {
    const subIds = new Set(state.subFrentes.filter((sf) => sf.frenteId === frenteId).map((sf) => sf.id))
    return state.tareas.filter((t) => subIds.has(t.subFrenteId) && !t.archivada).length
  }
  function tareasEnProyecto(proyectoId: string): number {
    const frenteIds = new Set(state.frentes.filter((f) => f.proyectoId === proyectoId).map((f) => f.id))
    const subIds = new Set(state.subFrentes.filter((sf) => frenteIds.has(sf.frenteId)).map((sf) => sf.id))
    return state.tareas.filter((t) => subIds.has(t.subFrenteId) && !t.archivada).length
  }

  const proyectoEnEdicion =
    modal?.tipo === 'proyecto-editar' ? proyectos.find((p) => p.id === modal.id) : undefined

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">Andotek Planning</div>

      <div className="nav-proyectos nav-pantallas">
        <button
          className={`nav-frente nav-pantalla${pantalla === 'resumen' ? ' nav-frente--activo' : ''}`}
          onClick={() => onSelectPantalla('resumen')}
        >
          <span>Resumen</span>
        </button>
        {esAdmin && (
          <button
            className={`nav-frente nav-pantalla${pantalla === 'mipanel' ? ' nav-frente--activo' : ''}`}
            onClick={() => onSelectPantalla('mipanel')}
          >
            <span>Mi Panel</span>
          </button>
        )}
      </div>

      <div className="sidebar__section">
        <span>Proyectos</span>
        {esAdmin && (
          <button className="icon-btn" title="Nuevo proyecto" onClick={() => setModal({ tipo: 'proyecto-nuevo' })}>+</button>
        )}
      </div>

      <div className="nav-proyectos">
        {proyectos.map((p) => {
          const activo = p.id === proyectoActivoId && pantalla === 'proyectos'
          return (
            <div key={p.id} className={`nav-proyecto${activo ? ' nav-proyecto--activo' : ''}`}>
              <button className="nav-proyecto__title" onClick={() => onSelectProyecto(p.id)}>
                <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                <span className="nav-proyecto__nombre">{p.nombre}</span>
                <span className="nav-frente__count">{tareasEnProyecto(p.id)}</span>
              </button>

              {activo && (
                <div className="nav-frentes">
                  {esAdmin && (
                    <div className="nav-proyecto__acciones">
                      <button className="link-btn" onClick={() => setModal({ tipo: 'proyecto-editar', id: p.id })}>Editar proyecto</button>
                      <button
                        className="link-btn link-btn--danger"
                        onClick={() => {
                          if (confirm(`¿Eliminar el proyecto "${p.nombre}" y todo su contenido?`)) actions.deleteProyecto(p.id)
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}

                  <button
                    className={`nav-frente${frenteSel === 'todos' ? ' nav-frente--activo' : ''}`}
                    onClick={() => onSelectFrente('todos')}
                  >
                    <span>Todos los frentes</span>
                    <span className="nav-frente__count">{tareasEnProyecto(p.id)}</span>
                  </button>

                  {frentes.map((f) => (
                    <div key={f.id} className={`nav-frente-row${frenteSel === f.id ? ' nav-frente-row--activo' : ''}`}>
                      <button className="nav-frente nav-frente--flex" onClick={() => onSelectFrente(f.id)}>
                        <span>{f.nombre}</span>
                        <span className="nav-frente__count">{tareasEnFrente(f.id)}</span>
                      </button>
                      {esAdmin && (
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

                  {esAdmin && (
                    <button className="nav-frente nav-frente--add" onClick={() => setModal({ tipo: 'frente-nuevo' })}>
                      + Frente
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {proyectos.length === 0 && <div className="nav-vacio">Sin proyectos.</div>}
      </div>

      {esAdmin && (
        <>
          <div className="sidebar__section"><span>Administracion</span></div>
          <div className="nav-proyectos">
            <button
              className={`nav-frente${pantalla === 'usuarios' ? ' nav-frente--activo' : ''}`}
              style={{ paddingLeft: 12 }}
              onClick={() => onSelectPantalla('usuarios')}
            >
              <span>Usuarios</span>
              <span className="nav-frente__count">{state.usuarios.length}</span>
            </button>
          </div>
        </>
      )}

      <div className="sidebar__footer">
        <span className="sesion" title={usuario.email}>
          <span className="resp-badge">{usuario.iniciales}</span>
          <span className="sesion__info">
            <b>{usuario.nombre}</b>
            <small>{usuario.rol === 'admin' ? 'Admin' : 'Cliente'}</small>
          </span>
        </span>
        <button className="link-btn sesion__salir" onClick={onLogout}>Salir</button>
      </div>

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
      {modal?.tipo === 'frente-nuevo' && proyectoActivoId && (
        <TextPromptModal
          titulo="Nuevo frente"
          label="Nombre del frente"
          textoBoton="Crear"
          onSubmit={(nombre) => actions.createFrente({ proyectoId: proyectoActivoId, nombre })}
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
