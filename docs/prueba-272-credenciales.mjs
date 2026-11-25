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
// #356 — Claves nuevas de Supabase. La puerta y el cliente salen ahora de UNA
// sola variable, `SUPABASE_SECRET_KEYS`, que según la guía oficial llega como
// objeto JSON con nombre (`{"default":"sb_secret_…"}`); la clave va en la
// cabecera `apikey`; y ninguna función lee ya `SUPABASE_SERVICE_ROLE_KEY` ni
// `SUPABASE_ANON_KEY`. Las comprobaciones de #272 siguen —rotación, formatos,
// lo que no debe pasar, tiempo constante, los dos usos—, adaptadas.
//
// Esta prueba importa `credenciales.ts`, que es lo que la función usa de verdad.
//
// Cómo correrla:  node docs/prueba-272-credenciales.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  autorizada,
  claveConNombre,
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
// El formato que la guía de Supabase documenta para la variable.
const OBJETO = JSON.stringify({ default: VIGENTE, rotacion: OTRA })

console.log('\n── #356 · El formato con nombre ──')
const deObjeto = clavesAceptadas(OBJETO)
chk(deObjeto.length === 2 && deObjeto.includes(VIGENTE) && deObjeto.includes(OTRA), '#356 · con el objeto con nombre se entienden sus claves, no el texto JSON entero', JSON.stringify(deObjeto))
chk(!deObjeto.includes(OBJETO), '#356 · el texto JSON NO se toma como si fuera una clave')
chk(claveConNombre(OBJETO) === VIGENTE, '#356 · la clave para hablar con la base es la de nombre `default`')
chk(claveConNombre(OBJETO, 'rotacion') === OTRA, '#356 · y se puede pedir otra por su nombre')
chk(claveConNombre(JSON.stringify({ otra: OTRA })) === null, '#356 · sin `default`, no hay clave de servicio (503), no se adivina otra')
chk(claveConNombre(`${VIGENTE},${OTRA}`) === null && claveConNombre(JSON.stringify([VIGENTE])) === null, '#356 · con una lista no se elige "la primera": tampoco hay clave de servicio')
// Control negativo: la lectura ANTERIOR, escrita acá tal como estaba.
const LECTURA_VIEJA = (crudo) => {
  try {
    const l = JSON.parse(crudo)
    return Array.isArray(l) ? l.map(String) : [crudo]
  } catch {
    return crudo.split(',')
  }
}
chk(LECTURA_VIEJA(OBJETO)[0] === OBJETO, '#356 · control negativo: la lectura anterior tomaba el texto JSON entero como UNA clave', 'candidato al `Invalid API key` de #272')
chk(!autorizada(VIGENTE, null, LECTURA_VIEJA(OBJETO)), '#356 · control negativo: y con eso la clave vigente NO entraba por la puerta')

console.log('\n── #356 · La clave en la cabecera `apikey` ──')
const claves = clavesAceptadas(OBJETO)
chk(autorizada(VIGENTE, null, claves), '#356 · la clave en `apikey` entra')
chk(autorizada(null, `Bearer ${VIGENTE}`, claves), '#356 · y en `Authorization: Bearer` también, mientras dura el cambio del programador')
chk(autorizada('no-es', `Bearer ${VIGENTE}`, claves) && autorizada(VIGENTE, 'Bearer no-es', claves), '#356 · basta con que una de las dos cabeceras calce')
chk(!autorizada('no-es', 'Bearer tampoco', claves), '#356 · si ninguna calza, no entra')
chk(!autorizada(ANTERIOR, `Bearer ${ANTERIOR}`, claves), '#356 · la `service_role` antigua ya no es una credencial aceptada')

console.log('\n── Varias claves a la vez (rotación) ──')
// Un proyecto puede tener varias claves secretas vigentes: es lo que permite
// rotar una sin cortar el servicio. Comparar contra UNA sola convierte cada
// rotación en una caída silenciosa (#272).
for (const [forma, crudo] of [
  ['objeto con nombre', OBJETO],
  ['lista separada por comas', `${VIGENTE},${OTRA}`],
  ['lista con espacios', `${VIGENTE} , ${OTRA}`],
  ['arreglo JSON', JSON.stringify([VIGENTE, OTRA])],
]) {
  const cs = clavesAceptadas(crudo)
  chk(cs.length === 2 && cs.includes(VIGENTE) && cs.includes(OTRA), `#272 · se entienden las dos claves cuando llegan como ${forma}`, JSON.stringify(cs))
  chk(autorizada(OTRA, null, cs), `#272 · y la SEGUNDA también entra (${forma})`)
}
chk(clavesAceptadas(JSON.stringify({ a: VIGENTE, b: VIGENTE })).length === 1, '#272 · la misma clave con dos nombres se cuenta una vez')

