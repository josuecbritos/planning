import { useState } from 'react'
import type { AlcancePermiso, PermisosTareas } from '../types'
import { Modal } from './Modal'

// Set de OCHO permisos sobre tareas, POR ACCESO (usuario × proyecto). El
// mismo componente sirve para clientes y para consultores invitados a
// proyectos ajenos (3.2): cada permiso es una fila; los que actuan sobre
// tareas se controlan con un selector segmentado de tres posiciones que
// hace el ALCANCE explicito: [ No | Solo asignadas | Todas ].

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
export function Seg<T extends string | boolean>({
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
  /** Nombre de la persona configurada (para el titulo). */
  nombre: string
  /** Proyecto al que pertenece el acceso (los permisos son POR PROYECTO). */
  contexto?: string
  /** Permisos actuales del acceso (nacen con el default del rol, 4). */
  permisos: PermisosTareas
  onGuardar: (permisos: PermisosTareas) => void
  onClose: () => void
}

export function PermisosModal({ nombre, contexto, permisos: iniciales, onGuardar, onClose }: Props) {
  const [permisos, setPermisos] = useState<PermisosTareas>({ ...iniciales })

  const setCreacion = (k: PermisoCreacion, v: boolean) =>
    setPermisos((p) => ({ ...p, [k]: v }))
  const setTarea = (k: PermisoTarea, v: false | AlcancePermiso) =>
    setPermisos((p) => ({ ...p, [k]: v }))

  return (
    <Modal titulo={`Permisos de ${nombre}${contexto ? ` en ${contexto}` : ''}`} onClose={onClose} ancho>
      <div className="permisos">
        <p className="permisos__intro">
          Permisos de este acceso (por usuario y por proyecto). Nacen con el
          default del rol; ajustables permiso a permiso.
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
                  { v: true, label: 'Sí' },
                ]}
                valor={!!permisos[key]}
                onChange={(v) => setCreacion(key, v)}
              />
            </div>
          ))}
        </div>

        <h4 className="permisos__grupo">
          Sobre tareas <span className="permisos__alcance">· alcance: en qué tareas puede actuar</span>
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
          <strong>Solo asignadas</strong>: únicamente las tareas cuyo responsable es este
          usuario. <strong>Todas</strong>: cualquier tarea del proyecto.
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
