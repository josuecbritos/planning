import { useMemo, useState } from 'react'
import type { AppState, Tarea } from './types'
import { initialState, HOY } from './data/seed'
import { toggleHecha, cambiarFechaObjetivo } from './lib/actions'
import { contar } from './lib/derive'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { TableView } from './components/TableView'
import { GanttView } from './components/GanttView'

export type Vista = 'tabla' | 'gantt'
/** Frente seleccionado en el sidebar, o 'todos'. */
export type FrenteSel = string | 'todos'

// Admin que "actua" en el dummy (usado como cambiado_por al replanificar).
const USUARIO_ACTUAL = 'u-jb'

export default function App() {
  const [state, setState] = useState<AppState>(initialState)
  const [vista, setVista] = useState<Vista>('tabla')
  const [frenteSel, setFrenteSel] = useState<FrenteSel>('todos')

  const proyecto = state.proyectos[0]

  // Tareas visibles segun el frente filtrado (afecta vista y contadores).
  const tareasVisibles = useMemo<Tarea[]>(() => {
    const subIds = new Set(
      state.subFrentes
        .filter((sf) => frenteSel === 'todos' || sf.frenteId === frenteSel)
        .map((sf) => sf.id),
    )
    return state.tareas.filter((t) => subIds.has(t.subFrenteId))
  }, [state.subFrentes, state.tareas, frenteSel])

  const contadores = useMemo(
    () => contar(state, tareasVisibles, HOY),
    [state, tareasVisibles],
  )

  // -- Acciones --
  const onToggleHecha = (tareaId: string) =>
    setState((s) => toggleHecha(s, tareaId, HOY))

  const onCambiarFecha = (tareaId: string, nueva: string) =>
    setState((s) => cambiarFechaObjetivo(s, tareaId, nueva, USUARIO_ACTUAL))

  return (
    <div className="app">
      <Sidebar
        state={state}
        proyecto={proyecto}
        frenteSel={frenteSel}
        onSelectFrente={setFrenteSel}
        hoy={HOY}
      />
      <div className="main">
        <Header
          proyecto={proyecto}
          vista={vista}
          onVista={setVista}
          contadores={contadores}
          hoy={HOY}
        />
        <div className="content">
          {vista === 'tabla' ? (
            <TableView
              state={state}
              frenteSel={frenteSel}
              hoy={HOY}
              onToggleHecha={onToggleHecha}
              onCambiarFecha={onCambiarFecha}
            />
          ) : (
            <GanttView
              state={state}
              frenteSel={frenteSel}
              hoy={HOY}
            />
          )}
        </div>
      </div>
    </div>
  )
}
