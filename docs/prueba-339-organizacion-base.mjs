// #339 — Organización del usuario: la parte que vive en la BASE.
//
// Las reglas de quién ve a quién no están en la pantalla: están en la política
// de lectura de `usuario` y en la vista enmascarada `usuario_visible`. El repo
// de memoria —el que usa la demo y las pruebas de Playwright— devuelve TODOS
// los usuarios a todo el mundo, así que los criterios 3 a 7 y el 12 del pedido
// **no se pueden comprobar desde la interfaz**: hay que preguntarle a una base
// de verdad.
//
// Esta prueba levanta un PostgreSQL local, le pone el andamiaje mínimo de
// Supabase —los roles de la API, el esquema `auth` con `auth.uid()` y los
// permisos por defecto que Supabase concede—, **aplica las migraciones del
// repo en orden** y después interroga la regla entrando como cada usuario.
//
// No toca producción ni necesita credenciales. La corrida contra producción es
// la compuerta `scripts/validar-rls.mjs`, que trae los mismos casos por la vía
// que sí puede usar allá (la API REST).
//
// Cómo correrla:
//   node docs/prueba-339-organizacion-base.mjs
//
// Requiere PostgreSQL instalado (16 en este contenedor). Si no está, la prueba
// lo dice y se salta entera en vez de fingir que pasó.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const chk = (ok, m, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'
const DATA = process.env.PG_DATA ?? '/var/lib/pgtest339'
const PUERTO = process.env.PG_PORT ?? '5439'
const SOCK = '/tmp'

if (!existsSync(join(BIN, 'initdb'))) {
  console.log(`SKIP  no hay PostgreSQL en ${BIN}: la prueba de base no puede correr`)
  process.exit(0)
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts })
const comoPostgres = (linea) => sh('su', ['postgres', '-c', linea])
/**
 * Una consulta, en crudo. Devuelve el texto de la respuesta y, si la base la
 * rechaza, el texto del error en vez de reventar. Tolerante A PROPÓSITO, igual
 * que los ayudantes de las pruebas de pantalla: sin la columna nueva —el
 * control negativo— la primera consulta fallaría y el proceso moriría después
 * de UNA comprobación, en vez de informar todo lo que se rompe.
 */
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

// ── Terreno: una base con el andamiaje de Supabase y las migraciones ───────
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
-- permiso para los tres roles de la API. Es lo que permite EVALUAR las
-- funciones de las políticas, y lo que le da sentido a los \`revoke ... from
-- anon\` puntuales de la migración 15. Sin esto, la base local rechaza
-- \`es_admin\` y la prueba mediría un entorno que no es el de producción.
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
`
writeFileSync('/tmp/andamio339.sql', ANDAMIO)
sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/andamio339.sql'])

const migraciones = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
let fallaron = []
for (const m of migraciones) {
  try {
    sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join('supabase/migrations', m)], { stdio: 'pipe' })
  } catch (e) {
    fallaron.push(`${m}: ${(e.stderr ?? '').toString().split('\n').filter((l) => /ERROR/.test(l))[0] ?? 'error'}`)
  }
}
chk(fallaron.length === 0, `las ${migraciones.length} migraciones del repo aplican limpias`, fallaron.join(' | '))
chk(
  migraciones.includes('20260707000032_organizacion_usuario.sql'),
  '#339 · la migración 32 está en el repo y entra en la cadena',
)

// La migración 32 se aplica DOS veces: tiene que ser idempotente, porque su
// propia comprobación crea una vista que depende de `usuario_visible`.
let segunda = ''
try {
  sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/migrations/20260707000032_organizacion_usuario.sql'], { stdio: 'pipe' })
} catch (e) {
  segunda = (e.stderr ?? '').toString().split('\n').filter((l) => /ERROR/.test(l))[0] ?? 'error'
}
chk(segunda === '', '#339 · y se puede volver a aplicar sin romperse', segunda)

