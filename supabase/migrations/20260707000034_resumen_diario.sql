-- =====================================================================
-- 34 · Resumen diario por correo (#272)
--
-- Hasta acá el producto enviaba DOS correos —la invitación y el
-- restablecimiento de contraseña—, los dos disparados por una persona. No
-- había nada que corriera solo a una hora fija, ni ninguna preferencia de
-- correo en la ficha del usuario.
--
-- Esta migración pone la parte de la BASE de un resumen diario: la
-- preferencia por persona, el turno que decide si hoy toca correr, los
-- datos que van en el correo y el registro de cada corrida. El envío en sí
-- vive en la función de servidor `resumen-diario`, y quien la despierta a
-- las 8:00 es el programador (pg_cron + pg_net), que se deja desde el
-- dashboard — ver DEPLOY.md § "Resumen diario".
--
-- Lo que NO cambia:
--   · Ningún permiso. La regla de visibilidad de `usuario` queda palabra
--     por palabra como la dejó la migración 32, y esta migración vuelve a
--     comprobarlo.
--   · Los dos correos que ya existen.
--   · Las notificaciones dentro de la aplicación.
--   · El grant por columnas de la tabla `usuario` (migración 15): el
--     cliente lee por `usuario_visible`, nunca la tabla (invariante 3).
--
-- ADITIVA: no borra ni reescribe ninguna migración anterior. `usuario_visible`
-- se amplía con `create or replace` y la columna nueva al FINAL, que es lo
-- único que PostgreSQL admite sin soltar la vista — así `regla_visibilidad_
-- usuario`, que depende de ella, no hay que tocarla.
--
-- ANTES DE APLICAR: respaldo del dueño (`pg_dump`). El plan gratuito no tiene
-- respaldos automáticos.
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que trae
-- casos nuevos para este cambio (§ "#272").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · La preferencia
-- ---------------------------------------------------------------------
-- Dos pasos y no uno, y es el punto entero del pedido: la columna NACE con
-- `default false`, así que todos los que ya existen quedan APAGADOS —nadie
-- pidió este correo, no se les enciende sin avisar—, y recién después el
-- default pasa a `true`, de modo que quien se dé de alta a partir de ahora
-- nace encendido. Un solo `add column ... default true` habría encendido a
-- todo el mundo de golpe.
alter table usuario add column if not exists resumen_diario boolean not null default false;
alter table usuario alter column resumen_diario set default true;

comment on column usuario.resumen_diario is
  '#272 · ¿Esta persona recibe el resumen diario por correo? Los usuarios '
  'anteriores a la migración 34 quedaron apagados; los nuevos nacen '
  'encendidos. NO entra en el candado de auto-edición: cada quien tiene que '
  'poder apagar el suyo.';

-- El candado `validar_autoedicion_usuario` (migraciones 18 y 32) NO se toca,
-- y es deliberado. Enumera las columnas PROHIBIDAS una por una, así que una
-- columna nueva queda permitida sola — que es justo lo que hace falta acá.
-- Lo contrario del caso de `organizacion` en #339, que sí entró a la lista
-- porque cambiarla amplía lo que uno VE. Esta solo decide si a uno le llega
-- un correo. Que nadie pueda tocar el interruptor de OTRO lo sigue
-- resolviendo la política `usuario_update`, que solo deja la propia fila (o
-- al administrador). La compuerta comprueba las dos cosas.

-- ---------------------------------------------------------------------
-- 2 · La vista enmascarada
-- ---------------------------------------------------------------------
-- `create or replace` con la columna nueva AL FINAL: PostgreSQL lo admite
-- mientras las columnas anteriores no cambien de nombre, tipo ni orden, y
-- así no hay que soltar la vista —lo que arrastraría a
-- `regla_visibilidad_usuario`, que depende de ella—. El WHERE queda
-- idéntico al de la migración 32: esta migración no toca la visibilidad.
--
-- Se entrega con la misma regla que `permisos_proyecto` y `organizacion`:
-- al administrador —que lo configura desde la ficha— y a cada quien el
-- suyo. Nadie más necesita saber si a un tercero le llega un correo.
create or replace view usuario_visible with (security_invoker = false) as
  select
    u.id, u.nombre, u.iniciales, u.iniciales_manual, u.rol, u.activo, u.auth_id,
    case when es_admin() or u.auth_id = auth.uid() or rol_actual() = 'consultor'
         then u.email else null end as email,
    case when es_admin() or u.auth_id = auth.uid()
         then u.permisos_proyecto else '{}'::jsonb end as permisos_proyecto,
    case when es_admin() or u.auth_id = auth.uid()
         then u.organizacion else null end as organizacion,
    case when es_admin() or u.auth_id = auth.uid()
         then u.resumen_diario else null end as resumen_diario
  from usuario u
  where not u.eliminado
    and (
      es_admin()
      or u.auth_id = auth.uid()
      or u.rol = 'admin'
      or comparte_proyecto(u.id)
      or misma_organizacion(u.id)
    );
grant select on usuario_visible to authenticated;

-- La regla vive en dos lugares y tiene que seguir diciendo lo mismo. Se
-- comprueba contra lo que la base tiene VIVO, no contra lo que este archivo
-- dice (migración 32, punto 3b).
do $$
declare v_ok boolean;
begin
  select coinciden into v_ok from regla_visibilidad_usuario;
  if not v_ok then
    raise exception '#272 — al ampliar `usuario_visible` se desalineó la regla de visibilidad de #339';
  end if;
  raise notice '#272 — comprobado: la regla de visibilidad sigue diciendo lo mismo en los dos lugares.';
end $$;

-- ---------------------------------------------------------------------
-- 3 · Días hábiles entre dos fechas
-- ---------------------------------------------------------------------
/** Espejo EXACTO de `difDiasHabiles` (src/lib/dates.ts), que es de donde
 *  sale la columna Atraso de la aplicación: cuenta los días hábiles
 *  estrictamente POSTERIORES a la primera fecha y hasta la segunda
 *  inclusive, con signo — positivo si la tarea se corrió hacia adelante.
 *
 *  Hace falta acá porque el correo muestra esa misma columna y ordena por
 *  ella, y el cálculo tiene que dar el mismo número que la pantalla. La
 *  prueba `docs/prueba-272-resumen-diario.mjs` compara las dos
 *  implementaciones fecha por fecha.
 *
 *  `immutable`: no mira el reloj ni la zona; solo aritmética de calendario.
 *  `isodow` da 6 y 7 para sábado y domingo. */
create or replace function dias_habiles_entre(p_a date, p_b date)
returns integer language sql immutable set search_path = public as $$
  select case
    when p_a is null or p_b is null then null
    when p_a = p_b then 0
    else (
      select count(*)::int * (case when p_a < p_b then 1 else -1 end)
      from generate_series(least(p_a, p_b) + 1, greatest(p_a, p_b), interval '1 day') d
      where extract(isodow from d) < 6
    )
  end;
$$;
-- #290: toda función nueva nace con EXECUTE para PUBLIC, y `revoke ... from
-- anon` NO lo quita —anon lo conserva por la vía de PUBLIC—. El revoke a
-- PUBLIC va PRIMERO y los demás después. Vuelve a aparecer con cada función
-- nueva; la comprobación del final de este archivo lo mide.
revoke execute on function dias_habiles_entre(date, date) from public;
revoke execute on function dias_habiles_entre(date, date) from anon, authenticated;
grant execute on function dias_habiles_entre(date, date) to service_role;

-- ---------------------------------------------------------------------
-- 4 · El registro de cada corrida
-- ---------------------------------------------------------------------
-- "Una corrida que falla no se reintenta. Que quede anotado que ocurrió."
-- Por eso la fila se escribe ANTES de enviar nada: si el envío revienta, la
-- fila del día ya está y el programador —que despierta cada hora— no vuelve
-- a intentarlo. El detalle del fallo se anota al cerrar.
create table if not exists resumen_diario_corrida (
  fecha     date primary key,          -- el día EN CHILE, no en UTC
  iniciada  timestamptz not null default now(),
  terminada timestamptz,
  enviados  integer not null default 0,
  fallidos  integer not null default 0,
  forzada   boolean not null default false,
  detalle   text
);

comment on table resumen_diario_corrida is
  '#272 · Una fila por día en que el resumen diario intentó correr. Se '
  'escribe al TOMAR el turno, antes de enviar: una corrida que falla queda '
  'anotada y no se reintenta.';

-- Los default privileges de Supabase conceden las tablas nuevas a anon: hay
-- que revocarlo explícitamente (misma nota que la migración 30). Esta tabla
-- no la lee nadie desde el navegador — es del programador.
alter table resumen_diario_corrida enable row level security;
revoke all on resumen_diario_corrida from public, anon, authenticated;
grant select, insert, update on resumen_diario_corrida to service_role;

-- ---------------------------------------------------------------------
-- 5 · El turno
-- ---------------------------------------------------------------------
/** ¿Le toca correr al resumen AHORA? Devuelve cierto UNA sola vez por día.
 *
 *  LA HORA SE RESUELVE POR NOMBRE DE ZONA, nunca con un desfase fijo: el
 *  programador de Supabase trabaja en UTC y Chile cambia de hora dos veces
 *  al año, así que un `-4` escrito a mano dejaría de dar las 8:00 en
 *  septiembre. Es la misma regla que ya rige `hoy_chile()` (#291): el
 *  programador despierta a la función CADA HORA y quien decide si es el
 *  momento es esta función, mirando `America/Santiago`.
 *
 *  Sábado y domingo no corre: el atraso se cuenta en días hábiles y el
 *  sábado repetiría lo del viernes.
 *
 *  `p_forzar` es para VERIFICAR desde el dashboard (DEPLOY.md): saltea el
 *  día y la hora, y vuelve a dejar la corrida del día en cero. No saltea
 *  ninguna otra regla — los mismos destinatarios, las mismas tareas. */
create or replace function resumen_diario_tomar_turno(p_forzar boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ahora timestamp := now() at time zone 'America/Santiago';
  v_hoy   date := v_ahora::date;
begin
  if p_forzar then
    insert into resumen_diario_corrida (fecha, forzada) values (v_hoy, true)
    on conflict (fecha) do update
      set iniciada = now(), terminada = null, enviados = 0, fallidos = 0,
          forzada = true, detalle = null;
    return true;
  end if;

  if extract(isodow from v_ahora) >= 6 then return false; end if;  -- sábado y domingo
  if extract(hour from v_ahora) <> 8 then return false; end if;    -- 8:00 de Chile

  insert into resumen_diario_corrida (fecha) values (v_hoy)
  on conflict (fecha) do nothing;
  return found;
end $$;
revoke execute on function resumen_diario_tomar_turno(boolean) from public;
revoke execute on function resumen_diario_tomar_turno(boolean) from anon, authenticated;
grant execute on function resumen_diario_tomar_turno(boolean) to service_role;

-- ---------------------------------------------------------------------
-- 6 · Qué le va a cada quien
-- ---------------------------------------------------------------------
/** Una fila por persona QUE TIENE ALGO QUE RECIBIR. Quien no tiene ni
 *  atrasadas ni vencimientos de hoy no aparece, así que no hay ningún
 *  camino por el que se le mande un correo vacío.
 *
 *  A QUIÉN: a cualquier usuario, consultor o cliente, con la misma regla.
 *  Un cliente tiene tareas asignadas igual que un consultor. Quedan fuera
 *  los que no pueden entrar a la herramienta —desactivado, eliminado, e
 *  invitado que todavía no activó su cuenta (`auth_id is null`)—, aunque su
 *  interruptor esté encendido.
 *
 *  QUÉ: sus tareas —donde es responsable— en los proyectos a los que HOY
 *  tiene acceso. "Tener acceso" es exactamente lo que muestra Mis Tareas:
 *  ser dueño o tener una fila en `acceso_proyecto`, y el proyecto no
 *  archivado. Sin caso especial para el administrador, igual que la
 *  pantalla (#179): ser admin no lo hace miembro de todo.
 *
 *  ORDEN. Atrasadas: de mayor a menor atraso —la columna Atraso del
 *  producto, días hábiles corridos respecto del compromiso original— y con
 *  el mismo atraso, por proyecto, frente, sub frente y nombre. Vencen hoy:
 *  por proyecto y, dentro de cada uno, por el orden que el dueño les dio a
 *  frentes y sub frentes ARRASTRÁNDOLOS (`orden`), no el alfabético.
 *
 *  El correo NO ordena nada: recibe las listas ya ordenadas.
 *
 *  SECURITY DEFINER y concedida SOLO a `service_role`: lee correos de
 *  terceros, que es justo lo que la aplicación tiene prohibido (invariante
 *  3). Por eso el destinatario se resuelve acá y no en el navegador. */
create or replace function resumen_diario_datos()
returns table (
  usuario_id uuid,
  nombre     text,
  email      text,
  atrasadas  jsonb,
  vencen_hoy jsonb,
  semana     integer
)
language sql stable security definer set search_path = public as $$
  with param as (
    select hoy_chile() as hoy,
           -- "hasta el domingo": el domingo de ESTA semana. `isodow` va de 1
           -- (lunes) a 7 (domingo), así que el domingo es hoy + (7 - isodow).
           hoy_chile() + (7 - extract(isodow from hoy_chile()))::int as domingo
  ),
  destinatario as (
    select u.id, u.nombre, u.email
    from usuario u
    where u.resumen_diario
      and u.activo
      and not u.eliminado
      and u.auth_id is not null
  ),
  mia as (
    select
      d.id as usuario_id,
      p.nombre as proyecto,
      f.nombre as frente,
      f.orden  as frente_orden,
      sf.nombre as sub_frente,
      sf.orden  as sub_frente_orden,
      t.titulo,
      t.fecha_objetivo,
      exists (select 1 from replanificacion r where r.tarea_id = t.id) as replanificada,
      -- Espejo de `atrasoHabiles`: los adelantos y el "sin cambio" no son
      -- atraso, y lo que no se puede calcular tampoco.
      greatest(coalesce(dias_habiles_entre(t.fecha_original, t.fecha_objetivo), 0), 0) as atraso
    from destinatario d
    join tarea t on t.responsable_id = d.id and not t.archivada and not t.hecha
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    join proyecto p on p.id = f.proyecto_id
    where p.estado <> 'archivado'
      and (
        p.creado_por = d.id
        or exists (select 1 from acceso_proyecto a where a.proyecto_id = p.id and a.usuario_id = d.id)
      )
      and t.fecha_objetivo is not null
  ),
  fila as (
    select
      m.usuario_id,
      m.proyecto, m.frente, m.sub_frente, m.titulo, m.fecha_objetivo, m.atraso,
      m.frente_orden, m.sub_frente_orden,
      case
        when m.fecha_objetivo < (select hoy from param)
          then case when m.replanificada then 'atrasada_replan' else 'atrasada' end
        else case when m.replanificada then 'pendiente_replan' else 'pendiente' end
      end as categoria,
      case
        when m.fecha_objetivo < (select hoy from param) then 'atrasada'
        when m.fecha_objetivo = (select hoy from param) then 'hoy'
        when m.fecha_objetivo <= (select domingo from param) then 'semana'
        else 'despues'
      end as bloque
    from mia m
  ),
  json_fila as (
    select
      f.usuario_id,
      f.bloque,
      jsonb_build_object(
        'titulo', f.titulo,
        'proyecto', f.proyecto,
        'frente', f.frente,
        'subFrente', f.sub_frente,
        'fecha', to_char(f.fecha_objetivo, 'YYYY-MM-DD'),
        'categoria', f.categoria,
        'atraso', f.atraso
      ) as tarea,
      f.atraso, lower(f.proyecto) as proy_orden, f.frente_orden, f.sub_frente_orden, f.titulo
    from fila f
  )
  select
    d.id,
    d.nombre,
    d.email,
    coalesce((
      select jsonb_agg(j.tarea order by j.atraso desc, j.proy_orden, j.frente_orden, j.sub_frente_orden, j.titulo)
      from json_fila j where j.usuario_id = d.id and j.bloque = 'atrasada'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(j.tarea order by j.proy_orden, j.frente_orden, j.sub_frente_orden, j.titulo)
      from json_fila j where j.usuario_id = d.id and j.bloque = 'hoy'
    ), '[]'::jsonb),
    (select count(*)::int from json_fila j where j.usuario_id = d.id and j.bloque = 'semana')
  from destinatario d
  where exists (
    select 1 from json_fila j where j.usuario_id = d.id and j.bloque in ('atrasada', 'hoy')
  )
  order by d.nombre;
$$;
revoke execute on function resumen_diario_datos() from public;
revoke execute on function resumen_diario_datos() from anon, authenticated;
grant execute on function resumen_diario_datos() to service_role;

-- ---------------------------------------------------------------------
-- 7 · Comprobación en la misma transacción (#290)
-- ---------------------------------------------------------------------
-- Si alguna de las funciones nuevas quedó con el permiso universal, esta
-- migración FALLA en vez de dejar un agujero abierto. Es la trampa que
-- reaparece con cada función nueva: medido, sin los `revoke ... from public`
-- de arriba esta consulta devuelve las tres.
do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas from permiso_ejecucion_abierto;
  if v_abiertas > 0 then
    raise exception '#272/#290 — quedaron % función(es) con el permiso universal', v_abiertas;
  end if;
  raise notice '#272 — comprobado: las funciones nuevas nacen cerradas.';
end $$;

-- Comprobación de la columna (para dejar constancia al aplicar): los que ya
-- estaban quedan apagados y el default pasa a encendido.
--
--   select count(*) filter (where resumen_diario) as encendidos,
--          count(*) filter (where not resumen_diario) as apagados
--     from usuario;
--   select column_default from information_schema.columns
--    where table_name = 'usuario' and column_name = 'resumen_diario';  -- true
--
-- La compuerta automatiza el resto (§ "#272").
