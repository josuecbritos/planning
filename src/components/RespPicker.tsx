import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Usuario } from '../types'

// Selector de responsable moderno: el disparador es el avatar (iniciales con
// color estable por persona) y el menu muestra avatar + nombre completo +
// iniciales, para reconocer a las personas al elegir.

const PALETA = ['#3f51b5', '#00838f', '#6a1b9a', '#2e7d32', '#ef6c00', '#c2185b', '#5d4037', '#455a64']

/** Color estable por usuario (hash simple del id). */
export function colorAvatar(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]
}

export function Avatar({ usuario }: { usuario?: Usuario }) {
  if (!usuario) return <span className="avatar avatar--vacio">—</span>
  return (
    <span className="avatar" style={{ background: colorAvatar(usuario.id) }} title={usuario.nombre}>
      {usuario.iniciales}
    </span>
  )
}

interface Props {
  /** Candidatos (los admins activos). */
  usuarios: Usuario[]
  value?: string
  onChange: (id?: string) => void
  ariaLabel?: string
}

export function RespPicker({ usuarios, value, onChange, ariaLabel }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actual = usuarios.find((u) => u.id === value)

  function abrir() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) {
      const anchoMenu = 240
      const altoEstimado = 46 * (usuarios.length + 1) + 12
      let x = r.left
      let y = r.bottom + 4
      if (x + anchoMenu > window.innerWidth - 8) x = window.innerWidth - anchoMenu - 8
      if (y + altoEstimado > window.innerHeight - 8) y = Math.max(8, r.top - altoEstimado - 4)
      setPos({ x, y })
    }
    setAbierto(true)
  }

  // Cierra con click fuera, Escape, scroll o resize (el menu es position:fixed).
  useEffect(() => {
    if (!abierto) return
    const cerrar = () => setAbierto(false)
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) cerrar()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [abierto])

  function elegir(id?: string) {
    setAbierto(false)
    if (id !== value) onChange(id)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="resp-picker"
        title={actual ? `${actual.nombre} (${actual.iniciales})` : 'Asignar responsable'}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
      >
        {actual ? <Avatar usuario={actual} /> : <span className="avatar avatar--vacio">+</span>}
        <span className="resp-picker__caret">▾</span>
      </button>

      {abierto &&
        createPortal(
          <div ref={menuRef} className="resp-menu" role="listbox" aria-label={ariaLabel}>
            <div className="resp-menu__inner" style={{ left: pos.x, top: pos.y, position: 'fixed' }}>
              <Opcion
                seleccionado={!actual}
                onElegir={() => elegir(undefined)}
                avatar={<span className="avatar avatar--vacio">—</span>}
                nombre="Sin asignar"
              />
              {usuarios.map((u) => (
                <Opcion
                  key={u.id}
                  seleccionado={u.id === value}
                  onElegir={() => elegir(u.id)}
                  avatar={<Avatar usuario={u} />}
                  nombre={u.nombre}
                  iniciales={u.iniciales}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function Opcion({
  seleccionado,
  onElegir,
  avatar,
  nombre,
  iniciales,
}: {
  seleccionado: boolean
  onElegir: () => void
  avatar: React.ReactNode
  nombre: string
  iniciales?: string
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={seleccionado}
      className={`resp-menu__opcion${seleccionado ? ' resp-menu__opcion--sel' : ''}`}
      // preventDefault: el foco no sale de la fila (no dispara el autoguardado
      // de la fila de creacion inline al elegir responsable).
      onMouseDown={(e) => e.preventDefault()}
      onClick={onElegir}
    >
      {avatar}
      <span className="resp-menu__nombre">
        {nombre}
        {iniciales && <small>{iniciales}</small>}
      </span>
      {seleccionado && <span className="resp-menu__check">✓</span>}
    </button>
  )
}
