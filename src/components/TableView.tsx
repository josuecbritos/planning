import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ordenarMulti, valorOrden, type ClaveOrden, type OrdenMulti } from '../lib/orden'
import { MenuTarea, opcionesDeTarea, useMenuTarea } from './MenuTarea'
import { abrirHueco } from '../lib/crear'
import { referenciaEnFoto, useVistaCongelada } from '../lib/vistaCongelada'
import { enMitadSuperior, useArrastreTareas, type DndTareas } from '../lib/arrastre'
import { planMoverTarea } from '../lib/mover'
import type { AppState, Frente, SubFrente, Tarea, Usuario } from '../types'
import type { Actions, FrenteSel } from '../App'
import { MOTIVO_FECHA_HECHA, miembrosDeProyecto, puedeEditarFecha, responsableDeTarea, type Can } from '../lib/permisos'
import { CATEGORIA_LABEL, categoriaDe, colorTarea, esAtrasada, nReplanificaciones, textoAtraso } from '../lib/derive'
import { filtroVacio, pasaFiltroCompleto, type Filtro } from '../lib/filtros'
import { formatoFecha } from '../lib/dates'
import { EmptyFrentes } from './EmptyFrentes'
import { HoverCard } from './HoverCard'
import { TaskDetail } from './TaskDetail'
import { InlineText } from './InlineText'
import { FechaEditable } from './FechaEditable'
import { Avatar, RespPicker } from './RespPicker'
import { CheckHecha } from './CheckHecha'

// Vista Tabla tipo Monday (4.2 / 7.2) con interaccion inline (Bloque 2):
// crear y editar pasa en la fila, sin formularios ni ventanas emergentes.

interface Props {
  state: AppState
  proyectoId: string
  frenteSel: FrenteSel
  hoy: string
  /** Permisos del usuario actual (§7): gobiernan cada control de la vista. */
  can: Can
  /** Filtro activo (punto 3): en la tabla filtran los tres campos. */
  filtro: Filtro
  /** Orden multinivel activo (punto 4): parte de la vista, por proyecto. */
  orden: OrdenMulti
  /** P1: nonce que fuerza el re-snapshot de la vista congelada ("Actualizar"). */
  snapshotNonce: number
  /** P1: informa si la foto quedó desactualizada (para "Actualizar vista"). */
  onStale: (stale: boolean) => void
  actions: Actions
  /** Abre el panel lateral de detalle (7.2). */
  onAbrirTarea: (tareaId: string) => void
  /** #137: tarea a resaltar al llegar desde una notificación (scroll + realce). */
  resaltarTareaId?: string | null
  /** #253: ids recién creados en esta sesión de trabajo. Se muestran aunque la
   *  foto congelada o el filtro los dejen fuera (sin reordenar el resto). */
  tareasNuevas?: string[]
  /** #219: sube en cada llegada desde una notificación. Entra en las
   *  dependencias del realce para que tocar DOS VECES la misma notificación
   *  —o tocarla estando ya en ese proyecto— vuelva a resaltar y a centrar la
   *  fila. Sin él, React descarta la asignación del mismo id y no pasa nada. */
  resaltarNonce?: number
  /** #293: miembro del proyecto y en escritorio → asa de arrastre. */
  puedeArrastrar?: boolean
}

// Referencia estable para el valor por defecto: un `[]` nuevo en cada render
// invalidaría los memos que dependen de él.
const SIN_NUEVAS: string[] = []

