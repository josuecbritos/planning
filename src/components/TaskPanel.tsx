import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Tarea, Usuario } from '../types'
import type { Actions } from '../App'
import { miembrosDeProyecto, responsableDeTarea } from '../lib/permisos'
import { formatoFecha, formatoFechaHora } from '../lib/dates'
import { CATEGORIA_LABEL, categoriaDe, colorTarea, esAtrasada, historialDe } from '../lib/derive'
import {
  aTextoEditable,
  aTextoGuardable,
  mencionEnCurso,
  mencionablesEn,
  partirComentario,
  type MencionElegida,
} from '../lib/menciones'

// Panel lateral de detalle (7.2, era backlog en v3.1): click sobre una tarea
// o una marca abre este panel con el detalle completo, el historial y los
// comentarios.
//
// #307: SOLO leer y comentar. Ya no lleva acciones, así que tampoco necesita
// permisos: no decide nada que dependa de quién mira. Lo único que escribe es
// el comentario, y comentar puede cualquier miembro (3.3).

interface Props {
  state: AppState
  tarea: Tarea
  hoy: string
  actions: Actions
  /** #208/#209: quién mira — para no ofrecerse a uno mismo en el selector de
   *  menciones y para saber qué comentarios puede editar. */
  sesionId?: string
  onClose: () => void
}

export function TaskPanel({ state, tarea, hoy, actions, sesionId, onClose }: Props) {
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Cerrar al hacer clic fuera del panel (además del botón ✕ y Escape). El
  // listener se difiere un tick para que el mismo clic que abre el panel no
  // lo cierre de inmediato; los clics DENTRO del panel no lo cierran.
  // #262: el calendario de fecha se monta como PORTAL fuera del aside — un
  // clic en sus flechas de mes no es "fuera del panel" y no debe cerrarlo.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('.fecha-cal')) return
      if (asideRef.current && !asideRef.current.contains(t)) onClose()
    }
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const color = colorTarea(state, tarea, hoy)
  const cat = categoriaDe(state, tarea, hoy)
  const hist = historialDe(state, tarea.id)
  const sub = state.subFrentes.find((sf) => sf.id === tarea.subFrenteId)
  const frente = state.frentes.find((f) => f.id === sub?.frenteId)
  // #228/#229: la misma lista de miembros que la tabla y la Gantt, y el mismo
  // trato para el responsable que ya no es candidato (se muestra apagado).
  const resp = responsableDeTarea(
    state,
    tarea.responsableId,
    miembrosDeProyecto(state, frente?.proyectoId ?? null),
  )

  const cadena: string[] = tarea.fechaOriginal
    ? [tarea.fechaOriginal, ...hist.map((h) => h.fechaNueva)]
    : []

  return (
    <aside className="panel-detalle" ref={asideRef}>
      <div className="panel-detalle__head">
        <span className={`hovercard__estado hc-estado--${color}`}>
          {tarea.archivada ? 'Archivada' : CATEGORIA_LABEL[cat]}
        </span>
        <button className="modal-x" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      <h3 className="panel-detalle__titulo">{tarea.titulo}</h3>
      <p className="panel-detalle__ruta">
        {frente?.nombre} › {sub?.nombre}
      </p>

      {tarea.descripcion && <p className="panel-detalle__desc">{tarea.descripcion}</p>}

      <dl className="panel-detalle__datos">
        {resp.estado !== 'sin-asignar' && (
          <>
            <dt>Responsable</dt>
            <dd title={resp.motivo}>
              <span className={`resp-badge${resp.apagado ? ' resp-badge--apagado' : ''}`}>
                {resp.usuario?.iniciales ?? '?'}
              </span>{' '}
              <span className={resp.apagado ? 'resp-apagado' : undefined}>
                {resp.usuario?.nombre ?? 'Responsable ya no disponible'}
              </span>
            </dd>
          </>
        )}
        <dt>Fecha comprometida original</dt>
        <dd>{tarea.fechaOriginal ? formatoFecha(tarea.fechaOriginal) : 'Sin fecha aún'}</dd>
        <dt>Fecha vigente</dt>
        <dd className={esAtrasada(cat) ? 'fecha-vencida' : ''}>
          {tarea.fechaObjetivo ? formatoFecha(tarea.fechaObjetivo) : 'Sin fecha aún'}
        </dd>
      </dl>

      <div className="panel-detalle__hist">
        <h4>
          {hist.length === 0
            ? 'Sin replanificaciones'
            : `Se movió ${hist.length} ${hist.length === 1 ? 'vez' : 'veces'}`}
        </h4>
        <ol className="panel-detalle__cadena">
          {cadena.map((f, i) => {
            const esVigente = i === cadena.length - 1
            const registro = i > 0 ? hist[i - 1] : null
            const autor = registro
              ? state.usuarios.find((u) => u.id === registro.cambiadoPor)
              : null
            return (
              <li key={i} className={esVigente ? 'vigente' : 'pasada'}>
                <span className="fecha-cadena">{formatoFecha(f)}</span>
                <small>
                  {i === 0
                    ? 'Compromiso inicial'
                    : `Replanificación ${i}${autor ? ` · ${autor.iniciales}` : ''}`}
                  {esVigente && i > 0 ? ' · vigente' : ''}
                </small>
              </li>
            )
          })}
          {/* Punto 1: el dia real del marcado vive SOLO en el historial;
              la marca queda en la ultima fecha planificada. */}
          {tarea.hecha && tarea.fechaReal && (
            <li className="marcada-lista">
              <span className="fecha-cadena">{formatoFecha(tarea.fechaReal)}</span>
              <small>Se marcó lista este día</small>
            </li>
          )}
        </ol>
      </div>

      {/* 3.3: TODOS los miembros pueden comentar, siempre (append-only). */}
      <Comentarios
        state={state}
        tarea={tarea}
        puedeComentar
        sesionId={sesionId}
        actions={actions}
      />

      {/* #307: acá terminaba el panel con un bloque de acciones —marcar hecha,
          replanificar, archivar y restaurar—, DESPUÉS del historial y del hilo
          de comentarios completo, así que con comentarios había que bajar
          hasta el fondo para llegar a ellas. El panel se usa para LEER una
          tarea y comentarla, nada más: marcar hecha y replanificar ya se hacen
          desde la tabla y desde la Gantt, así que tenerlas acá era un tercer
          lugar para lo mismo. Debajo de los comentarios no queda nada.
          Dos cosas se resolvieron solas al sacarlo: el estado dejó de decirse
          dos veces (queda la etiqueta del título, se fue la casilla "Hecha"), y
          desapareció de acá el texto de #245 sobre la fecha de una tarea hecha
          — que SIGUE existiendo como globo en la tabla y en Mis Tareas, que es
          donde el control de fecha vive.
          Consecuencia declarada y aceptada por el dueño: archivar y restaurar
          existían solo en la tabla y acá, así que la Gantt queda sin forma de
          archivar y hay que ir a la tabla. */}
    </aside>
  )
}

