// #358 — Que el resumen diario llegue aunque un intento falle.
//
// QUÉ PASÓ. El viernes 11-sep-2026 el resumen no salió, con 12 atrasadas y 3
// venciendo ese día. A las 8:00 de Chile la función falló a los 5,4 segundos
// con `Gateway Timeout` al llamar a `resumen_diario_tomar_turno`. La base
// estaba sana en ese mismo segundo. Y costó el día entero por dos razones:
//
//   · de las 24 llamadas del día SOLO UNA hacía trabajo —la de las 8:00—, así
//     que había una sola oportunidad y el tropiezo cayó justo ahí;
//   · tomar el turno marcaba el día Y servía de candado a la vez, así que al
//     fallar esa inserción no quedó ninguna fila y nadie se enteró.
//
// Lo que esta prueba mide es la máquina de estados que lo corrige: el intento
// se anota al empezar, SOLO un envío logrado cierra el día, y un fallo lo deja
// abierto para la hora siguiente.
//
// Lo que NO cubre, porque exige la plataforma: que Resend respete la clave de
// idempotencia. Eso es del proveedor y se comprueba con correos reales; acá se
// comprueba que la clave VIAJE, con el formato y el valor que corresponden.
//
// Cómo correrla:  node docs/prueba-358-reintento.mjs
//
// Requiere PostgreSQL instalado (16 en este contenedor). Si no está, la prueba
// lo dice y se salta entera en vez de fingir que pasó.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'
const DATA = process.env.PG_DATA ?? '/var/lib/pgtest358'
const PUERTO = process.env.PG_PORT ?? '5445'
const SOCK = '/tmp'

if (!existsSync(join(BIN, 'initdb'))) {
  console.log(`SKIP  no hay PostgreSQL en ${BIN}: la prueba de base no puede correr`)
  process.exit(0)
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts })
const comoPostgres = (linea) => sh('su', ['postgres', '-c', linea])
const q = (sql) => {
  try {
    return sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-tAc', sql]).trim()
  } catch (e) {
    return `ERROR: ${(e.stderr ?? e.message).toString().trim().split('\n')[0]}`
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

writeFileSync(
  '/tmp/andamio358.sql',
  `
create extension if not exists pgcrypto;
do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '') $$;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
`,
)
sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/andamio358.sql'])

const migraciones = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
const MIG36 = '20260707000036_resumen_diario_reintento.sql'
const fallaron = []
for (const m of migraciones) {
  try {
    sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join('supabase/migrations', m)], { stdio: 'pipe' })
  } catch (e) {
    fallaron.push(`${m}: ${((e.stderr ?? '').toString().split('\n').filter((l) => /ERROR/.test(l))[0] ?? 'error')}`)
  }
}
chk(migraciones.includes(MIG36), '#358 · la migración 36 está en el repo y entra en la cadena')
chk(fallaron.length === 0, `las ${migraciones.length} migraciones aplican limpias`, fallaron.join(' | '))

// La 36 se aplica DOS veces: tiene que ser idempotente.
let segunda = ''
try {
  sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join('supabase/migrations', MIG36)], { stdio: 'pipe' })
} catch (e) {
  segunda = (e.stderr ?? '').toString().split('\n').filter((l) => /ERROR/.test(l))[0] ?? 'error'
}
chk(segunda === '', '#358 · y se puede volver a aplicar sin romperse', segunda)

// ── Lo que ya existía no se pierde ─────────────────────────────────────────
console.log('\n── Las corridas que ya existían ──')
// El mismo cuidado que la columna de #272: una corrida vieja es una corrida
// TERMINADA, así que tiene que quedar `cerrado` y no reabrirse sola.
q(`delete from resumen_diario_corrida;
   insert into resumen_diario_corrida (fecha, terminada, enviados, fallidos)
   values (hoy_chile() - 1, now(), 1, 0);`)
q(`update resumen_diario_corrida set estado = 'cerrado' where fecha = hoy_chile() - 1;`)
chk(
  q(`select estado from resumen_diario_corrida where fecha = hoy_chile() - 1;`) === 'cerrado',
  '#358 · una corrida anterior queda cerrada',
)
chk(
  q(`select column_default from information_schema.columns where table_name='resumen_diario_corrida' and column_name='estado';`)
    .startsWith("'en_curso'"),
  '#358 · y el default pasa a `en_curso`, que es como nace todo intento nuevo',
  q(`select column_default from information_schema.columns where table_name='resumen_diario_corrida' and column_name='estado';`),
)