export function TableView({ state, proyectoId, frenteSel, hoy, can, filtro, orden, snapshotNonce, onStale, actions, onAbrirTarea, resaltarTareaId, resaltarNonce = 0, tareasNuevas = SIN_NUEVAS, puedeArrastrar = false }: Props) {
  const filtrando = !filtroVacio(filtro)
  // P1: la vista se congela cuando hay filtro y/u orden activo.
  const activo = filtrando || orden.length > 0
  const frentes = state.frentes
    .filter((f) => f.proyectoId === proyectoId && (frenteSel === 'todos' || f.id === frenteSel))
    .sort((a, b) => a.orden - b.orden)

  // #142: colapso momentáneo (no persistente) de frentes y sub frentes. En
  // vista "Todos" colapsan ambos niveles; en una vista de un solo frente solo
  // colapsan los sub frentes. El encabezado se mantiene: solo se ocultan el
  // chevron y las tareas debajo.
  // #311: el recuerdo sigue siendo uno solo y momentáneo —no se guarda por
  // vista ni sobrevive a recargar—; lo que cambia es que solo SE APLICA donde
  // hay chevron para deshacerlo (ver `colapsado` más abajo).
  const [frentesCol, setFrentesCol] = useState<Set<string>>(new Set())
  const [subsCol, setSubsCol] = useState<Set<string>>(new Set())
  const frenteColapsable = frenteSel === 'todos'
  const toggleFrente = (id: string) =>
    setFrentesCol((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleSub = (id: string) =>
    setSubsCol((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // #228: candidatos a responsable = los MIEMBROS del proyecto (dueño + accesos
  // activos). Ya no entran los admins no miembros: ver `miembrosDeProyecto`.
  const candidatos = miembrosDeProyecto(state, proyectoId)

  // P1: lista FRESCA de ids (filtro+orden aplicados ahora) y existentes del
  // scope, recorriendo frentes→subs→tareas igual que el render. La foto se
  // toma de aquí y se compara contra esto para saber si está desactualizada.
  const { frescoIds, existentesIds } = useMemo(() => {
    const fresco: string[] = []
    const existentes: string[] = []
    for (const f of frentes) {
      const subs = state.subFrentes.filter((sf) => sf.frenteId === f.id).sort((a, b) => a.orden - b.orden)
      for (const sf of subs) {
        const todas = state.tareas
          .filter((t) => t.subFrenteId === sf.id && !t.archivada)
          .sort((a, b) => a.orden - b.orden)
        for (const t of todas) existentes.push(t.id)
        const visibles = todas.filter((t) => !filtrando || pasaFiltroCompleto(state, t, filtro, hoy))
        const ordenadas = ordenarMulti(visibles, orden, (t, clave) =>
          valorOrden(state, t, clave as Exclude<ClaveOrden, 'proyecto'>, hoy),
        )
        for (const t of ordenadas) fresco.push(t.id)
      }
    }
    return { frescoIds: fresco, existentesIds: existentes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, proyectoId, frenteSel, filtrando, filtro, orden, hoy])

  const firma = JSON.stringify([proyectoId, frenteSel, filtro, orden, snapshotNonce])
  const { congelada, visibleIds, indice, stale, moverEnFoto } = useVistaCongelada(frescoIds, existentesIds, activo, firma)

  // #293: arrastrar para reordenar / mover de sub frente. Reordenar dentro
  // del propio sub frente es de cualquier miembro; cruzar a otro exige
  // `editarTareas` sobre la tarea (mismo permiso que el título). Con la
  // vista congelada, la caída se refleja en la FOTO (la foto manda) y se
  // enciende "Actualizar vista"; el orden nuevo se guarda igual.
  const dnd = useArrastreTareas({
    habilitado: puedeArrastrar,
    puedeRecibir: (t, subFrenteId) => subFrenteId === t.subFrenteId || can.editarTareas(t),
    alSoltar: (t, destino) => {
      if (planMoverTarea(state.tareas, t.id, destino.subFrenteId, destino.antesDeId).length === 0) return
      if (congelada) moverEnFoto(t.id, referenciaEnFoto(state.tareas, visibleIds, indice, t.id, destino))
      void actions.moverTarea(t.id, destino.subFrenteId, destino.antesDeId)
    },
  })

  // #137/#253: tareas que quedan FUERA de la vista actual (por el filtro o por
  // la foto congelada) y que hay que mostrar igual. Son dos casos con el mismo
  // remedio: la tarea a la que se llega desde una notificación (#137) y la que
  // se acaba de crear (#253) —que si no, con un orden aplicado, no aparecía y
  // se leía como que no se había guardado—. En ambos se fuerza la aparición y
  // se enciende "Actualizar vista"; la lista NO se reordena sola.
  //
  // Es un conjunto y no un id porque encadenando con Enter se crean varias
  // seguidas, y todas tienen que verse.
  const forzarIds = useMemo(() => {
    const fuera = new Set<string>()
    for (const id of [resaltarTareaId, ...tareasNuevas]) {
      if (!id) continue
      const t = state.tareas.find((x) => x.id === id)
      if (!t || t.archivada) continue
      const sf = state.subFrentes.find((x) => x.id === t.subFrenteId)
      const fr = sf && state.frentes.find((x) => x.id === sf.frenteId)
      if (!fr || fr.proyectoId !== proyectoId) continue
      const enVista = congelada ? visibleIds.has(t.id) : !filtrando || pasaFiltroCompleto(state, t, filtro, hoy)
      if (!enVista) fuera.add(t.id)
    }
    return fuera
    // Al retomarse la foto (cambio de filtro/orden o "Actualizar vista"), las
    // forzadas pasan a estar dentro y este conjunto se vacía solo.
  }, [resaltarTareaId, tareasNuevas, state, proyectoId, congelada, visibleIds, filtrando, filtro, hoy])

  useEffect(() => onStale(stale || forzarIds.size > 0), [stale, forzarIds, onStale])

  // #137: al llegar desde una notificación, asegura que el frente y el sub
  // frente de la tarea estén expandidos para poder verla.
  useEffect(() => {
    if (!resaltarTareaId) return
    const t = state.tareas.find((x) => x.id === resaltarTareaId)
    const sf = t && state.subFrentes.find((x) => x.id === t.subFrenteId)
    const fr = sf && state.frentes.find((x) => x.id === sf.frenteId)
    if (sf) setSubsCol((prev) => (prev.has(sf.id) ? new Set([...prev].filter((x) => x !== sf.id)) : prev))
    if (fr) setFrentesCol((prev) => (prev.has(fr.id) ? new Set([...prev].filter((x) => x !== fr.id)) : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltarTareaId, resaltarNonce, state])

  // #186: realce temporal (≈3.5 s) al llegar desde una notificación. NO usa el
  // fondo (chocaría con el color de categoría de la fila): atenúa el resto de
  // las filas y contornea la fila objetivo. `realceId` es el id visible durante
  // ese lapso; la inclusión forzada (forzarId) sigue viviendo de resaltarTareaId.
  const [realceOn, setRealceOn] = useState(false)
  useEffect(() => {
    if (!resaltarTareaId) {
      setRealceOn(false)
      return
    }
    setRealceOn(true)
    const id = window.setTimeout(() => setRealceOn(false), 3500)
    return () => window.clearTimeout(id)
  }, [resaltarTareaId, resaltarNonce])
  const realceId = realceOn ? resaltarTareaId : null

  // #292: el menú contextual de la tarea. Vive acá y no en App porque es esta
  // vista la que sabe sobre qué fila se hizo clic derecho; la Gantt tiene el
  // suyo, y las dos arman sus opciones con la MISMA función.
  const { menu, abrir, cerrar, pedirRenombrar, pulsoDe } = useMenuTarea()
  const tareaDelMenu = menu ? state.tareas.find((t) => t.id === menu.tareaId) : undefined

  // #328: tarea bajo la cual está abierta la fila de carga. Hasta ahora la
  // tabla solo sabía agregar AL FINAL del sub frente, con la línea "+ Tarea";
  // insertar en una posición concreta no se podía. Es un id y no un booleano
  // porque la fila se dibuja donde corresponde, no en un lugar fijo.
  const [insertarTrasId, setInsertarTrasId] = useState<string | null>(null)

  /**
   * Crear una tarea desde la tabla. Vive acá, y no en la fila de carga, porque
   * las dos cosas que la posicionan son de esta vista: el hueco entre hermanas
   * (#328) y la foto congelada (#333).
   */
  const crearTarea = useCallback(
    async (subFrenteId: string, datos: DatosNuevaTarea, debajoDe?: Tarea) => {
      const hermanos = state.tareas.filter((t) => t.subFrenteId === subFrenteId)
      const orden = await abrirHueco(hermanos, debajoDe, can.controlTotal, (id, o) =>
        actions.updateTarea(id, { orden: o }),
      )
      const nueva = await actions.createTarea({ subFrenteId, ...datos, orden })
      // #333: la foto solo tiene posición para lo que ya estaba cuando se la
      // tomó, así que la tarea nueva caía donde el render la dejara. Entra
      // justo después de su hermana por el mismo camino que el arrastre (#293).
      // La condición es `orden` y no `debajoDe`: quien no tiene control total
      // crea AL FINAL aunque haya pedido "debajo de esta", y la foto tiene que
      // decir lo mismo que el orden guardado.
      if (nueva && congelada && debajoDe && orden !== undefined) {
        moverEnFoto(nueva.id, { despuesDe: debajoDe.id })
      }
    },
    [state.tareas, can, actions, congelada, moverEnFoto],
  )

  return (
    // #293: el dragover que llega hasta acá no pasó por ningún destino
    // válido — se apaga el indicador (soltar ahí no hace nada).
    <div className={`tabla-wrap${realceOn ? ' tabla-wrap--realce' : ''}${dnd ? ' tabla-wrap--dnd' : ''}`} onDragOver={dnd ? dnd.fuera : undefined}>
      {frentes.map((f) => (
        <FrentePagina
          key={f.id}
          dnd={dnd}
          frente={f}
          state={state}
          hoy={hoy}
          candidatos={candidatos}
          can={can}
          filtro={filtro}
          filtrando={filtrando}
          orden={orden}
          congelada={congelada}
          visibleIds={visibleIds}
          indice={indice}
          forzarIds={forzarIds}
          realceId={realceId}
          /* #311: si el frente NO se puede plegar, tampoco puede estar
             plegado. El recuerdo de lo plegado es UNO SOLO y sobrevive al
             cambio de vista, pero el chevron solo se dibuja en "todos los
             frentes": al entrar a la vista de un frente que había quedado
             plegado, su contenido no se dibujaba y el control para abrirlo
             tampoco — la pantalla quedaba vacía y sin salida.
             El conjunto NO se toca, así que al volver a "todos" el frente
             sigue plegado como estaba: entrar y salir de su vista no cambia
             cómo se ve en la vista completa. */
          colapsado={frenteColapsable && frentesCol.has(f.id)}
          colapsable={frenteColapsable}
          onToggleColapso={() => toggleFrente(f.id)}
          subsCol={subsCol}
          onToggleSub={toggleSub}
          actions={actions}
          onAbrirTarea={onAbrirTarea}
          onMenu={abrir}
          pulsoDe={pulsoDe}
          crearTarea={crearTarea}
          insertarTrasId={insertarTrasId}
          onCerrarInsercion={() => setInsertarTrasId(null)}
        />
      ))}
      {frentes.length === 0 && (
        <EmptyFrentes proyectoId={proyectoId} puedeCrear={can.crearFrentes} actions={actions} />
      )}
      <MenuTarea
        menu={menu}
        onCerrar={cerrar}
        opciones={
          tareaDelMenu
            ? opcionesDeTarea(
                tareaDelMenu,
                can,
                actions,
                onAbrirTarea,
                () => pedirRenombrar(tareaDelMenu.id),
                // #328: acá es una capacidad NUEVA — hasta ahora la tabla solo
                // agregaba al final del sub frente.
                () => setInsertarTrasId(tareaDelMenu.id),
              )
            : []
        }
      />
    </div>
  )
}

function FrentePagina({
  dnd,
  frente,
  state,
  hoy,
  candidatos,
  can,
  filtro,
  filtrando,
  orden,
  congelada,
  visibleIds,
  indice,
  forzarIds,
  realceId,
  colapsado,
  colapsable,
  onToggleColapso,
  subsCol,
  onToggleSub,
  actions,
  onAbrirTarea,
  onMenu,
  pulsoDe,
  crearTarea,
  insertarTrasId,
  onCerrarInsercion,
}: {
  dnd?: DndTareas
  frente: Frente
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  filtro: Filtro
  filtrando: boolean
  orden: OrdenMulti
  congelada: boolean
  visibleIds: Set<string>
  indice: Map<string, number>
  forzarIds: Set<string>
  realceId?: string | null
  colapsado: boolean
  colapsable: boolean
  onToggleColapso: () => void
  subsCol: Set<string>
  onToggleSub: (id: string) => void
  /** #292: clic derecho sobre una fila de tarea, y el pulso de "Renombrar". */
  onMenu: (e: React.MouseEvent, tareaId: string) => void
  pulsoDe: (tareaId: string) => number
  /** #328/#333: crear una tarea, opcionalmente justo debajo de una hermana. */
  crearTarea: (subFrenteId: string, datos: DatosNuevaTarea, debajoDe?: Tarea) => void
  /** #328: tarea bajo la cual está abierta la fila de carga (o `null`). */
  insertarTrasId: string | null
  onCerrarInsercion: () => void
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const subs = state.subFrentes
    .filter((sf) => sf.frenteId === frente.id)
    .sort((a, b) => a.orden - b.orden)

  // Con filtro activo, los contenedores sin coincidencias se omiten. La foto
  // congelada manda: un sub muestra las tareas de su foto (aunque una edición
  // las haya sacado del filtro); se omite solo si su foto quedó vacía. #137: el
  // sub que contiene la tarea forzada nunca se omite.
  const coincidencias = (subId: string) =>
    state.tareas.some((t) => t.subFrenteId === subId && forzarIds.has(t.id)) ||
    (congelada
      ? state.tareas.some((t) => t.subFrenteId === subId && visibleIds.has(t.id))
      : state.tareas.some(
          (t) => t.subFrenteId === subId && !t.archivada && pasaFiltroCompleto(state, t, filtro, hoy),
        ))
  const subsVisibles = filtrando ? subs.filter((sf) => coincidencias(sf.id)) : subs
  if (filtrando && subsVisibles.length === 0) return null

  return (
    <section className="frente-bloque">
      {/* #142/#161: en vista "Todos" el frente colapsa; el chevron va a la
          DERECHA del título (más grande, se lee como control). #177: al
          plegarse conserva su borde inferior (se ve como bloque cerrado). */}
      <div className={`frente-cabecera${colapsado ? ' frente-cabecera--colapsado' : ''}`}>
        {/* #306: al lado del nombre, cuántos SUB FRENTES tiene —no cuántas
            tareas—: esa cuenta ya aparece en varios lugares y repetirla no
            aporta. La pertenencia se marca con peso y proximidad, no con
            marcos ni sangría: el frente pesa más que sus hijos y sus hijos
            van juntos. */}
        <h2 className="frente-titulo">
          {frente.nombre}
          <span className="frente-titulo__count">
            {subs.length} sub frente{subs.length === 1 ? '' : 's'}
          </span>
        </h2>
        {colapsable && (
          <button
            className="colapso-btn"
            aria-expanded={!colapsado}
            aria-label={colapsado ? `Expandir ${frente.nombre}` : `Colapsar ${frente.nombre}`}
            onClick={onToggleColapso}
          >
            {colapsado ? '▸' : '▾'}
          </button>
        )}
      </div>
      {!colapsado && (
        <>
          {subsVisibles.map((sf) => (
            <SubFrenteTabla
              key={sf.id}
              dnd={dnd}
              sub={sf}
              state={state}
              hoy={hoy}
              candidatos={candidatos}
              can={can}
              filtro={filtro}
              filtrando={filtrando}
              orden={orden}
              congelada={congelada}
              visibleIds={visibleIds}
              indice={indice}
              forzarIds={forzarIds}
              realceId={realceId}
              colapsado={subsCol.has(sf.id)}
              onToggleColapso={() => onToggleSub(sf.id)}
              actions={actions}
              onAbrirTarea={onAbrirTarea}
              onMenu={onMenu}
              pulsoDe={pulsoDe}
              crearTarea={crearTarea}
              insertarTrasId={insertarTrasId}
              onCerrarInsercion={onCerrarInsercion}
            />
          ))}
          {subs.length === 0 && <p className="vacio-inline">Sin sub frentes en este frente.</p>}
          {can.crearSubFrentes && !filtrando && (
            <NuevoSubFrenteInline frenteId={frente.id} vacio={subs.length === 0} actions={actions} />
          )}
        </>
      )}
    </section>
  )
}

/** N2: crear sub frente escribiendo el nombre directo, sin ventana. */
function NuevoSubFrenteInline({
  frenteId,
  vacio,
  actions,
}: {
  frenteId: string
  /** #306: el frente todavía no tiene ningún sub frente. */
  vacio: boolean
  actions: Actions
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')

  function crear() {
    const limpio = nombre.trim()
    if (limpio) {
      actions.createSubFrente({ frenteId, nombre: limpio })
      setNombre('')
      // queda abierto por si quiere encadenar otro sub frente
    }
  }

  if (!editando) {
    // #306 — Dos pesos para la misma acción, según el momento.
    //
    // Con el frente VACÍO sigue siendo un botón: es el momento más importante
    // y la única acción posible —alguien acaba de crear un frente y lo
    // siguiente que tiene que hacer es agregarle un sub frente—, así que ahí
    // el botón tiene que pesar.
    //
    // Con el frente ya poblado pasa a ser una línea de texto chica y gris,
    // pegada debajo del último: sigue donde uno la busca, pero deja de pesar
    // como un elemento más de la lista. Medía unos 60 por frente con su aire,
    // y con seis sub frentes cerrados eso llenaba la pantalla sin mostrar una
    // sola tarea.
    return vacio ? (
      <button className="btn btn--ghost subfrente-add" onClick={() => setEditando(true)}>
        + Sub Frente
      </button>
    ) : (
      <button className="subfrente-add-linea" onClick={() => setEditando(true)}>
        + Sub Frente
      </button>
    )
  }

  return (
    <div className="subfrente subfrente--nuevo">
      <div className="subfrente__titulo">
        <input
          className="inline-input inline-input--subfrente"
          autoFocus
          placeholder="Nombre del nuevo sub frente… (Enter crea, Esc cierra)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') crear()
            if (e.key === 'Escape') {
              setNombre('')
              setEditando(false)
            }
          }}
          onBlur={() => {
            crear()
            setEditando(false)
          }}
        />
      </div>
    </div>
  )
}

function SubFrenteTabla({
  dnd,
  sub,
  state,
  hoy,
  candidatos,
  can,
  filtro,
  filtrando,
  orden,
  congelada,
  visibleIds,
  indice,
  forzarIds,
  realceId,
  colapsado,
  onToggleColapso,
  onMenu,
  pulsoDe,
  crearTarea,
  insertarTrasId,
  onCerrarInsercion,
  actions,
  onAbrirTarea,
}: {
  dnd?: DndTareas
  sub: SubFrente
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  filtro: Filtro
  filtrando: boolean
  orden: OrdenMulti
  congelada: boolean
  visibleIds: Set<string>
  indice: Map<string, number>
  forzarIds: Set<string>
  realceId?: string | null
  colapsado: boolean
  onToggleColapso: () => void
  /** #292: clic derecho sobre una fila de tarea, y el pulso de "Renombrar". */
  onMenu: (e: React.MouseEvent, tareaId: string) => void
  pulsoDe: (tareaId: string) => number
  /** #328/#333: crear una tarea, opcionalmente justo debajo de una hermana. */
  crearTarea: (subFrenteId: string, datos: DatosNuevaTarea, debajoDe?: Tarea) => void
  /** #328: tarea bajo la cual está abierta la fila de carga (o `null`). */
  insertarTrasId: string | null
  onCerrarInsercion: () => void
  actions: Actions
  onAbrirTarea: (id: string) => void
}) {
  const todas = state.tareas
    .filter((t) => t.subFrenteId === sub.id)
    .sort((a, b) => a.orden - b.orden)
  // P1: con la vista congelada, se muestran EXACTAMENTE las tareas de la foto
  // (membresía + orden congelados): editar una tarea no la saca ni la reordena.
  // Sin congelar (vista live), se filtra y ordena en vivo.
  let tareas = congelada
    ? todas
        .filter((t) => visibleIds.has(t.id))
        .sort((a, b) => (indice.get(a.id) ?? 0) - (indice.get(b.id) ?? 0))
    : ordenarMulti(
        todas.filter((t) => !t.archivada && (!filtrando || pasaFiltroCompleto(state, t, filtro, hoy))),
        orden,
        (t, clave) => valorOrden(state, t, clave as Exclude<ClaveOrden, 'proyecto'>, hoy),
      )
  // #137/#253: las forzadas (excluidas por el filtro o por la foto) se insertan
  // igual —al final, sin tocar el orden de las demás— para poder verlas. El
  // aviso "Actualizar vista" ya está encendido.
  if (forzarIds.size > 0) {
    const extras = todas.filter((t) => forzarIds.has(t.id) && !tareas.some((x) => x.id === t.id))
    if (extras.length) tareas = [...tareas, ...extras]
  }
  const archivadas = filtrando ? [] : todas.filter((t) => t.archivada)

  return (
    // #329: el estado plegado sube al bloque entero, porque de él depende
    // cuánto separa del siguiente: desplegado no alcanzaba con 8 entre la
    // última fila de una tabla y el título del sub frente de abajo.
    <div className={`subfrente${colapsado ? ' subfrente--colapsado' : ''}`}>
      {/* #142: chevron para colapsar el sub frente; su fila-título no cambia,
          solo se antepone el chevron y se oculta la tabla de tareas. #177: al
          plegarse conserva su borde inferior. */}
      <div className={`subfrente__titulo${colapsado ? ' subfrente__titulo--colapsado' : ''}`}>
        {/* #161: el chevron va a la DERECHA del título (tras el conteo), más
            grande y con aire de control. */}
        <span>
          {can.editarEstructura ? (
            <InlineText
              valor={sub.nombre}
              onGuardar={(nombre) => actions.updateSubFrente(sub.id, { nombre })}
              ariaLabel={`Renombrar sub frente ${sub.nombre}`}
              inputClassName="inline-input--subfrente"
            />
          ) : (
            sub.nombre
          )}{' '}
          <span className="subfrente__count">· {tareas.length} tareas</span>{' '}
          <button
            className="colapso-btn"
            aria-expanded={!colapsado}
            aria-label={colapsado ? `Expandir ${sub.nombre}` : `Colapsar ${sub.nombre}`}
            onClick={onToggleColapso}
          >
            {colapsado ? '▸' : '▾'}
          </button>
        </span>
        {can.editarEstructura && (
          <span className="subfrente__tools">
            <button
              className="icon-btn"
              title="Eliminar sub frente"
              onClick={() => { if (confirm(`¿Eliminar el sub frente "${sub.nombre}" y sus tareas?`)) actions.deleteSubFrente(sub.id) }}
            >🗑</button>
          </span>
        )}
      </div>
      {!colapsado && (
      // #293: la tabla entera es destino "al final del sub frente" (cubre el
      // área bajo la última fila y los sub frentes sin tareas); las filas de
      // tarea frenan la propagación y afinan la posición.
      <table
        className={`tareas${dnd?.destino?.subFrenteId === sub.id ? ' tareas--drop' : ''}`}
        onDragOver={dnd ? (e) => dnd.sobre(e, sub.id, null) : undefined}
        onDrop={dnd ? dnd.soltar : undefined}
      >
        <thead>
          <tr>
            {/* Orden de columnas: primero COMO ESTA la tarea (Estado junto al
                nombre), despues las fechas — la Objetivo es la operativa y
                la Original queda al final como referencia. El ordenamiento
                ya no es por clic aqui (punto 4): se maneja desde "Ordenar". */}
            <th className="col-check">Hecha</th>
            <th>Tarea</th>
            <th className="col-resp">Resp.</th>
            <th className="col-estado">Estado</th>
            <th className="col-fecha">Fecha Objetivo</th>
            {/* Atraso (días hábiles corridos hacia adelante). En mobile se
                oculta (5 columnas), igual que hacía col-orig. */}
            <th className="col-desv">Atraso</th>
            {/* #298: la columna de acciones se titula igual que en las tablas
                de administración de usuarios y de proyectos. Sigue apareciendo
                solo si hay algún permiso sobre las tareas: quien solo mira no
                ve la columna ni su título. */}
            {can.algunoDeTareas && <th className="col-acc">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {tareas.map((t, i) => (
            <Fragment key={t.id}>
              <TareaFila
                dnd={dnd}
                siguienteId={tareas[i + 1]?.id ?? null}
                dropAntes={dnd?.destino?.subFrenteId === sub.id && dnd.destino.antesDeId === t.id}
                dropDespues={
                  dnd?.destino?.subFrenteId === sub.id &&
                  dnd.destino.antesDeId === null &&
                  i === tareas.length - 1
                }
                tarea={t}
                state={state}
                hoy={hoy}
                candidatos={candidatos}
                can={can}
                resaltar={t.id === realceId}
                actions={actions}
                onAbrirTarea={onAbrirTarea}
                onMenu={onMenu}
                pulsoRenombrar={pulsoDe(t.id)}
              />
              {/* #328: "Agregar tarea debajo" abre la fila de carga JUSTO acá,
                  no al final del sub frente. Es la misma fila de siempre; lo que
                  cambia es dónde se dibuja y qué orden le toca a lo que guarda. */}
              {insertarTrasId === t.id && can.crearTareas && (
                <NuevaTareaFila
                  candidatos={candidatos}
                  crear={(datos) => crearTarea(sub.id, datos, t)}
                  insercion={{ onCerrar: onCerrarInsercion }}
                />
              )}
            </Fragment>
          ))}
          {/* #320: la fila de "+ Tarea" se muestra TAMBIÉN con filtro puesto.
              Estaba escondida a propósito, por un problema real —la tarea
              recién creada puede no cumplir el filtro y desaparecer en el mismo
              momento en que la creas—, pero la Gantt ya resolvía ese problema
              en vez de esconder la acción, así que el mismo proyecto con el
              mismo filtro se comportaba al revés según la vista. El remedio ya
              vive acá: `forzarIds` deja la recién creada a la vista aunque el
              filtro o la foto la dejen fuera, y enciende "Actualizar vista".
              Lo que SÍ se sigue escondiendo con filtro puesto: "+ Sub Frente",
              el bloque de archivadas, y los sub frentes sin coincidencias. */}
          {can.crearTareas && (
            <NuevaTareaFila candidatos={candidatos} crear={(datos) => crearTarea(sub.id, datos)} />
          )}
        </tbody>
      </table>
      )}

      {!colapsado && archivadas.length > 0 && (
        <details className="archivadas">
          <summary>
            {archivadas.length} tarea{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'}
          </summary>
          <ul>
            {archivadas.map((t) => (
              <li key={t.id}>
                <button className="link-tarea" onClick={() => onAbrirTarea(t.id)}>{t.titulo}</button>
                {can.archivarEliminar(t) && (
                  <button
                    className="link-btn"
                    onClick={() => actions.updateTarea(t.id, { archivada: false })}
                  >
                    Restaurar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Lo que la fila de carga recoge antes de crear la tarea. */
export interface DatosNuevaTarea {
  titulo: string
  responsableId?: string
  fechaObjetivo?: string
}

/**
 * N1: fila de creacion inline. Click en "+ Tarea" abre una fila vacia con el
 * cursor en el titulo; Enter guarda y deja lista la siguiente (encadena);
 * el foco fuera de la fila guarda si hay titulo; Escape cierra.
 *
 * #328: la MISMA fila sirve para insertar en el medio, desde "Agregar tarea
 * debajo". Cambian dos cosas y ninguna es el formulario: arranca abierta —el
 * gesto ya ocurrió, en el menú— y se cierra al guardar, porque una inserción es
 * para ESA posición y encadenar debajo de ella diría otra cosa. Dónde va la
 * tarea lo decide quien llama (`crear`), que es el que conoce la foto.
 */
function NuevaTareaFila({
  candidatos,
  crear,
  insercion,
}: {
  candidatos: Usuario[]
  crear: (datos: DatosNuevaTarea) => void
  /** #328: presente = fila de inserción (abierta desde el menú). */
  insercion?: { onCerrar: () => void }
}) {
  const [activa, setActiva] = useState(!!insercion)
  const [titulo, setTitulo] = useState('')
  const [responsableId, setResponsableId] = useState('')
  // La tarea nace SIN FECHA (1.2): el campo parte en blanco; la primera fecha
  // que se le asigne fijara su compromiso inicial.
  const [fechaObjetivo, setFechaObjetivo] = useState('')
  const filaRef = useRef<HTMLTableRowElement>(null)
  const tituloRef = useRef<HTMLInputElement>(null)

  /**
   * #259: la fila parte EN BLANCO cada vez que se abre con "+ Tarea".
   *
   * Encadenar (guardar con Enter y seguir en la misma fila) conserva
   * responsable y fecha a propósito: cargar varias tareas de la misma persona
   * para la misma fecha es un caso real. Lo que estaba mal es que esos valores
   * sobrevivían al CIERRE de la fila: se volvía a abrir horas después y seguían
   * puestos, así que se asignaban tareas a alguien sin querer. Encadenar hereda;
   * reabrir empieza de cero.
   */
  function abrir() {
    setTitulo('')
    setResponsableId('')
    setFechaObjetivo('')
    setActiva(true)
  }

  function cerrar() {
    setTitulo('')
    setActiva(false)
    insercion?.onCerrar()
  }

  function guardar(): boolean {
    const limpio = titulo.trim()
    if (!limpio) return false
    crear({
      titulo: limpio,
      responsableId: responsableId || undefined,
      fechaObjetivo: fechaObjetivo || undefined,
    })
    // #328: insertando no se encadena — la posición es de esta inserción.
    if (insercion) {
      cerrar()
      return true
    }
    // Encadena: limpia el titulo y conserva responsable/fecha como defaults.
    setTitulo('')
    tituloRef.current?.focus()
    return true
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      guardar()
    }
    if (e.key === 'Escape') cerrar()
  }

  // Guarda (o cierra) cuando el foco sale de la fila completa.
  function onBlurFila() {
    setTimeout(() => {
      if (filaRef.current && !filaRef.current.contains(document.activeElement)) {
        const guardo = titulo.trim() ? guardar() : false
        if (!guardo) cerrar()
      }
    }, 0)
  }

  if (!activa) {
    return (
      <tr className="fila-add">
        <td colSpan={7}>
          <button className="btn btn--ghost" onClick={abrir}>
            + Tarea
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="fila-nueva" ref={filaRef} onBlur={onBlurFila} onKeyDown={onKeyDown}>
      <td className="col-check">
        <input className="chk" type="checkbox" disabled />
      </td>
      <td>
        <input
          ref={tituloRef}
          className="inline-input"
          autoFocus
          placeholder={insercion ? 'Título de la tarea… (Enter guarda)' : 'Título de la tarea… (Enter guarda y encadena)'}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          aria-label="Título de la nueva tarea"
        />
      </td>
      <td className="col-resp">
        <RespPicker
          usuarios={candidatos}
          value={responsableId || undefined}
          onChange={(id) => setResponsableId(id ?? '')}
          ariaLabel="Responsable de la nueva tarea"
        />
      </td>
      <td className="col-estado mudo">—</td>
      {/* #256: la misma pieza que una tarea sin fecha —el botón "Planificar"—,
          no un campo de fecha suelto. Planificar tiene peso en este producto
          (queda registrado, y moverlo después genera una replanificación con
          historial); un `dd/mm/aaaa` invita a poner una fecha de pasada. Al
          elegirla se devuelve el foco al título: así el guardado por foco-fuera
          no se dispara al cerrarse el calendario, y se sigue escribiendo. */}
      <td className="col-fecha">
        <FechaEditable
          valor={fechaObjetivo || undefined}
          onCambiar={(nueva) => {
            setFechaObjetivo(nueva)
            tituloRef.current?.focus()
          }}
          ariaLabel="Fecha objetivo de la nueva tarea"
        />
      </td>
      <td className="col-desv mudo">—</td>
      <td className="col-acc">
        <button className="icon-btn" title="Guardar (Enter)" onMouseDown={(e) => e.preventDefault()} onClick={guardar}>✓</button>
        <button className="icon-btn" title="Cerrar (Esc)" onMouseDown={(e) => e.preventDefault()} onClick={cerrar}>✕</button>
      </td>
    </tr>
  )
}

function TareaFila({
  dnd,
  siguienteId,
  dropAntes,
  dropDespues,
  tarea,
  state,
  hoy,
  candidatos,
  can,
  resaltar,
  actions,
  onAbrirTarea,
  onMenu,
  pulsoRenombrar,
}: {
  /** #293: arrastre activo en la vista (undefined = sin asa ni destinos). */
  dnd?: DndTareas
  /** Hermana visible siguiente (para "soltar después de esta fila"). */
  siguienteId?: string | null
  /** La tarea en vuelo caería ANTES / DESPUÉS de esta fila (indicador). */
  dropAntes?: boolean
  dropDespues?: boolean
  tarea: Tarea
  state: AppState
  hoy: string
  candidatos: Usuario[]
  can: Can
  resaltar?: boolean
  actions: Actions
  onAbrirTarea: (id: string) => void
  /** #292: clic derecho sobre la fila. */
  onMenu: (e: React.MouseEvent, tareaId: string) => void
  /** #292: pulso de "Renombrar" (0 = no le toca a esta fila). */
  pulsoRenombrar: number
}) {
  const cat = categoriaDe(state, tarea, hoy)
  const color = colorTarea(state, tarea, hoy)
  // #229: nunca "sin responsable" si la base sí tiene uno; si ya no es
  // candidato se muestra apagado, con el motivo en el tooltip.
  const resp = responsableDeTarea(state, tarea.responsableId, candidatos)
  const nComentarios = state.comentarios.filter((c) => c.tareaId === tarea.id).length
  const nReplan = nReplanificaciones(state, tarea.id)

  const tooltip = <TaskDetail state={state} tarea={tarea} hoy={hoy} />

  // #157/#186: al llegar desde una notificación se centra la fila. El realce es
  // un CONTORNO (no cambia el fondo, así no choca con el color de categoría) y
  // vive mientras `resaltar` está activo (~3.5 s, lo controla el padre). El
  // resto de las filas se atenúa vía `.tabla-wrap--realce`.
  const filaRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (resaltar) filaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [resaltar])
  // (`resaltar` pasa de false a true en cada llegada gracias al nonce de #219,
  //  así que este efecto vuelve a centrar la fila también la segunda vez.)

  // #293: cada fila de tarea es destino del arrastre — mitad superior deja la
  // tarea en vuelo ANTES de esta, mitad inferior después.
  const clasesDnd = dnd
    ? `${dnd.activo?.id === tarea.id ? ' fila--en-vuelo' : ''}${dropAntes ? ' fila--drop-antes' : ''}${dropDespues ? ' fila--drop-despues' : ''}`
    : ''

  return (
    <tr
      ref={filaRef}
      className={`${color !== 'ninguno' ? `fila--${color}` : ''}${resaltar ? ' fila--resaltada' : ''}${clasesDnd}`.trim() || undefined}
      onDragOver={
        dnd
          ? (e) => dnd.sobre(e, tarea.subFrenteId, enMitadSuperior(e) ? tarea.id : siguienteId ?? null)
          : undefined
      }
      onDrop={dnd ? dnd.soltar : undefined}
      // #292: el clic derecho abre el menú de la tarea en CUALQUIERA de sus
      // celdas. En la tabla ese gesto estaba libre: ninguna celda lo usaba.
      onContextMenu={(e) => onMenu(e, tarea.id)}
    >
      <td className="col-check">
        <CheckHecha
          hecha={tarea.hecha}
          disabled={!can.marcarHechas(tarea)}
          onToggle={() => actions.toggleHecha(tarea.id, !tarea.hecha)}
          ariaLabel={`Marcar hecha: ${tarea.titulo}`}
        />
      </td>

      <td className="tarea-cell">
        {/* #293: asa de arrastre — visible al pasar el mouse por la fila,
            pegada al borde izquierdo de la celda del nombre. El arrastre nace
            SOLO acá; la fila sigue siendo territorio de sus controles. */}
        {dnd && (
          <button
            type="button"
            className="drag-asa"
            aria-label={`Mover: ${tarea.titulo}`}
            draggable
            onDragStart={(e) => dnd.iniciar(e, tarea)}
            onDragEnd={dnd.terminar}
          >
            ⋮⋮
          </button>
        )}
        <span className="tarea-cell__row">
          {cat === 'hecha' && <span className="tarea-cell__mark mk-verde">✓</span>}
          {can.editarTareas(tarea) ? (
            // N3: click en el titulo lo edita en el lugar (el detalle vive en ⓘ).
            <InlineText
              valor={tarea.titulo}
              onGuardar={(titulo) => actions.updateTarea(tarea.id, { titulo })}
              ariaLabel={`Editar título: ${tarea.titulo}`}
              wrapDisplay={(nodo) => <HoverCard card={tooltip}>{nodo}</HoverCard>}
              abrirEdicion={pulsoRenombrar}
            />
          ) : (
            <HoverCard card={tooltip}>
              <span
                className="tarea-cell__link"
                role="button"
                tabIndex={0}
                onClick={() => onAbrirTarea(tarea.id)}
                onKeyDown={(e) => e.key === 'Enter' && onAbrirTarea(tarea.id)}
              >
                {tarea.titulo}
              </span>
            </HoverCard>
          )}
          {nReplan > 0 && (
            <span className="replan-count" title={`Se replanificó ${nReplan} ${nReplan === 1 ? 'vez' : 'veces'}`}>
              ↻ ×{nReplan}
            </span>
          )}
          {nComentarios > 0 && (
            <button
              className="comentarios-chip"
              title={`${nComentarios} comentario${nComentarios === 1 ? '' : 's'}`}
              onClick={() => onAbrirTarea(tarea.id)}
            >
              💬{nComentarios}
            </button>
          )}
        </span>
      </td>

      <td className="col-resp">
        {can.asignarResponsable(tarea) ? (
          // N3: el selector se despliega directo en la celda, sin formulario.
          <RespPicker
            usuarios={candidatos}
            value={tarea.responsableId}
            onChange={(id) => actions.updateTarea(tarea.id, { responsableId: id })}
            ariaLabel={`Responsable: ${tarea.titulo}`}
            apagado={resp.apagado}
            responsable={resp.usuario}
            motivo={resp.motivo}
          />
        ) : (
          resp.estado !== 'sin-asignar' && (
            <Avatar usuario={resp.usuario} apagado={resp.apagado} motivo={resp.motivo} />
          )
        )}
      </td>

      {/* La categoria en texto refuerza el color de fila; va junto al
          nombre para el barrido visual (punto 5). */}
      <td className="col-estado">
        <span className={`estado-chip estado-chip--${color}`}>{CATEGORIA_LABEL[cat]}</span>
      </td>

      {/* #245: en una tarea hecha la fecha se muestra como texto, no como
          control: no es un botón que falla, es una fecha cerrada. */}
      <td
        className={`col-fecha${esAtrasada(cat) ? ' fecha-vencida' : ''}`}
        title={tarea.hecha && can.editarFechas(tarea) ? MOTIVO_FECHA_HECHA : undefined}
      >
        {puedeEditarFecha(can, tarea) ? (
          <FechaEditable
            valor={tarea.fechaObjetivo}
            onCambiar={(nueva) => actions.cambiarFechaObjetivo(tarea.id, nueva)}
            ariaLabel={`Fecha objetivo: ${tarea.titulo}`}
          />
        ) : (
          tarea.fechaObjetivo ? formatoFecha(tarea.fechaObjetivo) : '—'
        )}
      </td>

      {/* Atraso: "N días" (hábiles) si se corrió hacia adelante, o "—".
          Mismo estilo que la fecha. Visible en desktop; en mobile se oculta. */}
      <td className="col-desv">{textoAtraso(tarea)}</td>

      {can.algunoDeTareas && (
        <td className="col-acc">
          <button className="icon-btn" data-tip="Información" aria-label="Información" onClick={() => onAbrirTarea(tarea.id)}>ⓘ</button>
          {can.archivarEliminar(tarea) && (
            <>
              <button
                className="icon-btn"
                data-tip="Archivar"
                aria-label="Archivar"
                onClick={() => { if (confirm(`¿Archivar la tarea "${tarea.titulo}"? Sale del plan y conserva su historial.`)) actions.updateTarea(tarea.id, { archivada: true }) }}
              >⤵</button>
              <button
                className="icon-btn"
                data-tip="Eliminar"
                aria-label="Eliminar"
                onClick={() => { if (confirm(`¿Eliminar definitivamente la tarea "${tarea.titulo}"? Se pierde su historial; si solo quieres cancelarla, usa Archivar.`)) actions.deleteTarea(tarea.id) }}
              >🗑</button>
            </>
          )}
        </td>
      )}
    </tr>
  )
}
