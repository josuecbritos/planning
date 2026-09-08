// #272 — Qué credenciales acepta `resumen-diario` como "el programador".
//
// ⚠️ ESTA LISTA SIRVE PARA RECONOCER A QUIEN LLAMA, NO PARA HABLAR CON LA BASE.
//
// Son dos usos distintos y NO comparten credencial. Para hablar con la base con
// permisos de servicio está `SUPABASE_SERVICE_ROLE_KEY`, y es la única que
// sirve: construir el cliente con una clave de esta lista hace que la base
// responda `Invalid API key` y la corrida muera antes de anotar nada. Pasó —la
// primera corrección de #272 tomaba `CLAVES[0]` para el cliente— y por eso esta
// advertencia está acá arriba y no al final.
//
// Vive en su propio archivo, y no dentro de `index.ts`, por la misma razón que
// `plantilla.ts`: para que la prueba `docs/prueba-272-credenciales.mjs` pueda
// comprobar la puerta DE VERDAD en vez de leer el código y creerle. No usa
// ninguna API de Deno —recibe los valores del entorno como argumentos—, así que
// se ejecuta igual en Deno y en Node.
//
// POR QUÉ EXISTE ESTE ARCHIVO. La primera versión comparaba contra
// `SUPABASE_SERVICE_ROLE_KEY` y nada más. En este proyecto esa variable está
// marcada como OBSOLETA: la vigente es `SUPABASE_SECRET_KEYS`. La llamada del
// programador llegaba con una credencial válida, la comparación se hacía contra
// `undefined` y la función respondía 401 — medido en los registros: la función
// arrancó y respondió 401 veintitrés milisegundos después, así que fue esta
// comparación y no la verificación de JWT de la plataforma.
//
// La lección, más allá del nombre de la variable: comparar contra UNA cadena
// fija convierte cualquier rotación de clave en una caída silenciosa. Un
// proyecto puede tener varias claves vigentes a la vez —es lo que permite rotar
// una sin cortar el servicio—, y por eso la variable vigente viene en PLURAL.

/**
 * Las credenciales que la función acepta, a partir de los dos valores del
 * entorno. Se aceptan TODAS las vigentes y también la anterior mientras el
 * proyecto la tenga: así esto funciona antes y después del cambio de sistema de
 * claves, sin una ventana en la que el resumen deje de salir.
 *
 * `SUPABASE_SECRET_KEYS` puede llegar como arreglo JSON o como lista separada
 * por comas. Se admiten las dos formas: cuál de las dos entrega la plataforma
 * no es algo que esta función deba adivinar, y equivocarse ahí es exactamente
 * el error que se está corrigiendo.
 *
 * Devuelve una lista SIN vacíos. Si queda vacía, la función no tiene con qué
 * autorizar a nadie y debe rechazar —nunca abrirse—, igual que #249 hizo con
 * `SITE_URL`.
 */
export function clavesAceptadas(secretKeys?: string | null, serviceRoleKey?: string | null): string[] {
  const crudo = (secretKeys ?? '').trim()
  let vigentes: string[] = []
  if (crudo) {
    try {
      const leido: unknown = JSON.parse(crudo)
      vigentes = Array.isArray(leido) ? leido.map((k) => String(k)) : [crudo]
    } catch {
      vigentes = crudo.split(',')
    }
  }
  const todas = [...vigentes, serviceRoleKey ?? '']
  const limpias = todas.map((k) => k.trim()).filter(Boolean)
  // Sin duplicados: la anterior puede estar también en la lista de vigentes.
  return [...new Set(limpias)]
}

/**
 * Comparación en tiempo constante. No es ceremonia: desde que esta función
 * dejó de apoyarse en una sola variable, esta comparación ES la puerta, y una
 * comparación que corta en el primer byte distinto le cuenta al que prueba
 * cuánto lleva acertado.
 *
 * La LONGITUD sí se filtra, y no hay forma de evitarlo comparando cadenas; no
 * es lo que se protege acá.
 */
export function credencialIgual(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  if (ba.length !== bb.length) return false
  let diferencia = 0
  for (let i = 0; i < ba.length; i++) diferencia |= ba[i] ^ bb[i]
  return diferencia === 0
}

/**
 * ¿La cabecera `Authorization` trae una credencial que esta función acepta?
 *
 * Con la lista VACÍA devuelve `false` siempre: sin ninguna clave configurada no
 * hay forma de saber quién es legítimo, y abrirse "por si acaso" sería peor que
 * no responder.
 */
export function autorizada(cabecera: string | null, claves: string[]): boolean {
  const enviada = (cabecera ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!enviada || claves.length === 0) return false
  // Se recorren TODAS y no se corta en la primera que calza: con una sola clave
  // no cambia nada, y con varias evita que el tiempo de respuesta diga cuál fue.
  let alguna = false
  for (const k of claves) if (credencialIgual(enviada, k)) alguna = true
  return alguna
}
