// #272 — El resumen diario: la parte que vive en la BASE.
//
// Quién recibe el correo, qué tareas le van, en qué orden y quién puede tocar
// el interruptor: nada de eso está en la pantalla. Está en la migración 34 —la
// columna, la vista enmascarada, el turno y `resumen_diario_datos()`— y en el
// candado de auto-edición que viene de #339. El repo de memoria no tiene RLS
// ni enmascarado, así que los criterios 1b, 4, 4b, 6, 6b, 8, 10, 11, 11b, 11c
// y 12 **no se pueden comprobar desde la interfaz**: hay que preguntarle a una
// base de verdad.
//
// Esta prueba levanta un PostgreSQL local con el andamiaje mínimo de Supabase,
// aplica las migraciones del repo EN ORDEN —parando antes de la 34 para poder
// medir el criterio 1b— y después interroga la base.
//
// No toca producción ni necesita credenciales. La corrida contra producción es
// la compuerta `scripts/validar-rls.mjs`.
//
// Cómo correrla:  node docs/prueba-272-resumen-diario-base.mjs
//
// Requiere PostgreSQL instalado (16 en este contenedor). Si no está, la prueba
// lo dice y se salta entera en vez de fingir que pasó.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { difDiasHabiles } from '../src/lib/dates.ts'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
const skip = (m, motivo) => console.log(`SKIP  ${m} — ${motivo}`)

const BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'
const DATA = process.env.PG_DATA ?? '/var/lib/pgtest272'
const PUERTO = process.env.PG_PORT ?? '5442'
const SOCK = '/tmp'
const MIG34 = '20260707000034_resumen_diario.sql'

if (!existsSync(join(BIN, 'initdb'))) {
  console.log(`SKIP  no hay PostgreSQL en ${BIN}: la prueba de base no puede correr`)
  process.exit(0)
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts })
const comoPostgres = (linea) => sh('su', ['postgres', '-c', linea])
/** Una consulta, en crudo. Tolerante a propósito: sin la migración 34 —el
 *  control negativo— la primera consulta fallaría y el proceso moriría después
 *  de UNA comprobación, en vez de informar todo lo que se rompe. */
const q = (sql, { fallaOk = true } = {}) => {
  try {
    return sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-tAc', sql]).trim()
  } catch (e) {
    if (fallaOk) return `ERROR: ${(e.stderr ?? e.message).toString().trim()}`
    throw e
  }
}
/** La misma consulta, pero ENTRANDO como un usuario: rol `authenticated` y el
 *  `sub` del JWT puesto, que es exactamente lo que ve `auth.uid()`. */
const como = (authId, sql, opts) =>
  q(`set role authenticated; set request.jwt.claim.sub='${authId}'; ${sql}`, opts)
const aplicar = (archivo) => {
  try {
    sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], { stdio: 'pipe' })
    return ''
  } catch (e) {
    return (e.stderr ?? '').toString().split('\n').filter((l) => /ERROR/.test(l))[0] ?? 'error'
  }
}

// ── Terreno ────────────────────────────────────────────────────────────────
console.log('── Levantando la base y aplicando las migraciones ──')
try {
  comoPostgres(`${BIN}/pg_ctl -D ${DATA}/data stop -m immediate`)
} catch {
  /* no estaba corriendo */
}
rmSync(DATA, { recursive: true, force: true })
mkdirSync(DATA, { recursive: true })
sh('chown', ['postgres:postgres', DATA])
comoPostgres(`${BIN}/initdb -D ${DATA}/data -U postgres --auth=trust`)
comoPostgres(`${BIN}/pg_ctl -D ${DATA}/data -l ${DATA}/log.txt -o '-p ${PUERTO} -k ${SOCK}' start`)

const ANDAMIO = `
create extension if not exists pgcrypto;
do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '') $$;
-- Fidelidad con Supabase: lo que crea \`postgres\` en \`public\` nace con
-- permiso para los tres roles de la API. Sin esto, la base local rechaza
-- \`es_admin\` y la prueba mediría un entorno que no es el de producción.
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
`
writeFileSync('/tmp/andamio272.sql', ANDAMIO)
sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/andamio272.sql'])

