import type {
  AlcancePermiso,
  AppState,
  PermisosProyecto,
  PermisosTareas,
  Tarea,
  Usuario,
} from '../types'

// Resolución de permisos (reestructuración roles-y-permisos). Principio
// rector (2): si creaste el proyecto → control total dentro de él; si te
// invitaron/asignaron → operas según los permisos de TU ACCESO (set de
// ocho), seas cliente o consultor. El admin queda fuera del principio: hace
// todo en cualquier proyecto. La barrera real vive en la base de datos
// (RLS + triggers); esto gobierna la UI.

// ---- Defaults por rol (4) ----

/** Cliente: ejecutor del plan — autonomía sobre SUS tareas, sin tocar la
 *  estructura (4.2). */
export const DEFAULT_PERMISOS_CLIENTE: PermisosTareas = {
  crearTareas: true,
  editarFechas: 'asignadas',
  marcarHechas: 'asignadas',
  asignarResponsable: 'todas',
}

/** Consultor invitado a proyecto ajeno: un colega — autonomía plena (4.3). */
export const DEFAULT_PERMISOS_CONSULTOR_INVITADO: PermisosTareas = {
  crearFrentes: true,
  crearSubFrentes: true,
  crearTareas: true,
  editarFechas: 'todas',
  marcarHechas: 'todas',
  editarTareas: 'todas',
  archivarEliminar: 'todas',
  asignarResponsable: 'todas',
}

/** Permisos de proyecto del consultor (4.1): autonomía sobre lo suyo; la
 *  configuración de permisos la retiene el admin. */
export const DEFAULT_PERMISOS_PROYECTO: PermisosProyecto = {
  crearProyectos: true,
  archivarEliminarProyectos: true,
  invitarClientes: true,
  configurarPermisosClientes: false,
}

/** Default del set de ocho según el rol del usuario que recibe el acceso. */
export function defaultPermisosTareas(rol: Usuario['rol']): PermisosTareas {
  if (rol === 'cliente') return { ...DEFAULT_PERMISOS_CLIENTE }
  if (rol === 'consultor') return { ...DEFAULT_PERMISOS_CONSULTOR_INVITADO }
  return {}
}

// ---- Consultas de contexto ----

/** ¿`usuario` es el dueño del proyecto? */
export function esDuenoDe(state: AppState, usuario: Usuario | null, proyectoId: string): boolean {
  if (!usuario) return false
  return state.proyectos.some((p) => p.id === proyectoId && p.duenoId === usuario.id)
}

/** Permisos del usuario DENTRO de un proyecto (los de su acceso). */
export function permisosEn(state: AppState, usuario: Usuario | null, proyectoId: string): PermisosTareas {
  if (!usuario) return {}
  return (
    state.accesos.find((a) => a.usuarioId === usuario.id && a.proyectoId === proyectoId)?.permisos ?? {}
  )
}

/** Permiso de NIVEL PROYECTO (3.1). Admin: siempre. */
export function permisoProyecto(usuario: Usuario | null, permiso: keyof PermisosProyecto): boolean {
  if (!usuario) return false
  if (usuario.rol === 'admin') return true
  if (usuario.rol !== 'consultor') return false
  return !!usuario.permisosProyecto?.[permiso]
}

/** ¿Puede crear proyectos? (gobierna el "+" de la sidebar) */
export function puedeCrearProyectos(usuario: Usuario | null): boolean {
  return permisoProyecto(usuario, 'crearProyectos')
}

/** ¿Puede editar (nombre/descripción/color/estado) este proyecto? */
export function puedeEditarProyecto(state: AppState, usuario: Usuario | null, proyectoId: string): boolean {
  return usuario?.rol === 'admin' || esDuenoDe(state, usuario, proyectoId)
}

/** ¿Puede eliminar este proyecto? (dueño requiere el permiso 3.1) */
export function puedeEliminarProyecto(state: AppState, usuario: Usuario | null, proyectoId: string): boolean {
  if (usuario?.rol === 'admin') return true
  return esDuenoDe(state, usuario, proyectoId) && permisoProyecto(usuario, 'archivarEliminarProyectos')
}

/** ¿Puede invitar/quitar CLIENTES en este proyecto? */
export function puedeInvitarClientesEn(state: AppState, usuario: Usuario | null, proyectoId: string): boolean {
  if (usuario?.rol === 'admin') return true
  return esDuenoDe(state, usuario, proyectoId) && permisoProyecto(usuario, 'invitarClientes')
}

/** ¿Puede configurar los permisos de los CLIENTES de este proyecto? (5) */
export function puedeConfigurarClientesEn(state: AppState, usuario: Usuario | null, proyectoId: string): boolean {
  if (usuario?.rol === 'admin') return true
  return esDuenoDe(state, usuario, proyectoId) && permisoProyecto(usuario, 'configurarPermisosClientes')
}

// ---- Can: "¿puede el usuario actual hacer X (sobre esta tarea)?" ----

export interface Can {
  /** Rol admin real (gobierna pantallas de administración). */
  esAdmin: boolean
  /** Control total EN EL PROYECTO ACTIVO: admin o dueño (2). */
  controlTotal: boolean
  crearFrentes: boolean
  crearSubFrentes: boolean
  crearTareas: boolean
  /** Renombrar/eliminar frentes y sub frentes: admin o dueño. */
  editarEstructura: boolean
  editarFechas(t: Tarea): boolean
  marcarHechas(t: Tarea): boolean
  editarTareas(t: Tarea): boolean
  archivarEliminar(t: Tarea): boolean
  asignarResponsable(t: Tarea): boolean
  /** true si tiene ALGUN permiso sobre tareas (muestra columnas/controles). */
  algunoDeTareas: boolean
}

/**
 * Construye el Can para el PROYECTO ACTIVO. Admin y dueño: todo. Invitado
 * (cliente o consultor asignado): según los permisos de su acceso.
 * `proyectoId` null (sin proyecto activo): solo el admin conserva permisos.
 */
export function makeCan(state: AppState | null, u: Usuario | null, proyectoId: string | null): Can {
  const esAdmin = u?.rol === 'admin'
  const esDueno = !!(state && u && proyectoId && esDuenoDe(state, u, proyectoId))
  const total = esAdmin || esDueno
  const p: PermisosTareas = total || !state || !proyectoId ? {} : permisosEn(state, u, proyectoId)

  const conAlcance = (perm: false | AlcancePermiso | undefined) => (t: Tarea) =>
    total || perm === 'todas' || (perm === 'asignadas' && t.responsableId === u?.id)

  return {
    esAdmin,
    controlTotal: total,
    crearFrentes: total || !!p.crearFrentes,
    crearSubFrentes: total || !!p.crearSubFrentes,
    crearTareas: total || !!p.crearTareas,
    editarEstructura: total,
    editarFechas: conAlcance(p.editarFechas),
    marcarHechas: conAlcance(p.marcarHechas),
    editarTareas: conAlcance(p.editarTareas),
    archivarEliminar: conAlcance(p.archivarEliminar),
    asignarResponsable: conAlcance(p.asignarResponsable),
    algunoDeTareas:
      total ||
      !!(p.editarFechas || p.marcarHechas || p.editarTareas || p.archivarEliminar || p.asignarResponsable),
  }
}