// ── La puerta de día y hora ────────────────────────────────────────────────
console.log('\n── Día y hora (criterios 6 y 9) ──')
const ahora = q(`select to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI Dy');`)
const esHabil = q(`select extract(isodow from now() at time zone 'America/Santiago') < 6;`) === 't'
const pasoLaHora = q(`select extract(hour from now() at time zone 'America/Santiago') >= 8;`) === 't'
console.log(`  ahora en Chile: ${ahora} · hábil=${esHabil} · pasó las 8:00=${pasoLaHora}`)
q(`delete from resumen_diario_corrida;`)
const tomaAhora = q(`select resumen_diario_tomar_turno(false);`) === 't'
chk(
  tomaAhora === (esHabil && pasoLaHora),
  esHabil && pasoLaHora
    ? '#358-9 · día hábil y pasada la hora: SÍ se toma el turno'
    : '#358-6 · fin de semana o antes de las 8:00: NO se toma el turno',
  `tomó=${tomaAhora}`,
)
chk(
  /America\/Santiago/.test(readFileSync(join('supabase/migrations', MIG36), 'utf8')) &&
    !/interval\s*'-?\d+\s*hours?'|utc[-+]\d/i.test(readFileSync(join('supabase/migrations', MIG36), 'utf8')),
  '#358 · la hora se resuelve por NOMBRE de zona, nunca con un desfase fijo',
)

// El resto de la prueba necesita poder tomar el turno, así que se usa `forzar`,
// que saltea el día y la hora — y NADA más.
const forzar = () => q(`select resumen_diario_tomar_turno(true);`)
const estado = () => q(`select estado || '/' || intentos from resumen_diario_corrida where fecha = hoy_chile();`)
const cerrar = (env, fal, det) =>
  q(`select resumen_diario_cerrar(${env}, ${fal}, ${det === null ? 'null' : `'${det}'`});`)

// ── El intento queda anotado al EMPEZAR (criterio 3) ──────────────────────
console.log('\n── El intento se anota al empezar ──')
q(`delete from resumen_diario_corrida;`)
chk(forzar() === 't', '#358 · se toma el turno')
chk(estado() === 'en_curso/1', '#358-3 · y la fila del día YA existe, en curso', estado())
chk(
  q(`select terminada is null from resumen_diario_corrida where fecha = hoy_chile();`) === 't',
  '#358-3 · sin terminar, porque todavía no terminó',
)

// ── Un fallo NO cierra el día (criterios 1, 3 y 4) ────────────────────────
console.log('\n── Un intento que falla deja el día abierto ──')
cerrar(0, 1, 'Gateway Timeout')
chk(estado() === 'fallido/1', '#358-4 · el intento fallido NO cierra el día', estado())
chk(
  /Gateway Timeout/.test(q(`select detalle from resumen_diario_corrida where fecha = hoy_chile();`)),
  '#358-3 · y queda anotado CON EL MOTIVO',
  q(`select detalle from resumen_diario_corrida where fecha = hoy_chile();`),
)
chk(forzar() === 't', '#358-1 · el intento siguiente vuelve a tomar el turno')
chk(estado() === 'en_curso/2', '#358-1 · y queda contado como segundo intento', estado())

// ── Un envío logrado SÍ cierra (criterios 2, 5 y 10) ──────────────────────
console.log('\n── Un envío logrado cierra el día ──')
cerrar(1, 0, null)
chk(estado() === 'cerrado/2', '#358-5 · el envío logrado cierra el día', estado())
chk(forzar() === 'f', '#358-10 · forzar con el día cerrado NO manda un segundo correo')
chk(q(`select resumen_diario_tomar_turno(false);`) === 'f', '#358-5 · y las llamadas siguientes no hacen nada')
chk(estado() === 'cerrado/2', '#358-2 · el día sigue cerrado y sin intentos de más', estado())
const historia = q(`select detalle from resumen_diario_corrida where fecha = hoy_chile();`)
chk(
  /intento 1: Gateway Timeout/.test(historia) && /intento 2: ok, 1 enviado/.test(historia),
  '#358-3 · el detalle cuenta LOS DOS intentos, no solo el último',
  historia.replace(/\n/g, ' ⏎ '),
)