// ── El escenario del pedido ────────────────────────────────────────────────
// Nadie comparte proyecto con nadie: todo lo que se vea a continuación es por
// la regla nueva, no por membresía.
const AUTH = {
  admin: '11111111-1111-1111-1111-111111111111',
  c1: '22222222-2222-2222-2222-222222222222',
  c2: '33333333-3333-3333-3333-333333333333',
  c3: '44444444-4444-4444-4444-444444444444',
  c4: '55555555-5555-5555-5555-555555555555',
  c5: '66666666-6666-6666-6666-666666666666',
  cl1: '77777777-7777-7777-7777-777777777777',
}
q(`
delete from acceso_proyecto; delete from tarea; delete from sub_frente; delete from frente; delete from proyecto;
delete from usuario; delete from auth.users;
insert into auth.users (id, email) values
 ('${AUTH.admin}','admin@x.cl'), ('${AUTH.c1}','c1@x.cl'), ('${AUTH.c2}','c2@x.cl'),
 ('${AUTH.c3}','c3@x.cl'), ('${AUTH.c4}','c4@x.cl'), ('${AUTH.c5}','c5@x.cl'), ('${AUTH.cl1}','cl1@x.cl');
insert into usuario (nombre, iniciales, email, rol, activo, auth_id, organizacion) values
 ('Admin','AD','admin@x.cl','admin',true,'${AUTH.admin}',null),
 ('C1','C1','c1@x.cl','consultor',true,'${AUTH.c1}','Andotek'),
 ('C2','C2','c2@x.cl','consultor',true,'${AUTH.c2}','Andotek'),
 ('C3','C3','c3@x.cl','consultor',true,'${AUTH.c3}','Otra'),
 ('C4','C4','c4@x.cl','consultor',true,'${AUTH.c4}',null),
 ('C5','C5','c5@x.cl','consultor',true,'${AUTH.c5}',null),
 ('CL1','CL','cl1@x.cl','cliente',true,'${AUTH.cl1}','Andotek');
`)
const ve = (authId) =>
  como(authId, `select coalesce(string_agg(nombre, ',' order by nombre), '(nadie)') from usuario_visible;`)
    .split('\n')
    .pop()
chk(
  q(`select count(*) from acceso_proyecto;`).split('\n').pop() === '0',
  '#339 · terreno: nadie comparte proyecto con nadie',
)

console.log('\n── Criterios 3 a 6 · quién ve a quién ──')
const veC1 = ve(AUTH.c1)
chk(
  veC1.includes('C2'),
  '#339-3 · dos consultores de la misma organización se ven, aunque no compartan ningún proyecto',
  `C1 ve: ${veC1}`,
)
chk(!veC1.includes('C3'), '#339 · y no ve al consultor de OTRA organización', `C1 ve: ${veC1}`)
chk(
  !veC1.includes('C4') && !veC1.includes('C5'),
  '#339 · ni a los consultores sin organización',
  `C1 ve: ${veC1}`,
)

const veC4 = ve(AUTH.c4)
chk(
  !veC4.includes('C5'),
  '#339-5 · dos consultores SIN organización siguen sin verse (estar los dos vacíos no los junta)',
  `C4 ve: ${veC4}`,
)

const veCL = ve(AUTH.cl1)
chk(
  !veCL.includes('C1') && !veCL.includes('C2'),
  '#339-6 · un CLIENTE con la misma organización que un consultor no gana visibilidad',
  `CL1 ve: ${veCL}`,
)
chk(
  veC1.includes('Admin') && veC4.includes('Admin') && veCL.includes('Admin'),
  '#339 · control de vida: todos siguen viendo al administrador y a sí mismos',
  `C1 "${veC1}" · C4 "${veC4}" · CL1 "${veCL}"`,
)

// Criterio 4: cambiarle la organización a uno de los dos y dejan de verse.
q(`update usuario set organizacion = 'Otra Empresa' where nombre = 'C2';`)
const veC1Despues = ve(AUTH.c1)
chk(
  !veC1Despues.includes('C2'),
  '#339-4 · al cambiarle la organización a uno de los dos, dejan de verse',
  `C1 ve ahora: ${veC1Despues}`,
)
q(`update usuario set organizacion = 'Andotek' where nombre = 'C2';`)
chk(ve(AUTH.c1).includes('C2'), '#339 · y al devolvérsela, vuelven a verse')

