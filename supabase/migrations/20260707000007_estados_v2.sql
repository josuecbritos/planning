-- =====================================================================
-- Gran pedida — Modelo de estados v2 (secciones 1.2, 1.3 y 6.3.18)
--
-- 1.2 Regla de replanificacion: un cambio de fecha objetivo SOLO cuenta
--     como replanificacion si la fecha que se esta moviendo vence hoy o
--     ya vencio. Mover una fecha futura es planificacion (sin historial).
-- 1.3 Regla de la fecha original: se actualiza junto con la fecha
--     objetivo mientras los cambios sean planificacion; se congela en el
--     primer cambio que si cuenta como replanificacion. Es "la ultima
--     fecha comprometida antes de empezar a atrasarse".
-- 18  Se permiten fechas en cualquier dia, incluidos sabado y domingo
--     (se elimina el anclaje a dia habil).
-- =====================================================================

-- La fecha_original ya no es inmutable a mano: la deriva el trigger.
drop trigger if exists trg_bloquear_fecha_original on tarea;
drop function if exists bloquear_fecha_original();

-- BEFORE insert/update: deriva fecha_original (ya sin anclaje de finde).
create or replace function normalizar_fechas_tarea()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- La primera fecha (si viene) es el compromiso inicial.
    new.fecha_original := new.fecha_objetivo;
    return new;
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo then
    if (old.fecha_objetivo is null or old.fecha_objetivo > current_date)
       and not exists (select 1 from replanificacion r where r.tarea_id = new.id) then
      -- Planificacion: la fecha original acompaña a la vigente.
      new.fecha_original := new.fecha_objetivo;
    else
      -- Congelada desde la primera replanificacion real.
      new.fecha_original := old.fecha_original;
    end if;
  else
    -- fecha_original no se edita por otras vias.
    new.fecha_original := old.fecha_original;
  end if;
  return new;
end;
$$;

-- AFTER update: historial SOLO para replanificaciones reales — cambios de
-- una fecha que vence hoy o ya vencio.
create or replace function registrar_replanificacion()
returns trigger language plpgsql as $$
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
  end if;
  return new;
end;
$$;

-- ajustar_dia_habil() queda sin uso en triggers (se conserva la funcion por
-- compatibilidad, pero ya no se aplica: los fines de semana son validos).
