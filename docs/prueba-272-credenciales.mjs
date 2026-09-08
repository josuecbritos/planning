// #272 (corrección) — La puerta de `resumen-diario`: qué credenciales acepta.
//
// EL DEFECTO QUE ESTO CIERRA:
//
//   La comprobación comparaba contra `SUPABASE_SERVICE_ROLE_KEY` y nada más.
//   En este proyecto esa variable está marcada como OBSOLETA —la vigente es
//   `SUPABASE_SECRET_KEYS`—, así que la comparación se hacía contra `undefined`
//   y la llamada del programador, con una credencial válida, recibía 401.
//
//   Medido en los registros de la función: arrancó a las 18:15:32.660 y
//   respondió 401 a las 18:15:32.683. Veintitrés milisegundos: el código CORRIÓ.
//   No fue la verificación de JWT de la plataforma —esa no habría dejado
//   arrancar la función—, fue esta comparación.
//
// Esta prueba importa `credenciales.ts`, que es lo que la función usa de verdad.
//
// Cómo correrla:  node docs/prueba-272-credenciales.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  autorizada,
  clavesAceptadas,
  credencialIgual,
} from '../supabase/functions/resumen-diario/credenciales.ts'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const VIGENTE = 'sb_secret_VIGENTE_0000000000'
const OTRA = 'sb_secret_LA_OTRA_111111111'
const ANTERIOR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role.anterior'

console.log('\n── El defecto: la clave vigente ya no era la obsoleta ──')
// El escenario exacto de producción: la variable obsoleta NO está, y la
// llamada llega con una clave vigente.
const soloVigentes = clavesAceptadas(VIGENTE, undefined)
chk(soloVigentes.includes(VIGENTE), 'la clave vigente se acepta aunque no exista la obsoleta', JSON.stringify(soloVigentes))
chk(
  autorizada(`Bearer ${VIGENTE}`, soloVigentes),
  '#272 · la llamada del programador con la clave VIGENTE pasa',
)
chk(
  !autorizada(`Bearer ${ANTERIOR}`, soloVigentes),
  '#272 · y una que el proyecto ya no tiene, no',
)

// Control negativo. `credenciales.ts` es un archivo NUEVO, así que no hay una
// versión anterior contra la que correr esta prueba: la regla vieja se escribe
// acá, tal como estaba, y se comprueba que en el mismo escenario FALLA. Sin
// esto, "la clave vigente pasa" no distingue el arreglo de una prueba que
// habría aprobado igual antes.
const REGLA_VIEJA = (cabecera, serviceRoleKey) => cabecera === `Bearer ${serviceRoleKey}`
chk(
  !REGLA_VIEJA(`Bearer ${VIGENTE}`, undefined),
  '#272 · control negativo: la regla ANTERIOR rechazaba esta misma llamada',
  'comparaba contra `Bearer undefined`',
)
chk(
  REGLA_VIEJA(`Bearer ${ANTERIOR}`, ANTERIOR),
  '#272 · control negativo: y solo pasaba cuando la obsoleta seguía existiendo',
)

console.log('\n── Varias claves a la vez (rotación) ──')
// `SUPABASE_SECRET_KEYS` viene en PLURAL porque un proyecto puede tener varias
// vigentes: es lo que permite rotar una sin cortar el servicio. Comparar contra
// UNA sola convierte cada rotación en una caída silenciosa.
for (const [forma, crudo] of [
  ['lista separada por comas', `${VIGENTE},${OTRA}`],
  ['lista con espacios', `${VIGENTE} , ${OTRA}`],
  ['arreglo JSON', JSON.stringify([VIGENTE, OTRA])],
]) {
  const claves = clavesAceptadas(crudo, undefined)
  chk(
    claves.length === 2 && claves.includes(VIGENTE) && claves.includes(OTRA),
    `#272 · se entienden las dos claves cuando llegan como ${forma}`,
    JSON.stringify(claves),
  )
  chk(
    autorizada(`Bearer ${OTRA}`, claves),
    `#272 · y la SEGUNDA también entra (${forma})`,
  )
}

