-- =====================================================================
-- Fix (pedido post-roles, punto 1): la replanificacion se evalua sobre la
-- fecha de ORIGEN, no la de destino.
--
-- La migracion 12 (roles_y_permisos) recreo registrar_replanificacion
-- como SECURITY DEFINER para que el historial lo escriba el trigger y no
-- el usuario (que la RLS le negaba). Al reescribirla se perdio la guardia
-- de la regla 1.2 (definida en la migracion 7): un cambio de fecha
-- objetivo SOLO cuenta como replanificacion si la fecha que se mueve
-- —la de ORIGEN, la vigente antes del cambio— vence hoy o ya vencio.
--
-- Sin esa guardia, mover una fecha FUTURA a cualquier otra fecha
-- registraba historial (↻ +1) y pintaba la tarea de morado, cuando mover
-- una fecha futura es planificacion, no replanificacion. Caso reportado:
-- tarea en 22-07 (futura) movida a 15-07 (vencida) con hoy=19-07 quedaba
-- "atrasada replanificada" (morada, ↻ x1) en vez de simplemente
-- "atrasada" (roja) con fecha original = 15-07 y sin ↻.
--
-- Se restaura la condicion sobre old.fecha_objetivo. La logica de la
-- fecha_original (normalizar_fechas_tarea) ya evaluaba bien sobre old y no
-- se toca. Se conserva el SECURITY DEFINER de la migracion 12.
-- =====================================================================

create or replace function registrar_replanificacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_num   integer;
begin
  -- 1.2: solo cuenta como replanificacion si la fecha de ORIGEN vence hoy
  -- o ya vencio. Mover una fecha futura es planificacion (sin historial).
  if old.fecha_objetivo is not null
     and old.fecha_objetivo <= current_date
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
