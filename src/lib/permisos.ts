import type { AlcancePermiso, Tarea, Usuario } from '../types'

// Resolucion de permisos (§7). `Can` responde "¿puede el usuario actual hacer
// X (sobre esta tarea)?". Los admins pueden todo; los clientes segun su
// configuracion por permiso + alcance (todas / solo asignadas). La barrera
// real vive en la base de datos (RLS + trigger); esto gobierna la UI.

export interface Can {
  esAdmin: boolean
  crearFrentes: boolean
  crearSubFrentes: boolean
  crearTareas: boolean
  /** Renombrar/eliminar frentes y sub frentes, proyectos, usuarios: solo admin. */
  editarEstructura: boolean
  editarFechas(t: Tarea): boolean
  marcarHechas(t: Tarea): boolean
  editarTareas(t: Tarea): boolean
  archivarEliminar(t: Tarea): boolean
  asignarResponsable(t: Tarea): boolean
  /** true si tiene ALGUN permiso sobre tareas (muestra columnas/controles). */
  algunoDeTareas: boolean
}

export function makeCan(u: Usuario | null): Can {
  const esAdmin = u?.rol === 'admin'
  const p = (esAdmin ? undefined : u?.permisos) ?? {}

  const conAlcance = (perm: false | AlcancePermiso | undefined) => (t: Tarea) =>
    esAdmin || perm === 'todas' || (perm === 'asignadas' && t.responsableId === u?.id)

  return {
    esAdmin,
    crearFrentes: esAdmin || !!p.crearFrentes,
    crearSubFrentes: esAdmin || !!p.crearSubFrentes,
    crearTareas: esAdmin || !!p.crearTareas,
    editarEstructura: esAdmin,
    editarFechas: conAlcance(p.editarFechas),
    marcarHechas: conAlcance(p.marcarHechas),
    editarTareas: conAlcance(p.editarTareas),
    archivarEliminar: conAlcance(p.archivarEliminar),
    asignarResponsable: conAlcance(p.asignarResponsable),
    algunoDeTareas:
      esAdmin ||
      !!(p.editarFechas || p.marcarHechas || p.editarTareas || p.archivarEliminar || p.asignarResponsable),
  }
}