console.log('\n── La anterior se sigue aceptando mientras exista ──')
// Para que esto funcione antes y después del cambio de sistema de claves, sin
// una ventana en la que el resumen deje de salir.
const ambas = clavesAceptadas(VIGENTE, ANTERIOR)
chk(autorizada(`Bearer ${VIGENTE}`, ambas), '#272 · con las dos configuradas, la vigente entra')
chk(autorizada(`Bearer ${ANTERIOR}`, ambas), '#272 · y la anterior también')
chk(
  clavesAceptadas(VIGENTE, VIGENTE).length === 1,
  '#272 · si la misma clave está en las dos variables, se cuenta una vez',
)

console.log('\n── Lo que NO pasa ──')
chk(!autorizada(`Bearer ${VIGENTE}`, []), '#272 · sin ninguna clave configurada NO se autoriza a nadie')
chk(!autorizada(null, ambas), '#272 · sin cabecera, no')
chk(!autorizada('Bearer ', ambas), '#272 · con la cabecera vacía, no')
chk(!autorizada('Bearer no-es-la-clave', ambas), '#272 · con otra credencial, no')
chk(!autorizada(`Bearer ${VIGENTE}x`, ambas), '#272 · ni con la clave y un carácter de más')
chk(!autorizada(`Bearer ${VIGENTE.slice(0, -1)}`, ambas), '#272 · ni con la clave a la que le falta uno')
chk(
  clavesAceptadas('', '').length === 0 && clavesAceptadas(undefined, null).length === 0,
  '#272 · el entorno vacío no produce ninguna clave (nada de aceptar la cadena vacía)',
)
// Sin esto, una variable vacía dejaría la lista con `['']` y `Bearer ` entraría.
chk(!autorizada('Bearer ', clavesAceptadas(',,', '')), '#272 · ni una lista de comas sueltas abre la puerta')

console.log('\n── La cabecera se lee como la manda el programador ──')
chk(autorizada(`bearer ${VIGENTE}`, ambas), '#272 · "bearer" en minúscula también se entiende')
chk(autorizada(`Bearer   ${VIGENTE}  `, ambas), '#272 · y los espacios de más no cambian el resultado')

