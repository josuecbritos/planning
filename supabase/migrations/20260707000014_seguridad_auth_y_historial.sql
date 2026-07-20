-- =====================================================================
-- Correcciones de seguridad post-auditoría (tanda 1)
--
-- 1 (defensa C1): el enlace auth <-> usuario ya no ocurre solo por email;
--   exige que exista una invitación CONSUMIDA (usada) para ese usuario. La
--   Edge Function `aceptar-invitacion` marca la invitación como usada ANTES
--   de crear la cuenta, de modo que una cuenta nacida por otra vía (p. ej.
--   un registro público, hoy OFF) no baste para apropiarse de una fila
--   `usuario`.
-- 2 (M1): el autor del historial de replanificaciones se deriva DENTRO de la
--   función con usuario_actual_id(), ignorando el `p_actor` del cliente, para
--   que `cambiado_por` refleje siempre al usuario autenticado.
-- 5 (L1): se fija `search_path` en las 6 funciones que lo tenían mutable.
-- =====================================================================

-- ---- 1. Enlace atado a invitación usada (defensa de C1) --------------
-- Antes: enlazaba cualquier alta de auth.users a la fila usuario con el
-- mismo email. Ahora, además, exige una invitación consumida para ese
-- usuario. Los usuarios ya activos (auth_id no nulo) no se ven afectados.
create or replace function vincular_usuario_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update usuario u set auth_id = new.id
  where lower(u.email) = lower(new.email)
    and u.auth_id is null
    and exists (
      select 1 from invitacion i
      where i.usuario_id = u.id and i.usada is not null
    );
  return new;
end;
$$;

-- ---- 2. Autor del historial desde la sesión (M1) --------------------
-- replanificar_tarea es SECURITY INVOKER: el UPDATE queda sujeto a la RLS
-- de `tarea` (autorización correcta). Se ignora `p_actor` (se conserva en la
-- firma por compatibilidad del cliente) y el actor sale de la sesión.
create or replace function replanificar_tarea(p_tarea uuid, p_nueva date, p_actor uuid)
returns tarea language plpgsql set search_path = public as $$
declare
  v_row tarea;
begin
  -- El autor SIEMPRE es el usuario autenticado, no el parámetro del cliente.
  perform set_config('app.actor', coalesce(usuario_actual_id()::text, ''), true);
  update tarea set fecha_objetivo = p_nueva where id = p_tarea returning * into v_row;
  return v_row;
end;
$$;

-- desplanificar_tarea (SECURITY DEFINER): igual, el actor sale de la sesión.
-- Se conserva su autorización (admin / dueño / invitado con editarFechas).
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

  -- El autor SIEMPRE es el usuario autenticado, no el parámetro del cliente.
  perform set_config('app.actor', coalesce(usuario_actual_id()::text, ''), true);

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

-- ---- 5. search_path fijo en las 6 funciones señaladas (L1) ----------
-- Funciones inmutables (no tocan tablas): search_path vacío es suficiente.
create or replace function default_permisos_proyecto()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"crearProyectos": true, "archivarEliminarProyectos": true,
           "invitarClientes": true, "configurarPermisosClientes": false}'::jsonb;
$$;

create or replace function default_permisos_tareas(p_rol text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_rol
    when 'cliente' then
      '{"crearTareas": true, "editarFechas": "asignadas", "marcarHechas": "asignadas",
        "asignarResponsable": "todas"}'::jsonb
    when 'consultor' then
      '{"crearFrentes": true, "crearSubFrentes": true, "crearTareas": true,
        "editarFechas": "todas", "marcarHechas": "todas", "editarTareas": "todas",
        "archivarEliminar": "todas", "asignarResponsable": "todas"}'::jsonb
    else '{}'::jsonb
  end;
$$;

create or replace function ajustar_dia_habil(p_fecha date)
returns date language sql immutable set search_path = '' as $$
  select case extract(isodow from p_fecha)
    when 6 then p_fecha - 1
    when 7 then p_fecha + 1
    else p_fecha
  end;
$$;

-- aplicar_default_consultor (trigger, referencia default_permisos_proyecto).
create or replace function aplicar_default_consultor()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rol = 'consultor'
     and (new.permisos_proyecto is null or new.permisos_proyecto = '{}'::jsonb) then
    new.permisos_proyecto := default_permisos_proyecto();
  end if;
  return new;
end;
$$;

-- normalizar_fechas_tarea (trigger, se conserva la lógica de la migración 10).
create or replace function normalizar_fechas_tarea()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.fecha_original := new.fecha_objetivo;
    return new;
  end if;

  if new.fecha_objetivo is null
     and old.fecha_objetivo is not null
     and old.fecha_objetivo <= current_date
     and not old.hecha then
    raise exception 'No puedes eliminar tareas que ya pasaron';
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo then
    if (old.fecha_objetivo is null or old.fecha_objetivo > current_date)
       and not exists (select 1 from replanificacion r where r.tarea_id = new.id) then
      new.fecha_original := new.fecha_objetivo;
    else
      new.fecha_original := old.fecha_original;
    end if;
  else
    new.fecha_original := old.fecha_original;
  end if;
  return new;
end;
$$;
