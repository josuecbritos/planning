-- =====================================================================
-- Migración 18 — Cuenta de usuario y comentarios (#205, #207, #208, #209)
--
-- Aditiva: no borra ni renombra nada. Cuatro bloques independientes:
--   1. #205 tabla `recuperacion` — tokens de restablecer contraseña, con su
--      propia semántica (1 hora, un solo uso). NO se reutiliza `invitacion`.
--   2. #207 auto-edición del perfil — nombre e iniciales, y solo eso.
--   3. #209 edición del propio comentario — sin borrado, con marca de editado.
--   4. #208 menciones — notificación de mención que NO duplica la de comentario.
--
-- Invariantes de docs/SEGURIDAD.md que este archivo toca, y cómo se respetan:
--   1 (registro público OFF): la recuperación NO crea cuentas; el token solo
--     apunta a un `usuario` que YA tiene `auth_id`.
--   2 (enlace auth.users ↔ usuario exige invitación usada): intacto — los
--     tokens de recuperación viven en su propia tabla y no tocan `invitacion`
--     ni el trigger `vincular_usuario_auth`.
--   4 (autor derivado de la sesión): las menciones las deriva un trigger del
--     TEXTO del comentario; el destinatario nunca llega como parámetro.
--   10 (RLS en toda tabla con datos, sin USING(true)): `recuperacion` queda
--     con RLS habilitada y CERO políticas — nadie la lee desde el cliente;
--     solo la Edge Function, que usa service_role.
-- =====================================================================

-- =====================================================================
-- 1 · #205 — Tokens de recuperación de contraseña
-- =====================================================================
create table if not exists recuperacion (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuario(id) on delete cascade,
  token      text not null unique,
  creada     timestamptz not null default now(),
  expira     timestamptz not null,
  usada      timestamptz
);
-- Consulta del límite por cuenta: "¿cuántos pedí en la última hora?".
create index if not exists idx_recuperacion_usuario on recuperacion (usuario_id, creada desc);

alter table recuperacion enable row level security;
-- Sin políticas a propósito: con RLS activa y ninguna política, la tabla es
-- inaccesible para anon y authenticated. La Edge Function la opera con
-- service_role, que no pasa por RLS. Se revocan además los privilegios de
-- tabla como segunda barrera (defensa en profundidad).
revoke all on recuperacion from anon, authenticated;

-- =====================================================================
-- 2 · #207 — El usuario edita SU nombre y SUS iniciales, nada más
-- =====================================================================

-- Las iniciales hoy se calculan una vez al crear y quedan congeladas. La regla
-- pedida distingue dos casos, y para eso hace falta saber si alguien las
-- escribió a mano: fijadas a mano → se respetan para siempre; nunca escritas →
-- siguen al nombre. Sin esta bandera los dos casos son indistinguibles.
alter table usuario add column if not exists iniciales_manual boolean not null default false;

-- Derivación canónica (misma regla que el front): iniciales de las palabras
-- del nombre, hasta dos, en mayúsculas.
create or replace function derivar_iniciales(p_nombre text)
returns text language sql immutable set search_path = public as $$
  select upper(substring(
    (select string_agg(left(palabra, 1), '' order by orden)
     from unnest(regexp_split_to_array(trim(p_nombre), '\s+')) with ordinality as t(palabra, orden)
     where palabra <> ''),
    1, 2));
$$;

-- Backfill: si las iniciales guardadas NO son las que se derivarían del
-- nombre, alguien las escribió a mano y hay que respetarlas.
update usuario
   set iniciales_manual = true
 where iniciales is not null
   and iniciales <> ''
   and iniciales is distinct from derivar_iniciales(nombre);

create or replace function sincronizar_iniciales()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Vacías = "no las fijé": se derivan y dejan de ser manuales.
  if new.iniciales is null or trim(new.iniciales) = '' then
    new.iniciales_manual := false;
    new.iniciales := derivar_iniciales(new.nombre);
  elsif not new.iniciales_manual
        and (tg_op = 'INSERT' or new.nombre is distinct from old.nombre) then
    new.iniciales := derivar_iniciales(new.nombre);
  end if;
  return new;
end;
$$;
revoke execute on function sincronizar_iniciales() from anon, authenticated;
drop trigger if exists trg_sincronizar_iniciales on usuario;
create trigger trg_sincronizar_iniciales before insert or update on usuario
  for each row execute function sincronizar_iniciales();

-- La política pasa de "solo admin" a "admin o mi propia fila". La política es
-- la puerta; el trigger de abajo es la cerradura: sin él, poder actualizar la
-- propia fila permitiría auto-ascenderse a admin.
drop policy if exists usuario_update on usuario;
create policy usuario_update on usuario for update
  using (es_admin() or auth_id = auth.uid())
  with check (es_admin() or auth_id = auth.uid());

-- Deliberadamente SECURITY INVOKER (sin `security definer`): necesita ver el
-- `current_user` REAL. Una petición del cliente entra como rol `authenticated`;
-- un UPDATE hecho dentro de una función SECURITY DEFINER —como
-- `crear_o_reactivar_usuario`, que un consultor con permiso usa para reactivar
-- a un cliente eliminado— entra como el dueño de esa función. Sin esta
-- distinción, la regla de auto-edición rompería esa alta, que ya tiene su
-- propia autorización adentro.
create or replace function validar_autoedicion_usuario()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if es_admin() then return new; end if;
  -- Quien no es admin solo puede tocar nombre e iniciales de SU fila. Se
  -- enumeran las columnas prohibidas una por una (lista blanca implícita):
  -- rol y permisos serían escalada de privilegio; activo y eliminado, evadir
  -- una baja; email y auth_id, apoderarse de otra cuenta.
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.eliminado is distinct from old.eliminado
     or new.auth_id is distinct from old.auth_id
     or new.permisos is distinct from old.permisos
     or new.permisos_proyecto is distinct from old.permisos_proyecto
  then
    raise exception 'Solo puedes cambiar tu nombre y tus iniciales';
  end if;
  return new;
end;
$$;
revoke execute on function validar_autoedicion_usuario() from anon, authenticated;
drop trigger if exists trg_validar_autoedicion_usuario on usuario;
create trigger trg_validar_autoedicion_usuario before update on usuario
  for each row execute function validar_autoedicion_usuario();

-- La vista por la que el front LEE usuarios necesita exponer la bandera, para
-- que Configuración pueda decir si las iniciales siguen al nombre o están
-- fijadas. Se recrea idéntica a la de la migración 16 + la columna nueva.
drop view if exists usuario_visible;
create view usuario_visible with (security_invoker = false) as
  select
    u.id, u.nombre, u.iniciales, u.iniciales_manual, u.rol, u.activo, u.auth_id,
    case when es_admin() or u.auth_id = auth.uid() or rol_actual() = 'consultor'
         then u.email else null end as email,
    case when es_admin() or u.auth_id = auth.uid()
         then u.permisos_proyecto else '{}'::jsonb end as permisos_proyecto
  from usuario u
  where not u.eliminado
    and (es_admin() or u.auth_id = auth.uid() or u.rol = 'admin' or comparte_proyecto(u.id));
grant select on usuario_visible to authenticated;

-- Nota: el privilegio de UPDATE sobre `usuario` ya lo tiene `authenticated`
-- por los grants por defecto del proyecto; quien acota qué se puede cambiar es
-- la política (qué filas) más el trigger (qué columnas), no el grant.

-- =====================================================================
-- 3 · #209 — Editar el propio comentario (nunca borrar, nunca el de otro)
-- =====================================================================
alter table comentario add column if not exists editado timestamptz;

-- Solo el AUTOR. A diferencia del resto del modelo, aquí el admin NO entra:
-- un comentario es la palabra de quien lo escribió, y el hilo acompaña al
-- registro de replanificaciones como respaldo de por qué pasó lo que pasó.
drop policy if exists comentario_update on comentario;
create policy comentario_update on comentario for update
  using (autor_id = usuario_actual_id())
  with check (autor_id = usuario_actual_id());
-- (Sigue SIN política de delete: no se borra ningún comentario.)

-- No necesita privilegios elevados: solo compara NEW contra OLD.
create or replace function validar_edicion_comentario()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Editar cambia el texto y nada más: ni el autor, ni la tarea, ni la hora
  -- original (que es lo que ordena el hilo).
  if new.autor_id is distinct from old.autor_id
     or new.tarea_id is distinct from old.tarea_id
     or new.timestamp is distinct from old.timestamp then
    raise exception 'De un comentario solo se puede editar el texto';
  end if;
  -- La marca de editado la pone la base, no el cliente.
  if new.texto is distinct from old.texto then
    new.editado := now();
  else
    new.editado := old.editado;
  end if;
  return new;
end;
$$;
revoke execute on function validar_edicion_comentario() from anon, authenticated;
drop trigger if exists trg_validar_edicion_comentario on comentario;
create trigger trg_validar_edicion_comentario before update on comentario
  for each row execute function validar_edicion_comentario();

-- =====================================================================
-- 4 · #208 — Menciones: una sola notificación por persona y comentario
-- =====================================================================

-- Tipo nuevo. El check se reemplaza porque un check no se "amplía".
alter table notificacion drop constraint if exists notificacion_tipo_check;
alter table notificacion add constraint notificacion_tipo_check
  check (tipo in ('asignacion','replan','comentario','mencion'));

-- ¿Este usuario puede ver este proyecto? Es el equivalente de
-- `tiene_acceso_proyecto`, pero para un usuario ARBITRARIO (aquella responde
-- por el de la sesión). Se usa para no generar una notificación hacia una
-- tarea que el destinatario no podría abrir.
create or replace function usuario_tiene_acceso(p_usuario uuid, p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuario u
    where u.id = p_usuario and u.activo and not u.eliminado
      and (
        u.rol = 'admin'
        or exists (select 1 from proyecto p where p.id = p_proyecto and p.creado_por = u.id)
        or exists (select 1 from acceso_proyecto a
                   where a.usuario_id = u.id and a.proyecto_id = p_proyecto)
      )
  );
$$;
revoke execute on function usuario_tiene_acceso(uuid, uuid) from anon, authenticated;

-- Reemplaza a notif_comentario: ahora resuelve menciones Y responsable en una
-- sola pasada. Hacerlo en UN trigger —y no en dos— es lo que garantiza la
-- regla "una sola notificación por persona": con dos triggers habría que
-- depender del orden en que Postgres los dispara.
--
-- Las menciones se leen del TEXTO, que las guarda por id: `@[<uuid>]`. Por eso
-- una mención sobrevive a que la persona cambie de nombre (#207): el nombre se
-- resuelve al pintar, no al escribir. Y por eso el destinatario no puede
-- falsificarse desde el cliente (invariante 4): sale del texto, validado aquí.
create or replace function notif_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resp        uuid;
  v_proyecto    uuid;
  v_mencionado  uuid;
  v_avisados    uuid[] := '{}';
begin
  select t.responsable_id, f.proyecto_id into v_resp, v_proyecto
    from tarea t
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
   where t.id = new.tarea_id;

  -- (a) Menciones: gana el texto más específico.
  for v_mencionado in
    select distinct (m[1])::uuid
      from regexp_matches(new.texto, '@\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]', 'g') as m
  loop
    -- Sin acceso al proyecto no hay notificación: la llevaría a una tarea que
    -- no puede abrir. `crear_notificacion` ya descarta al propio autor.
    if usuario_tiene_acceso(v_mencionado, v_proyecto) then
      perform crear_notificacion(v_mencionado, new.autor_id, 'mencion', new.tarea_id, '{}'::jsonb);
      v_avisados := array_append(v_avisados, v_mencionado);
    end if;
  end loop;

  -- (b) Responsable: solo si NO fue mencionado (si lo fue, ya recibió la suya).
  if v_resp is not null and not (v_resp = any (v_avisados)) then
    perform crear_notificacion(v_resp, new.autor_id, 'comentario', new.tarea_id, '{}'::jsonb);
  end if;

  return new;
end;
$$;
revoke execute on function notif_comentario() from anon, authenticated;
-- El trigger sigue siendo AFTER INSERT y solo INSERT: editar un comentario
-- (#209) no genera notificaciones nuevas.
drop trigger if exists trg_notif_comentario on comentario;
create trigger trg_notif_comentario after insert on comentario
  for each row execute function notif_comentario();
