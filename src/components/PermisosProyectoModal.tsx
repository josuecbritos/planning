import { useState } from 'react'
import type { PermisosProyecto, Usuario } from '../types'
import { Modal } from './Modal'
import { Seg } from './PermisosModal'

// Pantalla NUEVA (3.1): permisos de NIVEL PROYECTO de un consultor. Los
// configura el admin, consultor por consultor. Cuatro permisos Si/No.
// (Los permisos sobre tareas de un consultor invitado a un proyecto ajeno
// se configuran en su ACCESO, con el mismo set de ocho de los clientes.)

type Permiso = keyof PermisosProyecto

const PERMISOS: { key: Permiso; label: string; hint?: string }[] = [
  { key: 'crearProyectos', label: 'Crear proyectos', hint: 'Sin esto, solo gestiona los que el admin le asigne' },
  { key: 'archivarEliminarProyectos', label: 'Archivar / eliminar sus proyectos', hint: 'Sobre los proyectos de los que es dueño' },
  { key: 'invitarClientes', label: 'Invitar clientes a sus proyectos', hint: 'Sin esto, los clientes los asigna solo el admin' },
  { key: 'configurarPermisosClientes', label: 'Configurar permisos de los clientes de sus proyectos', hint: 'Sin esto, esos permisos los define el admin' },
]

interface Props {
  usuario: Usuario
  onGuardar: (permisos: PermisosProyecto) => void
  onClose: () => void
}

export function PermisosProyectoModal({ usuario, onGuardar, onClose }: Props) {
  const [permisos, setPermisos] = useState<PermisosProyecto>({ ...(usuario.permisosProyecto ?? {}) })

  return (
    <Modal titulo={`Permisos de proyecto de ${usuario.nombre}`} onClose={onClose} ancho>
      <div className="permisos">
        <p className="permisos__intro">
          Qué puede hacer este consultor A NIVEL DE PROYECTOS. Dentro de sus
          propios proyectos su control es total; en proyectos ajenos rige el
          set de permisos de su acceso.
        </p>

        <div className="permisos-lista">
          {PERMISOS.map(({ key, label, hint }) => (
            <div key={key} className="permiso-item">
              <span className="permiso-item__label">
                {label}
                {hint && <small>{hint}</small>}
              </span>
              <Seg
                ariaLabel={label}
                opciones={[
                  { v: false, label: 'No' },
                  { v: true, label: 'Sí' },
                ]}
                valor={!!permisos[key]}
                onChange={(v) => setPermisos((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </div>

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