/**
 * N5: hilo de comentarios acumulables. Cada comentario suma al historial (con
 * autor y fecha) y NO se borra: el hilo acompaña al registro de
 * replanificaciones y es el respaldo de por qué pasó lo que pasó.
 *
 * #208: se puede etiquetar con "@" a gente CON ACCESO al proyecto —etiquetar a
 * quien no puede ver la tarea generaría un aviso hacia una puerta cerrada—. En
 * el texto guardado la mención es un id, no un nombre, así que sobrevive a que
 * la persona se cambie el nombre (#207).
 *
 * #209: el AUTOR puede editar lo suyo, sin límite de tiempo y con marca
 * visible. Ni el admin ni el dueño del proyecto editan lo de otros, y nadie
 * borra nada. Editar no genera notificaciones nuevas.
 */
function Comentarios({
  state,
  tarea,
  puedeComentar,
  sesionId,
  actions,
}: {
  state: AppState
  tarea: Tarea
  puedeComentar: boolean
  sesionId?: string
  actions: Actions
}) {
  const [texto, setTexto] = useState('')
  const [elegidas, setElegidas] = useState<MencionElegida[]>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState('')
  const [elegidasEdit, setElegidasEdit] = useState<MencionElegida[]>([])

  const hilo = state.comentarios
    .filter((c) => c.tareaId === tarea.id)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))

  const candidatos = useMemo(
    () => mencionablesEn(state, tarea.id, sesionId),
    [state, tarea.id, sesionId],
  )

  function publicar() {
    const limpio = aTextoGuardable(texto, elegidas).trim()
    if (!limpio) return
    actions.addComentario(tarea.id, limpio)
    setTexto('')
    setElegidas([])
  }

  function abrirEdicion(id: string, textoGuardado: string) {
    const { texto: editable, elegidas: recuperadas } = aTextoEditable(textoGuardado, state.usuarios)
    setEditandoId(id)
    setTextoEdit(editable)
    setElegidasEdit(recuperadas)
  }

  function guardarEdicion() {
    const limpio = aTextoGuardable(textoEdit, elegidasEdit).trim()
    if (!limpio || !editandoId) return
    actions.editComentario(editandoId, limpio)
    setEditandoId(null)
  }

  return (
    <div className="panel-detalle__comentarios">
      <h4>Comentarios {hilo.length > 0 && `(${hilo.length})`}</h4>

      {hilo.length === 0 && <p className="comentario-vacio">Sin comentarios aún.</p>}

      <ul className="comentarios-hilo">
        {hilo.map((c) => {
          const autor = state.usuarios.find((u) => u.id === c.autorId)
          const esMio = !!sesionId && c.autorId === sesionId
          return (
            <li key={c.id} className="comentario">
              <div className="comentario__meta">
                {autor ? (
                  <>
                    <span className="resp-badge">{autor.iniciales}</span>
                    <b>{autor.nombre}</b>
                  </>
                ) : (
                  <b>—</b>
                )}
                <span className="comentario__fecha">{formatoFechaHora(c.timestamp)}</span>
                {c.editado && (
                  <span className="comentario__editado" title={`Editado el ${formatoFechaHora(c.editado)}`}>
                    editado
                  </span>
                )}
                {esMio && editandoId !== c.id && (
                  <button
                    className="link-btn comentario__editar"
                    onClick={() => abrirEdicion(c.id, c.texto)}
                  >
                    Editar
                  </button>
                )}
              </div>
              {editandoId === c.id ? (
                <div className="comentario-nuevo">
                  <CampoComentario
                    valor={textoEdit}
                    onCambiar={setTextoEdit}
                    candidatos={candidatos}
                    onElegir={(m) => setElegidasEdit((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))}
                    onEnviar={guardarEdicion}
                    placeholder="Editar el comentario…"
                  />
                  <div className="comentario-acciones">
                    <button className="btn btn--primary btn--sm" disabled={!textoEdit.trim()} onClick={guardarEdicion}>
                      Guardar
                    </button>
                    <button className="btn btn--sm" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="comentario__texto">
                  {partirComentario(c.texto).map((parte, i) => {
                    if (parte.tipo === 'mencion') {
                      return (
                        <span key={i} className="mencion">
                          @{state.usuarios.find((u) => u.id === parte.usuarioId)?.nombre ?? 'alguien'}
                        </span>
                      )
                    }
                    // #299: el enlace se abre en pestaña nueva —para no sacar a
                    // nadie de la herramienta a mitad de una tarea— y sin darle
                    // al destino ninguna referencia a esta ventana. Lo que se
                    // ve es el texto tal cual se escribió; el destino ya viene
                    // validado como http/https desde `partirComentario`.
                    if (parte.tipo === 'enlace') {
                      return (
                        <a
                          key={i}
                          className="comentario__enlace"
                          href={parte.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {parte.valor}
                        </a>
                      )
                    }
                    return <span key={i}>{parte.valor}</span>
                  })}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {puedeComentar && editandoId === null && (
        <div className="comentario-nuevo">
          <CampoComentario
            valor={texto}
            onCambiar={setTexto}
            candidatos={candidatos}
            onElegir={(m) => setElegidas((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))}
            onEnviar={publicar}
            placeholder="Agregar un comentario… (@ para etiquetar a alguien)"
          />
          <button className="btn btn--primary btn--sm" disabled={!texto.trim()} onClick={publicar}>
            Comentar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * #208: campo de texto con selector de "@". En el editor se ve "@Nombre"; la
 * conversión al marcador por id ocurre al publicar, con las personas que se
 * eligieron aquí. Se eligen de la lista: escribir "@" y un nombre a mano NO
 * crea una mención, y eso es deliberado — así una mención siempre apunta a
 * alguien que existe y tiene acceso.
 */
function CampoComentario({
  valor,
  onCambiar,
  candidatos,
  onElegir,
  onEnviar,
  placeholder,
}: {
  valor: string
  onCambiar: (v: string) => void
  candidatos: Usuario[]
  onElegir: (m: MencionElegida) => void
  onEnviar: () => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [busca, setBusca] = useState<{ desde: number; termino: string } | null>(null)

  const sugeridos = busca
    ? candidatos
        .filter((u) => u.nombre.toLowerCase().includes(busca.termino.toLowerCase().trim()))
        .slice(0, 6)
    : []

  function recalcular(v: string, cursor: number) {
    setBusca(mencionEnCurso(v, cursor))
  }

  function elegir(u: Usuario) {
    if (!busca) return
    const antes = valor.slice(0, busca.desde)
    const despues = valor.slice(busca.desde + 1 + busca.termino.length)
    const insertado = `@${u.nombre} `
    onCambiar(`${antes}${insertado}${despues}`)
    onElegir({ id: u.id, nombre: u.nombre })
    setBusca(null)
    // Devolver el foco donde estaba, tras la mención recién puesta.
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      const pos = antes.length + insertado.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="comentario-campo">
      <textarea
        ref={ref}
        rows={2}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => {
          onCambiar(e.target.value)
          recalcular(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onClick={(e) => recalcular(valor, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => {
          // Sin retardo, el blur cierra la lista antes de que el clic llegue.
          setTimeout(() => setBusca(null), 150)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && busca) {
            e.stopPropagation() // no cerrar el panel de detalle: solo la lista
            setBusca(null)
            return
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onEnviar()
        }}
      />
      {busca && sugeridos.length > 0 && (
        <ul className="mencion-lista">
          {sugeridos.map((u) => (
            <li key={u.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(u)}>
                <span className="resp-badge">{u.iniciales}</span>
                <span>{u.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {busca && sugeridos.length === 0 && (
        <ul className="mencion-lista">
          <li className="mencion-lista__vacio">Nadie con acceso a este proyecto coincide.</li>
        </ul>
      )}
    </div>
  )
}
