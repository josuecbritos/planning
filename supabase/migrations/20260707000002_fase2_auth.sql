-- =====================================================================
-- Fase 2 — Login, roles y acceso por proyecto
-- Documento Funcional v3.1: Modulo 1 (7.1) + tabla 5.7.
--
-- Reemplaza la RLS permisiva de Fase 1 por politicas reales:
--   * Admin: acceso total a todo.
--   * Cliente: SOLO LECTURA y SOLO de los proyectos asignados (5.7).
-- La regla vive a nivel de base de datos, no de interfaz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vinculo usuario <-> auth.users
-- El Admin crea la fila en `usuario` con el email; cuando esa persona se
-- registra/inicia sesion en Supabase Auth con el mismo email, un trigger
-- enlaza ambos registros.
-- ---------------------------------------------------------------------
alter table usuario add column if not exists auth_id uuid unique references auth.users(id);

create or replace function vincular_usuario_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update usuario set auth_id = new.id
  where lower(email) = lower(new.email) and auth_id is null;
  return new;
end;
$$;

drop trigger if exists trg_vincular_usuario_auth on auth.users;
create trigger trg_vincular_usuario_auth
  after insert on auth.users
  for each row execute function vincular_usuario_auth();

-- ---------------------------------------------------------------------
-- 2. Helpers de sesion (security definer para evitar recursion de RLS)
-- ---------------------------------------------------------------------
create or replace function usuario_actual_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from usuario where auth_id = auth.uid() and activo limit 1;
$$;

create or replace function es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuario
    where auth_id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- Proyectos visibles para el usuario actual (admin: todos; cliente: asignados).
create or replace function proyectos_visibles()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from proyecto p
  where es_admin()
     or exists (
       select 1 from acceso_cliente_proyecto a
       where a.proyecto_id = p.id and a.usuario_id = usuario_actual_id()
     );
$$;

-- ---------------------------------------------------------------------
-- 3. Regla: exactamente 2 Admins activos (5.1 / 7.1)
-- ---------------------------------------------------------------------
create or replace function limitar_admins()
returns trigger language plpgsql as $$
declare v_count integer;
begin
  if new.rol = 'admin' and new.activo then
    select count(*) into v_count from usuario
    where rol = 'admin' and activo and id <> new.id;
    if v_count >= 2 then
      raise exception 'El sistema admite exactamente 2 usuarios Admin activos';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limitar_admins on usuario;
create trigger trg_limitar_admins
  before insert or update on usuario
  for each row execute function limitar_admins();

-- ---------------------------------------------------------------------
-- 4. RLS real (reemplaza fase1_all)
-- ---------------------------------------------------------------------

-- usuario: el admin gestiona; cada usuario puede leerse a si mismo.
drop policy if exists fase1_all on usuario;
drop policy if exists usuario_select on usuario;
drop policy if exists usuario_write on usuario;
create policy usuario_select on usuario for select
  using (es_admin() or auth_id = auth.uid());
create policy usuario_write on usuario for all
  using (es_admin()) with check (es_admin());

-- proyecto: admin todo; cliente lee los asignados.
drop policy if exists fase1_all on proyecto;
drop policy if exists proyecto_select on proyecto;
drop policy if exists proyecto_write on proyecto;
create policy proyecto_select on proyecto for select
  using (id in (select proyectos_visibles()));
create policy proyecto_write on proyecto for insert
  with check (es_admin());
drop policy if exists proyecto_update on proyecto;
drop policy if exists proyecto_delete on proyecto;
create policy proyecto_update on proyecto for update
  using (es_admin()) with check (es_admin());
create policy proyecto_delete on proyecto for delete
  using (es_admin());

-- frente: visibilidad via proyecto; escritura solo admin.
drop policy if exists fase1_all on frente;
drop policy if exists frente_select on frente;
drop policy if exists frente_write on frente;
create policy frente_select on frente for select
  using (proyecto_id in (select proyectos_visibles()));
create policy frente_write on frente for all
  using (es_admin()) with check (es_admin());

-- sub_frente
drop policy if exists fase1_all on sub_frente;
drop policy if exists subfrente_select on sub_frente;
drop policy if exists subfrente_write on sub_frente;
create policy subfrente_select on sub_frente for select
  using (exists (
    select 1 from frente f
    where f.id = frente_id and f.proyecto_id in (select proyectos_visibles())
  ));
create policy subfrente_write on sub_frente for all
  using (es_admin()) with check (es_admin());

-- tarea
drop policy if exists fase1_all on tarea;
drop policy if exists tarea_select on tarea;
drop policy if exists tarea_write on tarea;
create policy tarea_select on tarea for select
  using (exists (
    select 1 from sub_frente sf
    join frente f on f.id = sf.frente_id
    where sf.id = sub_frente_id and f.proyecto_id in (select proyectos_visibles())
  ));
create policy tarea_write on tarea for all
  using (es_admin()) with check (es_admin());

-- replanificacion: mismo alcance de lectura que la tarea; el historial lo
-- escribe el trigger. Escritura directa solo admin.
drop policy if exists fase1_all on replanificacion;
drop policy if exists replan_select on replanificacion;
drop policy if exists replan_write on replanificacion;
create policy replan_select on replanificacion for select
  using (exists (
    select 1 from tarea t
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    where t.id = tarea_id and f.proyecto_id in (select proyectos_visibles())
  ));
create policy replan_write on replanificacion for all
  using (es_admin()) with check (es_admin());

-- acceso_cliente_proyecto: admin gestiona; el cliente lee sus asignaciones.
drop policy if exists fase1_all on acceso_cliente_proyecto;
drop policy if exists acceso_select on acceso_cliente_proyecto;
drop policy if exists acceso_write on acceso_cliente_proyecto;
create policy acceso_select on acceso_cliente_proyecto for select
  using (es_admin() or usuario_id = usuario_actual_id());
create policy acceso_write on acceso_cliente_proyecto for all
  using (es_admin()) with check (es_admin());

-- ---------------------------------------------------------------------
-- 5. El RPC de replanificacion pasa a exigir permisos de escritura
--    (definer NO: respeta la RLS del caller sobre tarea).
-- ---------------------------------------------------------------------
-- (replanificar_tarea ya corre como invoker; el UPDATE interno choca con
--  tarea_write si el caller no es admin — correcto por diseño.)
