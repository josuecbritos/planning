-- =====================================================================
-- Reestructuración de roles y permisos (pedido-roles-y-permisos)
--
-- Modelo nuevo:
--   * Tres roles: admin (ve/gestiona todo, sin límite de cantidad),
--     consultor (sus proyectos + los asignados), cliente (solo invitado).
--   * Dueño de proyecto = proyecto.creado_por. Principio rector: el dueño
--     tiene control total dentro de su proyecto; un invitado (consultor o
--     cliente) opera según los permisos configurados EN SU ACCESO.
--   * Accesos generalizados: acceso_cliente_proyecto → acceso_proyecto,
--     con `permisos` jsonb POR ACCESO (set de ocho sobre tareas).
--   * Permisos de proyecto del consultor en usuario.permisos_proyecto:
--     { crearProyectos, archivarEliminarProyectos, invitarClientes,
--       configurarPermisosClientes }.
--   * Defaults por rol aplicados por triggers (al crear consultor y al
--     crear un acceso).
--
-- ⚠️ ORDEN DE APLICACIÓN (runbook en README):
--   0) Export manual de la base (respaldo).
--   1) Esta migración (modelo + backfill + RLS, todo junto).
--   2) Redeploy de la Edge Function invitar-usuario.
--   3) Compuerta de validación: scripts/validar-rls.mjs rol por rol.
--   4) Recién entonces invitar usuarios reales.
-- =====================================================================

-- =====================================================================
-- PASO 1 — Modelo de datos + backfill (antes de tocar la RLS, para que
-- las políticas nuevas no evalúen contra filas sin dueño/rol).
-- =====================================================================

-- 1.a Rol consultor + fin de la regla "exactamente 2 admins".
alter table usuario drop constraint if exists usuario_rol_check;
alter table usuario add constraint usuario_rol_check
  check (rol in ('admin', 'consultor', 'cliente'));

drop trigger if exists trg_limitar_admins on usuario;
drop function if exists limitar_admins();

-- 1.b Permisos de proyecto del consultor (3.1).
alter table usuario add column if not exists permisos_proyecto jsonb not null default '{}'::jsonb;

-- Defaults por rol (4.1 / 4.2 / 4.3). Los "No" se omiten (ausente = false).
create or replace function default_permisos_proyecto()
returns jsonb language sql immutable as $$
  select '{"crearProyectos": true, "archivarEliminarProyectos": true,
           "invitarClientes": true, "configurarPermisosClientes": false}'::jsonb;
$$;

create or replace function default_permisos_tareas(p_rol text)
returns jsonb language sql immutable as $$
  select case p_rol
    -- Cliente: ejecutor del plan — crea/planifica/completa lo suyo, asigna
    -- responsable en todas; no altera la estructura (4.2).
    when 'cliente' then
      '{"crearTareas": true, "editarFechas": "asignadas", "marcarHechas": "asignadas",
        "asignarResponsable": "todas"}'::jsonb
    -- Consultor invitado: un colega — autonomía plena (4.3).
    when 'consultor' then
      '{"crearFrentes": true, "crearSubFrentes": true, "crearTareas": true,
        "editarFechas": "todas", "marcarHechas": "todas", "editarTareas": "todas",
        "archivarEliminar": "todas", "asignarResponsable": "todas"}'::jsonb
    else '{}'::jsonb
  end;
$$;

-- Al crear (o convertir a) un consultor sin configuración, aplicar el default.
create or replace function aplicar_default_consultor()
returns trigger language plpgsql as $$
begin
  if new.rol = 'consultor'
     and (new.permisos_proyecto is null or new.permisos_proyecto = '{}'::jsonb) then
    new.permisos_proyecto := default_permisos_proyecto();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_default_consultor on usuario;
create trigger trg_default_consultor
  before insert or update of rol on usuario
  for each row execute function aplicar_default_consultor();

-- 1.c Dueño de proyecto (2): creado_por ES el dueño.
-- Backfill (9): proyectos existentes → la cuenta admin que los creó; si no
-- quedó registrado, el primer admin activo (las cuentas del titular).
update proyecto
set creado_por = (
  select id from usuario where rol = 'admin' and activo order by fecha_creacion limit 1
)
where creado_por is null;