const migraciones = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
chk(migraciones.includes(MIG34), '#272 · la migración 34 está en el repo y entra en la cadena')

// Se aplican TODAS menos la 34: hace falta que haya usuarios ANTES de que la
// columna exista para poder medir el criterio 1b.
const fallaron = []
for (const m of migraciones.filter((m) => m !== MIG34)) {
  const err = aplicar(join('supabase/migrations', m))
  if (err) fallaron.push(`${m}: ${err}`)
}
chk(fallaron.length === 0, `las ${migraciones.length - 1} migraciones previas aplican limpias`, fallaron.join(' | '))

// ── El escenario ───────────────────────────────────────────────────────────
const A = {
  admin: '10000000-0000-0000-0000-000000000001',
  ana: '10000000-0000-0000-0000-000000000002',
  beto: '10000000-0000-0000-0000-000000000003',
  caro: '10000000-0000-0000-0000-000000000004',
  dario: '10000000-0000-0000-0000-000000000005',
  elsa: '10000000-0000-0000-0000-000000000006',
  gina: '10000000-0000-0000-0000-000000000007',
  otro: '10000000-0000-0000-0000-000000000008',
}
q(
  `insert into auth.users (id, email) values ` +
    Object.entries(A).map(([n, id]) => `('${id}','${n}@x.cl')`).join(',') +
    `;
insert into usuario (nombre, iniciales, email, rol, activo, auth_id) values
 ('Admin','AD','admin@x.cl','admin',true,'${A.admin}'),
 ('Ana','AN','ana@x.cl','consultor',true,'${A.ana}'),
 ('Beto','BE','beto@x.cl','cliente',true,'${A.beto}'),
 ('Caro','CA','caro@x.cl','consultor',true,'${A.caro}'),
 ('Dario','DA','dario@x.cl','consultor',true,'${A.dario}'),
 ('Elsa','EL','elsa@x.cl','consultor',true,'${A.elsa}'),
 ('Gina','GI','gina@x.cl','consultor',true,'${A.gina}'),
 ('Otro','OT','otro@x.cl','consultor',true,'${A.otro}'),
 ('Fabi','FA','fabi@x.cl','consultor',true,null);`,
  { fallaOk: false },
)

console.log('\n── Criterio 1b · quién nace encendido ──')
const anchos = q(`select count(*) from usuario;`)
const err34 = aplicar(join('supabase/migrations', MIG34))
chk(err34 === '', '#272 · la migración 34 aplica limpia sobre la base con usuarios', err34)
chk(
  q(`select count(*) from usuario where not resumen_diario;`) === anchos,
  `#272-1b · los ${anchos} usuarios que YA existían quedan apagados`,
  `encendidos: ${q(`select count(*) from usuario where resumen_diario;`)}`,
)
chk(
  q(`select column_default from information_schema.columns where table_name='usuario' and column_name='resumen_diario';`) ===
    'true',
  '#272-1b · y el default pasa a encendido',
)
q(`insert into usuario (nombre, iniciales, email, rol, activo) values ('Nuevo','NU','nuevo@x.cl','consultor',true);`)
chk(
  q(`select resumen_diario from usuario where email='nuevo@x.cl';`) === 't',
  '#272-1b · un usuario creado DESPUÉS nace encendido',
)
chk(aplicar(join('supabase/migrations', MIG34)) === '', '#272 · y se puede volver a aplicar sin romperse')
chk(
  q(`select count(*) from usuario where not resumen_diario;`) === anchos,
  '#272 · volver a aplicarla NO apaga a los que ya se habían encendido',
)

// El interruptor se enciende solo para quien va a recibir en las pruebas.
q(`update usuario set resumen_diario = true where email in ('ana@x.cl','beto@x.cl','dario@x.cl','elsa@x.cl','fabi@x.cl','gina@x.cl');
   update usuario set resumen_diario = false where email = 'caro@x.cl';
   update usuario set activo = false where email = 'dario@x.cl';
   update usuario set eliminado = true where email = 'elsa@x.cl';`)

