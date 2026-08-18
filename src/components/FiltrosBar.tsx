import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Proyecto, Usuario } from '../types'
import { CATEGORIA_LABEL, type Categoria } from '../lib/derive'
import {
  FECHA_RELATIVA_LABEL,
  RESP_SIN_ASIGNAR,
  cuentaFiltro,
  etiquetaCampoFecha,
  filtroVacio,
  type FechaRelativa,
  type Filtro,
  type FiltroGuardado,
} from '../lib/filtros'
import type { CampoOrden, CampoOrdenOpc, Direccion, OrdenMulti } from '../lib/orden'
import { coincideConVista } from '../lib/vistas'
import { TextPromptModal } from './TextPromptModal'
import { Avatar } from './RespPicker'

// Barra de controles (#305). Cuatro controles, siempre los mismos y siempre en
// el mismo lugar: `Filtrar · Ordenar · Rango` a la izquierda y `Vistas` a la
// derecha, más "Actualizar vista" pegado al extremo derecho — el único que
// aparece y desaparece, a propósito.
//
// Antes eran diez elementos sueltos (un botón por campo de filtro, otro por
// "limpiar" de cada cosa, "Guardar vista") que crecían y partían la barra en
// dos líneas. Ahora los campos de filtro viven DENTRO de "Filtrar", a dos
// niveles; los "limpiar" son la × de cada control; y "Guardar vista" se mudó
// adentro del menú de Vistas. El horizonte de la Gantt —que era una franja
// propia sobre la grilla, con el aviso de fin de semana que aparecía y
// desaparecía— es ahora el control "Rango".
//
// Filtro y orden se guardan juntos como una sola "vista", privada por usuario
// y por proyecto (en la base desde #289).

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

/** Campos que viven dentro del panel de "Filtrar". */
type CampoFiltro = 'fecha' | 'responsable' | 'proyecto' | 'estado'

/**
 * #305 — El control "Rango": los días y el horizonte de la Gantt. El estado
 * vive arriba (en la pantalla) porque lo comparten la barra, que lo elige, y
 * la grilla, que lo usa. Ausente = vista tabla, donde este control no existe.
 */