-- Y en adelante, todo proyecto nace con dueño (el usuario actual).
create or replace function default_dueno_proyecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.creado_por is null then
    new.creado_por := usuario_actual_id();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_default_dueno on proyecto;
create trigger trg_default_dueno
  before insert on proyecto
  for each row execute function default_dueno_proyecto();

-- 1.d Accesos generalizados (8): cubren cliente-proyecto Y consultor-proyecto,
-- con sus permisos asociados POR ACCESO.
alter table if exists acceso_cliente_proyecto rename to acceso_proyecto;
alter table acceso_proyecto add column if not exists permisos jsonb not null default '{}'::jsonb;

-- Backfill (9): cada acceso existente hereda la configuración actual del
-- usuario (los clientes demo conservan sus permisos; NO se les aplica el
-- default nuevo).
update acceso_proyecto a
set permisos = coalesce(u.permisos, '{}'::jsonb)
from usuario u
where u.id = a.usuario_id
  and (a.permisos is null or a.permisos = '{}'::jsonb);

-- Los accesos NUEVOS nacen con el default del rol del usuario (4).
create or replace function aplicar_default_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.permisos is null or new.permisos = '{}'::jsonb then
    new.permisos := default_permisos_tareas((select rol from usuario where id = new.usuario_id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_default_acceso on acceso_proyecto;
create trigger trg_default_acceso
  before insert on acceso_proyecto
  for each row execute function aplicar_default_acceso();

-- =====================================================================
-- PASO 2 — Helpers de autorización (security definer: cortan la
-- recursión de RLS y leen con privilegios de definición).
-- =====================================================================

-- usuario_actual_id() y es_admin() se conservan tal cual (fase 2).

create or replace function rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from usuario where auth_id = auth.uid() and activo limit 1;
$$;

/** ¿El usuario actual es el dueño del proyecto? (creado_por) */
create or replace function es_dueno_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto where id = p_proyecto and creado_por = usuario_actual_id()
  );
$$;

/** ¿El usuario actual tiene un ACCESO (fila) a este proyecto? */
create or replace function es_invitado_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acceso_proyecto a
    where a.proyecto_id = p_proyecto and a.usuario_id = usuario_actual_id()
  );
$$;

/** Visibilidad del proyecto: admin, dueño o invitado. (Se REDEFINE la
 *  función existente: las políticas antiguas que la usan heredan la
 *  semántica nueva.) */
create or replace function tiene_acceso_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_admin() or es_dueno_proyecto(p_proyecto) or es_invitado_proyecto(p_proyecto);
$$;

/** Permiso de NIVEL PROYECTO del consultor actual (3.1). Admin: siempre. */
create or replace function permiso_proyecto(p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select es_admin() or coalesce((
    (select permisos_proyecto from usuario where auth_id = auth.uid() and activo limit 1)
      ->> p_nombre
  )::boolean, false);
$$;

/** Permisos del usuario actual DENTRO de un proyecto (los de su acceso). */
create or replace function permisos_en(p_proyecto uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select permisos from acceso_proyecto
    where proyecto_id = p_proyecto and usuario_id = usuario_actual_id()
  ), '{}'::jsonb);
$$;

