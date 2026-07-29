import type { RealtimeChannel } from '@supabase/supabase-js'
import { getClient } from './client'

// =====================================================================
// #255 — La cañería de tiempo real. ES UNA SOLA (principio 3 del pedido):
// conexión, reconexión, degradación y la semántica de los eventos viven aquí,
// y las tablas SE SUSCRIBEN a ella. La entrega 2 (#260) sumará sus tablas
// llamando a `suscribirTabla` con otro nombre de tabla — no construirá otro
// mecanismo. Si alguna vez aparece un segundo punto de conexión en el código,
// algo se hizo mal.
//
// LA SEMÁNTICA (principio 1): el canal AVISA; la verdad se relee de la base.
// Los eventos no traen "qué cambió" utilizable — un canal caído se pierde los
// eventos para siempre, y los DELETE viajan solo con la clave primaria (a
// propósito: ver la migración 20)—, así que el callback no recibe filas:
// recibe la señal de que hay que releer. La relectura pasa por RLS, con lo
// que el eco desaparece por construcción: releer tras una acción propia
// devuelve el mismo estado, no lo aplica dos veces.
//
// DEGRADACIÓN (principio 2): si el canal no conecta —red que bloquea
// WebSockets, límite del plan, lo que sea— se reintenta unas veces con
// espera creciente y después se deja de intentar, EN SILENCIO. La aplicación
// funciona exactamente como sin tiempo real: todo al recargar. Ningún error
// de este módulo llega jamás a la pantalla.
//
// SEGURIDAD: el filtro `usuario_id=eq.X` acota el ruido, pero NO es la
// barrera — la barrera es la RLS, que Realtime evalúa con el JWT del
// suscriptor para INSERT/UPDATE (los DELETE llevan solo el uuid; ver la
// migración 20). supabase-js reenvía el token de la sesión al canal por su
// cuenta en cada login/refresh.
// =====================================================================

/** Por qué avisa el canal. `reconectado` implica posible pérdida de eventos:
 *  quien escucha debe releer TODO su estado, no asumir que no pasó nada. */
export type MotivoAviso = 'cambio' | 'reconectado'

export interface SuscripcionTabla {
  /** Cierra el canal y cancela cualquier reintento pendiente. */
  cerrar(): void
}

/** Reintentos ante un canal que no conecta: pocos y espaciados. Tras el
 *  último, la sesión queda sin tiempo real hasta recargar (degradación). */
const ESPERAS_MS = [5_000, 15_000, 45_000]

/**
 * Suscribe UNA tabla al canal de cambios. `alAviso` se llama con 'cambio' por
 * cada evento (insert/update/delete) y con 'reconectado' cuando el canal
 * vuelve tras haberse perdido — en ambos casos la reacción correcta es releer
 * la base, nunca acumular eventos.
 *
 * `filtro` es un filtro de servidor de Realtime (p. ej. `usuario_id=eq.<id>`)
 * que reduce tráfico en INSERT/UPDATE. Los DELETE no lo respetan (la fila ya
 * no existe para evaluarlo), así que pueden llegar avisos de borrados ajenos:
 * inofensivo, porque el aviso no trae contenido y la relectura pasa por RLS.
 */
export function suscribirTabla(opts: {
  tabla: string
  filtro?: string
  alAviso: (motivo: MotivoAviso) => void
}): SuscripcionTabla {
  let canal: RealtimeChannel | null = null
  let reintento: number | null = null
  let intentos = 0
  let estuvoSuscrito = false
  let cerrado = false

  function abrir() {
    if (cerrado) return
    let cliente
    try {
      cliente = getClient()
    } catch {
      return // sin configuración no hay canal; la app sigue igual (principio 2)
    }

    canal = cliente
      .channel(`cambios:${opts.tabla}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: opts.tabla, ...(opts.filtro ? { filter: opts.filtro } : {}) },
        () => opts.alAviso('cambio'),
      )
      .subscribe((estado) => {
        if (cerrado) return
        if (estado === 'SUBSCRIBED') {
          intentos = 0
          // La PRIMERA suscripción no avisa: el estado recién cargado ya está
          // al día. Las siguientes sí: entre la caída y la vuelta pudo pasar
          // cualquier cosa y esos eventos no se recuperan.
          if (estuvoSuscrito) opts.alAviso('reconectado')
          estuvoSuscrito = true
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
          // supabase-js reintenta las caídas de red por su cuenta; esto cubre
          // el canal que no logra establecerse. Pocos reintentos y silencio.
          descartarCanal()
          if (intentos < ESPERAS_MS.length) {
            reintento = window.setTimeout(abrir, ESPERAS_MS[intentos])
            intentos += 1
          }
        }
      })
  }

  function descartarCanal() {
    if (!canal) return
    const c = canal
    canal = null
    try {
      void getClient().removeChannel(c)
    } catch {
      /* cerrar nunca lanza hacia afuera */
    }
  }

  abrir()

  return {
    cerrar() {
      cerrado = true
      if (reintento !== null) window.clearTimeout(reintento)
      descartarCanal()
    },
  }
}