console.log('\n── Criterio 7 · verse no da acceso a nada ──')
q(`
insert into proyecto (nombre, creado_por) select 'Proyecto de C2', id from usuario where nombre='C2';
insert into frente (proyecto_id, nombre, orden) select id, 'F', 0 from proyecto where nombre='Proyecto de C2';
insert into sub_frente (frente_id, nombre, orden) select id, 'SF', 0 from frente where nombre='F';
insert into tarea (sub_frente_id, titulo, orden) select id, 'Tarea de C2', 0 from sub_frente where nombre='SF';
`)
const proyC1 = como(AUTH.c1, `select count(*) from proyecto;`).split('\n').pop()
const tareasC1 = como(AUTH.c1, `select count(*) from tarea;`).split('\n').pop()
chk(
  ve(AUTH.c1).includes('C2') && proyC1 === '0' && tareasC1 === '0',
  '#339-7 · C1 ve a C2 por organización y NO ve ninguno de sus proyectos ni de sus tareas',
  `proyectos ${proyC1}, tareas ${tareasC1}`,
)
const proyC2 = como(AUTH.c2, `select count(*) from proyecto;`).split('\n').pop()
chk(proyC2 === '1', '#339 · control de vida: su dueño sí los ve', `C2 ve ${proyC2} proyecto(s)`)

console.log('\n── Criterio 8 · el correo se sigue mostrando igual ──')
const correoParaConsultor = como(AUTH.c1, `select email from usuario_visible where nombre='C2';`).split('\n').pop()
const correoParaCliente = como(AUTH.cl1, `select coalesce(email,'(oculto)') from usuario_visible where nombre='Admin';`).split('\n').pop()
const correoPropioCliente = como(AUTH.cl1, `select email from usuario_visible where nombre='CL1';`).split('\n').pop()
chk(
  correoParaConsultor === 'c2@x.cl' && correoParaCliente === '(oculto)' && correoPropioCliente === 'cl1@x.cl',
  '#339-8 · el correo mantiene su regla: lo ven el admin, el consultor y cada quien el suyo',
  `consultor→"${correoParaConsultor}" cliente→"${correoParaCliente}" propio→"${correoPropioCliente}"`,
)

console.log('\n── Criterio 9 · solo el administrador asigna la organización ──')
const intento = como(
  AUTH.c1,
  `update usuario set organizacion='Otra Empresa' where auth_id='${AUTH.c1}';`,
  { fallaOk: true },
)
chk(
  /ERROR/.test(intento) && /nombre y tus iniciales/.test(intento),
  '#339-9 · un no administrador no puede cambiar NI SU PROPIA organización',
  intento.split('\n').find((l) => /ERROR/.test(l)) ?? intento,
)
chk(
  q(`select organizacion from usuario where nombre='C1';`).split('\n').pop() === 'Andotek',
  '#339 · y su organización quedó intacta',
)
const intentoAjeno = como(
  AUTH.c1,
  `update usuario set organizacion='Andotek' where nombre='C4';`,
  { fallaOk: true },
)
const c4Sigue = q(`select coalesce(organizacion,'(vacía)') from usuario where nombre='C4';`).split('\n').pop()
chk(
  c4Sigue === '(vacía)',
  '#339-9 · ni la de nadie más',
  `C4 quedó con ${c4Sigue}${/ERROR/.test(intentoAjeno) ? ' (rechazado)' : ' (la fila no era suya y no la alcanza)'}`,
)
// Control de vida: el administrador SÍ puede.
// Se relee por la VISTA y no por la tabla: `organizacion` no está entre las
// columnas que la tabla le concede a authenticated (invariante 3), así que
// leerla desde la tabla se rechaza —y eso también es parte de lo correcto—.
const comoAdmin = como(
  AUTH.admin,
  `update usuario set organizacion='Andotek' where nombre='C4'; select organizacion from usuario_visible where nombre='C4';`,
  { fallaOk: true },
)
chk(
  comoAdmin.split('\n').pop() === 'Andotek',
  '#339 · control de vida: el administrador sí puede asignarla',
  comoAdmin.split('\n').pop(),
)
const leerTabla = como(AUTH.admin, `select organizacion from usuario where nombre='C4';`, { fallaOk: true })
chk(
  /ERROR/.test(leerTabla),
  '#339 · y ni siquiera el administrador lee `organizacion` de la TABLA: se lee por la vista (invariante 3)',
  leerTabla.split('\n').find((l) => /ERROR/.test(l)) ?? '',
)
q(`update usuario set organizacion = null where nombre='C4';`)

