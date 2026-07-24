import { useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import { esDuenoDe, puedeEditarProyecto, puedeEliminarProyecto } from '../lib/permisos'
import { ProyectoModal } from './ProyectoModal'
import { MiembrosModal } from './MiembrosModal'

// Administración → Proyectos (#132). Reparto: este módulo es dueño de la
// relación usuario↔proyecto (miembros, 🔑) y del ciclo de vida del proyecto
// (editar, archivar #133, eliminar #134).
//
// #146: administrar ≠ ser miembro. El admin ve y administra TODOS los
// proyectos (sea o no miembro); su barra lateral y Resumen/Mis Tareas siguen
// mostrando solo donde es miembro. El consultor ve los suyos (dueño + asignados).

interface Props {
  state: AppState
  /** Proyectos administrables: admin = todos; consultor = dueño + asignados. */
  proyectos: Proyecto[]
  sesion: Usuario
  actions: Actions
}

type ModalState =
  | { tipo: 'editar'; proyecto: Proyecto }
  | { tipo: 'miembros'; proyecto: Proyecto }
  | null

export function AdminProyectosView({ state, proyectos, sesion, actions }: Props) {
  const [modal, setModal] = useState<ModalState>(null)
  // #149: la casilla SUMA los archivados a la lista, no reemplaza.
  const [verArchivados, setVerArchivados] = useState(false)

  const esAdmin = sesion.rol === 'admin'
  const lista = proyectos
    .filter((p) => verArchivados || p.estado !== 'archivado')
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  // #151: el conteo incluye al dueño (que no tiene fila en acceso_proyecto).
  const nMiembros = (p: Proyecto) =>
    state.accesos.filter((a) => a.proyectoId === p.id).length + (p.duenoId ? 1 : 0)

  // #147: ¿la sesión es miembro (dueño o con acceso)? Marca el chip y decide
  // unirse/salirse.
  const esMiembro = (p: Proyecto) =>
    esDuenoDe(state, sesion, p.id) ||
    state.accesos.some((a) => a.usuarioId === sesion.id && a.proyectoId === p.id)

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

  function unirseSalirse(p: Proyecto) {
    if (esMiembro(p)) actions.quitarAcceso(sesion.id, p.id)
    else actions.asignarAcceso(sesion.id, p.id)
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
        <p className="vacio-inline">No hay proyectos.</p>
      ) : (
        <table className="tareas usuarios-tabla">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Dueño</th>
              <th>Miembros</th>
              <th>Estado</th>
              <th className="col-acc">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const dueno = state.usuarios.find((u) => u.id === p.duenoId)
              const puedeEditar = puedeEditarProyecto(state, sesion, p.id)
              const puedeArchivarEliminar = puedeEliminarProyecto(state, sesion, p.id)
              const archivado = p.estado === 'archivado'
              const miembro = esMiembro(p)
              const soyDueno = esDuenoDe(state, sesion, p.id)
              return (
                <tr key={p.id} className={archivado ? 'usuario-inactivo' : ''}>
                  <td>
                    <span className="usuario-nombre">
                      <span className="nav-proyecto__dot" style={{ background: p.color ?? '#607d8b' }} />
                      {p.nombre}
                      {/* #147: chip MIEMBRO, mismo trato visual que DUEÑO. */}
                      {miembro && <span className="chip-dueno chip-miembro">Miembro</span>}
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
                    {/* #150: sobre un proyecto archivado solo tienen sentido
                        desarchivar y eliminar; editar/miembros/unirse quedan
                        deshabilitados (atenuados). #148: tooltips con data-tip. */}
                    {puedeEditar && (
                      <button
                        className="icon-btn"
                        data-tip="Editar proyecto"
                        disabled={archivado}
                        onClick={() => setModal({ tipo: 'editar', proyecto: p })}
                      >
                        ✎
                      </button>
                    )}
                    {(esAdmin || soyDueno) && (
                      <button
                        className="icon-btn"
                        data-tip="Miembros"
                        disabled={archivado}
                        onClick={() => setModal({ tipo: 'miembros', proyecto: p })}
                      >
                        👥
                      </button>
                    )}
                    {/* #147: unirse/salirse (afecta la barra lateral). El dueño
                        siempre es miembro y no puede salirse. */}
                    <button
                      className="icon-btn"
                      data-tip={soyDueno ? 'El dueño siempre es miembro' : miembro ? 'Salir del proyecto' : 'Unirme al proyecto'}
                      disabled={archivado || soyDueno}
                      onClick={() => unirseSalirse(p)}
                    >
                      {miembro ? '🚪' : '➕'}
                    </button>
                    {puedeArchivarEliminar && (
                      <button
                        className="icon-btn"
                        data-tip={archivado ? 'Desarchivar' : 'Archivar'}
                        onClick={() => archivar(p)}
                      >
                        📦
                      </button>
                    )}
                    {puedeArchivarEliminar && archivado && (
                      <button className="icon-btn" data-tip="Eliminar (definitivo)" onClick={() => eliminar(p)}>🗑</button>
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
