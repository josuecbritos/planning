import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppState, Tarea } from './types'
import { HOY as HOY_SIM } from './data/seed'
import { makeRepo } from './data'
import { supabaseConfigured } from './data/client'
import { hoyISO } from './lib/dates'
import { contar } from './lib/derive'
import * as apply from './data/apply'
import type {
  NuevaTarea,
  NuevoFrente,
  NuevoProyecto,
  NuevoSubFrente,
  PatchProyecto,
  PatchTarea,
} from './data/repo'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { TableView } from './components/TableView'
import { GanttView } from './components/GanttView'

export type Vista = 'tabla' | 'gantt'
export type FrenteSel = string | 'todos'

// Admin que "actua" (cambiado_por al replanificar). En Fase 2 sera el usuario logueado.
const USUARIO_ACTUAL = 'u-jb'

/** Acciones CRUD expuestas a los componentes. Todas persisten via Repo. */
export interface Actions {
  createProyecto: (i: NuevoProyecto) => Promise<void>
  updateProyecto: (id: string, p: PatchProyecto) => Promise<void>
  deleteProyecto: (id: string) => Promise<void>
  createFrente: (i: NuevoFrente) => Promise<void>
  updateFrente: (id: string, p: { nombre?: string }) => Promise<void>
  deleteFrente: (id: string) => Promise<void>
  createSubFrente: (i: NuevoSubFrente) => Promise<void>
  updateSubFrente: (id: string, p: { nombre?: string }) => Promise<void>
  deleteSubFrente: (id: string) => Promise<void>
  createTarea: (i: NuevaTarea) => Promise<void>
  updateTarea: (id: string, p: PatchTarea) => Promise<void>
  deleteTarea: (id: string) => Promise<void>
  toggleHecha: (tareaId: string, hecha: boolean) => Promise<void>
  cambiarFechaObjetivo: (tareaId: string, nueva: string) => Promise<void>
}

