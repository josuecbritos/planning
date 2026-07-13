-- =====================================================================
-- Gran pedida §7 — Permisos configurables por cliente
--
-- Cada usuario cliente lleva su configuracion en usuario.permisos (jsonb):
--   { "crearFrentes": bool, "crearSubFrentes": bool, "crearTareas": bool,
--     "editarFechas": false|"todas"|"asignadas", "marcarHechas": ...,
--     "editarTareas": ..., "archivarEliminar": ..., "asignarResponsable": ... }
--
-- La UI gobierna los controles; la barrera real vive aqui: RLS por permiso
-- de creacion/eliminacion + trigger de columnas para la edicion granular
-- (RLS es por fila; el trigger valida QUE campos cambio el cliente).
-- =====================================================================

alter table usuario add column if not exists permisos jsonb not null default '{}'::jsonb;

-- Helpers ------------------------------------------------------------

create or replace function permisos_actual()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(permisos, '{}'::jsonb) from usuario
  where auth_id = auth.uid() and activo limit 1;
$$;

-- Permiso booleano de creacion (crearFrentes / crearSubFrentes / crearTareas).
create or replace function permiso_bool(p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((permisos_actual() ->> p_nombre)::boolean, false);
$$;

-- Permiso sobre tareas con alcance: 'todas' o 'asignadas' (contra el
-- responsable de la tarea).
create or replace function permiso_tarea(p_nombre text, p_responsable uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  v := permisos_actual() ->> p_nombre;
  if v = 'todas' then return true; end if;
  if v = 'asignadas' then return p_responsable is not null and p_responsable = usuario_actual_id(); end if;
  return false;
end;
$$;

-- RLS: creacion por clientes con permiso ------------------------------

drop policy if exists frente_write on frente;
create policy frente_insert on frente for insert
  with check (es_admin() or (tiene_acceso_proyecto(proyecto_id) and permiso_bool('crearFrentes')));
drop policy if exists frente_update on frente;
create policy frente_update on frente for update
  using (es_admin() or tiene_acceso_proyecto(proyecto_id))
  with check (es_admin() or tiene_acceso_proyecto(proyecto_id));
drop policy if exists frente_delete on frente;
create policy frente_delete on frente for delete using (es_admin());

drop policy if exists subfrente_write on sub_frente;
create policy subfrente_insert on sub_frente for insert
  with check (es_admin() or exists (
    select 1 from frente f where f.id = frente_id
      and tiene_acceso_proyecto(f.proyecto_id) and permiso_bool('crearSubFrentes')
  ));
drop policy if exists subfrente_update on sub_frente;
create policy subfrente_update on sub_frente for update
  using (es_admin() or exists (
    select 1 from frente f where f.id = frente_id and tiene_acceso_proyecto(f.proyecto_id)
  ))
  with check (es_admin() or exists (
    select 1 from frente f where f.id = frente_id and tiene_acceso_proyecto(f.proyecto_id)
  ));
drop policy if exists subfrente_delete on sub_frente;
create policy subfrente_delete on sub_frente for delete using (es_admin());

-- Los frentes/sub frentes solo cambian nombre/orden; el trigger de abajo
-- restringe QUE puede tocar un cliente (solo `orden`, salvo que sea quien
-- lo creo en la misma transaccion de insercion — no rastreamos autor, asi
-- que el nombre queda para admins).
create or replace function validar_cambios_estructura()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if es_admin() then return new; end if;
  if new.nombre is distinct from old.nombre then
    raise exception 'Sin permiso para renombrar (solo admins)';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validar_frente on frente;
create trigger trg_validar_frente before update on frente
  for each row execute function validar_cambios_estructura();
drop trigger if exists trg_validar_subfrente on sub_frente;
create trigger trg_validar_subfrente before update on sub_frente
  for each row execute function validar_cambios_estructura();

-- RLS: tareas ---------------------------------------------------------

drop policy if exists tarea_write on tarea;

create policy tarea_insert on tarea for insert
  with check (es_admin() or exists (
    select 1 from sub_frente sf join frente f on f.id = sf.frente_id
    where sf.id = sub_frente_id
      and tiene_acceso_proyecto(f.proyecto_id) and permiso_bool('crearTareas')
  ));

-- Update: la fila es alcanzable si el cliente tiene ALGUN permiso de
-- edicion sobre ella; el trigger valida campo a campo.
create or replace function cliente_puede_editar_algo(p_tarea tarea)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return permiso_tarea('editarFechas', p_tarea.responsable_id)
      or permiso_tarea('marcarHechas', p_tarea.responsable_id)
      or permiso_tarea('editarTareas', p_tarea.responsable_id)
      or permiso_tarea('archivarEliminar', p_tarea.responsable_id)
      or permiso_tarea('asignarResponsable', p_tarea.responsable_id);
end;
$$;

create policy tarea_update on tarea for update
  using (es_admin() or (
    exists (
      select 1 from sub_frente sf join frente f on f.id = sf.frente_id
      where sf.id = sub_frente_id and tiene_acceso_proyecto(f.proyecto_id)
    ) and cliente_puede_editar_algo(tarea)
  ));

create policy tarea_delete on tarea for delete
  using (es_admin() or (
    exists (
      select 1 from sub_frente sf join frente f on f.id = sf.frente_id
      where sf.id = sub_frente_id and tiene_acceso_proyecto(f.proyecto_id)
    ) and permiso_tarea('archivarEliminar', responsable_id)
  ));

-- Trigger: validacion campo a campo para clientes (alcance sobre la fila
-- ANTERIOR: los permisos se evaluan contra el responsable previo al cambio).
create or replace function validar_permisos_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if es_admin() then return new; end if;

  if (new.titulo is distinct from old.titulo
      or new.descripcion is distinct from old.descripcion
      or new.comentarios is distinct from old.comentarios)
     and not permiso_tarea('editarTareas', old.responsable_id) then
    raise exception 'Sin permiso para editar la tarea';
  end if;

  if new.responsable_id is distinct from old.responsable_id
     and not permiso_tarea('asignarResponsable', old.responsable_id) then
    raise exception 'Sin permiso para cambiar el responsable';
  end if;

  if (new.hecha is distinct from old.hecha or new.fecha_real is distinct from old.fecha_real)
     and not permiso_tarea('marcarHechas', old.responsable_id) then
    raise exception 'Sin permiso para marcar tareas como hechas';
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo
     and not permiso_tarea('editarFechas', old.responsable_id) then
    raise exception 'Sin permiso para editar fechas';
  end if;

  if new.archivada is distinct from old.archivada
     and not permiso_tarea('archivarEliminar', old.responsable_id) then
    raise exception 'Sin permiso para archivar tareas';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_validar_permisos_tarea on tarea;
create trigger trg_validar_permisos_tarea before update on tarea
  for each row execute function validar_permisos_tarea();
