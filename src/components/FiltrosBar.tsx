import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Usuario } from '../types'
import { CATEGORIA_LABEL, type Categoria } from '../lib/derive'
import {
  FECHA_RELATIVA_LABEL,
  etiquetaFecha,
  filtroVacio,
  type FechaRelativa,
  type Filtro,
  type FiltroGuardado,
} from '../lib/filtros'
import { TextPromptModal } from './TextPromptModal'
import { Avatar } from './RespPicker'

// Barra de filtros guardables (punto 3): Fecha Objetivo, Responsable y
// Estado, con multi-seleccion por campo. Los guardados son privados por
// usuario y por proyecto (localStorage), con nombre; se aplican desde el
// desplegable y pueden actualizarse, renombrarse y eliminarse.

const ESTADOS: Categoria[] = ['hecha', 'pendiente', 'pendiente_replan', 'atrasada', 'atrasada_replan']
const ESTADO_COLOR: Record<Categoria, string> = {
  hecha: 'var(--verde)',
  pendiente: 'var(--gris-borde)',
  pendiente_replan: 'var(--ambar)',
  atrasada: 'var(--rojo)',
  atrasada_replan: 'var(--morado)',
}
const RELATIVAS: FechaRelativa[] = ['hoy', 'semana', 'proxima', 'mes']

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'f-' + Math.floor(Math.random() * 1e9).toString(36)
}

interface Props {
  proyectoId: string
  usuarioId: string
  candidatos: Usuario[]
  filtro: Filtro
  onCambiar: (f: Filtro) => void
}