create or replace function permiso_bool_en(p_proyecto uuid, p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((permisos_en(p_proyecto) ->> p_nombre)::boolean, false);
$$;

/** Permiso sobre tareas con alcance: 'todas' o 'asignadas' (contra el
 *  responsable ACTUAL de la tarea — "puede soltar lo suyo, no tomar lo
 *  ajeno", 3.2). */
create or replace function permiso_tarea_en(p_proyecto uuid, p_nombre text, p_responsable uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  v := permisos_en(p_proyecto) ->> p_nombre;
  if v = 'todas' then return true; end if;
  if v = 'asignadas' then
    return p_responsable is not null and p_responsable = usuario_actual_id();
  end if;
  return false;
end;
$$;

/** ¿Algún permiso de edición sobre esta tarea? (alcanza la fila; el trigger
 *  valida campo a campo). */
create or replace function invitado_puede_editar_algo_en(p_proyecto uuid, p_responsable uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select permiso_tarea_en(p_proyecto, 'editarFechas', p_responsable)
      or permiso_tarea_en(p_proyecto, 'marcarHechas', p_responsable)
      or permiso_tarea_en(p_proyecto, 'editarTareas', p_responsable)
      or permiso_tarea_en(p_proyecto, 'archivarEliminar', p_responsable)
      or permiso_tarea_en(p_proyecto, 'asignarResponsable', p_responsable);
$$;

/** Proyecto al que pertenece un sub frente. */
create or replace function proyecto_de_subfrente(p_subfrente uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select f.proyecto_id from sub_frente sf join frente f on f.id = sf.frente_id
  where sf.id = p_subfrente;
$$;

/** ¿El usuario `u` es cliente? (para las reglas "solo clientes", 5/6). */
create or replace function es_cliente(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuario where id = p_usuario and rol = 'cliente');
$$;

/** ¿`u` comparte algún proyecto visible con el usuario actual? (para ver
 *  nombres/avatares de responsables y la lista de miembros, 7). */
create or replace function comparte_proyecto(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto p
    where tiene_acceso_proyecto(p.id)
      and (p.creado_por = p_usuario or exists (
        select 1 from acceso_proyecto a
        where a.proyecto_id = p.id and a.usuario_id = p_usuario
      ))
  );
$$;

-- =====================================================================
-- PASO 3 — RLS reescrita completa.
-- =====================================================================

-- ---- usuario --------------------------------------------------------
drop policy if exists usuario_select on usuario;
drop policy if exists usuario_write on usuario;
drop policy if exists usuario_insert on usuario;
drop policy if exists usuario_update on usuario;
drop policy if exists usuario_delete on usuario;

-- Se ven: uno mismo, los admins (personal de la consultora, aparecen como
-- responsables) y quienes comparten proyecto (miembros). Los permisos
-- (columnas de configuración) solo se muestran en la UI a quien puede
-- configurarlos (7); la barrera dura es la ESCRITURA, abajo.
create policy usuario_select on usuario for select using (
  es_admin() or auth_id = auth.uid() or rol = 'admin' or comparte_proyecto(id)
);
-- Alta: admin; o consultor con permiso invitarClientes creando un CLIENTE.
create policy usuario_insert on usuario for insert with check (
  es_admin()
  or (rol_actual() = 'consultor' and permiso_proyecto('invitarClientes') and rol = 'cliente')
);
-- Configuración (rol, activo, permisos_proyecto…): solo admin (5).
create policy usuario_update on usuario for update
  using (es_admin()) with check (es_admin());
create policy usuario_delete on usuario for delete using (es_admin());

-- ---- proyecto -------------------------------------------------------
drop policy if exists proyecto_select on proyecto;
drop policy if exists proyecto_write on proyecto;
drop policy if exists proyecto_insert on proyecto;
drop policy if exists proyecto_update on proyecto;
drop policy if exists proyecto_delete on proyecto;

-- Select con expresión directa sobre la fila (cubre el RETURNING del
-- insert, ver migración 4): admin, dueño o invitado.
create policy proyecto_select on proyecto for select using (
  es_admin() or creado_por = usuario_actual_id() or es_invitado_proyecto(id)
);
-- Crear: admin; o consultor con permiso crearProyectos, siempre como dueño
-- de lo que crea (no puede atribuírselo a otro).
create policy proyecto_insert on proyecto for insert with check (
  es_admin()
  or (rol_actual() = 'consultor' and permiso_proyecto('crearProyectos')
      and creado_por = usuario_actual_id())
);
-- Editar: admin o dueño (control total dentro de lo suyo, 2). El with check
-- impide que un dueño transfiera la propiedad (solo admin).
create policy proyecto_update on proyecto for update
  using (es_admin() or creado_por = usuario_actual_id())
  with check (es_admin() or creado_por = usuario_actual_id());
-- Eliminar: admin; o dueño con permiso archivarEliminarProyectos (3.1).
create policy proyecto_delete on proyecto for delete using (
  es_admin()
  or (creado_por = usuario_actual_id() and permiso_proyecto('archivarEliminarProyectos'))
);

-- ---- acceso_proyecto ------------------------------------------------
drop policy if exists acceso_select on acceso_proyecto;
drop policy if exists acceso_write on acceso_proyecto;
drop policy if exists acceso_insert on acceso_proyecto;
drop policy if exists acceso_update on acceso_proyecto;
drop policy if exists acceso_delete on acceso_proyecto;

-- Miembros visibles para quien ve el proyecto (7) y cada uno ve sus accesos.
create policy acceso_select on acceso_proyecto for select using (
  usuario_id = usuario_actual_id() or tiene_acceso_proyecto(proyecto_id)
);
-- Invitar: admin (a cualquiera, 6); o dueño con permiso invitarClientes,
-- SOLO clientes (un consultor no comparte sus proyectos con consultores).
create policy acceso_insert on acceso_proyecto for insert with check (
  es_admin()
  or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('invitarClientes')
      and es_cliente(usuario_id))
);
-- Configurar permisos del acceso: admin; o dueño con permiso
-- configurarPermisosClientes, SOLO sobre clientes de sus proyectos (5).
create policy acceso_update on acceso_proyecto for update
  using (
    es_admin()
    or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('configurarPermisosClientes')
        and es_cliente(usuario_id))
  )
  with check (
    es_admin()
    or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('configurarPermisosClientes')
        and es_cliente(usuario_id))
  );
-- Quitar acceso: mismas reglas que invitar.
create policy acceso_delete on acceso_proyecto for delete using (
  es_admin()
  or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('invitarClientes')
      and es_cliente(usuario_id))
);