export interface RangoProps {
  /** §6.3.19: lunes a viernes (por defecto) o los siete días. */
  soloHabiles: boolean
  onSoloHabiles: (v: boolean) => void
  modo: 'hoy' | 'todo'
  onModo: (m: 'hoy' | 'todo') => void
  /** §6.3.20: tareas con fecha de fin de semana que "días hábiles" esconde. */
  ocultasFinde: number
  /** "Todo el proyecto" o, en Mis Tareas, "Todas mis tareas". */
  etiquetaTodo: string
}

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
  /** #305: presente solo en Gantt — agrega el control "Rango". */
  rango?: RangoProps
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
  rango,
  vistaActivaId = null,
  onVistaActiva,
  stale = false,
  onActualizarVista,
}: Props) {
  const [modal, setModal] = useState<{ tipo: 'guardar' } | { tipo: 'renombrar'; id: string; nombre: string } | null>(null)
  // #305: en qué campo está parado el panel de Filtrar. `null` = primer nivel
  // (fichas de lo aplicado + lista de campos). Se reinicia al cerrar el menú:
  // volver a abrirlo siempre empieza por el principio.
  const [campo, setCampo] = useState<CampoFiltro | null>(null)

  const activo = !filtroVacio(filtro)
  const ordenActivo = orden.length > 0
  const cuenta = cuentaFiltro(filtro)
  // #215: la vista en la que se está y si tiene cambios sin guardar. El
  // asterisco aparece en cuanto filtro u orden dejan de coincidir con lo
  // guardado — cambiarlo y limpiarlo cuentan igual, sin excepciones.
  const vistaActiva = guardados.find((g) => g.id === vistaActivaId)
  const modificada = !!vistaActiva && !coincideConVista(vistaActiva, filtro, orden)
  // #305: el nombre del control no cambia nunca ("Vistas"); lo que varía es el
  // sufijo, con las mismas cuatro formas de siempre.
  const sufijoVistas = vistaActiva
    ? ` · ${vistaActiva.nombre}${modificada ? ' *' : ''}`
    : guardados.length
      ? ` (${guardados.length})`
      : ''

  // #215: salir de la vista activa deja todo limpio. Es lo mismo que hace
  // tocar la vista marcada dentro del menú; la × solo lo pone a la vista.
  const salirDeVista = () => {
    onCambiar({})
    onCambiarOrden([])
    onVistaActiva?.(null)
  }

  // Punto 4 (#111): activación directa. La prioridad = posición en `orden`
  // (0 = prioridad 1). Tocar una dirección activa el campo como PRIORIDAD 1
  // (al frente, el último activado manda); tocar la dirección ya activa lo
  // desactiva y los demás se renumeran solos.
  const prioridadDe = (c: CampoOrden) => orden.findIndex((r) => r.campo === c)
  const toggleOrden = (c: CampoOrden, dir: Direccion) => {
    const actual = orden.find((r) => r.campo === c)
    if (actual && actual.dir === dir) {
      onCambiarOrden(orden.filter((r) => r.campo !== c))
    } else {
      onCambiarOrden([{ campo: c, dir }, ...orden.filter((r) => r.campo !== c)])
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

  const limpiarFecha = () => onCambiar({ ...filtro, fecha: undefined, sinFecha: undefined, conFecha: undefined })

  // #305 — Campos del panel de Filtrar. Cada uno sabe cuántos valores tiene y
  // cómo limpiarse entero: eso es exactamente lo que necesita su ficha.
  const campos: { clave: CampoFiltro; nombre: string; n: number; texto: string; limpiar: () => void }[] = [
    { clave: 'fecha', nombre: 'Fecha', n: cuenta.fecha, texto: etiquetaCampoFecha(filtro), limpiar: limpiarFecha },
    ...(candidatos
      ? [
          {
            clave: 'responsable' as const,
            nombre: 'Responsable',
            n: cuenta.responsables,
            texto: String(cuenta.responsables),
            limpiar: () => onCambiar({ ...filtro, responsables: undefined }),
          },
        ]
      : []),
    ...(proyectos
      ? [
          {
            clave: 'proyecto' as const,
            nombre: 'Proyecto',
            n: cuenta.proyectos,
            texto: String(cuenta.proyectos),
            limpiar: () => onCambiar({ ...filtro, proyectos: undefined }),
          },
        ]
      : []),
    {
      clave: 'estado',
      nombre: 'Estado',
      n: cuenta.estados,
      texto: String(cuenta.estados),
      limpiar: () => onCambiar({ ...filtro, estados: undefined }),
    },
  ]
  const campoActual = campos.find((c) => c.clave === campo) ?? null

  // #305: el horizonte tiene un tercer estado que no se elige, se impone —
  // mientras hay filtro de fecha, ese filtro define el horizonte (#250). "En
  // horizonte visible" es la excepción: DERIVA su rango del horizonte, así que
  // deja el grupo elegible.
  const horizonteImpuesto = !!filtro.fecha && filtro.fecha.tipo !== 'horizonte'

  return (
    <div className="controles-bar">
      <Control
        nombre="Filtrar"
        icono={<IconoFiltrar />}
        contador={cuenta.total}
        onLimpiar={activo ? () => onCambiar({}) : undefined}
        tituloLimpiar="Limpiar todos los filtros"
        onAbierto={(v) => { if (!v) setCampo(null) }}
        medirClave={campo}
      >
        {campoActual ? (
          <>
            {/* Segundo nivel: las opciones del campo, con la vuelta arriba. */}
            <button className="filtro-volver" onClick={() => setCampo(null)}>
              ‹ Filtrar
            </button>
            <div className="filtro-menu__grupo">{campoActual.nombre}</div>
            {campo === 'fecha' && <OpcionesFecha
              contexto={contexto}
              filtro={filtro}
              onCambiar={onCambiar}
              vistaGantt={vistaGantt}
            />}
            {campo === 'responsable' && candidatos && (
              <>
                {candidatos.map((u) => (
                  <label key={u.id} className="filtro-op filtro-op--check">
                    <input
                      type="checkbox"
                      checked={filtro.responsables?.includes(u.id) ?? false}
                      onChange={() => toggleResp(u.id)}
                    />
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
              </>
            )}
            {campo === 'proyecto' && proyectos && (
              <>
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
              </>
            )}
            {campo === 'estado' && (
              <>
                {ESTADOS.map((c) => (
                  <label key={c} className="filtro-op filtro-op--check">
                    <input
                      type="checkbox"
                      checked={filtro.estados?.includes(c) ?? false}
                      onChange={() => toggleEstado(c)}
                    />
                    <span className="filtro-dot" style={{ background: ESTADO_COLOR[c] }} />
                    <span>{CATEGORIA_LABEL[c]}</span>
                  </label>
                ))}
                {/* Punto 5: marcar/desmarcar todos los estados de una vez. */}
                <button className="filtro-op filtro-op--todos" onClick={toggleTodosEstados}>
                  {allEstados ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            {/* #305: primer nivel. Lo aplicado se ve como FICHAS: una por campo,
                no por valor — con cuatro estados elegidos hay una sola ficha,
                "Estado: 4", y su × borra los cuatro. Para sacar un valor suelto
                se entra al campo y se destilda. Esa × reemplaza a los "Limpiar
                filtro" que antes vivían dentro de cada campo. */}
            {cuenta.total > 0 && (
              <>
                <div className="filtro-menu__grupo">Aplicado</div>
                <div className="filtro-fichas">
                  {campos
                    .filter((c) => c.n > 0)
                    .map((c) => (
                      <span key={c.clave} className="filtro-ficha">
                        <button
                          className="filtro-ficha__ir"
                          title={`Ver las opciones de ${c.nombre}`}
                          onClick={() => setCampo(c.clave)}
                        >
                          {c.nombre}: {c.texto}
                        </button>
                        <button
                          className="filtro-ficha__x"
                          aria-label={`Limpiar ${c.nombre}`}
                          title={`Limpiar ${c.nombre}`}
                          onClick={c.limpiar}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              </>
            )}
            <div className="filtro-menu__grupo">Campos</div>
            {campos.map((c) => (
              <button key={c.clave} className="filtro-op filtro-op--campo" onClick={() => setCampo(c.clave)}>
                <span className="filtro-op__nombre">{c.nombre}</span>
                {c.n > 0 && <span className="filtro-op__n">{c.n}</span>}
                <span className="filtro-op__flecha" aria-hidden="true">›</span>
              </button>
            ))}
          </>
        )}
      </Control>

      {/* Punto 4 (#111): los campos estan a la vista; tocar una direccion (↑/↓)
          activa/desactiva ese campo. El numero muestra su prioridad (el ultimo
          activado manda). #305: la × reemplaza al "Limpiar orden" suelto. */}
      <Control
        nombre="Ordenar"
        icono={<IconoOrdenar />}
        contador={orden.length}
        onLimpiar={ordenActivo ? () => onCambiarOrden([]) : undefined}
        tituloLimpiar="Limpiar el orden"
      >
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
      </Control>

      {/* #305 — "Rango": los días de la grilla y su horizonte. Sin contador ni
          ×: sus opciones siempre tienen valor, no hay nada que contar ni que
          quitar. Solo existe en Gantt. */}
      {rango && (
        <Control
          nombre="Rango"
          icono={<IconoRango />}
          punto={rango.ocultasFinde > 0}
          tituloPunto={`${rango.ocultasFinde} tarea${rango.ocultasFinde === 1 ? '' : 's'} escondida${rango.ocultasFinde === 1 ? '' : 's'}`}
          medirClave={`${rango.soloHabiles}|${horizonteImpuesto}|${rango.ocultasFinde}`}
        >
          <div className="filtro-menu__grupo">Días</div>
          <button
            className={`filtro-op${rango.soloHabiles ? ' filtro-op--on' : ''}`}
            onClick={() => rango.onSoloHabiles(true)}
          >
            Días hábiles
          </button>
          <button
            className={`filtro-op${!rango.soloHabiles ? ' filtro-op--on' : ''}`}
            onClick={() => rango.onSoloHabiles(false)}
          >
            Semana completa
          </button>
          {/* §6.3.20: el detalle del aviso. Antes era una franja entera sobre la
              grilla que aparecía y desaparecía según el proyecto, moviendo todo
              lo de abajo; ahora vive acá y afuera solo queda el círculo. */}
          {rango.ocultasFinde > 0 && (
            <div className="filtro-menu__nota filtro-menu__nota--aviso">
              <span className="controles-punto" aria-hidden="true" />
              {rango.ocultasFinde} tarea{rango.ocultasFinde === 1 ? '' : 's'} con fecha de fin de semana no se{' '}
              {rango.ocultasFinde === 1 ? 'muestra' : 'muestran'}.
            </div>
          )}

          <div className="filtro-menu__grupo">Horizonte</div>
          <button
            className={`filtro-op${!horizonteImpuesto && rango.modo === 'hoy' ? ' filtro-op--on' : ''}`}
            disabled={horizonteImpuesto}
            title="2 semanas atrás + semana actual + 2 adelante, fijo"
            onClick={() => rango.onModo('hoy')}
          >
            Alrededor de hoy
          </button>
          <button
            className={`filtro-op${!horizonteImpuesto && rango.modo === 'todo' ? ' filtro-op--on' : ''}`}
            disabled={horizonteImpuesto}
            title="De la primera a la última tarea"
            onClick={() => rango.onModo('todo')}
          >
            {rango.etiquetaTodo}
          </button>
          {horizonteImpuesto && (
            <div className="filtro-menu__nota">
              Definido por el filtro de fecha. Quítalo para volver a elegir el horizonte.
            </div>
          )}
        </Control>
      )}

      <span className="controles-bar__sep" />

      <Control
        nombre="Vistas"
        sufijo={sufijoVistas}
        icono={<IconoVistas />}
        onLimpiar={vistaActiva ? salirDeVista : undefined}
        tituloLimpiar="Salir de esta vista (queda todo limpio)"
        alDerecha
        clase="controles-ctrl--vistas"
        medirClave={guardados.length}
      >
        {(cerrar) => (
          <>
            {/* #305: "Guardar vista" dejó de ser un botón permanente en la
                barra y vive acá, con el mismo aviso cuando no hay nada que
                guardar. */}
            <button
              className="filtro-op filtro-op--guardar"
              disabled={!activo && !ordenActivo}
              title={
                activo || ordenActivo
                  ? 'Guardar la vista actual (filtro + orden) con un nombre'
                  : 'Arma un filtro u orden para poder guardar la vista'
              }
              onClick={() => {
                cerrar()
                setModal({ tipo: 'guardar' })
              }}
            >
              + Guardar vista
            </button>
            <div className="filtro-menu__grupo">Guardadas</div>
            {guardados.length === 0 && <div className="filtro-menu__vacio">Aún no guardas vistas en este proyecto.</div>}
            {guardados.map((g) => {
              const esActiva = g.id === vistaActivaId
              return (
                <div key={g.id} className={`filtro-guardado${esActiva ? ' filtro-guardado--activa' : ''}`}>
                  <button
                    className="filtro-guardado__aplicar"
                    // #215: la activa se ve marcada, y tocarla la DESMARCA — es la
                    // forma de quedar sin vista. Entrar y salir de una vista pasa
                    // por aquí y por la × del botón.
                    title={esActiva ? 'Salir de esta vista (queda todo limpio)' : 'Aplicar esta vista (filtro + orden)'}
                    onClick={() => {
                      if (esActiva) {
                        salirDeVista()
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
                    onClick={() => {
                      cerrar()
                      setModal({ tipo: 'renombrar', id: g.id, nombre: g.nombre })
                    }}
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
          </>
        )}
      </Control>

      {/* P1: aparece solo cuando la foto quedó desactualizada por una edición;
          recalcula la vista (saca lo que ya no calza, reordena) y desaparece.
          #305: es el ÚNICO elemento de la barra que aparece y desaparece, y va
          pegado al extremo derecho — avisa de algo que acaba de pasar. */}
      {stale && onActualizarVista && (
        <button
          className="controles-btn controles-btn--actualizar"
          title="La vista quedó desactualizada por una edición: recalcular filtro y orden"
          onClick={onActualizarVista}
        >
          ↻ <span className="controles-btn__nombre">Actualizar vista</span>
        </button>
      )}

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

/**
 * El campo Fecha, el más profundo del panel: relativas, rango fijo con dos
 * calendarios, "Con fecha", "Sin fecha" y "En horizonte visible (Gantt)".
 * #305 lo bajó un nivel (vive dentro de Filtrar) SIN tocar ninguna de sus
 * opciones ni sus reglas de exclusión entre sí.
 */
function OpcionesFecha({
  contexto,
  filtro,
  onCambiar,
  vistaGantt,
}: {
  contexto: string
  filtro: Filtro
  onCambiar: (f: Filtro) => void
  vistaGantt: boolean
}) {
  return (
    <>
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
        onClick={() => onCambiar({ ...filtro, conFecha: undefined, sinFecha: filtro.sinFecha ? undefined : true })}
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
    </>
  )
}

// ---------------------------------------------------------------------------
// Control de la barra: pastilla (ícono + nombre + contador o círculo) + su ×
// opcional + el panel desplegable.
// ---------------------------------------------------------------------------

// #310 — Colocación de los menús flotantes.
//
// `MARGEN` es el aire mínimo contra cualquier borde de la pantalla: era el
// valor que los menús anclados por la derecha usaban contra SU propio borde, y
// ahora rige los cuatro. Ninguno de los dos anclajes miraba el borde opuesto:
// los de la izquierda se salían por la derecha, y los de la derecha por la
// izquierda en cuanto la pantalla se angostaba. `ANCHO_MINIMO` es el del CSS
// (`.filtro-menu`), y solo se usa como suposición en la primera colocación,
// antes de poder medir el menú real. `ALTO_MINIMO` evita que un botón muy abajo
// deje el menú aplastado a cero.
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

function Control({
  nombre,
  sufijo = '',
  icono,
  contador,
  onLimpiar,
  tituloLimpiar,
  punto,
  tituloPunto,
  alDerecha,
  clase = '',
  medirClave,
  onAbierto,
  children,
}: {
  nombre: string
  /** Texto variable a la derecha del nombre (Vistas: " · Atrasadas *"). */
  sufijo?: string
  icono: ReactNode
  /** Cantidad de valores puestos. `undefined` = este control no cuenta nada. */
  contador?: number
  /** Presente = el control muestra su ×, que limpia lo suyo. */
  onLimpiar?: () => void
  tituloLimpiar?: string
  /**
   * #305 — El círculo significa UNA sola cosa: hay tareas ocultas. No debe
   * reutilizarse para ningún otro aviso, ni en Rango ni en otro control: si
   * dice dos cosas deja de decir "hay tareas escondidas" y pasa a decir "mira
   * acá", que es mucho menos.
   */
  punto?: boolean
  tituloPunto?: string
  alDerecha?: boolean
  clase?: string
  /** Cambia cuando el CONTENIDO del menú cambia de tamaño: re-mide y recoloca. */
  medirClave?: unknown
  /** Se abrió o se cerró el menú (Filtrar lo usa para volver al primer nivel). */
  onAbierto?: (abierto: boolean) => void
  children: ReactNode | ((cerrar: () => void) => ReactNode)
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
    onAbierto?.(abierto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  // #305: los menús ahora cambian de contenido sin cerrarse (Filtrar entra y
  // sale de un campo; Rango cambia de aviso). Un contenido nuevo tiene otro
  // ancho, así que hay que volver a medir desde cero: si no, se recolocaría con
  // el ancho viejo y podría quedar fuera de la pantalla.
  useLayoutEffect(() => {
    if (!abierto) return
    medido.current = false
    recolocar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medirClave])

  // Segunda pasada, una sola vez por medición: el menú ya está montado y en el
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

  const hayContador = contador !== undefined && contador > 0
  // La pastilla se ve encendida cuando tiene algo puesto, que es exactamente
  // cuando ofrece su × para quitarlo. "Rango" nunca se enciende: sus opciones
  // siempre tienen valor, y su único aviso es el círculo.
  const encendido = !!onLimpiar

  return (
    <div className={`controles-ctrl${onLimpiar ? ' controles-ctrl--conx' : ''} ${clase}`.trimEnd()}>
      <button
        ref={btnRef}
        className={`controles-btn${encendido ? ' controles-btn--activo' : ''}${abierto ? ' controles-btn--abierto' : ''}`}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="controles-btn__icono" aria-hidden="true">{icono}</span>
        <span className="controles-btn__nombre">
          {nombre}
          {sufijo}
        </span>
        {hayContador && <span className="controles-btn__n">{contador}</span>}
        {punto && <span className="controles-punto" title={tituloPunto} aria-label={tituloPunto} />}
        <span className="controles-btn__caret" aria-hidden="true">▾</span>
      </button>
      {onLimpiar && (
        <button className="controles-x" aria-label={tituloLimpiar ?? `Limpiar ${nombre}`} title={tituloLimpiar} onClick={onLimpiar}>
          ✕
        </button>
      )}
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
            {typeof children === 'function' ? children(() => setAbierto(false)) : children}
          </div>,
          document.body,
        )}
    </div>
  )
}

// -- Íconos de los cuatro controles (todos con el mismo peso visual) --------

function IconoFiltrar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M4 5h16l-6.5 8v5.2L10.5 20v-7L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function IconoOrdenar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M7 4v16M7 20l-3-3M7 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6h7M13 11h5M13 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconoRango() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconoVistas() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