console.log('\n── La vista enmascarada ──')
const id = (correo) => q(`select id from usuario where email='${correo}';`)
chk(
  como(A.ana, `select resumen_diario from usuario_visible where email='ana@x.cl';`).split('\n').pop() === 't',
  '#272 · cada quien ve el SUYO',
)
// "n/n" y no "distinto de cero": sin la columna la consulta da un ERROR, que
// tampoco es cero. El control negativo lo encontró aprobando por accidente.
const todosAdmin = como(A.admin, `select count(*)::text || '/' || count(resumen_diario)::text from usuario_visible;`)
  .split('\n')
  .pop()
chk(
  /^([1-9]\d*)\/\1$/.test(todosAdmin),
  '#272 · el administrador los ve todos',
  todosAdmin,
)
// `coalesce` y no una comparación contra vacío: `psql` imprime una línea "SET"
// por cada `set` del preámbulo, así que "sin filas" y "una fila nula" se ven
// exactamente igual desde afuera. Sin esto, el caso pasaría por no encontrar
// la fila — que es justo lo contrario de lo que se quiere medir.
chk(
  como(A.ana, `select coalesce(resumen_diario::text, 'NULO') from usuario_visible where email='admin@x.cl';`)
    .split('\n')
    .pop() === 'NULO',
  '#272 · sobre un tercero llega vacío, con la misma regla que la organización',
  como(A.ana, `select coalesce(resumen_diario::text, 'NULO') from usuario_visible where email='admin@x.cl';`).split('\n').pop(),
)
chk(
  q(`select coinciden from regla_visibilidad_usuario;`) === 't',
  '#272 · ampliar la vista no desalineó la regla de visibilidad de #339',
)

console.log('\n── Criterios 4 y 4b · quién puede tocar el interruptor ──')
// Se lee por `usuario_visible` y NO por la tabla: la aplicación no tiene
// permiso de SELECT sobre `usuario.resumen_diario` (invariante 3), así que
// preguntarle a la tabla mediría un camino que el producto no usa.
const propio = como(
  A.ana,
  `update usuario set resumen_diario = false where auth_id = '${A.ana}'; select resumen_diario from usuario_visible where auth_id='${A.ana}';`,
)
chk(propio.split('\n').pop() === 'f', '#272-4b · uno SÍ puede cambiar el suyo', propio)
como(A.ana, `update usuario set resumen_diario = true where auth_id = '${A.ana}';`)
// La política `usuario_update` no da error: simplemente no alcanza ninguna
// fila. Por eso lo que se mide es el VALOR de Beto, no el mensaje.
const ajeno = como(A.ana, `update usuario set resumen_diario = false where auth_id = '${A.beto}';`)
chk(
  q(`select resumen_diario from usuario where auth_id='${A.beto}';`) === 't',
  '#272-4 · un usuario NO puede cambiar el de otro',
  ajeno,
)
// Y el candado sigue cerrado para lo que #339 dejó cerrado: la columna nueva
// entró por ser nueva, no porque el candado se haya aflojado.
const org = como(A.ana, `update usuario set organizacion = 'Andotek' where auth_id = '${A.ana}';`)
chk(
  /Solo puedes cambiar tu nombre/.test(org),
  '#272 · y el candado de #339 sigue cerrado (la organización se sigue rechazando)',
)

console.log('\n── #290 · las funciones nuevas nacen cerradas ──')
chk(q(`select count(*) from permiso_ejecucion_abierto;`) === '0', '#272-16 · ninguna función quedó abierta a PUBLIC')
for (const f of ['dias_habiles_entre(date,date)', 'resumen_diario_tomar_turno(boolean)', 'resumen_diario_datos()']) {
  chk(
    q(`select has_function_privilege('anon', '${f}', 'execute');`) === 'f',
    `#272-16 · anon no puede ejecutar ${f}`,
  )
  chk(
    q(`select has_function_privilege('service_role', '${f}', 'execute');`) === 't',
    `#272 · y el programador (service_role) sí`,
  )
}
chk(
  q(`select has_table_privilege('anon', 'resumen_diario_corrida', 'select');`) === 'f',
  '#272 · el registro de corridas no lo lee anon',
)
chk(
  q(`select has_table_privilege('authenticated', 'resumen_diario_corrida', 'select');`) === 'f',
  '#272 · ni la aplicación',
)