// ── Dos llamadas a la vez ─────────────────────────────────────────────────
console.log('\n── El candado ──')
q(`delete from resumen_diario_corrida;`)
chk(forzar() === 't', '#358 · la primera llamada toma el turno')
chk(forzar() === 'f', '#358 · la segunda lo ve tomado y se detiene')
chk(q(`select resumen_diario_tomar_turno(false);`) === 'f', '#358 · y la del programador, igual')
chk(estado() === 'en_curso/1', '#358 · un solo intento contado', estado())

// Un intento que murió sin cerrar ni anotar —una función que revienta a
// medias— no puede dejar el día trabado para siempre.
console.log('\n── Un intento que murió a medias ──')
q(`update resumen_diario_corrida set iniciada = now() - interval '11 minutes' where fecha = hoy_chile();`)
chk(forzar() === 't', '#358 · pasados diez minutos, el siguiente lo retoma')
chk(estado() === 'en_curso/2', '#358 · y lo cuenta como intento nuevo', estado())
q(`update resumen_diario_corrida set iniciada = now() - interval '9 minutes' where fecha = hoy_chile();`)
chk(forzar() === 'f', '#358 · antes de los diez, no: puede haber otro trabajando')

// ── Cero destinatarios ────────────────────────────────────────────────────
console.log('\n── Sin nada que mandar (criterio 7) ──')
q(`delete from resumen_diario_corrida;`)
forzar()
cerrar(0, 0, null)
chk(estado() === 'cerrado/1', '#358-7 · "no había nada que mandar" es una corrida completa: cierra el día', estado())
chk(forzar() === 'f', '#358-7 · y no se vuelve a preguntar cada hora')

// ── No se arrastra al día siguiente ───────────────────────────────────────
console.log('\n── Cada día es su propia pregunta ──')
q(`delete from resumen_diario_corrida;
   insert into resumen_diario_corrida (fecha, estado, intentos) values (hoy_chile() - 1, 'fallido', 3);`)
chk(
  q(`select count(*) from resumen_diario_corrida where fecha = hoy_chile();`) === '0',
  '#358 · terreno: ayer quedó fallido y hoy no tiene fila',
)
chk(forzar() === 't', '#358 · hoy se toma su propio turno')
chk(
  q(`select estado from resumen_diario_corrida where fecha = hoy_chile() - 1;`) === 'fallido',
  '#358 · y lo de ayer NO se reintenta: queda como quedó',
)

// ── Permisos (criterio 12) ────────────────────────────────────────────────
console.log('\n── #290 · las funciones nacen cerradas ──')
chk(q(`select count(*) from permiso_ejecucion_abierto;`) === '0', '#358-12 · ninguna función quedó abierta a PUBLIC')
for (const f of ['resumen_diario_tomar_turno(boolean)', 'resumen_diario_cerrar(integer,integer,text)']) {
  chk(q(`select has_function_privilege('anon', '${f}', 'execute');`) === 'f', `#358-12 · anon no puede ejecutar ${f}`)
  chk(
    q(`select has_function_privilege('authenticated', '${f}', 'execute');`) === 'f',
    `#358-12 · la aplicación tampoco`,
  )
  chk(q(`select has_function_privilege('service_role', '${f}', 'execute');`) === 't', '#358 · y el programador sí')
}

// ── La clave de idempotencia ──────────────────────────────────────────────
console.log('\n── La clave de idempotencia (criterio 2) ──')
// Esto vive en la función de servidor, que importa APIs de Deno y no corre acá:
// se lee el código. Vale por lo que es — un guardia contra quitarla sin querer.
const fn = readFileSync('supabase/functions/resumen-diario/index.ts', 'utf8')
const vivo = fn.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
chk(/'Idempotency-Key':/.test(vivo), '#358-2 · cada envío lleva su clave de idempotencia')
chk(
  /'Idempotency-Key': `resumen-diario\/\$\{hoy\}\/\$\{d\.usuario_id\}`/.test(vivo),
  '#358-2 · con el formato del proveedor: evento / día / persona',
)
chk(
  /resumen_diario_cerrar/.test(vivo),
  '#358 · y el cierre pasa por `resumen_diario_cerrar`, no por un UPDATE suelto',
)
chk(
  !/from\('resumen_diario_corrida'\)[\s\S]{0,80}\.update\(/.test(vivo),
  '#358 · la función ya no escribe la tabla por su cuenta',
)

comoPostgres(`${BIN}/pg_ctl -D ${DATA}/data stop -m fast`)
console.log('\n(base local detenida)')
