import { useState } from 'react'
import type { Tarea, Usuario } from '../types'
import { hoyISO } from '../lib/dates'
import { Modal } from './Modal'

// Crear / editar tarea. En modo edicion la fecha objetivo no se cambia aqui:
// se replanifica desde la columna F. objetivo para dejar registro en historial.

export interface DatosTarea {
  titulo: string
  responsableId?: string
  fechaObjetivo: string
  descripcion?: string
  comentarios?: string
}

interface Props {
  tarea?: Tarea
  usuarios: Usuario[]
  fechaSugerida?: string
  onSubmit: (datos: DatosTarea) => void
  onClose: () => void
}

export function TareaModal({ tarea, usuarios, fechaSugerida, onSubmit, onClose }: Props) {
  const edicion = Boolean(tarea)
  const [titulo, setTitulo] = useState(tarea?.titulo ?? '')
  const [responsableId, setResponsableId] = useState(tarea?.responsableId ?? '')
  const [fechaObjetivo, setFechaObjetivo] = useState(tarea?.fechaObjetivo ?? fechaSugerida ?? hoyISO())
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [comentarios, setComentarios] = useState(tarea?.comentarios ?? '')
  const valido = titulo.trim().length > 0 && fechaObjetivo.length > 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    onSubmit({
      titulo: titulo.trim(),
      responsableId: responsableId || undefined,
      fechaObjetivo,
      descripcion: descripcion.trim() || undefined,
      comentarios: comentarios.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal titulo={edicion ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="campo">
          <span>Titulo</span>
          <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="campo">
          <span>Responsable</span>
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} ({u.iniciales})</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Fecha objetivo</span>
          <input
            type="date"
            value={fechaObjetivo}
            onChange={(e) => setFechaObjetivo(e.target.value)}
            disabled={edicion}
          />
          {edicion && (
            <small className="ayuda">
              Para replanificar, cambia la fecha desde la columna “F. objetivo” (queda en el historial).
            </small>
          )}
        </label>
        <label className="campo">
          <span>Descripcion</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <label className="campo">
          <span>Comentarios</span>
          <textarea rows={2} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </label>
        <div className="modal-acciones">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={!valido}>
            {edicion ? 'Guardar' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