console.log('\n── El atraso, contra la aplicación ──')
// `dias_habiles_entre` tiene que dar EXACTAMENTE lo mismo que `difDiasHabiles`
// (src/lib/dates.ts), que es de donde sale la columna Atraso de la pantalla.
// Se comparan todos los pares de un mes: 900 casos, no tres elegidos a mano.
const iso = (d) => d.toISOString().slice(0, 10)
const dias = [...Array(30)].map((_, i) => iso(new Date(Date.UTC(2026, 8, 1 + i))))
const pares = []
for (const a of dias) for (const b of dias) pares.push([a, b])
const enBase = q(
  `select string_agg(dias_habiles_entre(p.a::date, p.b::date)::text, ',' order by p.i) from (values ` +
    pares.map(([a, b], i) => `(${i},'${a}','${b}')`).join(',') +
    `) as p(i,a,b);`,
).split(',')
const enPantalla = pares.map(([a, b]) => String(difDiasHabiles(a, b)))
const distintos = pares.filter((_, i) => enBase[i] !== enPantalla[i])
chk(
  distintos.length === 0,
  `#272 · los ${pares.length} pares de fechas dan el mismo atraso en la base y en la pantalla`,
  distintos.slice(0, 3).map(([a, b], i) => `${a}→${b}: base ${enBase[i]} vs ${enPantalla[i]}`).join(' | '),
)

console.log('\n── El turno ──')
const fuenteMig = readFileSync(join('supabase/migrations', MIG34), 'utf8')
chk(
  /America\/Santiago/.test(fuenteMig) && !/interval\s*'-?\d+\s*hours?'|utc[-+]\d/i.test(fuenteMig),
  '#272-14 · la hora se resuelve por NOMBRE de zona, nunca con un desfase fijo',
)
const ahoraCl = q(`select to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI Dy');`)
const [, horaCl, diaCl] = ahoraCl.match(/ (\d\d):\d\d (\w+)$/) ?? []
const esMomento = horaCl === '08' && !['Sat', 'Sun'].includes(diaCl)
if (esMomento) {
  skip('#272-9 · fuera de las 8:00 el turno no se toma', `ahora SON las 8:00 de Chile (${ahoraCl})`)
} else {
  chk(
    q(`select resumen_diario_tomar_turno(false);`) === 'f',
    '#272-9/14 · fuera de las 8:00 de Chile (o en fin de semana) el turno NO se toma',
    ahoraCl,
  )
}
chk(q(`select resumen_diario_tomar_turno(true);`) === 't', '#272 · forzado desde el dashboard, sí')
chk(
  q(`select count(*) from resumen_diario_corrida where fecha = (now() at time zone 'America/Santiago')::date;`) === '1',
  '#272-§7 · y la corrida queda ANOTADA antes de enviar nada',
)
q(`delete from resumen_diario_corrida;`)
q(`insert into resumen_diario_corrida (fecha) values ((now() at time zone 'America/Santiago')::date);`)
chk(
  q(`select resumen_diario_tomar_turno(false);`) === 'f',
  '#272-§7 · con la corrida del día ya anotada, no se reintenta',
)
q(`delete from resumen_diario_corrida;`)

// ── El escenario de las tareas ─────────────────────────────────────────────
console.log('\n── El terreno de las tareas ──')
const HOY = q(`select hoy_chile();`)
const dHoy = (n) => q(`select (hoy_chile() + ${n})::text;`)
const idAna = id('ana@x.cl')
const idBeto = id('beto@x.cl')
const idGina = id('gina@x.cl')
const idOtro = id('otro@x.cl')