-- ---- frente ---------------------------------------------------------
drop policy if exists frente_select on frente;
drop policy if exists frente_insert on frente;
drop policy if exists frente_update on frente;
drop policy if exists frente_delete on frente;

create policy frente_select on frente for select using (tiene_acceso_proyecto(proyecto_id));
create policy frente_insert on frente for insert with check (
  es_admin() or es_dueno_proyecto(proyecto_id)
  or (es_invitado_proyecto(proyecto_id) and permiso_bool_en(proyecto_id, 'crearFrentes'))
);
-- Update alcanzable para miembros (corrimientos de orden); el trigger
-- restringe el RENOMBRE a admin/dueño.
create policy frente_update on frente for update
  using (tiene_acceso_proyecto(proyecto_id))
  with check (tiene_acceso_proyecto(proyecto_id));
create policy frente_delete on frente for delete using (
  es_admin() or es_dueno_proyecto(proyecto_id)
);

-- ---- sub_frente -----------------------------------------------------
drop policy if exists subfrente_select on sub_frente;
drop policy if exists subfrente_insert on sub_frente;
drop policy if exists subfrente_update on sub_frente;
drop policy if exists subfrente_delete on sub_frente;

create policy subfrente_select on sub_frente for select using (
  exists (select 1 from frente f where f.id = frente_id and tiene_acceso_proyecto(f.proyecto_id))
);
create policy subfrente_insert on sub_frente for insert with check (
  exists (
    select 1 from frente f where f.id = frente_id and (
      es_admin() or es_dueno_proyecto(f.proyecto_id)
      or (es_invitado_proyecto(f.proyecto_id) and permiso_bool_en(f.proyecto_id, 'crearSubFrentes'))
    )
  )
);
create policy subfrente_update on sub_frente for update
  using (exists (select 1 from frente f where f.id = frente_id and tiene_acceso_proyecto(f.proyecto_id)))
  with check (exists (select 1 from frente f where f.id = frente_id and tiene_acceso_proyecto(f.proyecto_id)));
create policy subfrente_delete on sub_frente for delete using (
  exists (
    select 1 from frente f where f.id = frente_id
      and (es_admin() or es_dueno_proyecto(f.proyecto_id))
  )
);

-- ---- tarea ----------------------------------------------------------
drop policy if exists tarea_select on tarea;
drop policy if exists tarea_insert on tarea;
drop policy if exists tarea_update on tarea;
drop policy if exists tarea_delete on tarea;

