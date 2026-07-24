-- =====================================================================
-- Mejoras de producto (desktop) — pedido #132–#144
--
--  #133 Archivado de proyectos: estado -> {activo, archivado}; gate del
--       cambio de estado por el permiso archivarEliminarProyectos.
--  #136 Eliminar usuarios: columna `eliminado` (invisible + no entra),
--       usuario_visible filtra eliminados, RPC crear_o_reactivar_usuario.
--  #137 Notificaciones: tabla `notificacion` + RLS (cada quien las suyas)
--       + 3 triggers (asignación, replan, comentario). Autor desde la
--       sesión (invariante 4); funciones con search_path (Advisor) y sin
--       EXECUTE para anon/authenticated (invariante 6).
--
-- Respeta los invariantes de docs/SEGURIDAD.md. Migración aditiva.
-- =====================================================================

-- =====================================================================
-- PASO 1 (#133) — proyecto.estado: solo activo / archivado
-- =====================================================================
-- Los proyectos existentes con pausado/cerrado pasan a activo (hoy no hay
-- ninguno en producción; la migración es segura igual).
update proyecto set estado = 'activo' where estado is distinct from 'archivado' and estado <> 'activo';
alter table proyecto drop constraint if exists proyecto_estado_check;
alter table proyecto add constraint proyecto_estado_check check (estado in ('activo','archivado'));

-- Archivar/desarchivar exige el permiso archivarEliminarProyectos (admin
-- siempre). La política de update ya limita a admin/dueño; este trigger
-- añade el permiso SOLO cuando cambia el estado (editar nombre/color no se
-- ve afectado). Así, un dueño consultor sin el permiso no puede archivar —
-- verificado a nivel de base, no solo de interfaz (#133).
create or replace function validar_estado_proyecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado
     and not (es_admin() or permiso_proyecto('archivarEliminarProyectos')) then
    raise exception 'Sin permiso para archivar o desarchivar proyectos';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validar_estado_proyecto on proyecto;
create trigger trg_validar_estado_proyecto before update on proyecto
  for each row execute function validar_estado_proyecto();

-- =====================================================================
-- PASO 2 (#136) — usuario.eliminado + usuario_visible filtra eliminados
-- =====================================================================
-- `activo` conserva su significado (desactivar = baja temporal, sigue
-- visible). `eliminado` es el tercer nivel: no entra y desaparece de la UI.
-- Eliminar setea activo=false Y eliminado=true; usuario_actual_id()/es_admin()
-- ya filtran por activo, así que un eliminado no puede iniciar sesión ni leer.
alter table usuario add column if not exists eliminado boolean not null default false;

-- La vista deja de mostrar eliminados (a todos, admin incluido: la única
-- vuelta es dar de alta el mismo correo, que reactiva la fila vía RPC).
drop view if exists usuario_visible;
create view usuario_visible with (security_invoker = false) as
  select
    u.id, u.nombre, u.iniciales, u.rol, u.activo, u.auth_id,
    case when es_admin() or u.auth_id = auth.uid() or rol_actual() = 'consultor'
         then u.email else null end as email,
    case when es_admin() or u.auth_id = auth.uid()
         then u.permisos_proyecto else '{}'::jsonb end as permisos_proyecto
  from usuario u
  where not u.eliminado
    and (es_admin() or u.auth_id = auth.uid() or u.rol = 'admin' or comparte_proyecto(u.id));
grant select on usuario_visible to authenticated;

-- =====================================================================
-- PASO 3 (#136) — Alta que reactiva si el correo ya existe (aunque esté
-- eliminado, invisible para el cliente). Es SECURITY DEFINER porque debe
-- ver filas que la vista oculta; la autorización se replica adentro
-- (misma regla que usuario_insert: admin, o consultor con invitarClientes
-- creando un cliente). Sus accesos guardados vuelven con él.
-- =====================================================================
create or replace function crear_o_reactivar_usuario(
  p_nombre text, p_iniciales text, p_email text, p_rol text
) returns usuario language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_row usuario;
begin
  if not (
    es_admin()
    or (rol_actual() = 'consultor' and permiso_proyecto('invitarClientes') and p_rol = 'cliente')
  ) then
    raise exception 'Sin permiso para crear usuarios';
  end if;

  select * into v_row from usuario where lower(email) = v_email;
  if found then
    if not v_row.eliminado and v_row.activo then
      raise exception 'Ya existe un usuario activo con ese correo';
    end if;
    -- Reactivar la fila existente (conserva id, correo, rol y sus accesos).
    update usuario
      set eliminado = false, activo = true,
          nombre = p_nombre, iniciales = p_iniciales
      where id = v_row.id
      returning * into v_row;
    return v_row;
  end if;

  insert into usuario (nombre, iniciales, email, rol)
    values (p_nombre, p_iniciales, v_email, p_rol)
    returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function crear_o_reactivar_usuario(text, text, text, text) from anon;

-- =====================================================================
-- PASO 4 (#137) — Tabla de notificaciones + RLS + índice
-- =====================================================================
create table if not exists notificacion (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuario(id) on delete cascade,   -- destinatario
  tipo       text not null check (tipo in ('asignacion','replan','comentario')),
  tarea_id   uuid not null references tarea(id) on delete cascade,     -- a dónde navega
  autor_id   uuid references usuario(id),                              -- quién la generó
  dato       jsonb not null default '{}'::jsonb,                       -- p.ej. {"fecha": "..."} para replan
  leida      boolean not null default false,
  creada     timestamptz not null default now()
);
-- Consulta de cada carga: mis notificaciones, más recientes primero.
create index if not exists idx_notificacion_usuario on notificacion (usuario_id, creada desc);

alter table notificacion enable row level security;

-- Cada usuario ve y marca como leídas SOLO las suyas. Sin insert/delete desde
-- el cliente: las crean los triggers (security definer) y se borran en cascada.
drop policy if exists notificacion_select on notificacion;
create policy notificacion_select on notificacion for select
  using (usuario_id = usuario_actual_id());
drop policy if exists notificacion_update on notificacion;
create policy notificacion_update on notificacion for update
  using (usuario_id = usuario_actual_id())
  with check (usuario_id = usuario_actual_id());

-- =====================================================================
-- PASO 5 (#137) — Triggers que generan las notificaciones (autor = sesión;
-- nunca al propio autor). Todas security definer + search_path fijo; los
-- triggers no llevan EXECUTE para anon/authenticated (invariante 6).
-- =====================================================================

-- Helper: inserta una notificación si el destinatario existe y no es el autor.
create or replace function crear_notificacion(
  p_dest uuid, p_autor uuid, p_tipo text, p_tarea uuid, p_dato jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_dest is not null and p_autor is not null and p_dest <> p_autor then
    insert into notificacion (usuario_id, autor_id, tipo, tarea_id, dato)
      values (p_dest, p_autor, p_tipo, p_tarea, coalesce(p_dato, '{}'::jsonb));
  end if;
end;
$$;
revoke execute on function crear_notificacion(uuid, uuid, text, uuid, jsonb) from anon, authenticated;

-- (1) Te asignaron una tarea: cambia (o nace) responsable_id.
create or replace function notif_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.responsable_id is not null
     and (tg_op = 'INSERT' or new.responsable_id is distinct from old.responsable_id) then
    perform crear_notificacion(new.responsable_id, usuario_actual_id(), 'asignacion', new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function notif_asignacion() from anon, authenticated;
drop trigger if exists trg_notif_asignacion on tarea;
create trigger trg_notif_asignacion after insert or update of responsable_id on tarea
  for each row execute function notif_asignacion();

-- (2) Replanificaron una tarea tuya: se aprovecha registrar_replanificacion
-- (misma condición). Se recrea conservando la lógica de la migración 13 y se
-- agrega la notificación al responsable (si no es quien replanificó).
create or replace function registrar_replanificacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_num   integer;
begin
  if old.fecha_objetivo is not null
     and old.fecha_objetivo <= current_date
     and new.fecha_objetivo is not null
     and new.fecha_objetivo is distinct from old.fecha_objetivo then
    v_actor := nullif(current_setting('app.actor', true), '');
    select count(*) + 1 into v_num from replanificacion where tarea_id = new.id;
    insert into replanificacion (tarea_id, fecha_anterior, fecha_nueva, numero_cambio, cambiado_por)
    values (new.id, old.fecha_objetivo, new.fecha_objetivo, v_num,
            case when v_actor is null then null else v_actor::uuid end);
    -- Notifica al responsable de la tarea (autor = quien replanificó).
    if v_actor is not null then
      perform crear_notificacion(
        new.responsable_id, v_actor::uuid, 'replan', new.id,
        jsonb_build_object('fecha', new.fecha_objetivo));
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function registrar_replanificacion() from anon, authenticated;

-- (3) Comentaron una tarea tuya.
create or replace function notif_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_resp uuid;
begin
  select responsable_id into v_resp from tarea where id = new.tarea_id;
  perform crear_notificacion(v_resp, new.autor_id, 'comentario', new.tarea_id, '{}'::jsonb);
  return new;
end;
$$;
revoke execute on function notif_comentario() from anon, authenticated;
drop trigger if exists trg_notif_comentario on comentario;
create trigger trg_notif_comentario after insert on comentario
  for each row execute function notif_comentario();
