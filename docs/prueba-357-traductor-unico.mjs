// #357 — BUG: el interruptor del resumen diario se veía apagado aunque en la
// base estuviera encendido.
//
// LA CAUSA, que es de lo que trata esta prueba:
//
//   Había DOS traductores de usuario. `src/auth/supabaseAuth.ts` armaba la
//   sesión —la que corre AL ENTRAR Y AL RECARGAR— y traducía ocho campos;
//   `src/data/supabaseRepo.ts` traducía once. Los dos leen `usuario_visible`
//   con `select('*')`, así que el dato SIEMPRE llegó: el de la sesión lo
//   descartaba al traducir.
//
//   De ahí el síntoma: al encender el interruptor la pantalla se refrescaba con
//   el traductor completo y se veía encendido; al recargar entraba el de la
//   sesión, el campo llegaba vacío y el control se veía apagado. Y no era solo
//   el resumen diario: la organización (#339) y las iniciales manuales (#207)
//   se perdían por el mismo lado.
//
// POR QUÉ ESTA PRUEBA NO ES DE PANTALLA. El defecto es exclusivo de Supabase:
// en modo Local la sesión toma el `Usuario` directo del estado del repo
// (`memoryAuth`), sin traducir, así que el navegador NO puede reproducirlo. Lo
// que sí se puede medir —y es la causa entera— es que haya UN traductor y que
// no pierda campos. Los criterios 1 a 5 se comprueban contra Supabase, a mano.
//
// Cómo correrla:  node docs/prueba-357-traductor-unico.mjs
import { readFileSync } from 'node:fs'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

// La importación va DINÁMICA y con su propia comprobación. Con un `import`
// arriba, contra un árbol donde el traductor compartido no existe el módulo no
// resuelve, el proceso muere antes de la primera línea y la corrida informa
// CERO comprobaciones — que es indistinguible de no haberla corrido. Así el
// control negativo dice lo que encontró en vez de callarse.
let usuarioDesdeFila = null
try {
  ;({ usuarioDesdeFila } = await import('../src/data/repo.ts'))
} catch (e) {
  console.log(`  (no se pudo importar \`src/data/repo.ts\`: ${e.message.split('\n')[0]})`)
}
chk(
  typeof usuarioDesdeFila === 'function',
  '#357 · existe UN traductor compartido, `usuarioDesdeFila`, exportado por `src/data/repo.ts`',
)
if (typeof usuarioDesdeFila !== 'function') {
  console.log('\n  Sin el traductor compartido no hay nada más que medir: el resto de esta')
  console.log('  prueba habla de lo que ese traductor entrega.')
  process.exit(1)
}

// Una fila como la entrega `usuario_visible` para UNO MISMO: sin enmascarar.
const FILA = {
  id: 'u-1',
  nombre: 'Josué Brito',
  iniciales: 'JB',
  iniciales_manual: true,
  email: 'jb@andotek.cl',
  rol: 'admin',
  activo: true,
  auth_id: 'auth-1',
  permisos_proyecto: { crearProyectos: true },
  organizacion: 'Andotek',
  resumen_diario: true,
}

console.log('\n── El traductor no pierde ningún campo ──')
const u = usuarioDesdeFila(FILA)
console.log(`  ${JSON.stringify(u)}`)

// El criterio 7 del pedido: que el próximo campo no se pierda por el mismo
// lado. Por eso la lista de campos NO se escribe acá — se lee del tipo
// `Usuario` en `src/types.ts`. Agregar un campo al tipo y olvidarse del
// traductor pone esto en rojo.
const types = readFileSync('src/types.ts', 'utf8')
const cuerpo = types.slice(types.indexOf('export interface Usuario {'))
const campos = [
  ...cuerpo.slice(0, cuerpo.indexOf('\n}')).matchAll(/^ {2}(\w+)\??:/gm),
].map((m) => m[1])
console.log(`  campos de \`Usuario\`: ${campos.join(', ')}`)
chk(campos.length >= 10, 'se pudieron leer los campos del tipo `Usuario`', `${campos.length}`)

// `eliminado` es la única excepción, y tiene motivo: la vista filtra a los
// eliminados (`where not u.eliminado`), así que esa columna nunca viene en una
// fila que el cliente pueda leer.
const NO_VIAJA = ['eliminado']
const faltantes = campos.filter((c) => !NO_VIAJA.includes(c) && u[c] === undefined)
chk(
  faltantes.length === 0,
  '#357-7 · el traductor entrega TODOS los campos de `Usuario` que la vista trae',
  faltantes.length ? `se perdieron: ${faltantes.join(', ')}` : '',
)
chk(
  !Object.prototype.hasOwnProperty.call(u, 'eliminado'),
  '#357 · y no inventa `eliminado`, que la vista nunca entrega',
)

