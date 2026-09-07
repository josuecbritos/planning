// #353 — Un consultor suma a un colega: la parte que vive en la BASE.
//
// Las reglas de QUIÉN PUEDE AGREGAR A QUIÉN no están en la pantalla: están en
// las tres políticas de `acceso_proyecto`. El repo de memoria no tiene RLS, así
// que un límite que solo se viera en pantalla no probaría nada: se comprueba
// contra una base de verdad.
//
// La otra mitad —que la pantalla LLEGUE a hacerlo, que es lo que #339 dejó a
// medias— vive en `docs/prueba-353-agregar-colega.mjs`.
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
//   node docs/prueba-353-agregar-colega-base.mjs
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
const DATA = process.env.PG_DATA ?? '/var/lib/pgtest353'
const PUERTO = process.env.PG_PORT ?? '5441'
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
writeFileSync('/tmp/andamio353.sql', ANDAMIO)
sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/andamio353.sql'])


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
chk(migraciones.includes('20260707000033_agregar_colega_organizacion.sql'), '#353 · la migración 33 está en el repo y entra en la cadena')

// Idempotente: se aplica dos veces sin romperse.
let segunda = ''
try {
  sh('psql', ['-h', SOCK, '-p', PUERTO, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/migrations/20260707000033_agregar_colega_organizacion.sql'], { stdio: 'pipe' })
} catch (e) {
  segunda = (e.stderr ?? '').toString().split('\n').filter((l) => /ERROR/.test(l))[0] ?? 'error'
}
chk(segunda === '', '#353 · y se puede volver a aplicar sin romperse', segunda)

// ── El escenario del pedido ────────────────────────────────────────────────
// Dos consultores de la misma organización SIN ningún proyecto en común, uno de
// otra organización, uno sin organización y un cliente.
const AUTH = {
  admin: '11111111-1111-1111-1111-111111111111',
  a: '22222222-2222-2222-2222-222222222222',
  b: '33333333-3333-3333-3333-333333333333',
  otra: '44444444-4444-4444-4444-444444444444',
  sinorg: '55555555-5555-5555-5555-555555555555',
  cli: '77777777-7777-7777-7777-777777777777',
}
q(`
delete from acceso_proyecto; delete from tarea; delete from sub_frente; delete from frente; delete from proyecto;
delete from usuario; delete from auth.users;
insert into auth.users (id, email) values
 ('${AUTH.admin}','admin@x.cl'), ('${AUTH.a}','a@x.cl'), ('${AUTH.b}','b@x.cl'),
 ('${AUTH.otra}','otra@x.cl'), ('${AUTH.sinorg}','sinorg@x.cl'), ('${AUTH.cli}','cli@x.cl');
insert into usuario (nombre, iniciales, email, rol, activo, auth_id, organizacion) values
 ('Admin','AD','admin@x.cl','admin',true,'${AUTH.admin}',null),
 ('A','A','a@x.cl','consultor',true,'${AUTH.a}','Andotek'),
 ('B','B','b@x.cl','consultor',true,'${AUTH.b}','Andotek'),
 ('Otra','OT','otra@x.cl','consultor',true,'${AUTH.otra}','Otra'),
 ('SinOrg','SO','sinorg@x.cl','consultor',true,'${AUTH.sinorg}',null),
 ('Cli','CL','cli@x.cl','cliente',true,'${AUTH.cli}',null);
insert into proyecto (nombre, creado_por) select 'Proy de A', id from usuario where nombre='A';
insert into proyecto (nombre, creado_por) select 'Otro de A', id from usuario where nombre='A';
insert into frente (proyecto_id, nombre, orden) select id, 'F', 0 from proyecto where nombre='Proy de A';
insert into sub_frente (frente_id, nombre, orden) select id, 'SF', 0 from frente where nombre='F';
insert into tarea (sub_frente_id, titulo, orden) select id, 'Tarea', 0 from sub_frente where nombre='SF';
`)
const id = (n) => q(`select id from usuario where nombre='${n}';`).split('\n').pop()
const proy = (n) => q(`select id from proyecto where nombre='${n}';`).split('\n').pop()
const P1 = proy('Proy de A')
const P2 = proy('Otro de A')
const agregar = (authId, usuarioId, proyectoId) =>
  como(authId, `insert into acceso_proyecto (usuario_id, proyecto_id) values ('${usuarioId}','${proyectoId}');`)
const quitar = (authId, usuarioId, proyectoId) =>
  como(authId, `delete from acceso_proyecto where usuario_id='${usuarioId}' and proyecto_id='${proyectoId}';`)
const ok = (r) => !/ERROR/.test(r) && /INSERT 0 1|DELETE 1|UPDATE 1/.test(r)

chk(q(`select count(*) from acceso_proyecto;`).split('\n').pop() === '0', '#353 · terreno: nadie comparte proyecto con nadie')

// ── EL OBJETIVO ────────────────────────────────────────────────────────────
console.log('\n── El objetivo · A suma a su colega B ──')
const sumaB = agregar(AUTH.a, id('B'), P1)
chk(ok(sumaB), '#353-1/2 · el dueño con el permiso SUMA a un colega de su misma organización', sumaB.split('\n').pop())

// Criterio 9: B ve ESE proyecto y NINGÚN otro de A.
const veB = como(AUTH.b, `select coalesce(string_agg(nombre,',' order by nombre),'(ninguno)') from proyecto;`).split('\n').pop()
chk(veB === 'Proy de A', '#353-2/9 · B ve ese proyecto, y NINGÚN otro de A', `B ve: ${veB}`)
const tareasB = como(AUTH.b, `select count(*) from tarea;`).split('\n').pop()
chk(tareasB === '1', '#353-2 · y sus tareas', `${tareasB} tarea(s)`)

// Criterio 4: puede configurar sus permisos en ese proyecto. El consultor NACE
// sin ese permiso (default de la migración 12, que este pedido no cambia), así
// que primero se le da — es terreno, no un defecto.
q(`update usuario set permisos_proyecto = permisos_proyecto || '{"configurarPermisosClientes": true}'::jsonb where nombre='A';`)
const config = como(
  AUTH.a,
  `update acceso_proyecto set permisos = '{"crearTareas": true}'::jsonb where usuario_id='${id('B')}' and proyecto_id='${P1}';`,
)
chk(ok(config), '#353-4 · y puede configurar sus permisos en ese proyecto', config.split('\n').pop())

// Criterio 5: puede quitarlo.
const saca = quitar(AUTH.a, id('B'), P1)
chk(ok(saca), '#353-5 · y puede quitarlo', saca.split('\n').pop())
const veBDespues = como(AUTH.b, `select count(*) from proyecto;`).split('\n').pop()
chk(veBDespues === '0', '#353-5 · tras quitarlo, B deja de ver el proyecto', `${veBDespues} proyecto(s)`)

// ── Los límites ────────────────────────────────────────────────────────────
console.log('\n── Los límites ──')
const otraOrg = agregar(AUTH.a, id('Otra'), P1)
chk(/ERROR/.test(otraOrg), '#353-6 · NO puede sumar a un consultor de OTRA organización', otraOrg.split('\n').find((l) => /ERROR/.test(l)) ?? otraOrg)
const sinOrg = agregar(AUTH.a, id('SinOrg'), P1)
chk(/ERROR/.test(sinOrg), '#353-6 · ni a un consultor SIN organización', sinOrg.split('\n').find((l) => /ERROR/.test(l)) ?? sinOrg)
const conCliente = agregar(AUTH.a, id('Cli'), P1)
chk(ok(conCliente), '#353 · control de vida: a un CLIENTE sí puede, como hasta hoy', conCliente.split('\n').pop())

// Criterio 7: sin el permiso, no puede ni con un cliente.
quitar(AUTH.a, id('Cli'), P1)
q(`update usuario set permisos_proyecto = permisos_proyecto || '{"invitarClientes": false}'::jsonb where nombre='A';`)
const sinPermiso = agregar(AUTH.a, id('Cli'), P1)
chk(/ERROR/.test(sinPermiso), '#353-7 · sin el permiso no puede sumar a nadie, ni siquiera a un cliente')
const sinPermisoColega = agregar(AUTH.a, id('B'), P1)
chk(/ERROR/.test(sinPermisoColega), '#353-7 · ni a su colega')
q(`update usuario set permisos_proyecto = permisos_proyecto || '{"invitarClientes": true}'::jsonb where nombre='A';`)

// Criterio 8: un cliente no gana nada.
const clienteAgrega = agregar(AUTH.cli, id('B'), P1)
chk(/ERROR/.test(clienteAgrega), '#353-8 · un CLIENTE no puede sumar a nadie a ningún proyecto')

// Criterio 10: el administrador sigue siendo global.
const adminSuma = agregar(AUTH.admin, id('Otra'), P1)
chk(ok(adminSuma), '#353-10 · el administrador sigue pudiendo sumar a cualquiera', adminSuma.split('\n').pop())
quitar(AUTH.admin, id('Otra'), P1)

// El dueño no puede sumar a un colega a un proyecto que NO es suyo.
q(`insert into proyecto (nombre, creado_por) select 'De otro', id from usuario where nombre='Otra';`)
const ajeno = agregar(AUTH.a, id('B'), proy('De otro'))
chk(/ERROR/.test(ajeno), '#353 · y tampoco a un proyecto que no es suyo')

// ── La lista de agregables la entrega la base ──────────────────────────────
console.log('\n── Criterio 3 · la lista la entrega la base ──')
const agregables = (authId, p) =>
  como(authId, `select coalesce(string_agg(nombre,',' order by nombre),'(nadie)') from usuarios_agregables('${p}');`).split('\n').pop()
const listaA = agregables(AUTH.a, P1)
chk(listaA === 'B', '#353-3 · para A, la lista trae a su colega y a nadie más', `A puede agregar: ${listaA}`)
const listaAdmin = agregables(AUTH.admin, P1)
chk(
  listaAdmin.includes('Otra') && listaAdmin.includes('SinOrg') && listaAdmin.includes('Cli'),
  '#353-3 · para el administrador, a cualquiera',
  `admin puede agregar: ${listaAdmin}`,
)
const listaCliente = agregables(AUTH.cli, P1)
chk(listaCliente === '(nadie)', '#353-3 · para un cliente, a nadie', `cliente: ${listaCliente}`)
// Quien ya está dentro sale de la lista.
agregar(AUTH.a, id('B'), P1)
chk(agregables(AUTH.a, P1) === '(nadie)', '#353-3 · y quien ya es miembro sale de la lista')
quitar(AUTH.a, id('B'), P1)

// ── La organización es cosa de consultores ─────────────────────────────────
console.log('\n── Criterio 16c · la organización solo en consultores ──')
q(`update usuario set organizacion = 'Andotek' where nombre='Cli';`)
chk(
  q(`select coalesce(organizacion,'(nula)') from usuario where nombre='Cli';`).split('\n').pop() === '(nula)',
  '#353-3b · la base no acepta una organización en un usuario que no es consultor',
)
chk(
  q(`select count(*) from usuario where rol <> 'consultor' and organizacion is not null;`).split('\n').pop() === '0',
  '#353-16c · ningún usuario que no sea consultor queda con organización guardada',
)
// Y al cambiar de perfil, se suelta: si quedara guardada e invisible, volver a
// ponerlo como consultor le activaría sola una visibilidad que nadie decidió.
como(AUTH.admin, `select cambiar_rol_usuario('${id('B')}','cliente');`)
chk(
  q(`select rol||' / '||coalesce(organizacion,'(nula)') from usuario where nombre='B';`).split('\n').pop() === 'cliente / (nula)',
  '#353-3b · y al pasar a alguien a cliente, su organización se borra',
  q(`select rol||' / '||coalesce(organizacion,'(nula)') from usuario where nombre='B';`).split('\n').pop(),
)
q(`update usuario set rol='consultor' where nombre='B';`)
chk(
  q(`select coalesce(organizacion,'(nula)') from usuario where nombre='B';`).split('\n').pop() === '(nula)',
  '#353-3b · y al volver a consultor NO se le reactiva sola: queda sin organización',
)
q(`update usuario set organizacion='Andotek' where nombre='B';`)

// ── Los invariantes ────────────────────────────────────────────────────────
console.log('\n── Los invariantes ──')
chk(
  q(`select coinciden from regla_visibilidad_usuario;`).split('\n').pop() === 't',
  '#353-15 · la regla de visibilidad sigue diciendo lo mismo en los dos lugares',
)
const orgAjena = como(AUTH.a, `select coalesce(organizacion,'(oculta)') from usuario_visible where nombre='B';`).split('\n').pop()
chk(
  orgAjena === '(oculta)',
  '#353-15b · un consultor NO ve la organización de otro usuario: sigue siendo un dato del administrador',
  orgAjena,
)
const orgPropia = como(AUTH.a, `select coalesce(organizacion,'(oculta)') from usuario_visible where nombre='A';`).split('\n').pop()
chk(orgPropia === 'Andotek', '#353 · control de vida: cada quien sí ve la suya', orgPropia)
const abiertas = q(`select coalesce(string_agg(funcion,', '),'(ninguna)') from permiso_ejecucion_abierto;`).split('\n').pop()
chk(abiertas === '(ninguna)', '#353-17 · ninguna función nueva quedó con el permiso universal (la trampa de #290)', abiertas)
for (const fn of ['usuarios_agregables(uuid)', 'puede_dar_acceso_a(uuid)', 'es_colega_de_organizacion(uuid)']) {
  chk(
    q(`select has_function_privilege('anon', '${fn}', 'execute');`).split('\n').pop() === 'f',
    `#353-17 · \`anon\` no puede ejecutar ${fn}`,
  )
}
const filasDeMas = como(AUTH.a, `select count(*) from (select id from usuario except select id from usuario_visible) x;`).split('\n').pop()
chk(filasDeMas === '0', '#248 · la tabla `usuario` sigue sin devolver ninguna fila que la vista no tenga')

// ── #354 · la fuente sabe lo que el cliente NO puede calcular ───────────────
console.log('\n── #354 · quitar y configurar tampoco los decide la pantalla ──')
// Éste es el par de medidas que explica el bug de #354 y lo cierra: sobre el
// MISMO consultor y en la MISMA sesión, la organización del colega llega VACÍA
// —así que comparar organizaciones en el navegador no puede funcionar— y sin
// embargo la función que autoriza la operación responde que SÍ. Por eso la
// pantalla tiene que preguntar en vez de calcular.
const orgDelColega = como(AUTH.a, `select coalesce(organizacion,'(vacía)') from usuario_visible where nombre='B';`).split('\n').pop()
const puedeSobreColega = como(AUTH.a, `select puede_dar_acceso_a('${id('B')}');`).split('\n').pop()
chk(
  orgDelColega === '(vacía)' && puedeSobreColega === 't',
  '#354 · al consultor le llega VACÍA la organización del colega, y aun así la fuente dice que sí puede',
  `organización del colega: ${orgDelColega} · puede_dar_acceso_a: ${puedeSobreColega}`,
)
const puedeSobreOtra = como(AUTH.a, `select puede_dar_acceso_a('${id('Otra')}');`).split('\n').pop()
const puedeSobreSinOrg = como(AUTH.a, `select puede_dar_acceso_a('${id('SinOrg')}');`).split('\n').pop()
const puedeSobreCliente = como(AUTH.a, `select puede_dar_acceso_a('${id('Cli')}');`).split('\n').pop()
chk(
  puedeSobreOtra === 'f' && puedeSobreSinOrg === 'f' && puedeSobreCliente === 't',
  '#354 · y esa misma fuente dice que no sobre otra organización ni sobre uno sin organización, y que sí sobre un cliente',
  `otra=${puedeSobreOtra} sinOrg=${puedeSobreSinOrg} cliente=${puedeSobreCliente}`,
)
chk(
  q(`select has_function_privilege('authenticated', 'puede_dar_acceso_a(uuid)', 'execute');`).split('\n').pop() === 't',
  '#354 · y el cliente puede preguntársela: la función ya estaba concedida desde #353',
)

try {
  comoPostgres(`${BIN}/pg_ctl -D ${DATA}/data stop -m immediate`)
} catch {
  /* base desechable */
}