// Dos proyectos con acceso y dos sin él. Los frentes se numeran AL REVÉS del
// alfabeto a propósito: si el correo ordenara alfabéticamente en vez de por el
// orden que el dueño les dio arrastrándolos, se notaría.
q(
  `insert into proyecto (id, nombre, creado_por, estado) values
     ('20000000-0000-0000-0000-000000000001','Alfa','${idAna}','activo'),
     ('20000000-0000-0000-0000-000000000002','Beta','${idOtro}','activo'),
     ('20000000-0000-0000-0000-000000000003','Zeta','${idOtro}','activo'),
     ('20000000-0000-0000-0000-000000000004','Archivado','${idAna}','archivado');
   insert into acceso_proyecto (usuario_id, proyecto_id) values
     ('${idAna}','20000000-0000-0000-0000-000000000002'),
     ('${idBeto}','20000000-0000-0000-0000-000000000002'),
     ('${idGina}','20000000-0000-0000-0000-000000000002');
   insert into frente (id, proyecto_id, nombre, orden) values
     ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Zorro',0),
     ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Ancla',1),
     ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','Uno',0),
     ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000003','Vedado',0),
     ('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000004','Viejo',0);
   insert into sub_frente (id, frente_id, nombre, orden) values
     ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','SZ',0),
     ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','SA',0),
     ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','SU',0),
     ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','SV',0),
     ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000005','SW',0);`,
  { fallaOk: false },
)

/** Crea una tarea por el MISMO camino que el producto: se inserta con la fecha
 *  original y, si hay que replanificarla, se mueve — que es lo que deja el
 *  historial y lo que hace que la columna Atraso valga algo. */
const tarea = (idT, sub, titulo, resp, fechaFinal, original) => {
  q(
    `insert into tarea (id, sub_frente_id, titulo, responsable_id, fecha_objetivo)
       values ('${idT}','${sub}','${titulo}','${resp}', (hoy_chile() + ${original ?? fechaFinal})::date);`,
    { fallaOk: false },
  )
  if (original !== undefined && original !== fechaFinal) {
    // Se mueve CON una sesión puesta: `validar_permisos_tarea` pregunta por
    // `auth.uid()`, así que sin sesión la base rechaza el cambio igual que se
    // lo rechazaría a cualquiera. Mover la fecha es lo que deja el historial y
    // lo que hace que la columna Atraso valga algo.
    q(
      `set request.jwt.claim.sub='${A.admin}'; update tarea set fecha_objetivo = (hoy_chile() + ${fechaFinal})::date where id = '${idT}';`,
      { fallaOk: false },
    )
  }
}