console.log('\n── La normalización ──')
q(`update usuario set organizacion = '  Andotek  ' where nombre='C3';`)
chk(
  q(`select organizacion from usuario where nombre='C3';`).split('\n').pop() === 'Andotek',
  '#339 · la organización se guarda sin espacios al borde ("  Andotek  " → "Andotek")',
)
q(`update usuario set organizacion = '   ' where nombre='C3';`)
chk(
  q(`select coalesce(organizacion,'(nula)') from usuario where nombre='C3';`).split('\n').pop() === '(nula)',
  '#339 · y una organización en blanco se guarda como vacía, no como una organización llamada " "',
)
q(`update usuario set organizacion = 'Otra' where nombre='C3';`)

console.log('\n── Criterio 12 · la regla dice lo mismo en los dos lugares ──')
// Comparación ESTRICTA: se vuelve a deparsar la expresión de la política
// dentro de una vista, para que el MISMO código de PostgreSQL escriba las dos.
// Así la igualdad no depende de cómo estén puestos los paréntesis.
q(`
do $$
declare expr text;
begin
  select pg_get_expr(polqual, polrelid) into expr from pg_policy where polname='usuario_select';
  execute format('create or replace view _cmp_politica as select u.id from usuario u where %s', expr);
end $$;
`)
const soloWhere = (def) => def.slice(def.indexOf('WHERE')).replace(/;\s*$/, '').replace(/\s+/g, ' ').trim()
const defPolitica = soloWhere(q(`select pg_get_viewdef('public._cmp_politica'::regclass, true);`))
const defVista = soloWhere(q(`select pg_get_viewdef('public.usuario_visible'::regclass, true);`))
chk(
  defPolitica === defVista,
  '#339-12 · la política y la vista dicen EXACTAMENTE lo mismo (deparsadas por el mismo código)',
  defPolitica === defVista ? defVista : `política: ${defPolitica}\n            vista:    ${defVista}`,
)
chk(
  /misma_organizacion/.test(defVista),
  '#339 · y las dos incluyen el caso nuevo',
  defVista,
)
chk(
  q(`select coinciden from regla_visibilidad_usuario;`).split('\n').pop() === 't',
  '#339-12 · y la vista que mira la compuerta lo confirma desde dentro de la base',
)
q(`drop view if exists _cmp_politica;`)

console.log('\n── Los invariantes que no se pueden romper ──')
const columnas = q(`
select coalesce(string_agg(a.attname, ',' order by a.attname), '(ninguna)')
from information_schema.column_privileges p
join pg_attribute a on a.attrelid = 'public.usuario'::regclass and a.attname = p.column_name
where p.table_name='usuario' and p.grantee='authenticated' and p.privilege_type='SELECT';
`).split('\n').pop()
chk(
  !columnas.includes('organizacion') && !columnas.includes('email'),
  '#339 · la tabla `usuario` no le abre `organizacion` a authenticated (como tampoco `email`)',
  `columnas concedidas: ${columnas}`,
)
const filasDeMas = como(AUTH.c1, `select count(*) from (select id from usuario except select id from usuario_visible) x;`).split('\n').pop()
chk(filasDeMas === '0', '#248 · la tabla no devuelve ninguna fila que la vista no tenga', `${filasDeMas} de más`)
const anonPuede = q(`select has_function_privilege('anon', 'misma_organizacion(uuid)', 'execute');`).split('\n').pop()
chk(anonPuede === 'f', '#339 · `anon` no puede ejecutar el predicado nuevo (invariante 5)')
const abiertas = q(`select count(*) from permiso_ejecucion_abierto;`).split('\n').pop()
chk(abiertas === '0', '#290 · ninguna función quedó con el permiso universal', `${abiertas} abiertas`)

try {
  comoPostgres(`${BIN}/pg_ctl -D ${DATA}/data stop -m immediate`)
} catch {
  /* da igual: es una base desechable */
}
