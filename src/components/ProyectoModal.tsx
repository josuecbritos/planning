import { useState } from 'react'
import type { Proyecto } from '../types'
import { Modal } from './Modal'

// Crear / editar proyecto.

interface Props {
  proyecto?: Proyecto
  onSubmit: (datos: { nombre: string; descripcion?: string; color?: string; estado: Proyecto['estado'] }) => void
  onClose: () => void
}

const COLORES = ['#2e7d32', '#1565c0', '#6a1b9a', '#c62828', '#ef6c00', '#00838f']

export function ProyectoModal({ proyecto, onSubmit, onClose }: Props) {
  const [nombre, setNombre] = useState(proyecto?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion ?? '')
  const [color, setColor] = useState(proyecto?.color ?? COLORES[0])
  const valido = nombre.trim().length > 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    // #133: el estado (activo/archivado) ya no se edita aquí; se archiva/
    // desarchiva desde el menú de la barra y Administración → Proyectos. Se
    // conserva el estado actual (o "activo" al crear).
    const estado: Proyecto['estado'] = proyecto?.estado ?? 'activo'
    onSubmit({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, color, estado })
    onClose()
  }

  return (
    <Modal titulo={proyecto ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="campo">
          <span>Nombre</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="campo">
          <span>Descripción</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <div className="campo">
          <span>Color</span>
          <div className="swatches">
            {COLORES.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${color === c ? ' swatch--sel' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div className="modal-acciones">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={!valido}>
            {proyecto ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
