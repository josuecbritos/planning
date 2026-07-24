import { useState } from 'react'
import type { AppState, Proyecto, Usuario } from '../types'
import type { Actions } from '../App'
import { esDuenoDe, puedeCrearProyectos, puedeEditarProyecto, puedeEliminarProyecto } from '../lib/permisos'
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
  | { tipo: 'nuevo' }
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

  // #167: el conteo son SOLO usuarios activos (accesos de activos + dueño si
  // está activo). Los desactivados/eliminados no cuentan ni aparecen en el
  // modal de Miembros.
  const activos = new Set(state.usuarios.filter((u) => u.activo).map((u) => u.id))
  const nMiembros = (p: Proyecto) =>
    state.accesos.filter((a) => a.proyectoId === p.id && activos.has(a.usuarioId)).length +
    (p.duenoId && activos.has(p.duenoId) ? 1 : 0)

  // Relación de la sesión con un proyecto (#165, pills excluyentes).
  const soyDueno = (p: Proyecto) => esDuenoDe(state, sesion, p.id)
  const soyMiembro = (p: Proyecto) =>
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

  return (
    <div className="usuarios-wrap">
      <div className="usuarios-cabecera">
        <h2>Proyectos</h2>
        <div className="usuarios-cabecera__acciones">
          <label className="proy-filtro">
            <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
            Ver archivados
          </label>
          {/* #169: botón de crear, homologado con "+ Usuario". */}
          {puedeCrearProyectos(sesion) && (
            <button className="btn btn--primary" onClick={() => setModal({ tipo: 'nuevo' })}>
              + Proyecto
            </button>
          )}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="vacio-inline">No hay proyectos.</p>
      ) : (
        <table className="tareas usuarios-tabla">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th className="col-dueno">Dueño</th>
              <th className="col-mini">Miembros</th>
              <th className="col-estado-adm">Estado</th>
              <th className="col-acc">Acciones</th>
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
                      {/* #165: DUEÑO / MIEMBRO excluyentes, o nada. */}
                      {soyDueno(p) ? (
                        <span className="chip-dueno">Dueño</span>
                      ) : soyMiembro(p) ? (
                        <span className="chip-dueno chip-miembro">Miembro</span>
                      ) : null}
                    </span>
                  </td>
                  <td>{dueno ? dueno.nombre : <span className="usuarios-sin">—</span>}</td>
                  <td>{nMiembros(p)}</td>
                  <td>
                    <span className={`chip-estado chip-estado--${p.estado}`}>
                      {archivado ? 'Archivado' : 'Activo'}
                    </span>
                  </td>
                  {/* #166: en archivado solo aparecen 📦 y 🗑 (los demás no se
                      renderizan, no se atenúan). La columna tiene ancho fijo
                      (CSS) para que mostrar archivados no mueva la geometría. */}
                  <td className="col-acc">
                    {!archivado && puedeEditar && (
                      <button className="icon-btn" data-tip="Editar proyecto" onClick={() => setModal({ tipo: 'editar', proyecto: p })}>✎</button>
                    )}
                    {!archivado && (esAdmin || soyDueno(p)) && (
                      <button className="icon-btn" data-tip="Miembros" onClick={() => setModal({ tipo: 'miembros', proyecto: p })}>👥</button>
                    )}
                    {puedeArchivarEliminar && (
                      <button className="icon-btn" data-tip={archivado ? 'Desarchivar' : 'Archivar'} onClick={() => archivar(p)}>📦</button>
                    )}
                    {archivado && puedeArchivarEliminar && (
                      <button className="icon-btn" data-tip="Eliminar (definitivo)" onClick={() => eliminar(p)}>🗑</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {modal?.tipo === 'nuevo' && (
        <ProyectoModal onSubmit={(d) => actions.createProyecto(d)} onClose={() => setModal(null)} />
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
