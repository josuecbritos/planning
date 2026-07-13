import { useState } from 'react'
import type { AlcancePermiso, PermisosCliente, Usuario } from '../types'
import { Modal } from './Modal'

// Configuracion de permisos por cliente (§7.29-30): on/off por permiso y,
// para los que actuan sobre tareas, alcance "todas" o "solo asignadas".

type PermisoTarea = 'editarFechas' | 'marcarHechas' | 'editarTareas' | 'archivarEliminar' | 'asignarResponsable'
type PermisoCreacion = 'crearFrentes' | 'crearSubFrentes' | 'crearTareas'

const CREACION: { key: PermisoCreacion; label: string }[] = [
  { key: 'crearFrentes', label: 'Crear frentes' },
  { key: 'crearSubFrentes', label: 'Crear sub frentes' },
  { key: 'crearTareas', label: 'Crear tareas' },
]

const SOBRE_TAREAS: { key: PermisoTarea; label: string }[] = [
  { key: 'editarFechas', label: 'Editar fechas (planificar / replanificar)' },
  { key: 'marcarHechas', label: 'Marcar tareas como hechas' },
  { key: 'editarTareas', label: 'Editar tareas (nombre)' },
  { key: 'archivarEliminar', label: 'Archivar / eliminar tareas' },
  { key: 'asignarResponsable', label: 'Asignar / cambiar responsable' },
]

interface Props {
  usuario: Usuario
  onGuardar: (permisos: PermisosCliente) => void
  onClose: () => void
}

export function PermisosModal({ usuario, onGuardar, onClose }: Props) {
  const [permisos, setPermisos] = useState<PermisosCliente>({ ...(usuario.permisos ?? {}) })

  const setCreacion = (k: PermisoCreacion, v: boolean) =>
    setPermisos((p) => ({ ...p, [k]: v }))
  const setTarea = (k: PermisoTarea, v: false | AlcancePermiso) =>
    setPermisos((p) => ({ ...p, [k]: v }))

  return (
    <Modal titulo={`Permisos de ${usuario.nombre}`} onClose={onClose}>
      <div className="permisos">
        <p className="permisos__intro">
          Configuracion propia de este cliente. Sin permisos activos, solo lectura.
        </p>

        <h4 className="permisos__grupo">Creacion</h4>
        {CREACION.map(({ key, label }) => (
          <label key={key} className="permiso-fila">
            <input
              type="checkbox"
              checked={!!permisos[key]}
              onChange={(e) => setCreacion(key, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}

        <h4 className="permisos__grupo">Sobre tareas (con alcance)</h4>
        {SOBRE_TAREAS.map(({ key, label }) => {
          const valor = permisos[key] || false
          return (
            <div key={key} className="permiso-fila permiso-fila--tarea">
              <label>
                <input
                  type="checkbox"
                  checked={valor !== false}
                  onChange={(e) => setTarea(key, e.target.checked ? 'asignadas' : false)}
                />
                <span>{label}</span>
              </label>
              {valor !== false && (
                <select
                  className="asignar-select"
                  value={valor}
                  onChange={(e) => setTarea(key, e.target.value as AlcancePermiso)}
                >
                  <option value="asignadas">Solo sus tareas asignadas</option>
                  <option value="todas">Todas las tareas del proyecto</option>
                </select>
              )}
            </div>
          )
        })}

        <p className="permisos__nota">
          "Asignar / cambiar responsable" permite asignar a cualquier persona con
          acceso al proyecto (admins y otros clientes asignados).
        </p>

        <div className="modal-acciones">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onGuardar(permisos)
              onClose()
            }}
          >
            Guardar permisos
          </button>
        </div>
      </div>
    </Modal>
  )
}
