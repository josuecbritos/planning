-- =====================================================================
-- Ajustes de planificacion (pedido puntos 1 y 2)
--
-- 2. Borrar la marca de una tarea replanificada debe DESHACER ese
--    movimiento: la fecha vuelve a la anterior y el registro se elimina
--    del historial (la tarea no queda "replanificada" por una
--    replanificacion que ya no existe). Sin historial, borrar la marca
--    deja la tarea sin planificar (fecha y original nulas), como hasta
--    ahora. Sigue prohibido borrar una fecha que vence hoy o ya vencio.
--
--    Se implementa como RPC con security definer porque deshacer exige
--    eliminar la fila de `replanificacion` (cuya escritura directa es
--    solo de admin); la autorizacion se verifica adentro: admin o
--    cliente con permiso editarFechas sobre la tarea y acceso al
--    proyecto.
--
-- 1. Replanificar hacia fechas PASADAS ya lo aceptan los triggers (no
--    hay restriccion de destino en la base); el cambio es solo de UI.
-- =====================================================================

create or replace function desplanificar_tarea(p_tarea uuid, p_actor uuid)
returns tarea language plpgsql security definer set search_path = public as $$
declare
  v_row tarea;
  v_ult replanificacion;
begin
  select * into v_row from tarea where id = p_tarea;
  if not found then
    raise exception 'Tarea no encontrada';
  end if;

  if not (
    es_admin()
    or (
      permiso_tarea('editarFechas', v_row.responsable_id)
      and exists (
        select 1 from sub_frente sf
        join frente f on f.id = sf.frente_id
        where sf.id = v_row.sub_frente_id and tiene_acceso_proyecto(f.proyecto_id)
      )
    )
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
    -- Deshacer la ultima replanificacion (el update posterior no genera
    -- historial: la fecha que se mueve es futura).
    delete from replanificacion where id = v_ult.id;
    update tarea set fecha_objetivo = v_ult.fecha_anterior
      where id = p_tarea returning * into v_row;
  else
    -- Sin historial: queda sin planificar (el trigger normalizar_fechas
    -- acompaña la fecha_original a nula).
    update tarea set fecha_objetivo = null
      where id = p_tarea returning * into v_row;
  end if;

  return v_row;
end;
$$;