// Ana: dos atrasadas (una replanificada, con atraso; otra sin mover) y dos de
// hoy en frentes cuyo orden NO es el alfabético.
tarea('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'Beta atrasada movida', idAna, -3, -10)
tarea('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Alfa atrasada quieta', idAna, -8)
tarea('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Hoy en Ancla', idAna, 0)
tarea('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'Hoy en Zorro', idAna, 0)
// Fuera de alcance: proyecto sin acceso, proyecto archivado, hecha y archivada.
tarea('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000004', 'Vedada', idAna, -4)
tarea('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000005', 'En archivado', idAna, -4)
tarea('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000001', 'Ya hecha', idAna, -4)
q(`set request.jwt.claim.sub='${A.admin}'; update tarea set hecha = true, fecha_real = hoy_chile() where id='50000000-0000-0000-0000-000000000007';`)
tarea('50000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000001', 'Cancelada', idAna, -4)
q(`set request.jwt.claim.sub='${A.admin}'; update tarea set archivada = true where id='50000000-0000-0000-0000-000000000008';`)
// Y una que vence dentro de la semana: cuenta para la línea, no para un bloque.
tarea('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000001', 'Esta semana', idAna, 1)
// Beto (CLIENTE) tiene una atrasada. Gina solo tiene una de la semana.
tarea('50000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000003', 'De Beto', idBeto, -2)
tarea('50000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-000000000003', 'De Gina', idGina, 1)

chk(
  q(`select count(*) from replanificacion where tarea_id='50000000-0000-0000-0000-000000000001';`) === '1',
  '#272 · terreno: la tarea movida quedó con su replanificación',
)

// ── Los datos del correo ───────────────────────────────────────────────────
console.log('\n── Criterios 6, 6b, 8, 10, 11, 11b, 11c y 12 ──')
const datos = JSON.parse(
  q(`select coalesce(jsonb_agg(to_jsonb(d) order by d.nombre), '[]'::jsonb) from resumen_diario_datos() d;`),
)
const quienes = datos.map((d) => d.nombre)
console.log(`  destinatarios: ${quienes.join(', ') || '(nadie)'}`)

chk(quienes.includes('Ana'), '#272-5 · Ana, con atrasadas y de hoy, recibe')
chk(quienes.includes('Beto'), '#272-11b · un CLIENTE con tareas atrasadas también recibe')
chk(!quienes.includes('Caro'), '#272-10 · con el interruptor apagado no llega nada')
chk(!quienes.includes('Gina'), '#272-8 · sin atrasadas ni de hoy no llega nada, aunque queden para la semana')
chk(!quienes.includes('Dario'), '#272-11c · un usuario DESACTIVADO no recibe, aunque su interruptor esté encendido')
chk(!quienes.includes('Elsa'), '#272-11c · un usuario ELIMINADO tampoco')
chk(!quienes.includes('Fabi'), '#272-11c · ni un invitado que todavía no activó su cuenta')

const ana = datos.find((d) => d.nombre === 'Ana') ?? { atrasadas: [], vencen_hoy: [], semana: 0 }
console.log('  atrasadas: ' + ana.atrasadas.map((t) => `${t.titulo} (${t.atraso})`).join(' | '))
console.log('  vencen hoy: ' + ana.vencen_hoy.map((t) => `${t.titulo} [${t.frente}]`).join(' | '))

chk(ana.atrasadas.length === 2, '#272-5 · Ana tiene 2 atrasadas', String(ana.atrasadas.length))
chk(ana.vencen_hoy.length === 2, '#272-5 · y 2 que vencen hoy', String(ana.vencen_hoy.length))
const titulos = [...ana.atrasadas, ...ana.vencen_hoy].map((t) => t.titulo)
chk(!titulos.includes('Vedada'), '#272-11 · no aparece la tarea de un proyecto sin acceso')
chk(!titulos.includes('En archivado'), '#272 · ni la de un proyecto archivado')
chk(!titulos.includes('Ya hecha'), '#272 · ni una hecha')
chk(!titulos.includes('Cancelada'), '#272 · ni una archivada')
chk(!titulos.includes('Esta semana'), '#272 · ni la que vence más adelante en la semana')

chk(
  ana.atrasadas[0]?.titulo === 'Beta atrasada movida',
  '#272-6 · las atrasadas van de MAYOR a menor atraso',
  ana.atrasadas.map((t) => `${t.titulo}=${t.atraso}`).join(' , '),
)
chk(
  ana.atrasadas[0]?.atraso === difDiasHabiles(dHoy(-10), dHoy(-3)),
  '#272 · y el atraso es el mismo número que muestra la pantalla',
  `${ana.atrasadas[0]?.atraso} vs ${difDiasHabiles(dHoy(-10), dHoy(-3))}`,
)
chk(ana.atrasadas[1]?.atraso === 0, '#272 · una atrasada que nunca se movió va con la columna vacía')
chk(
  ana.atrasadas[0]?.categoria === 'atrasada_replan' && ana.atrasadas[1]?.categoria === 'atrasada',
  '#272-5 · cada tarea con la categoría que le pinta la fila',
)
chk(
  ana.vencen_hoy[0]?.frente === 'Zorro' && ana.vencen_hoy[1]?.frente === 'Ancla',
  '#272-6b · las de hoy siguen el orden de frentes de la TABLA del proyecto, no el alfabético',
  ana.vencen_hoy.map((t) => t.frente).join(' , '),
)
chk(
  ana.vencen_hoy.every((t) => t.fecha === HOY),
  '#272 · y todas vencen hoy',
)
chk(ana.semana === 1, '#272-12 · la línea de la semana dice el número correcto', String(ana.semana))
const beto = datos.find((d) => d.nombre === 'Beto')
chk(beto?.semana === 0, '#272-12 · y vale 0 cuando no queda ninguna, para que la sección desaparezca')
chk(
  Boolean(beto?.email) && beto.email === 'beto@x.cl',
  '#272-§6d · el destinatario se resuelve EN EL SERVIDOR, con su dirección',
)

// ── Cierre ─────────────────────────────────────────────────────────────────
comoPostgres(`${BIN}/pg_ctl -D ${DATA}/data stop -m fast`)
console.log('\n(base local detenida)')