console.log('\n── Lo que NO pasa ──')
chk(!autorizada(VIGENTE, null, []), '#272 · sin ninguna clave configurada NO se autoriza a nadie')
chk(!autorizada(null, null, claves), '#272 · sin cabeceras, no')
chk(!autorizada('', 'Bearer ', claves), '#272 · con las cabeceras vacías, no')
chk(!autorizada(`${VIGENTE}x`, null, claves), '#272 · ni con la clave y un carácter de más')
chk(!autorizada(VIGENTE.slice(0, -1), null, claves), '#272 · ni con la clave a la que le falta uno')
chk(clavesAceptadas('').length === 0 && clavesAceptadas(undefined).length === 0 && clavesAceptadas(null).length === 0, '#272 · el entorno vacío no produce ninguna clave')
chk(!autorizada('', 'Bearer ', clavesAceptadas(',,')), '#272 · ni una lista de comas sueltas abre la puerta')
chk(clavesAceptadas('{}').length === 0 && claveConNombre('{}') === null, '#356 · ni un objeto vacío')

console.log('\n── La cabecera se lee como la manda el programador ──')
chk(autorizada(null, `bearer ${VIGENTE}`, claves), '#272 · "bearer" en minúscula también se entiende')
chk(autorizada(`  ${VIGENTE} `, `Bearer   ${VIGENTE}  `, claves), '#272 · y los espacios de más no cambian el resultado')

console.log('\n── La comparación no cuenta por dónde falla ──')
chk(credencialIgual('abc', 'abc'), 'iguales, sí')
chk(!credencialIgual('abc', 'abd'), 'distintas al final, no')
chk(!credencialIgual('abc', 'xbc'), 'distintas al principio, no')
chk(!credencialIgual('abc', 'abcd'), 'de largo distinto, no')
const fuente = readFileSync('supabase/functions/resumen-diario/credenciales.ts', 'utf8')
chk(!/\breturn true\b[\s\S]{0,80}?for \(/.test(fuente) && /diferencia \|=/.test(fuente), 'la comparación recorre los bytes enteros en vez de cortar en el primero distinto')

console.log('\n── Los dos usos de credencial ──')
// Cuál clave usa el cliente es una decisión de `index.ts`, que importa APIs de
// Deno y no se puede ejecutar acá. Estas comprobaciones LEEN EL CÓDIGO, y se
// dice para que valgan por lo que son: guardias contra volver a mezclarlos.
const idx = readFileSync('supabase/functions/resumen-diario/index.ts', 'utf8')
const idxVivo = idx.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
chk(/const CLAVE_SERVICIO = claveConNombre\(Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)\)/.test(idxVivo), '#356 · la clave de servicio es la secreta `default`')
chk(/createClient\(\s*Deno\.env\.get\('SUPABASE_URL'\)!,\s*CLAVE_SERVICIO\s*\)/.test(idxVivo), '#272-1 · y es con ESA con la que se construye el cliente de la base')
chk(!/createClient\([^)]*\bCLAVES\b/.test(idxVivo), '#272 · el cliente NO se construye con la lista de la puerta')
chk(/\['SUPABASE_SECRET_KEYS \(default\)', claveConNombre\(Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)\)\]/.test(idxVivo), '#356 · si falta la `default`, entra en la lista que responde 503')
chk(/FALTAN\.length > 0[\s\S]{0,200}?responder\(503/.test(idxVivo), '#272-1 · y el 503 llega con el motivo anotado, sin caerse a otra credencial')
chk(/autorizada\(req\.headers\.get\('apikey'\), req\.headers\.get\('Authorization'\), CLAVES\)/.test(idxVivo), '#356 · la puerta mira `apikey` y `Authorization`')

console.log('\n── #356 · Ninguna función lee las claves antiguas ──')
const dir = 'supabase/functions'
const viejas = []
const secretas = []
for (const fn of readdirSync(dir)) {
  let src
  try {
    src = readFileSync(join(dir, fn, 'index.ts'), 'utf8')
  } catch {
    continue
  }
  const vivo = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  if (/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY/.test(vivo)) viejas.push(fn)
  if (/SUPABASE_SECRET_KEYS/.test(vivo)) secretas.push(fn)
}
chk(viejas.length === 0, '#356 · ninguna función lee SUPABASE_SERVICE_ROLE_KEY ni SUPABASE_ANON_KEY', viejas.join(', '))
chk(secretas.length === 5, '#356 · las cinco funciones leen SUPABASE_SECRET_KEYS', secretas.join(', '))
const elim = readFileSync(join(dir, 'eliminar-usuario', 'index.ts'), 'utf8').replace(/\/\/.*$/gm, '')
chk(/SUPABASE_PUBLISHABLE_KEYS/.test(elim) && /Authorization: `Bearer \$\{jwt\}`/.test(elim), '#356 · eliminar-usuario arma el cliente "como el usuario" con la publicable y el token de quien llama')
