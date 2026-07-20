import { useState } from 'react'
import type { Actions } from '../App'

// Estado vacío de un proyecto sin frentes (pedido §2): la Gantt y la Tabla
// ofrecen "Agregar frente" en el cuerpo, para crear el primero sin tener que
// ir a la barra lateral. Solo aparece la acción si el usuario puede crear
// frentes (dueño, admin o invitado con el permiso); si no, un texto guía.

interface Props {
  proyectoId: string
  /** can.crearFrentes del usuario actual sobre este proyecto. */
  puedeCrear: boolean
  actions: Actions
}

export function EmptyFrentes({ proyectoId, puedeCrear, actions }: Props) {
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')

  function crear() {
    const n = nombre.trim()
    if (!n) return
    actions.createFrente({ proyectoId, nombre: n })
    setNombre('')
    setCreando(false)
  }

  return (
    <div className="vacio-frentes">
      <p>Este proyecto aún no tiene frentes.</p>
      {!puedeCrear ? (
        <p className="mudo">Pídele a quien administra el proyecto que agregue el primero.</p>
      ) : creando ? (
        <div className="vacio-frentes__form">
          <input
            autoFocus
            value={nombre}
            placeholder="Nombre del frente"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crear()
              if (e.key === 'Escape') {
                setCreando(false)
                setNombre('')
              }
            }}
          />
          <button className="btn btn--primary" onClick={crear} disabled={!nombre.trim()}>
            Crear
          </button>
          <button
            className="btn"
            onClick={() => {
              setCreando(false)
              setNombre('')
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button className="btn btn--primary" onClick={() => setCreando(true)}>
          + Agregar frente
        </button>
      )}
    </div>
  )
}
