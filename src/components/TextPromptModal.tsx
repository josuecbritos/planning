import { useState } from 'react'
import { Modal } from './Modal'

// Modal simple de un solo campo de texto (crear/renombrar frente y sub frente).

interface Props {
  titulo: string
  label: string
  valorInicial?: string
  textoBoton?: string
  onSubmit: (valor: string) => void
  onClose: () => void
}

export function TextPromptModal({ titulo, label, valorInicial = '', textoBoton = 'Guardar', onSubmit, onClose }: Props) {
  const [valor, setValor] = useState(valorInicial)
  const valido = valor.trim().length > 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    onSubmit(valor.trim())
    onClose()
  }

  return (
    <Modal titulo={titulo} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="campo">
          <span>{label}</span>
          <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
        <div className="modal-acciones">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={!valido}>{textoBoton}</button>
        </div>
      </form>
    </Modal>
  )
}
