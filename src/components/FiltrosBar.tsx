import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Proyecto, Usuario } from '../types'
import { CATEGORIA_LABEL, type Categoria } from '../lib/derive'
import {
  FECHA_RELATIVA_LABEL,
  RESP_SIN_ASIGNAR,
  etiquetaFecha,
  filtroVacio,
  type FechaRelativa,
  type Filtro,
  type FiltroGuardado,
} from '../lib/filtros'
import type { CampoOrden, CampoOrdenOpc, Direccion, OrdenMulti } from '../lib/orden'
import { coincideConVista } from '../lib/vistas'
import { TextPromptModal } from './TextPromptModal'
import { Avatar } from './RespPicker'

// Barra de filtros + orden guardables (puntos 3 y 4): Fecha Objetivo,
// Responsable y Estado con multi-seleccion, mas un menu "Ordenar" multinivel
// (reglas campo + direccion). Filtro y orden se guardan juntos como una sola
// "vista", privada por usuario y por proyecto (en la base desde #289): se aplican desde
// el desplegable y pueden actualizarse, renombrarse y eliminarse.

const ESTADOS: Categoria[] = ['hecha', 'pendiente', 'pendiente_replan', 'atrasada', 'atrasada_replan']
const ESTADO_COLOR: Record<Categoria, string> = {
  hecha: 'var(--verde)',
  pendiente: 'var(--gris-borde)',
  pendiente_replan: 'var(--ambar)',
  atrasada: 'var(--rojo)',
  atrasada_replan: 'var(--morado)',
}
// #279: "Próximo día hábil" va después de "Hoy", como pide el pedido.
const RELATIVAS: FechaRelativa[] = ['hoy', 'proxHabil', 'semana', 'proxima', 'mes']

interface Props {
  /** Contexto de guardado: el id del proyecto, o 'mis-tareas' (los filtros
   *  guardados son privados por usuario Y por contexto; no se mezclan). */
  contexto: string
  /** #289: las vistas de ESTA pantalla, ya filtradas por usuario y contexto.
   *  Vienen del estado cargado (base de datos), no de localStorage. */
  guardados: FiltroGuardado[]
  /** #289: guardar/renombrar/actualizar/eliminar pasan por el repositorio.
   *  La barra ya no persiste nada por su cuenta. */
  onCrearVista: (nombre: string, filtro: Filtro, orden: OrdenMulti) => Promise<string | null>
  onGuardarVista: (id: string, patch: { nombre?: string; filtro?: Filtro; orden?: OrdenMulti }) => void
  onEliminarVista: (id: string) => void
  /** Personas filtrables. Ausente = el campo Responsable no aplica. */
  candidatos?: Usuario[]
  /** Proyectos filtrables. Ausente = el campo Proyecto no aplica. */
  proyectos?: Proyecto[]
  filtro: Filtro
  onCambiar: (f: Filtro) => void
  /** Orden multinivel activo (parte de la vista). */
  orden: OrdenMulti
  onCambiarOrden: (o: OrdenMulti) => void
  /** Campos ordenables de este contexto (proyecto o Mis Tareas). */
  camposOrden: CampoOrdenOpc[]
  /** P4: ¿estamos en la Gantt? Solo ahí se puede ACTIVAR "En horizonte visible". */
  vistaGantt?: boolean
  /** #215: id de la vista guardada en la que se está, o null. */
  vistaActivaId?: string | null
  /** #215: entrar o salir de una vista. Solo lo dispara este desplegable. */
  onVistaActiva?: (id: string | null) => void
  /** P1: la foto quedó desactualizada → mostrar "Actualizar vista". */
  stale?: boolean
  /** P1: recalcula la foto (re-snapshot). */
  onActualizarVista?: () => void
}

