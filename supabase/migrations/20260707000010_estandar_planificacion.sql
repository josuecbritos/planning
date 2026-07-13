-- =====================================================================
-- Estandar de planificacion en la Gantt (pedido punto 2)
--
-- La planificacion pasa a ser por clics: borrar la marca de una tarea
-- futura la deja "sin planificar" (fecha_objetivo = null). Este cambio
-- ya lo aceptan los triggers existentes; lo que falta es la regla 2.2:
-- una tarea cuya fecha vence hoy o ya vencio NO puede quedar sin fecha
-- (solo se marca lista o se replanifica). Se agrega esa guardia a
-- normalizar_fechas_tarea; el resto de la logica queda igual que en la
-- migracion 7.
-- =====================================================================

create or replace function normalizar_fechas_tarea()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- La primera fecha (si viene) es el compromiso inicial.
    new.fecha_original := new.fecha_objetivo;
    return new;
  end if;

  -- Regla 2.2: borrar la fecha (desplanificar) solo vale para fechas
  -- futuras; una tarea de hoy o vencida se marca lista o se replanifica.
  if new.fecha_objetivo is null
     and old.fecha_objetivo is not null
     and old.fecha_objetivo <= current_date
     and not old.hecha then
    raise exception 'No puedes eliminar tareas que ya pasaron';
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo then
    if (old.fecha_objetivo is null or old.fecha_objetivo > current_date)
       and not exists (select 1 from replanificacion r where r.tarea_id = new.id) then
      -- Planificacion: la fecha original acompaña a la vigente (si la
      -- tarea se desplanifica, ambas vuelven a nulas).
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