export function FiltrosBar({ proyectoId, usuarioId, candidatos, filtro, onCambiar }: Props) {
  const clave = `planificador.filtros.${usuarioId}.${proyectoId}`
  const [guardados, setGuardados] = useState<FiltroGuardado[]>([])
  const [modal, setModal] = useState<{ tipo: 'guardar' } | { tipo: 'renombrar'; id: string; nombre: string } | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(clave)
      setGuardados(raw ? (JSON.parse(raw) as FiltroGuardado[]) : [])
    } catch {
      setGuardados([])
    }
  }, [clave])

  function persistir(lista: FiltroGuardado[]) {
    setGuardados(lista)
    try {
      localStorage.setItem(clave, JSON.stringify(lista))
    } catch {
      /* sin storage: los guardados viven solo en esta sesion */
    }
  }

  const activo = !filtroVacio(filtro)
  const nResp = filtro.responsables?.length ?? 0
  const nEst = filtro.estados?.length ?? 0

  const toggleResp = (id: string) => {
    const set = new Set(filtro.responsables ?? [])
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onCambiar({ ...filtro, responsables: set.size ? [...set] : undefined })
  }
  const toggleEstado = (c: Categoria) => {
    const set = new Set(filtro.estados ?? [])
    if (set.has(c)) set.delete(c)
    else set.add(c)
    onCambiar({ ...filtro, estados: set.size ? [...set] : undefined })
  }

  return (
    <div className="filtros-bar">
      <span className="filtros-bar__label">Filtrar</span>

      <Desplegable
        etiqueta={filtro.fecha ? `Fecha: ${etiquetaFecha(filtro.fecha)}` : 'Fecha'}
        activo={!!filtro.fecha}
      >
        <div className="filtro-menu__grupo">Relativas (se recalculan)</div>
        {RELATIVAS.map((r) => (
          <button
            key={r}
            className={`filtro-op${filtro.fecha?.tipo === 'relativa' && filtro.fecha.valor === r ? ' filtro-op--on' : ''}`}
            onClick={() =>
              onCambiar({
                ...filtro,
                fecha:
                  filtro.fecha?.tipo === 'relativa' && filtro.fecha.valor === r
                    ? undefined
                    : { tipo: 'relativa', valor: r },
              })
            }
          >
            {FECHA_RELATIVA_LABEL[r]}
          </button>
        ))}
        <div className="filtro-menu__grupo">Rango fijo</div>
        <div className="filtro-rango">
          <input
            type="date"
            className="fecha-input"
            aria-label="Filtro desde"
            value={filtro.fecha?.tipo === 'rango' ? filtro.fecha.desde ?? '' : ''}
            onChange={(e) => {
              const hasta = filtro.fecha?.tipo === 'rango' ? filtro.fecha.hasta : undefined
              const desde = e.target.value || undefined
              onCambiar({ ...filtro, fecha: desde || hasta ? { tipo: 'rango', desde, hasta } : undefined })
            }}
          />
          –
          <input
            type="date"
            className="fecha-input"
            aria-label="Filtro hasta"
            value={filtro.fecha?.tipo === 'rango' ? filtro.fecha.hasta ?? '' : ''}
            onChange={(e) => {
              const desde = filtro.fecha?.tipo === 'rango' ? filtro.fecha.desde : undefined
              const hasta = e.target.value || undefined
              onCambiar({ ...filtro, fecha: desde || hasta ? { tipo: 'rango', desde, hasta } : undefined })
            }}
          />
        </div>
        {filtro.fecha && (
          <button className="filtro-op filtro-op--quitar" onClick={() => onCambiar({ ...filtro, fecha: undefined })}>
            Quitar filtro de fecha
          </button>
        )}
      </Desplegable>

      <Desplegable etiqueta={nResp ? `Responsable (${nResp})` : 'Responsable'} activo={nResp > 0}>
        {candidatos.map((u) => (
          <label key={u.id} className="filtro-op filtro-op--check">
            <input type="checkbox" checked={filtro.responsables?.includes(u.id) ?? false} onChange={() => toggleResp(u.id)} />
            <Avatar usuario={u} />
            <span>{u.nombre}</span>
          </label>
        ))}
        {candidatos.length === 0 && <div className="filtro-menu__vacio">Sin personas en este proyecto.</div>}
      </Desplegable>

      <Desplegable etiqueta={nEst ? `Estado (${nEst})` : 'Estado'} activo={nEst > 0}>
        {ESTADOS.map((c) => (
          <label key={c} className="filtro-op filtro-op--check">
            <input type="checkbox" checked={filtro.estados?.includes(c) ?? false} onChange={() => toggleEstado(c)} />
            <span className="filtro-dot" style={{ background: ESTADO_COLOR[c] }} />
            <span>{CATEGORIA_LABEL[c]}</span>
          </label>
        ))}
      </Desplegable>

      {activo && (
        <button className="link-btn filtros-bar__limpiar" onClick={() => onCambiar({})}>
          Limpiar
        </button>
      )}

      <span className="filtros-bar__sep" />

      <Desplegable etiqueta={`Guardados${guardados.length ? ` (${guardados.length})` : ''}`} activo={false} alDerecha>
        {guardados.length === 0 && <div className="filtro-menu__vacio">Aun no guardas filtros en este proyecto.</div>}
        {guardados.map((g) => (
          <div key={g.id} className="filtro-guardado">
            <button className="filtro-guardado__aplicar" title="Aplicar este filtro" onClick={() => onCambiar(g.filtro)}>
              {g.nombre}
            </button>
            <button
              className="icon-btn"
              data-tip="Actualizar con el filtro actual"
              aria-label={`Actualizar ${g.nombre}`}
              disabled={!activo}
              onClick={() => persistir(guardados.map((x) => (x.id === g.id ? { ...x, filtro } : x)))}
            >
              💾
            </button>
            <button
              className="icon-btn"
              data-tip="Renombrar"
              aria-label={`Renombrar ${g.nombre}`}
              onClick={() => setModal({ tipo: 'renombrar', id: g.id, nombre: g.nombre })}
            >
              ✎
            </button>
            <button
              className="icon-btn"
              data-tip="Eliminar"
              aria-label={`Eliminar ${g.nombre}`}
              onClick={() => persistir(guardados.filter((x) => x.id !== g.id))}
            >
              🗑
            </button>
          </div>
        ))}
      </Desplegable>

      <button
        className="btn btn--ghost btn--sm"
        disabled={!activo}
        title={activo ? 'Guardar la combinacion actual con un nombre' : 'Arma un filtro para poder guardarlo'}
        onClick={() => setModal({ tipo: 'guardar' })}
      >
        Guardar filtro…
      </button>

      {modal?.tipo === 'guardar' && (
        <TextPromptModal
          titulo="Guardar filtro"
          label='Nombre (ej. "Mis atrasadas", "Lo de esta semana")'
          textoBoton="Guardar"
          onSubmit={(nombre) => persistir([...guardados, { id: uid(), nombre, filtro }])}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'renombrar' && (
        <TextPromptModal
          titulo="Renombrar filtro"
          label="Nuevo nombre"
          valorInicial={modal.nombre}
          onSubmit={(nombre) => persistir(guardados.map((x) => (x.id === modal.id ? { ...x, nombre } : x)))}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

/** Boton + panel desplegable con cierre por click afuera o Escape. */
function Desplegable({
  etiqueta,
  activo,
  alDerecha,
  children,
}: {
  etiqueta: string
  activo: boolean
  alDerecha?: boolean
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [abierto])

  return (
    <div className="filtro-desplegable" ref={ref}>
      <button
        className={`filtro-btn${activo ? ' filtro-btn--activo' : ''}${abierto ? ' filtro-btn--abierto' : ''}`}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {etiqueta} <span className="filtro-btn__caret">▾</span>
      </button>
      {abierto && <div className={`filtro-menu${alDerecha ? ' filtro-menu--derecha' : ''}`}>{children}</div>}
    </div>
  )
}
