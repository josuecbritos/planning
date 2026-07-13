import { useState } from 'react'
import type { AlcancePermiso, PermisosCliente, Usuario } from '../types'
import { Modal } from './Modal'

// Configuracion de permisos por cliente (§7.29-30): cada permiso es una
// fila de una lista; los que actuan sobre tareas se controlan con un
// selector segmentado de tres posiciones que hace el ALCANCE explicito:
// [ No | Solo asignadas | Todas ].

type PermisoTarea = 'editarFechas' | 'marcarHechas' | 'editarTareas' | 'archivarEliminar' | 'asignarResponsable'
type PermisoCreacion = 'crearFrentes' | 'crearSubFrentes' | 'crearTareas'

const CREACION: { key: PermisoCreacion; label: string; hint?: string }[] = [
  { key: 'crearFrentes', label: 'Crear frentes' },
  { key: 'crearSubFrentes', label: 'Crear sub frentes' },
  { key: 'crearTareas', label: 'Crear tareas' },
]

const SOBRE_TAREAS: { key: PermisoTarea; label: string; hint?: string }[] = [
  { key: 'editarFechas', label: 'Editar fechas', hint: 'Planificar y replanificar' },
  { key: 'marcarHechas', label: 'Marcar como hechas' },
  { key: 'editarTareas', label: 'Editar tareas', hint: 'Cambiar el nombre' },
  { key: 'archivarEliminar', label: 'Archivar / eliminar' },
  { key: 'asignarResponsable', label: 'Asignar responsable', hint: 'A cualquier persona con acceso al proyecto' },
]

/** Selector segmentado generico (2 o 3 posiciones). */
function Seg<T extends string | boolean>({
  opciones,
  valor,
  onChange,
  ariaLabel,
}: {
  opciones: { v: T; label: string }[]
  valor: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {opciones.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={o.v === valor}
          className={`seg__btn${o.v === valor ? ' seg__btn--on' : ''}${o.v === false ? ' seg__btn--no' : ''}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

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

        <h4 className="permisos__grupo">Crear elementos</h4>
        <div className="permisos-lista">
          {CREACION.map(({ key, label, hint }) => (
            <div key={key} className="permiso-item">
              <span className="permiso-item__label">
                {label}
                {hint && <small>{hint}</small>}
              </span>
              <Seg
                ariaLabel={label}
                opciones={[
                  { v: false, label: 'No' },
                  { v: true, label: 'Si' },
                ]}
                valor={!!permisos[key]}
                onChange={(v) => setCreacion(key, v)}
              />
            </div>
          ))}
        </div>

        <h4 className="permisos__grupo">
          Sobre tareas <span className="permisos__alcance">· alcance: en que tareas puede actuar</span>
        </h4>
        <div className="permisos-lista">
          {SOBRE_TAREAS.map(({ key, label, hint }) => (
            <div key={key} className="permiso-item">
              <span className="permiso-item__label">
                {label}
                {hint && <small>{hint}</small>}
              </span>
              <Seg
                ariaLabel={label}
                opciones={[
                  { v: false as const, label: 'No' },
                  { v: 'asignadas' as const, label: 'Solo asignadas' },
                  { v: 'todas' as const, label: 'Todas' },
                ]}
                valor={permisos[key] || false}
                onChange={(v) => setTarea(key, v)}
              />
            </div>
          ))}
        </div>

        <p className="permisos__nota">
          <strong>Solo asignadas</strong>: unicamente las tareas cuyo responsable es este
          cliente. <strong>Todas</strong>: cualquier tarea de sus proyectos.
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