create policy tarea_select on tarea for select using (
  exists (
    select 1 from sub_frente sf join frente f on f.id = sf.frente_id
    where sf.id = sub_frente_id and tiene_acceso_proyecto(f.proyecto_id)
  )
);
create policy tarea_insert on tarea for insert with check (
  es_admin()
  or es_dueno_proyecto(proyecto_de_subfrente(sub_frente_id))
  or (es_invitado_proyecto(proyecto_de_subfrente(sub_frente_id))
      and permiso_bool_en(proyecto_de_subfrente(sub_frente_id), 'crearTareas'))
);
-- Alcanzable si tiene ALGÚN permiso de edición; el trigger valida campo a
-- campo (contra el responsable previo al cambio).
create policy tarea_update on tarea for update using (
  es_admin()
  or es_dueno_proyecto(proyecto_de_subfrente(sub_frente_id))
  or (es_invitado_proyecto(proyecto_de_subfrente(sub_frente_id))
      and invitado_puede_editar_algo_en(proyecto_de_subfrente(sub_frente_id), responsable_id))
);
create policy tarea_delete on tarea for delete using (
  es_admin()
  or es_dueno_proyecto(proyecto_de_subfrente(sub_frente_id))
  or (es_invitado_proyecto(proyecto_de_subfrente(sub_frente_id))
      and permiso_tarea_en(proyecto_de_subfrente(sub_frente_id), 'archivarEliminar', responsable_id))
);

-- Validación campo a campo para NO admin / NO dueño (invitados).
create or replace function validar_permisos_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proyecto uuid;
begin
  v_proyecto := proyecto_de_subfrente(old.sub_frente_id);
  -- Principio rector (2): admin y dueño hacen todo dentro del proyecto.
  if es_admin() or es_dueno_proyecto(v_proyecto) then return new; end if;

  if (new.titulo is distinct from old.titulo
      or new.descripcion is distinct from old.descripcion
      or new.comentarios is distinct from old.comentarios)
     and not permiso_tarea_en(v_proyecto, 'editarTareas', old.responsable_id) then
    raise exception 'Sin permiso para editar la tarea';
  end if;

  if new.responsable_id is distinct from old.responsable_id
     and not permiso_tarea_en(v_proyecto, 'asignarResponsable', old.responsable_id) then
    raise exception 'Sin permiso para cambiar el responsable';
  end if;

  if (new.hecha is distinct from old.hecha or new.fecha_real is distinct from old.fecha_real)
     and not permiso_tarea_en(v_proyecto, 'marcarHechas', old.responsable_id) then
    raise exception 'Sin permiso para marcar tareas como hechas';
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo
     and not permiso_tarea_en(v_proyecto, 'editarFechas', old.responsable_id) then
    raise exception 'Sin permiso para editar fechas';
  end if;

  if new.archivada is distinct from old.archivada
     and not permiso_tarea_en(v_proyecto, 'archivarEliminar', old.responsable_id) then
    raise exception 'Sin permiso para archivar tareas';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_validar_permisos_tarea on tarea;
create trigger trg_validar_permisos_tarea before update on tarea
  for each row execute function validar_permisos_tarea();

-- Renombrar estructura: solo admin o dueño (los invitados solo mueven orden).
create or replace function validar_cambios_frente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if es_admin() or es_dueno_proyecto(new.proyecto_id) then return new; end if;
  if new.nombre is distinct from old.nombre then
    raise exception 'Sin permiso para renombrar (solo admin o dueño del proyecto)';
  end if;
  return new;
end;
$$;
create or replace function validar_cambios_subfrente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proyecto uuid;
begin
  select proyecto_id into v_proyecto from frente where id = new.frente_id;
  if es_admin() or es_dueno_proyecto(v_proyecto) then return new; end if;
  if new.nombre is distinct from old.nombre then
    raise exception 'Sin permiso para renombrar (solo admin o dueño del proyecto)';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validar_frente on frente;
create trigger trg_validar_frente before update on frente
  for each row execute function validar_cambios_frente();
drop trigger if exists trg_validar_subfrente on sub_frente;
create trigger trg_validar_subfrente before update on sub_frente
  for each row execute function validar_cambios_subfrente();