console.log('\n── Los valores ──')
for (const [campo, esperado] of [
  ['id', 'u-1'],
  ['nombre', 'Josué Brito'],
  ['iniciales', 'JB'],
  ['inicialesManual', true],
  ['email', 'jb@andotek.cl'],
  ['rol', 'admin'],
  ['activo', true],
  ['authId', 'auth-1'],
  ['organizacion', 'Andotek'],
  ['resumenDiario', true],
]) {
  chk(u[campo] === esperado, `\`${campo}\` llega como ${JSON.stringify(esperado)}`, JSON.stringify(u[campo]))
}
chk(u.permisosProyecto?.crearProyectos === true, '`permisosProyecto` llega entero')

console.log('\n── El enmascarado no cambia (criterio 6) ──')
// Sobre un TERCERO la vista entrega `null` en los tres campos enmascarados. Eso
// tiene que seguir llegando como `undefined`: no es "vacío" ni "apagado", es
// "no me corresponde saberlo".
const tercero = usuarioDesdeFila({
  ...FILA,
  iniciales_manual: null,
  permisos_proyecto: null,
  organizacion: null,
  resumen_diario: null,
})
for (const campo of ['organizacion', 'resumenDiario', 'permisosProyecto', 'inicialesManual']) {
  chk(tercero[campo] === undefined, `#357-6 · \`${campo}\` de un tercero sigue llegando vacío`, JSON.stringify(tercero[campo]))
}
chk(tercero.resumenDiario !== false, '#357-6 · y vacío NO es lo mismo que apagado')
// La fila sin iniciales es un caso real: la base las deriva del nombre.
chk(usuarioDesdeFila({ ...FILA, iniciales: null }).iniciales === '', '#357 · sin iniciales, cadena vacía y no `null`')

console.log('\n── Un solo traductor, y los dos caminos lo usan ──')
const auth = readFileSync('src/auth/supabaseAuth.ts', 'utf8')
const repo = readFileSync('src/data/supabaseRepo.ts', 'utf8')
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

chk(
  /import \{[^}]*usuarioDesdeFila[^}]*\} from '\.\.\/data\/repo'/.test(sinComentarios(auth)),
  '#357 · la SESIÓN usa el traductor compartido',
)
chk(
  /import \{[^}]*usuarioDesdeFila[^}]*\} from '\.\/repo'/.test(sinComentarios(repo)),
  '#357 · y el repositorio, el mismo',
)
// La comprobación que impide que vuelvan a separarse: ningún archivo puede
// declarar su propio traductor de usuario.
for (const [nombre, src] of [
  ['supabaseAuth.ts', auth],
  ['supabaseRepo.ts', repo],
]) {
  chk(
    !/(const|function)\s+toUsuario/.test(sinComentarios(src)),
    `#357 · ${nombre} ya no declara un traductor propio`,
  )
}
const declaraciones = [auth, repo, readFileSync('src/data/repo.ts', 'utf8')]
  .map(sinComentarios)
  .join('\n')
  .match(/(?:export )?function usuarioDesdeFila/g) ?? []
chk(declaraciones.length === 1, '#357 · `usuarioDesdeFila` se declara UNA sola vez', `${declaraciones.length}`)

console.log('\n── Control negativo: la regla anterior ──')
// El traductor de la sesión, tal como estaba, escrito acá. Sin esto, "el
// traductor entrega todos los campos" no distingue el arreglo de una prueba
// que habría aprobado igual antes.
const traductorViejoDeLaSesion = (r) => ({
  id: r.id,
  nombre: r.nombre,
  iniciales: r.iniciales ?? '',
  email: r.email,
  rol: r.rol,
  activo: r.activo,
  authId: r.auth_id ?? undefined,
  permisosProyecto: r.permisos_proyecto ?? undefined,
})
const viejo = traductorViejoDeLaSesion(FILA)
const perdidos = ['resumenDiario', 'organizacion', 'inicialesManual'].filter((c) => viejo[c] === undefined)
chk(
  perdidos.length === 3,
  '#357 · el traductor ANTERIOR perdía los tres campos',
  perdidos.join(', '),
)
chk(
  perdidos.every((c) => u[c] !== undefined),
  '#357 · y el de ahora los entrega',
)
// El síntoma exacto del pedido, en una línea.
chk(
  viejo.resumenDiario === undefined && u.resumenDiario === true,
  '#357-1 · con la base en `true`, el de antes decía "vacío" y el de ahora dice "encendido"',
)