export function FiltrosBar({
  contexto,
  guardados,
  onCrearVista,
  onGuardarVista,
  onEliminarVista,
  candidatos,
  proyectos,
  filtro,
  onCambiar,
  orden,
  onCambiarOrden,
  camposOrden,
  vistaGantt = false,
  vistaActivaId = null,
  onVistaActiva,
  stale = false,
  onActualizarVista,
}: Props) {
  const [modal, setModal] = useState<{ tipo: 'guardar' } | { tipo: 'renombrar'; id: string; nombre: string } | null>(null)

  const activo = !filtroVacio(filtro)
  const ordenActivo = orden.length > 0
  // #215: la vista en la que se está y si tiene cambios sin guardar. El
  // asterisco aparece en cuanto filtro u orden dejan de coincidir con lo
  // guardado — cambiarlo y limpiarlo cuentan igual, sin excepciones.
  const vistaActiva = guardados.find((g) => g.id === vistaActivaId)
  const modificada = !!vistaActiva && !coincideConVista(vistaActiva, filtro, orden)
  const etiquetaVistas = vistaActiva
    ? `Vistas · ${vistaActiva.nombre}${modificada ? ' *' : ''}`
    : `Vistas${guardados.length ? ` (${guardados.length})` : ''}`
  const nResp = filtro.responsables?.length ?? 0
  const nEst = filtro.estados?.length ?? 0
  const nProy = filtro.proyectos?.length ?? 0

  // Punto 4 (#111): activación directa. La prioridad = posición en `orden`
  // (0 = prioridad 1). Tocar una dirección activa el campo como PRIORIDAD 1
  // (al frente, el último activado manda); tocar la dirección ya activa lo
  // desactiva y los demás se renumeran solos.
  const prioridadDe = (campo: CampoOrden) => orden.findIndex((r) => r.campo === campo)
  const toggleOrden = (campo: CampoOrden, dir: Direccion) => {
    const actual = orden.find((r) => r.campo === campo)
    if (actual && actual.dir === dir) {
      onCambiarOrden(orden.filter((r) => r.campo !== campo))
    } else {
      onCambiarOrden([{ campo, dir }, ...orden.filter((r) => r.campo !== campo)])
    }
  }

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
  // Punto 5: "Seleccionar todos" en Responsable y Estado (no en Fecha). Con
  // todo seleccionado, alterna a "deseleccionar todos".
  const todosResp = [...(candidatos?.map((u) => u.id) ?? []), RESP_SIN_ASIGNAR]
  const allResp = todosResp.length > 0 && todosResp.every((id) => filtro.responsables?.includes(id))
  const toggleTodosResp = () => onCambiar({ ...filtro, responsables: allResp ? undefined : todosResp })
  // #220: Proyecto tenía selección múltiple pero no el "Seleccionar todos"
  // que sí tienen Responsable y Estado. En Mis Tareas, donde Responsable no
  // aplica, era el único multi-selección sin la opción. Era una omisión.
  const todosProy = proyectos?.map((p) => p.id) ?? []
  const allProy = todosProy.length > 0 && todosProy.every((id) => filtro.proyectos?.includes(id))
  const toggleTodosProy = () => onCambiar({ ...filtro, proyectos: allProy ? undefined : todosProy })
  const allEstados = ESTADOS.every((c) => filtro.estados?.includes(c))
  const toggleTodosEstados = () => onCambiar({ ...filtro, estados: allEstados ? undefined : [...ESTADOS] })
  const toggleProyecto = (id: string) => {
    const set = new Set(filtro.proyectos ?? [])
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onCambiar({ ...filtro, proyectos: set.size ? [...set] : undefined })
  }

  return (
    <div className="filtros-bar">
      <span className="filtros-bar__label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 5h16l-6.5 8v5.2L10.5 20v-7L4 5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        Filtrar
      </span>

      <Desplegable
        etiqueta={
          filtro.fecha
            ? `Fecha: ${etiquetaFecha(filtro.fecha)}${filtro.sinFecha ? ' + sin fecha' : ''}`
            : filtro.conFecha
              ? 'Fecha: Con fecha'
              : filtro.sinFecha
                ? 'Fecha: Sin fecha'
                : 'Fecha'
        }
        activo={!!filtro.fecha || !!filtro.sinFecha || !!filtro.conFecha}
      >
        <div className="filtro-menu__grupo">Relativas (se recalculan)</div>
        {RELATIVAS.map((r) => (
          <button
            key={r}
            className={`filtro-op${filtro.fecha?.tipo === 'relativa' && filtro.fecha.valor === r ? ' filtro-op--on' : ''}`}
            onClick={() =>
              onCambiar({
                ...filtro,
                // #223: elegir cualquier otra opción de fecha apaga "Con fecha".
                conFecha: undefined,
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
              onCambiar({ ...filtro, conFecha: undefined, fecha: desde || hasta ? { tipo: 'rango', desde, hasta } : undefined })
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
              onCambiar({ ...filtro, conFecha: undefined, fecha: desde || hasta ? { tipo: 'rango', desde, hasta } : undefined })
            }}
          />
        </div>
        {/* #223: "Con fecha" — todas las tareas que tienen fecha objetivo, sea
            cual sea. EXCLUYENTE con el resto del campo: se apaga al elegir
            cualquier otra opción de fecha, y al activarla las apaga. */}
        <button
          className={`filtro-op${filtro.conFecha ? ' filtro-op--on' : ''}`}
          onClick={() =>
            onCambiar({
              ...filtro,
              fecha: undefined,
              sinFecha: undefined,
              conFecha: filtro.conFecha ? undefined : true,
            })
          }
        >
          Con fecha
        </button>
        {/* Mismo formato que las demas opciones del campo (punto 1). */}
        <button
          className={`filtro-op${filtro.sinFecha ? ' filtro-op--on' : ''}`}
          onClick={() =>
            onCambiar({ ...filtro, conFecha: undefined, sinFecha: filtro.sinFecha ? undefined : true })
          }
        >
          Sin fecha
        </button>
        {/* P4: "En horizonte visible (Gantt)" — solo en contexto de proyecto
            (no en Mis Tareas, que cruza proyectos y no tiene un horizonte único).
            Solo se ACTIVA desde la Gantt; desde la tabla puede desactivarse si ya
            está activa. Excluyente: reemplaza cualquier otra selección de fecha. */}
        {contexto !== 'mis-tareas' && (
          <button
            className={`filtro-op${filtro.fecha?.tipo === 'horizonte' ? ' filtro-op--on' : ''}`}
            disabled={!vistaGantt && filtro.fecha?.tipo !== 'horizonte'}
            title={
              !vistaGantt && filtro.fecha?.tipo !== 'horizonte'
                ? 'Se activa desde la Gantt'
                : 'Tareas con fecha dentro del horizonte visible de la Gantt, más las sin fecha'
            }
            onClick={() =>
              onCambiar({
                ...filtro,
                sinFecha: undefined,
                conFecha: undefined,
                fecha: filtro.fecha?.tipo === 'horizonte' ? undefined : { tipo: 'horizonte' },
              })
            }
          >
            En horizonte visible (Gantt)
          </button>
        )}
        {(filtro.fecha || filtro.sinFecha || filtro.conFecha) && (
          <button
            className="filtro-op filtro-op--quitar"
            onClick={() => onCambiar({ ...filtro, fecha: undefined, sinFecha: undefined, conFecha: undefined })}
          >
            Limpiar filtro
          </button>
        )}
      </Desplegable>

      {candidatos && (
      <Desplegable etiqueta={nResp ? `Responsable (${nResp})` : 'Responsable'} activo={nResp > 0}>
        {candidatos.map((u) => (
          <label key={u.id} className="filtro-op filtro-op--check">
            <input type="checkbox" checked={filtro.responsables?.includes(u.id) ?? false} onChange={() => toggleResp(u.id)} />
            <Avatar usuario={u} />
            <span>{u.nombre}</span>
          </label>
        ))}
        <label className="filtro-op filtro-op--check">
          <input
            type="checkbox"
            checked={filtro.responsables?.includes(RESP_SIN_ASIGNAR) ?? false}
            onChange={() => toggleResp(RESP_SIN_ASIGNAR)}
          />
          <span className="avatar avatar--sin">?</span>
          <span>Sin asignar</span>
        </label>
        {candidatos.length === 0 && <div className="filtro-menu__vacio">Sin personas en este proyecto.</div>}
        {/* Punto 5: marcar/desmarcar todas las opciones de una vez. */}
        <button className="filtro-op filtro-op--todos" onClick={toggleTodosResp}>
          {allResp ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </button>
        {nResp > 0 && (
          <button
            className="filtro-op filtro-op--quitar"
            onClick={() => onCambiar({ ...filtro, responsables: undefined })}
          >
            Limpiar filtro
          </button>
        )}
      </Desplegable>
      )}

      {proyectos && (
        <Desplegable etiqueta={nProy ? `Proyecto (${nProy})` : 'Proyecto'} activo={nProy > 0}>
          {proyectos.map((p) => (
            <label key={p.id} className="filtro-op filtro-op--check">
              <input
                type="checkbox"
                checked={filtro.proyectos?.includes(p.id) ?? false}
                onChange={() => toggleProyecto(p.id)}
              />
              <span className="filtro-dot" style={{ background: p.color ?? '#607d8b' }} />
              <span>{p.nombre}</span>
            </label>
          ))}
          {proyectos.length === 0 && <div className="filtro-menu__vacio">Sin proyectos.</div>}
          {/* #220: mismo control, mismo aspecto y mismo lugar que en los otros. */}
          <button className="filtro-op filtro-op--todos" onClick={toggleTodosProy}>
            {allProy ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
          {nProy > 0 && (
            <button
              className="filtro-op filtro-op--quitar"
              onClick={() => onCambiar({ ...filtro, proyectos: undefined })}
            >
              Limpiar filtro
            </button>
          )}
        </Desplegable>
      )}

      <Desplegable etiqueta={nEst ? `Estado (${nEst})` : 'Estado'} activo={nEst > 0}>
        {ESTADOS.map((c) => (
          <label key={c} className="filtro-op filtro-op--check">
            <input type="checkbox" checked={filtro.estados?.includes(c) ?? false} onChange={() => toggleEstado(c)} />
            <span className="filtro-dot" style={{ background: ESTADO_COLOR[c] }} />
            <span>{CATEGORIA_LABEL[c]}</span>
          </label>
        ))}
        {/* Punto 5: marcar/desmarcar todos los estados de una vez. */}
        <button className="filtro-op filtro-op--todos" onClick={toggleTodosEstados}>
          {allEstados ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </button>
        {nEst > 0 && (
          <button
            className="filtro-op filtro-op--quitar"
            onClick={() => onCambiar({ ...filtro, estados: undefined })}
          >
            Limpiar filtro
          </button>
        )}
      </Desplegable>

      {activo && (
        <button className="link-btn filtros-bar__limpiar" onClick={() => onCambiar({})}>
          Limpiar filtros
        </button>
      )}

      <span className="filtros-bar__sep" />

      {/* Punto 4 (#111): menu "Ordenar" junto a Filtrar. Los campos estan a la
          vista; tocar una direccion (↑/↓) activa/desactiva ese campo. El
          numero muestra su prioridad (el ultimo activado manda). */}
      <span className="filtros-bar__label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 4v16M7 20l-3-3M7 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 6h7M13 11h5M13 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Ordenar
      </span>

      <Desplegable etiqueta={ordenActivo ? `Orden (${orden.length})` : 'Ordenar'} activo={ordenActivo}>
        {camposOrden.map((c) => {
          const prio = prioridadDe(c.campo)
          const regla = prio >= 0 ? orden[prio] : null
          return (
            <div key={c.campo} className={`orden-campo${regla ? ' orden-campo--activo' : ''}`}>
              <span className="orden-campo__prio">{prio >= 0 ? prio + 1 : ''}</span>
              <span className="orden-campo__label">{c.label}</span>
              <button
                className={`orden-campo__dir${regla?.dir === 1 ? ' orden-campo__dir--on' : ''}`}
                aria-label={`Ordenar ${c.label} ascendente`}
                aria-pressed={regla?.dir === 1}
                title="Ascendente"
                onClick={() => toggleOrden(c.campo, 1)}
              >
                ↑
              </button>
              <button
                className={`orden-campo__dir${regla?.dir === -1 ? ' orden-campo__dir--on' : ''}`}
                aria-label={`Ordenar ${c.label} descendente`}
                aria-pressed={regla?.dir === -1}
                title="Descendente"
                onClick={() => toggleOrden(c.campo, -1)}
              >
                ↓
              </button>
            </div>
          )
        })}
      </Desplegable>

      {/* "Limpiar orden" vive FUERA del menu (junto al boton), como el de filtros. */}
      {ordenActivo && (
        <button className="link-btn filtros-bar__limpiar" onClick={() => onCambiarOrden([])}>
          Limpiar orden
        </button>
      )}

      <span className="filtros-bar__sep" />

      {/* P1: aparece solo cuando la foto quedó desactualizada por una edición;
          recalcula la vista (saca lo que ya no calza, reordena) y desaparece. */}
      {stale && onActualizarVista && (
        <button
          className="filtro-btn filtro-btn--actualizar"
          title="La vista quedó desactualizada por una edición: recalcular filtro y orden"
          onClick={onActualizarVista}
        >
          ↻ Actualizar vista
        </button>
      )}

      <Desplegable etiqueta={etiquetaVistas} activo={!!vistaActiva} alDerecha>
        {guardados.length === 0 && <div className="filtro-menu__vacio">Aún no guardas vistas en este proyecto.</div>}
        {guardados.map((g) => {
          const esActiva = g.id === vistaActivaId
          return (
          <div key={g.id} className={`filtro-guardado${esActiva ? ' filtro-guardado--activa' : ''}`}>
            <button
              className="filtro-guardado__aplicar"
              // #215: la activa se ve marcada, y tocarla la DESMARCA — es la
              // forma de quedar sin vista. Entrar y salir de una vista pasa
              // solo por aquí.
              title={esActiva ? 'Salir de esta vista (queda todo limpio)' : 'Aplicar esta vista (filtro + orden)'}
              onClick={() => {
                if (esActiva) {
                  onCambiar({})
                  onCambiarOrden([])
                  onVistaActiva?.(null)
                } else {
                  onCambiar(g.filtro)
                  onCambiarOrden(g.orden ?? [])
                  onVistaActiva?.(g.id)
                }
              }}
            >
              <span className="filtro-guardado__marca" aria-hidden="true">{esActiva ? '✓' : ''}</span>
              {g.nombre}
              {esActiva && modificada && <span className="filtro-guardado__mod" title="Con cambios sin guardar"> *</span>}
            </button>
            {/* #160/#175: tooltip rápido (data-tip, misma inmediatez que el
                resto de la app). El menú de Vistas no recorta el globo porque
                usa overflow visible (.filtro-menu--derecha). */}
            <button
              className="icon-btn"
              data-tip="Actualizar con el filtro y orden actuales"
              aria-label={`Actualizar ${g.nombre}`}
              disabled={!activo && !ordenActivo}
              onClick={() => onGuardarVista(g.id, { filtro, orden })}
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
              onClick={() => {
                // #141: confirmar antes de borrar una vista guardada.
                if (confirm(`¿Eliminar la vista guardada "${g.nombre}"?`)) {
                  onEliminarVista(g.id)
                  // #215: si se borra la que estaba activa, los filtros se
                  // quedan tal cual —nadie pidió cambiarlos— pero pasan a ser
                  // temporales: al salir y volver se entra limpio.
                  if (esActiva) onVistaActiva?.(null)
                }
              }}
            >
              🗑
            </button>
          </div>
          )
        })}
      </Desplegable>

      <button
        className="filtro-btn filtro-btn--guardar"
        disabled={!activo && !ordenActivo}
        title={
          activo || ordenActivo
            ? 'Guardar la vista actual (filtro + orden) con un nombre'
            : 'Arma un filtro u orden para poder guardar la vista'
        }
        onClick={() => setModal({ tipo: 'guardar' })}
      >
        + Guardar vista
      </button>

      {modal?.tipo === 'guardar' && (
        <TextPromptModal
          titulo="Guardar vista"
          label='Nombre (ej. "Mis atrasadas", "Por estado y fecha")'
          textoBoton="Guardar"
          onSubmit={(nombre) => {
            // #215: guardar una vista nueva te deja DENTRO de ella. Es el acto
            // deliberado de "esto quiero que quede"; quedar fuera de lo que
            // acabas de guardar sería desconcertante.
            // #289: el id lo asigna la base; se entra a la vista recién
            // creada solo si el guardado salió bien.
            void onCrearVista(nombre, filtro, orden).then((id) => {
              if (id) onVistaActiva?.(id)
            })
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'renombrar' && (
        <TextPromptModal
          titulo="Renombrar filtro"
          label="Nuevo nombre"
          valorInicial={modal.nombre}
          onSubmit={(nombre) => onGuardarVista(modal.id, { nombre })}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

/** Boton + panel desplegable con cierre por click afuera o Escape. */
// #310 — Colocación de los menús flotantes de la barra de filtros.
//
// `MARGEN` es el aire mínimo contra cualquier borde de la pantalla: era el
// valor que los menús anclados por la derecha usaban contra SU propio borde, y
// ahora rige los cuatro. Ninguno de los dos anclajes miraba el borde opuesto:
// los de la izquierda se salían por la derecha, y los de la derecha por la
// izquierda en cuanto la pantalla se angostaba. `ANCHO_MINIMO` es el del CSS (`.filtro-menu`), y solo se usa
// como suposición en la primera colocación, antes de poder medir el menú real.
// `ALTO_MINIMO` evita que un botón muy abajo deje el menú aplastado a cero.
const MARGEN = 8
const ANCHO_MINIMO = 244
const ALTO_MINIMO = 120

interface Posicion {
  top: number
  left?: number
  right?: number
  anchoMaximo: number
  altoMaximo: number
}

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
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // P3: el menú se renderiza en un PORTAL con position: fixed anclado al botón,
  // para que NUNCA lo recorte el overflow del contenedor (p. ej. la tabla corta
  // de Mis Tareas). Se reposiciona al hacer scroll o resize mientras está abierto.
  const [pos, setPos] = useState<Posicion | null>(null)
  // #310: `false` mientras el menú no se haya medido. Gobierna la primera
  // pasada —la que solo sirve para medir— y evita que la segunda se repita.
  const medido = useRef(false)

  const recolocar = () => {
    const b = btnRef.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const top = r.bottom + 6
    // #310 · A LO ALTO: el alto disponible se mide DESDE donde queda el menú
    // hasta el borde inferior. El tope anterior era una fracción de la pantalla
    // COMPLETA y no descontaba lo que el botón ya había bajado: con la barra de
    // filtros en la mitad de abajo, el menú se pasaba por el borde inferior.
    const altoMaximo = Math.max(ALTO_MINIMO, window.innerHeight - top - MARGEN)
    // #310 · A LO ANCHO: si ni corriéndose entra, que se angoste.
    const anchoMaximo = window.innerWidth - MARGEN * 2

    // #310 — Por qué hay DOS pasadas y por qué la primera no coloca de verdad.
    //
    // El menú no tiene ancho fijo: se ajusta a su contenido, acotado por el
    // espacio que le queda desde su anclaje hasta el borde de la pantalla. Eso
    // significa que su ancho DEPENDE de dónde se lo coloque — y para colocarlo
    // bien hace falta saber su ancho. Medirlo después de colocarlo se muerde
    // la cola: la primera versión de este arreglo lo hacía así y "Vistas"
    // quedaba pegado al borde, sin margen.
    //
    // Se corta midiendo en un sitio que NO le recorta el ancho: contra el
    // borde izquierdo, donde el espacio disponible siempre supera el ancho
    // máximo. Lo que se mide ahí es el ancho natural, y ya no cambia al
    // llevarlo a su lugar — porque las dos ramas de abajo dejan siempre al
    // menos `ancho` de espacio.
    //
    // Las dos pasadas ocurren antes de pintar (`useLayoutEffect`), así que no
    // se ve ningún salto.
    if (!medido.current) {
      setPos({ top, left: MARGEN, anchoMaximo, altoMaximo })
      return
    }
    const ancho = Math.min(menuRef.current?.offsetWidth || ANCHO_MINIMO, anchoMaximo)

    if (alDerecha) {
      // #310: este lado respetaba el borde DERECHO —el de su propio anclaje—,
      // nunca el izquierdo. Con la pantalla angosta el menú se pasaba por la
      // izquierda: medido, "Vistas" a 320px quedaba en -163.7.
      //
      // La distancia al borde derecho no puede ser tan grande que el borde
      // izquierdo se salga: ese es el tope de abajo.
      const distanciaMaxima = Math.max(MARGEN, window.innerWidth - MARGEN - ancho)
      const right = Math.min(Math.max(MARGEN, window.innerWidth - r.right), distanciaMaxima)
      setPos({ top, right, anchoMaximo, altoMaximo })
      return
    }
    // #310: los anclados por la IZQUIERDA copiaban el borde del botón sin
    // comprobar nada, así que cualquier botón pasada la mitad de la pantalla
    // empujaba el menú fuera.
    //
    // Con espacio de sobra el `Math.min` devuelve `r.left`, así que en
    // escritorio el menú queda exactamente donde quedaba.
    const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - MARGEN - ancho))
    setPos({ top, left, anchoMaximo, altoMaximo })
  }

  useLayoutEffect(() => {
    if (abierto) {
      medido.current = false
      recolocar()
    } else {
      setPos(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  // Segunda pasada, una sola vez por apertura: el menú ya está montado y en el
  // sitio donde nada le recorta el ancho, así que ahora se mide y se coloca
  // definitivamente. La bandera corta la cadena — sin ella cada `setPos`
  // volvería a disparar este efecto.
  useLayoutEffect(() => {
    if (!abierto || !pos || medido.current) return
    medido.current = true
    recolocar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pos])

  useEffect(() => {
    if (!abierto) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setAbierto(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    const onMover = () => recolocar()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // capture: atrapa el scroll de cualquier contenedor, no solo el de la ventana.
    window.addEventListener('scroll', onMover, true)
    window.addEventListener('resize', onMover)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMover, true)
      window.removeEventListener('resize', onMover)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  return (
    <div className="filtro-desplegable">
      <button
        ref={btnRef}
        className={`filtro-btn${activo ? ' filtro-btn--activo' : ''}${abierto ? ' filtro-btn--abierto' : ''}`}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {etiqueta} <span className="filtro-btn__caret">▾</span>
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={`filtro-menu filtro-menu--portal${alDerecha ? ' filtro-menu--derecha' : ''}`}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              right: pos.right,
              maxWidth: pos.anchoMaximo,
              maxHeight: pos.altoMaximo,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  )
}