-- ---- replanificacion ------------------------------------------------
drop policy if exists replan_select on replanificacion;
drop policy if exists replan_write on replanificacion;
drop policy if exists replan_insert on replanificacion;

create policy replan_select on replanificacion for select using (
  exists (
    select 1 from tarea t
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    where t.id = tarea_id and tiene_acceso_proyecto(f.proyecto_id)
  )
);
-- Escritura directa: solo admin. El historial lo escribe el trigger, que
-- pasa a SECURITY DEFINER — corrige un defecto latente: hasta ahora la
-- inserción del historial corría como el usuario y la RLS se la negaba a
-- los invitados con permiso editarFechas.
create policy replan_write on replanificacion for all
  using (es_admin()) with check (es_admin());

create or replace function registrar_replanificacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_num   integer;
begin
  if old.fecha_objetivo is not null
     and new.fecha_objetivo is not null
     and new.fecha_objetivo is distinct from old.fecha_objetivo then
    v_actor := nullif(current_setting('app.actor', true), '');
    select count(*) + 1 into v_num from replanificacion where tarea_id = new.id;
    insert into replanificacion (tarea_id, fecha_anterior, fecha_nueva, numero_cambio, cambiado_por)
    values (new.id, old.fecha_objetivo, new.fecha_objetivo, v_num,
            case when v_actor is null then null else v_actor::uuid end);
  end if;
  return new;
end;
$$;
-- (el trigger trg_registrar_replanificacion ya apunta a esta función)

-- ---- comentario -----------------------------------------------------
-- 3.3: TODOS los miembros pueden comentar, siempre. No se editan ni borran
-- (no hay políticas de update/delete). El autor debe ser uno mismo.
drop policy if exists comentario_insert on comentario;
create policy comentario_insert on comentario for insert with check (
  exists (
    select 1 from tarea t
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    where t.id = tarea_id and tiene_acceso_proyecto(f.proyecto_id)
  )
  and (autor_id = usuario_actual_id() or es_admin())
);
-- (comentario_select ya usa tiene_acceso_proyecto: hereda la semántica nueva)

-- =====================================================================
-- PASO 4 — RPC desplanificar_tarea con la autorización nueva.
-- =====================================================================
create or replace function desplanificar_tarea(p_tarea uuid, p_actor uuid)
returns tarea language plpgsql security definer set search_path = public as $$
declare
  v_row tarea;
  v_ult replanificacion;
  v_proyecto uuid;
begin
  select * into v_row from tarea where id = p_tarea;
  if not found then
    raise exception 'Tarea no encontrada';
  end if;

  v_proyecto := proyecto_de_subfrente(v_row.sub_frente_id);
  if not (
    es_admin()
    or es_dueno_proyecto(v_proyecto)
    or (es_invitado_proyecto(v_proyecto)
        and permiso_tarea_en(v_proyecto, 'editarFechas', v_row.responsable_id))
  ) then
    raise exception 'Sin permiso para editar fechas de esta tarea';
  end if;

  if v_row.fecha_objetivo is null then
    return v_row;
  end if;
  if v_row.fecha_objetivo <= current_date and not v_row.hecha then
    raise exception 'No puedes eliminar tareas que ya pasaron';
  end if;

  perform set_config('app.actor', coalesce(p_actor::text, ''), true);

  select * into v_ult from replanificacion
  where tarea_id = p_tarea
  order by numero_cambio desc
  limit 1;

  if found then
    delete from replanificacion where id = v_ult.id;
    update tarea set fecha_objetivo = v_ult.fecha_anterior
      where id = p_tarea returning * into v_row;
  else
    update tarea set fecha_objetivo = null
      where id = p_tarea returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- =====================================================================
-- PASO 5 — Limpieza de helpers del modelo anterior (ya sin referencias).
-- =====================================================================
drop function if exists cliente_puede_editar_algo(tarea);
drop function if exists permiso_tarea(text, uuid);
drop function if exists permiso_bool(text);
drop function if exists permisos_actual();
drop function if exists proyectos_visibles();
drop function if exists validar_cambios_estructura();