export default function App() {
  const repo = useMemo(() => makeRepo(), [])
  const HOY = useMemo(() => (supabaseConfigured ? hoyISO() : HOY_SIM), [])

  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('tabla')
  const [frenteSel, setFrenteSel] = useState<FrenteSel>('todos')
  const [proyectoActivoId, setProyectoActivoId] = useState<string | null>(null)

  // Carga inicial
  useEffect(() => {
    let vivo = true
    repo
      .loadState()
      .then((s) => {
        if (!vivo) return
        setState(s)
        setProyectoActivoId((prev) => prev ?? s.proyectos[0]?.id ?? null)
      })
      .catch((e) => vivo && setError(String(e.message ?? e)))
    return () => {
      vivo = false
    }
  }, [repo])

  // Envuelve una mutacion: ejecuta en el repo, aplica al estado local, captura errores.
  const run = useCallback(
    async (fn: () => Promise<(s: AppState) => AppState>) => {
      try {
        const patch = await fn()
        setState((s) => (s ? patch(s) : s))
      } catch (e) {
        setError(String((e as Error).message ?? e))
      }
    },
    [],
  )

  const actions: Actions = useMemo(
    () => ({
      createProyecto: (i) =>
        run(async () => {
          const p = await repo.createProyecto(i)
          setProyectoActivoId(p.id)
          return (s) => apply.upsertProyecto(s, p)
        }),
      updateProyecto: (id, p) =>
        run(async () => {
          const r = await repo.updateProyecto(id, p)
          return (s) => apply.upsertProyecto(s, r)
        }),
      deleteProyecto: (id) =>
        run(async () => {
          await repo.deleteProyecto(id)
          setProyectoActivoId((cur) => (cur === id ? null : cur))
          return (s) => apply.removeProyecto(s, id)
        }),
      createFrente: (i) =>
        run(async () => {
          const f = await repo.createFrente(i)
          return (s) => apply.upsertFrente(s, f)
        }),
      updateFrente: (id, p) =>
        run(async () => {
          const f = await repo.updateFrente(id, p)
          return (s) => apply.upsertFrente(s, f)
        }),
      deleteFrente: (id) =>
        run(async () => {
          await repo.deleteFrente(id)
          return (s) => apply.removeFrente(s, id)
        }),
      createSubFrente: (i) =>
        run(async () => {
          const sf = await repo.createSubFrente(i)
          return (s) => apply.upsertSubFrente(s, sf)
        }),
      updateSubFrente: (id, p) =>
        run(async () => {
          const sf = await repo.updateSubFrente(id, p)
          return (s) => apply.upsertSubFrente(s, sf)
        }),
      deleteSubFrente: (id) =>
        run(async () => {
          await repo.deleteSubFrente(id)
          return (s) => apply.removeSubFrente(s, id)
        }),
      createTarea: (i) =>
        run(async () => {
          const t = await repo.createTarea(i)
          return (s) => apply.upsertTarea(s, t)
        }),
      updateTarea: (id, p) =>
        run(async () => {
          const t = await repo.updateTarea(id, p)
          return (s) => apply.upsertTarea(s, t)
        }),
      deleteTarea: (id) =>
        run(async () => {
          await repo.deleteTarea(id)
          return (s) => apply.removeTarea(s, id)
        }),
      toggleHecha: (tareaId, hecha) =>
        run(async () => {
          const patch: PatchTarea = hecha ? { hecha: true, fechaReal: HOY } : { hecha: false }
          const t = await repo.updateTarea(tareaId, patch)
          return (s) => apply.upsertTarea(s, t)
        }),
      cambiarFechaObjetivo: (tareaId, nueva) =>
        run(async () => {
          const { tarea, historial } = await repo.cambiarFechaObjetivo(tareaId, nueva, USUARIO_ACTUAL)
          return (s) => apply.setHistorialTarea(apply.upsertTarea(s, tarea), tareaId, historial)
        }),
    }),
    [repo, run, HOY],
  )

  // Al cambiar de proyecto, se resetea el filtro de frente.
  const onSelectProyecto = useCallback((id: string) => {
    setProyectoActivoId(id)
    setFrenteSel('todos')
  }, [])

  // Frentes/tareas visibles: del proyecto activo + filtro de frente.
  const tareasVisibles = useMemo<Tarea[]>(() => {
    if (!state || !proyectoActivoId) return []
    const frenteIds = new Set(state.frentes.filter((f) => f.proyectoId === proyectoActivoId).map((f) => f.id))
    const subIds = new Set(
      state.subFrentes
        .filter((sf) => frenteIds.has(sf.frenteId) && (frenteSel === 'todos' || sf.frenteId === frenteSel))
        .map((sf) => sf.id),
    )
    return state.tareas.filter((t) => subIds.has(t.subFrenteId))
  }, [state, proyectoActivoId, frenteSel])

  const contadores = useMemo(
    () => (state ? contar(state, tareasVisibles, HOY) : null),
    [state, tareasVisibles, HOY],
  )

  if (error && !state) {
    return <div className="fatal">No se pudo cargar: {error}</div>
  }
  if (!state) {
    return <div className="cargando">Cargando…</div>
  }

  const proyecto = state.proyectos.find((p) => p.id === proyectoActivoId) ?? null

  return (
    <div className="app">
      <Sidebar
        state={state}
        proyectoActivoId={proyectoActivoId}
        frenteSel={frenteSel}
        onSelectProyecto={onSelectProyecto}
        onSelectFrente={setFrenteSel}
        actions={actions}
      />
      <div className="main">
        {error && (
          <div className="banner-error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Cerrar">✕</button>
          </div>
        )}
        {proyecto && contadores ? (
          <>
            <Header
              proyecto={proyecto}
              modo={repo.modo}
              vista={vista}
              onVista={setVista}
              contadores={contadores}
              hoy={HOY}
            />
            <div className="content">
              {vista === 'tabla' ? (
                <TableView
                  state={state}
                  proyectoId={proyecto.id}
                  frenteSel={frenteSel}
                  hoy={HOY}
                  actions={actions}
                />
              ) : (
                <GanttView state={state} proyectoId={proyecto.id} frenteSel={frenteSel} hoy={HOY} />
              )}
            </div>
          </>
        ) : (
          <div className="vacio">
            <p>No hay ningun proyecto seleccionado.</p>
            <p>Crea uno desde la barra lateral para empezar.</p>
          </div>
        )}
      </div>
    </div>
  )
}
