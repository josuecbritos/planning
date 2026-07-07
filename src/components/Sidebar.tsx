import { useState } from 'react'
import type { AppState } from '../types'
import type { Actions, FrenteSel } from '../App'
import { TextPromptModal } from './TextPromptModal'
import { ProyectoModal } from './ProyectoModal'

// Barra lateral: lista de proyectos (con CRUD) y, para el proyecto activo, sus
// frentes navegables (con CRUD). El frente seleccionado tambien filtra el Gantt.

interface Props {
  state: AppState
  proyectoActivoId: string | null
  frenteSel: FrenteSel
  onSelectProyecto: (id: string) => void
  onSelectFrente: (f: FrenteSel) => void
  actions: Actions
}

type ModalState =
  | { tipo: 'proyecto-nuevo' }
  | { tipo: 'proyecto-editar'; id: string }
  | { tipo: 'frente-nuevo' }
  | { tipo: 'frente-editar'; id: string; nombre: string }
  | null

export function Sidebar({ state, proyectoActivoId, frenteSel, onSelectProyecto, onSelectFrente, actions }: Props) {
  const [modal, setModal] = useState<ModalState>(null)

  const proyectos = state.proyectos
  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoActivoId)
    .sort((a, b) => a.orden - b.orden)

  function tareasEnFrente(frenteId: string): number {
    const subIds = new Set(state.subFrentes.filter((sf) => sf.frenteId === frenteId).map((sf) => sf.id))
    return state.tareas.filter((t) => subIds.has(t.subFrenteId)).length
  }
  function tareasEnProyecto(proyectoId: string): number {
    const frenteIds = new Set(state.frentes.filter((f) => f.proyectoId === proyectoId).map((f) => f.id))
    const subIds = new Set(state.subFrentes.filter((sf) => frenteIds.has(sf.frenteId)).map((sf) => sf.id))
    return state.tareas.filter((t) => subIds.has(t.subFrenteId)).length
  }

  const proyectoEnEdicion =
    modal?.tipo === 'proyecto-editar' ? proyectos.find((p) => p.id === modal.id) : undefined

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        Planificador
        <small>Documento Funcional v3.1</small>
      </div>

      <div className="sidebar__section">
        <span>Proyectos</span>
        <button className="icon-btn" title="Nuevo proyecto" onClick={() => setModal({ tipo: 'proyecto-nuevo' })}>+</button>
      </div>

      <div className="nav-proyectos">
        {proyectos.map((p) => {
          const activo = p.id === proyectoActivoId
          return (
            <div key={p.id} className={`nav-proyecto${activo ? ' nav-proyecto--activo' : ''}`}>
              <button className="nav-proyecto__title" onClick={() => onSelectProyecto(p.id)}>
                <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                <span className="nav-proyecto__nombre">{p.nombre}</span>
                <span className="nav-frente__count">{tareasEnProyecto(p.id)}</span>
              </button>

              {activo && (
                <div className="nav-frentes">
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
                    </div>
                  ))}

                  <button className="nav-frente nav-frente--add" onClick={() => setModal({ tipo: 'frente-nuevo' })}>
                    + Frente
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {proyectos.length === 0 && <div className="nav-vacio">Sin proyectos.</div>}
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