console.log('\n── La comparación no cuenta por dónde falla ──')
chk(credencialIgual('abc', 'abc'), 'iguales, sí')
chk(!credencialIgual('abc', 'abd'), 'distintas al final, no')
chk(!credencialIgual('abc', 'xbc'), 'distintas al principio, no')
chk(!credencialIgual('abc', 'abcd'), 'de largo distinto, no')
const fuente = readFileSync('supabase/functions/resumen-diario/credenciales.ts', 'utf8')
chk(
  !/\breturn true\b[\s\S]{0,80}?for \(/.test(fuente) && /diferencia \|=/.test(fuente),
  'la comparación recorre los bytes enteros en vez de cortar en el primero distinto',
)

console.log('\n── Los dos usos de credencial no comparten clave ──')
// La primera corrección de #272 arregló la puerta y rompió lo que viene
// después: construía el cliente de la base con `CLAVES[0]` —la lista que sirve
// para RECONOCER a quien llama— y la base respondía `Invalid API key`. La
// corrida moría antes de anotarse, así que la tabla de corridas quedaba vacía y
// no llegaba ningún correo.
//
// Cuál clave usa el cliente es una decisión de `index.ts`, que importa APIs de
// Deno y no se puede ejecutar acá. Estas comprobaciones LEEN EL CÓDIGO, y se
// dice para que valgan por lo que son: guardias contra volver a mezclarlos.
const idx = readFileSync('supabase/functions/resumen-diario/index.ts', 'utf8')
const idxVivo = idx.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
chk(
  /const CLAVE_SERVICIO = \(Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(idxVivo),
  '#272 · la clave de servicio sale de SUPABASE_SERVICE_ROLE_KEY',
)
chk(
  /createClient\(\s*Deno\.env\.get\('SUPABASE_URL'\)!,\s*CLAVE_SERVICIO\s*\)/.test(idxVivo),
  '#272-1 · y es con ESA con la que se construye el cliente de la base',
)
chk(!/CLAVE_ADMIN/.test(idx), '#272-2 · `CLAVE_ADMIN` desapareció, también de los comentarios')
chk(
  !/createClient\([^)]*\bCLAVES\b/.test(idxVivo),
  '#272 · el cliente NO se construye con la lista de la puerta',
)
chk(
  /\['SUPABASE_SERVICE_ROLE_KEY', Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)\]/.test(idxVivo),
  '#272-1 · si esa variable falta, entra en la lista que responde 503',
)
chk(
  /FALTAN\.length > 0[\s\S]{0,200}?responder\(503/.test(idxVivo),
  '#272-1 · y el 503 llega con el motivo anotado, sin caerse a otra credencial',
)
chk(
  /ESTA LISTA SIRVE PARA RECONOCER A QUIEN LLAMA, NO PARA HABLAR CON LA BASE/.test(
    readFileSync('supabase/functions/resumen-diario/credenciales.ts', 'utf8'),
  ),
  '#272-2 · y queda dicho en el propio `credenciales.ts`',
)

// Control negativo de ESTA corrección: la regla anterior y la nueva, las dos
// escritas acá, sobre el mismo entorno de producción —una clave vigente y la
// anterior—. Sin esto, las comprobaciones de arriba solo dirían que el código
// dice lo que dice.
const claveDelClienteANTES = (secretKeys, serviceRoleKey) => clavesAceptadas(secretKeys, serviceRoleKey)[0]
const claveDelClienteAHORA = (_secretKeys, serviceRoleKey) => (serviceRoleKey ?? '').trim()
chk(
  claveDelClienteANTES(VIGENTE, ANTERIOR) === VIGENTE,
  '#272 · control negativo: la regla ANTERIOR tomaba la clave de la puerta para hablar con la base',
  'de ahí el `Invalid API key`',
)
chk(
  claveDelClienteAHORA(VIGENTE, ANTERIOR) === ANTERIOR,
  '#272 · y la de ahora toma la de SERVICIO, aunque haya claves vigentes en el entorno',
)

console.log('\n── Ninguna otra función de servidor compara contra la obsoleta ──')
// La revisión que pidió el pedido, hecha sobre el código y no de memoria: se
// distingue USAR la clave (para construir el cliente admin) de COMPARAR contra
// ella (que es lo que rompía). Si alguien agrega una comparación nueva contra la
// variable obsoleta, esto lo ve.
const dir = 'supabase/functions'
const comparan = []
const usan = []
for (const fn of readdirSync(dir)) {
  const archivo = join(dir, fn, 'index.ts')
  let src
  try {
    src = readFileSync(archivo, 'utf8')
  } catch {
    continue
  }
  const sinComentarios = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  // Comparar = la variable aparece a un lado de ===, !== o dentro de una
  // plantilla que se compara con la cabecera.
  if (/(===|!==)[^\n]*SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY[^\n]*(===|!==)/.test(sinComentarios)) {
    comparan.push(fn)
  }
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(sinComentarios)) usan.push(fn)
}
chk(comparan.length === 0, '#272 · ninguna función COMPARA contra SUPABASE_SERVICE_ROLE_KEY', comparan.join(', '))
console.log(
  `  (la NOMBRAN, que es otra cosa: las cuatro anteriores para construir su cliente` +
    `\n   admin, y resumen-diario para seguir aceptándola mientras exista:` +
    `\n   ${usan.join(', ') || 'ninguna'})`,
)
