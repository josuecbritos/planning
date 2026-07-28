import type { ISODate } from '../types'

/**
 * "Hoy" del modo Local (demo sin backend): una fecha fija para que el plan de
 * ejemplo muestre tareas hechas, vencidas y futuras a la vez. Con Supabase,
 * "hoy" es la fecha real del sistema.
 *
 * #240: vive acá, en un módulo de una constante, y no en `seed.ts`. La
 * aplicación necesita este valor siempre, pero los DATOS de demo solo en modo
 * Local; tenerlos en el mismo archivo obligaba a cargar el plan de ejemplo
 * completo —usuarios incluidos— aunque el backend fuera la base real.
 */
export const HOY_SIMULADO: ISODate = '2024-10-30'
