import { useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import { esDuenoDe, puedeEditarProyecto, puedeEliminarProyecto } from '../lib/permisos'
import { ProyectoModal } from './ProyectoModal'
import { MiembrosModal } from './MiembrosModal'

// Administración → Proyectos (#132). Reparto: este módulo es dueño de la
// relación usuario↔proyecto (miembros, 🔑) y del ciclo de vida del proyecto
// (editar, archivar #133, eliminar #134). Trabaja sobre los proyectos de los
// que el usuario es miembro (misma visibilidad de siempre).

interface Props {
  state: AppState
  proyectos: Proyecto[] // proyectos miembro (incluye archivados)
  sesion: Usuario
  actions: Actions
}

type ModalState =
  | { tipo: 'editar'; proyecto: Proyecto }
  | { tipo: 'miembros'; proyecto: Proyecto }
  | null

export function AdminProyectosView({ state, proyectos, sesion, actions }: Props) {
  const [modal, setModal] = useState<ModalState>(null)
  const [verArchivados, setVerArchivados] = useState(false)

  const esAdmin = sesion.rol === 'admin'
  const lista = proyectos
    .filter((p) => (verArchivados ? p.estado === 'archivado' : p.estado !== 'archivado'))
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const nMiembros = (p: Proyecto) => state.accesos.filter((a) => a.proyectoId === p.id).length

  async function archivar(p: Proyecto) {
    const archivar = p.estado !== 'archivado'
    const msg = archivar
      ? `¿Archivar "${p.nombre}"? Saldrá de la barra lateral, de Resumen y de Mis Tareas.`
      : `¿Desarchivar "${p.nombre}"? Volverá a las vistas.`
    if (confirm(msg)) await actions.updateProyecto(p.id, { estado: archivar ? 'archivado' : 'activo' })
  }

  async function eliminar(p: Proyecto) {
    if (
      confirm(
        `¿Eliminar "${p.nombre}" y TODO su contenido (frentes, tareas, historial, comentarios)? ` +
          'Esta acción no se puede deshacer.',
      )
    ) {
      await actions.deleteProyecto(p.id)
    }
  }

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <h2>Proyectos</h2>
        <label className="proy-filtro">
          <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
          Ver archivados
        </label>
      </div>

      {lista.length === 0 ? (
        <p className="vacio-inline">{verArchivados ? 'No hay proyectos archivados.' : 'No hay proyectos activos.'}</p>
      ) : (
        <table className="tareas usuarios-tabla">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Dueño</th>
              <th>Miembros</th>
              <th>Estado</th>
              <th className="col-acc"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const dueno = state.usuarios.find((u) => u.id === p.duenoId)
              const puedeEditar = puedeEditarProyecto(state, sesion, p.id)
              const puedeArchivarEliminar = puedeEliminarProyecto(state, sesion, p.id)
              const archivado = p.estado === 'archivado'
              return (
                <tr key={p.id} className={archivado ? 'usuario-inactivo' : ''}>
                  <td>
                    <span className="usuario-nombre">
                      <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                      {p.nombre}
                    </span>
                  </td>
                  <td>{dueno ? dueno.nombre : <span className="usuarios-sin">—</span>}</td>
                  <td>{nMiembros(p)}</td>
                  <td>
                    <span className={`chip-estado chip-estado--${p.estado}`}>
                      {archivado ? 'Archivado' : 'Activo'}
                    </span>
                  </td>
                  <td className="col-acc">
                    {puedeEditar && (
                      <button className="icon-btn" title="Editar" onClick={() => setModal({ tipo: 'editar', proyecto: p })}>✎</button>
                    )}
                    {(esAdmin || esDuenoDe(state, sesion, p.id)) && (
                      <button className="icon-btn" title="Miembros" onClick={() => setModal({ tipo: 'miembros', proyecto: p })}>👥</button>
                    )}
                    {puedeArchivarEliminar && (
                      <button
                        className="icon-btn"
                        title={archivado ? 'Desarchivar' : 'Archivar'}
                        onClick={() => archivar(p)}
                      >
                        📦
                      </button>
                    )}
                    {puedeArchivarEliminar && archivado && (
                      <button className="icon-btn" title="Eliminar (definitivo)" onClick={() => eliminar(p)}>🗑</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {modal?.tipo === 'editar' && (
        <ProyectoModal
          proyecto={modal.proyecto}
          onSubmit={(d) => actions.updateProyecto(modal.proyecto.id, d)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'miembros' && (
        <MiembrosModal
          state={state}
          proyecto={modal.proyecto}
          sesion={sesion}
          actions={actions}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
