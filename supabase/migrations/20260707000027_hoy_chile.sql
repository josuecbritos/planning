-- =====================================================================
-- #291 — La base y la aplicación no coincidían en qué día es hoy.
--
-- QUÉ PASABA. El navegador calcula "hoy" con la hora local (correcta). La
-- base usaba `current_date`, que sigue la zona horaria del servidor —y
-- ninguna migración la fija, así que queda en el valor por defecto de
-- Supabase: UTC—. Chile va 4 horas detrás de UTC en invierno y 3 en
-- verano, de modo que **cada tarde, desde las 20:00 de Chile, la base ya
-- cree que es el día siguiente**.
--
-- En esa ventana, una tarea planificada para MAÑANA le parece a la base
-- planificada para HOY, y entonces:
--   · `registrar_replanificacion` escribe una replanificación FALSA;
--   · `normalizar_fechas_tarea` conserva una fecha original que nunca fue
--     un compromiso, y bloquea desplanificar con "No puedes eliminar
--     tareas que ya pasaron";
--   · `desplanificar_tarea` da ese mismo error falso.
-- (El pedido nombra a la segunda `bloquear_fecha_original`: así se llamaba
-- en las migraciones 1 y 6; desde la 10 la lógica vigente vive en
-- `normalizar_fechas_tarea`, redefinida por última vez en la 14. Son las
-- mismas dos comparaciones.)
--
-- El historial de replanificaciones es el diferenciador del producto: un
-- registro falso cada tarde ensucia justo la medición para la que la
-- herramienta existe, y no se nota — parece un dato real.
--
-- QUÉ HACE ESTA MIGRACIÓN.
--   1. Crea `hoy_chile()`: UN solo lugar que responde "qué día es hoy en
--      Chile". Usa el NOMBRE de la zona (`America/Santiago`), no un
--      desfase fijo: Chile cambia de hora y un `-4` escrito a mano
--      volvería a romper esto en septiembre. El día que el producto
--      atienda a un cliente en otro huso, se cambia acá y en ningún otro
--      lado.
--   2. Redefine las tres funciones vigentes cambiando ÚNICAMENTE
--      `current_date` por `hoy_chile()`. Todo lo demás —la regla de que
--      solo cuenta como replanificación mover una tarea comprometida, los
--      permisos, las notificaciones, el deshacer— queda idéntico.
--
-- CAMINO DESCARTADO (no reabrir): cambiar la zona horaria de la base
-- entera. Es una línea, pero es configuración del servidor y no un hecho
-- del código: no viaja en las migraciones, no se ve al leer el repo, y un
-- restablecimiento del proyecto la deja atrás sin que nadie se entere. La
-- conversión va escrita y visible.
--
-- EXECUTE (#290): en Postgres las funciones nacen ejecutables por
-- `public`, así que revocar solo a `anon` no surte efecto. `hoy_chile()`
-- se cierra **contra `public`** y se concede explícitamente a
-- `authenticated` y `service_role`. Hace falta: `normalizar_fechas_tarea`
-- NO es SECURITY DEFINER —corre con el rol que escribe la tarea—, así que
-- ese rol necesita el EXECUTE. Las otras dos sí son SECURITY DEFINER y la
-- llamarían igual como dueñas.
--
-- NO SE TOCA: la forma de guardar las fechas (siguen siendo días sin
-- hora), `hoyISO()` ni nada del navegador —el navegador ya usaba la hora
-- correcta—, ni la regla de replanificación en sí. Esto es solo sobre CON
-- QUÉ DÍA se comparan.
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que
-- trae el caso nuevo de la ventana de la tarde.
--
-- DATOS YA MALOS: al final de este archivo queda la consulta que los
-- identifica. **Es de solo lectura y no se ejecuta sola.** El pedido pide
-- listar y detenerse: borrar historial es decisión de Josué.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · El único lugar que sabe qué día es hoy (para la base).
-- ---------------------------------------------------------------------

/**
 * Fecha de hoy en la zona horaria de Chile. `stable` porque `now()` es
 * constante dentro de la transacción. Zona por NOMBRE: el cambio de hora
 * (verano/invierno) lo resuelve sola.
 */
create or replace function hoy_chile()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- #290: cerrar contra `public`, no solo contra `anon` — si no, el grant
-- implícito de Postgres deja la función abierta a todo el mundo.
revoke execute on function hoy_chile() from public;
grant execute on function hoy_chile() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2 · Las tres funciones vigentes, con la ÚNICA diferencia de comparar
--     contra `hoy_chile()` en vez de `current_date`.
-- ---------------------------------------------------------------------

-- (a) `registrar_replanificacion` — cuerpo de la migración 16, intacto
--     salvo la comparación. Decide si un cambio de fecha cuenta como
--     replanificación (solo si la fecha anterior vencía hoy o antes).
create or replace function registrar_replanificacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_num   integer;
begin
  if old.fecha_objetivo is not null
     and old.fecha_objetivo <= hoy_chile()
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
revoke execute on function registrar_replanificacion() from public;

-- (b) `normalizar_fechas_tarea` — cuerpo de la migración 14, intacto salvo
--     las DOS comparaciones. Decide si se puede desplanificar y si la
--     fecha original se rehace o se conserva.
create or replace function normalizar_fechas_tarea()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.fecha_original := new.fecha_objetivo;
    return new;
  end if;

  if new.fecha_objetivo is null
     and old.fecha_objetivo is not null
     and old.fecha_objetivo <= hoy_chile()
     and not old.hecha then
    raise exception 'No puedes eliminar tareas que ya pasaron';
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo then
    if (old.fecha_objetivo is null or old.fecha_objetivo > hoy_chile())
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

-- (c) `desplanificar_tarea` — cuerpo de la migración 14, intacto salvo la
--     comparación. Borrar la marca de una tarea replanificada deshace la
--     última replanificación; sin historial, la deja sin planificar.
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
  if v_row.fecha_objetivo <= hoy_chile() and not v_row.hecha then
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
-- RPC legítima del usuario autenticado: se cierra contra `public` y se
-- concede explícitamente (antes de #290 solo se revocaba a `anon`, que no
-- quitaba nada porque el grant implícito es a `public`).
revoke execute on function desplanificar_tarea(uuid, uuid) from public;
grant execute on function desplanificar_tarea(uuid, uuid) to authenticated, service_role;

-- =====================================================================
-- 3 · CONSULTA DE DIAGNÓSTICO — solo lectura, NO se ejecuta sola.
--
-- Identifica las replanificaciones FALSAS ya escritas: aquellas en las
-- que, en hora de Chile, la fecha anterior todavía era FUTURA cuando se
-- registró el cambio. Correrla en el SQL Editor y revisar el resultado.
--
-- **No borrar nada.** Tocar el historial es tocar el diferenciador del
-- producto; la decisión la toma Josué con los números a la vista.
--
--   -- cuántas son
--   select count(*) as replanificaciones_falsas
--   from replanificacion r
--   where r.fecha_anterior > (r.timestamp at time zone 'America/Santiago')::date;
--
--   -- el listado, con su tarea y su proyecto
--   select r.id,
--          r.tarea_id,
--          t.titulo                as tarea,
--          p.nombre                as proyecto,
--          r.fecha_anterior,
--          r.fecha_nueva,
--          r.numero_cambio,
--          r.timestamp             as registrada_utc,
--          (r.timestamp at time zone 'America/Santiago') as registrada_chile,
--          (r.timestamp at time zone 'America/Santiago')::date as dia_chile
--   from replanificacion r
--   join tarea t       on t.id  = r.tarea_id
--   join sub_frente sf on sf.id = t.sub_frente_id
--   join frente f      on f.id  = sf.frente_id
--   join proyecto p    on p.id  = f.proyecto_id
--   where r.fecha_anterior > (r.timestamp at time zone 'America/Santiago')::date
--   order by r.timestamp desc;
--
-- Las tareas afectadas arrastran además una FECHA ORIGINAL equivocada
-- (se conservó un compromiso que nunca existió). Para verlas:
--
--   select distinct t.id, t.titulo, t.fecha_original, t.fecha_objetivo
--   from replanificacion r join tarea t on t.id = r.tarea_id
--   where r.fecha_anterior > (r.timestamp at time zone 'America/Santiago')::date;
-- =====================================================================
