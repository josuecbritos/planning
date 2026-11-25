// #272 / #356 — Las credenciales de `resumen-diario`.
//
// DOS USOS, Y DESDE #356 UNA SOLA FUENTE: `SUPABASE_SECRET_KEYS`.
//
//   1. RECONOCER A QUIEN LLAMA (la puerta). Se acepta CUALQUIERA de las claves
//      secretas vigentes del proyecto: un proyecto puede tener varias a la vez
//      —es lo que permite rotar una sin cortar el servicio—, y comparar contra
//      una sola cadena fija convirtió una rotación en una caída silenciosa
//      (#272). `clavesAceptadas`.
//   2. HABLAR CON LA BASE con permisos de servicio. Se usa la clave con NOMBRE
//      `default`, como indica la guía oficial de Supabase
//      (`JSON.parse(SUPABASE_SECRET_KEYS)['default']`). `claveConNombre`.
//
// La antigua `SUPABASE_SERVICE_ROLE_KEY` ya no se lee (#356): Supabase retira
// las claves `anon` y `service_role` a fines de 2026.
//
// EL FORMATO. Según la documentación, `SUPABASE_SECRET_KEYS` llega como objeto
// JSON con nombre (`{"default":"sb_secret_…"}`). Hasta #356 esto solo entendía
// un arreglo o una lista separada por comas: con un objeto tomaba el TEXTO JSON
// entero como si fuera una sola clave — candidato a ser la causa del
// `Invalid API key` anotado al corregir #272, cuando se armó el cliente con una
// clave de esa lista. Ahora se entienden las tres formas, y el formato real se
// midió en producción antes del cambio (CHANGELOG, #356).
//
// Vive en su propio archivo, y no dentro de `index.ts`, para que
// `docs/prueba-272-credenciales.mjs` pueda comprobar la puerta DE VERDAD en vez
// de leer el código y creerle. No usa ninguna API de Deno —recibe los valores
// del entorno como argumentos—, así que se ejecuta igual en Deno y en Node.

/** Las claves de un valor de `SUPABASE_SECRET_KEYS`, en cualquiera de sus formas. */
function leer(crudo: string): { lista: string[]; nombradas: Record<string, string> } {
  try {
    const leido: unknown = JSON.parse(crudo)
    if (Array.isArray(leido)) return { lista: leido.map((k) => String(k)), nombradas: {} }
    if (leido && typeof leido === 'object') {
      const nombradas = Object.fromEntries(
        Object.entries(leido as Record<string, unknown>).filter(([, v]) => typeof v === 'string') as [string, string][],
      )
      return { lista: Object.values(nombradas), nombradas }
    }
    if (typeof leido === 'string') return { lista: [leido], nombradas: {} }
    return { lista: [crudo], nombradas: {} }
  } catch {
    return { lista: crudo.split(','), nombradas: {} }
  }
}

/**
 * Uso 1 — Las credenciales que la puerta acepta: TODAS las claves secretas
 * vigentes. Objeto con nombre, arreglo JSON o lista separada por comas.
 *
 * Devuelve una lista SIN vacíos ni duplicados. Si queda vacía, la función no
 * tiene con qué autorizar a nadie y debe rechazar —nunca abrirse—, igual que
 * #249 hizo con `SITE_URL`.
 */
export function clavesAceptadas(secretKeys?: string | null): string[] {
  const crudo = (secretKeys ?? '').trim()
  if (!crudo) return []
  const limpias = leer(crudo).lista.map((k) => k.trim()).filter(Boolean)
  return [...new Set(limpias)]
}

/**
 * Uso 2 — La clave con la que se habla con la base: la que tiene NOMBRE
 * `nombre` (por omisión `default`). Solo existe si la variable llega como
 * objeto con nombre; con cualquier otra forma devuelve `null` y la función
 * responde 503 diciendo qué falta, en vez de adivinar cuál de una lista usar.
 */
export function claveConNombre(secretKeys?: string | null, nombre = 'default'): string | null {
  const crudo = (secretKeys ?? '').trim()
  if (!crudo) return null
  const clave = (leer(crudo).nombradas[nombre] ?? '').trim()
  return clave || null
}

/**
 * Comparación en tiempo constante. No es ceremonia: esta comparación ES la
 * puerta, y una que corta en el primer byte distinto le cuenta al que prueba
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
 * ¿Quien llama trae una credencial que esta función acepta?
 *
 * #356: la clave se busca en la cabecera `apikey`, que es donde la guía de
 * Supabase dice que van las claves nuevas, y TAMBIÉN en `Authorization:
 * Bearer`, donde la manda hoy el programador: así el cambio del programador no
 * deja ni una hora sin resumen. Basta con que una de las dos calce.
 *
 * Con la lista VACÍA devuelve `false` siempre: sin ninguna clave configurada no
 * hay forma de saber quién es legítimo, y abrirse "por si acaso" sería peor que
 * no responder.
 */
export function autorizada(apikey: string | null, authorization: string | null, claves: string[]): boolean {
  const enviadas = [(apikey ?? '').trim(), (authorization ?? '').replace(/^Bearer\s+/i, '').trim()].filter(Boolean)
  if (!enviadas.length || claves.length === 0) return false
  // Se recorren TODAS y no se corta en la primera que calza: el tiempo de
  // respuesta no dice cuál fue ni por qué cabecera llegó.
  let alguna = false
  for (const enviada of enviadas) for (const k of claves) if (credencialIgual(enviada, k)) alguna = true
  return alguna
}
