-- =====================================================================
-- #294 — La tarea sin fecha que se marca hecha queda con fecha.
--
-- QUÉ PASABA. Marcar hecha no tocaba la fecha objetivo, así que una tarea
-- sin fecha marcada hecha quedaba contada de dos maneras: la Gantt la
-- dibujaba y la sumaba en la carga del día del marcado (dibuja por "fecha
-- vigente" = fecha objetivo, o la real si está hecha), la Tabla la
-- mostraba con la Fecha Objetivo vacía, y el filtro "Con fecha" la sacaba
-- de la Gantt donde se la estaba viendo puesta en un día concreto.
--
-- QUÉ HACE ESTA MIGRACIÓN.
--   1. Columna nueva `tarea.fecha_por_marcado` (aditiva, default false):
--      recuerda que la fecha vigente LA PUSO EL MARCADO, no una
--      planificación. Es la parte de fondo del pedido: sin ella, desmarcar
--      no puede distinguir "vuelvo a sin fecha" (la fecha era del marcado)
--      de "conservo mi fecha" (estaba planificada) — y borraría fechas que
--      el usuario planificó.
--   2. `normalizar_fechas_tarea` (cuerpo de la migración 27 + tres reglas):
--        · marcar hecha una tarea SIN fecha → fecha objetivo = el día del
--          marcado (la misma `fecha_real` que el marcado ya guarda; si no
--          viene, `hoy_chile()` — nunca `current_date`, #291). La fecha
--          original queda IGUAL: la tarea no gana atraso.
--        · desmarcar una cuya fecha la puso el marcado → vuelve a quedar
--          SIN fecha (fecha, original y marca se limpian juntas). El
--          bloqueo "No puedes eliminar tareas que ya pasaron" no aplica:
--          siempre excluyó a las hechas, y este quite viaja EN el
--          desmarcado, no como paso posterior.
--        · la marca es INTERNA: el trigger la fuerza al valor previo en
--          todo UPDATE (nadie la fabrica desde el cliente) y solo estas
--          reglas la mueven; un cambio de fecha por cualquier otra vía la
--          apaga (esa fecha ya no es "la que puso el marcado").
--   3. `validar_permisos_tarea` (cuerpo de la migración 28 + la exención):
--      el relleno del marcado y el quite del desmarcado NO exigen
--      `editarFechas` — con `marcarHechas` alcanza, porque el VALOR no lo
--      decide el cliente: lo fuerza el trigger (que corre antes:
--      trg_normalizar_fechas < trg_validar_permisos_tarea, orden
--      alfabético de PostgreSQL). Cualquier otro cambio de fecha sigue
--      exigiendo `editarFechas`, igual que siempre.
--   4. CORRECCIÓN DE DATOS: a las tareas ya hechas y sin fecha se les
--      graba como fecha objetivo su día de marcado (`fecha_real`), con la
--      original igual (sin atraso) y la marca puesta (desmarcarlas las
--      devuelve a sin fecha, como a las nuevas). Se corre con los triggers
--      de la tabla DESACTIVADOS (operación única del dueño): cero
--      historial, cero notificaciones, cero interferencia — y lo que se
--      escribe es exactamente lo que se lee en el UPDATE. Las hechas sin
--      fecha QUE NO TIENEN día de marcado guardado no se tocan (no se
--      inventa una fecha); el RAISE NOTICE informa cuántas fueron en cada
--      grupo. **Guardar esa salida.**
--
-- QUÉ NO CAMBIA: una tarea que YA tenía fecha conserva su fecha
-- planificada al marcarse y al desmarcarse (la fecha de cierre sigue
-- siendo la última fecha planificada, no el día del clic); la regla de
-- replanificación, el historial y las notificaciones quedan intactos
-- (poner fecha donde no había ninguna nunca registró ni notificó: el
-- trigger de historial exige que la fecha anterior exista).
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (única red: esta migración
-- modifica datos existentes). DESPUÉS: correr `scripts/validar-rls.mjs`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · La memoria del origen de la fecha.
-- ---------------------------------------------------------------------

alter table tarea add column if not exists fecha_por_marcado boolean not null default false;

-- ---------------------------------------------------------------------
-- 2 · `normalizar_fechas_tarea` — cuerpo de la migración 27, más las
--     reglas del marcado (numeral 2 de la cabecera).
-- ---------------------------------------------------------------------

create or replace function normalizar_fechas_tarea()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.fecha_original := new.fecha_objetivo;
    new.fecha_por_marcado := false;
    return new;
  end if;

  -- #294: la marca es interna — ningún UPDATE externo la mueve; solo las
  -- reglas de abajo. (Este trigger corre ANTES que el de permisos.)
  new.fecha_por_marcado := old.fecha_por_marcado;

  -- #294 (a): marcar hecha una tarea SIN fecha → el día del marcado.
  if new.hecha and not old.hecha and old.fecha_objetivo is null then
    new.fecha_objetivo := coalesce(new.fecha_real, hoy_chile());
    new.fecha_original := new.fecha_objetivo;  -- sin atraso
    new.fecha_por_marcado := true;
    return new;
  end if;

  -- #294 (b): desmarcar una cuya fecha la puso el marcado → sin fecha.
  if not new.hecha and old.hecha and old.fecha_por_marcado then
    new.fecha_objetivo := null;
    new.fecha_original := null;
    new.fecha_por_marcado := false;
    return new;
  end if;

  -- #294: un cambio de fecha por cualquier otra vía apaga la marca.
  if new.fecha_objetivo is distinct from old.fecha_objetivo then
    new.fecha_por_marcado := false;
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
revoke execute on function normalizar_fechas_tarea() from public;

-- ---------------------------------------------------------------------
-- 3 · `validar_permisos_tarea` — cuerpo de la migración 28, con la
--     exención del marcado en el caso de fecha (numeral 3).
-- ---------------------------------------------------------------------

create or replace function validar_permisos_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proyecto uuid;
begin
  v_proyecto := proyecto_de_subfrente(old.sub_frente_id);
  -- Principio rector (2): admin y dueño hacen todo dentro del proyecto.
  if es_admin() or es_dueno_proyecto(v_proyecto) then return new; end if;

  -- #293: mover la tarea a otro sub frente = editarTareas (contra el
  -- responsable PREVIO, como todo el trigger), y solo dentro del proyecto.
  if new.sub_frente_id is distinct from old.sub_frente_id then
    if not permiso_tarea_en(v_proyecto, 'editarTareas', old.responsable_id) then
      raise exception 'Sin permiso para mover la tarea de sub frente';
    end if;
    if proyecto_de_subfrente(new.sub_frente_id) is distinct from v_proyecto then
      raise exception 'La tarea solo puede moverse dentro de su proyecto';
    end if;
  end if;

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

  -- #294: la fecha que PONE el marcado (a) y la que QUITA el desmarcado
  -- (b) no exigen editarFechas — el valor lo fuerza el trigger de fechas,
  -- no el cliente, y el marcado en sí ya pasó por marcarHechas (arriba).
  if new.fecha_objetivo is distinct from old.fecha_objetivo
     and not (new.hecha and not old.hecha and old.fecha_objetivo is null)
     and not (not new.hecha and old.hecha and old.fecha_por_marcado)
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
revoke execute on function validar_permisos_tarea() from public;

-- ---------------------------------------------------------------------
-- 4 · CORRECCIÓN DE DATOS — tareas ya hechas y sin fecha (numeral 4).
--     Triggers desactivados: operación única del dueño, cero efectos
--     laterales. GUARDAR la salida del NOTICE.
-- ---------------------------------------------------------------------

alter table tarea disable trigger user;

do $$
declare
  v_corregidas int;
  v_sin_dia    int;
begin
  update tarea
     set fecha_objetivo    = fecha_real,
         fecha_original    = fecha_real,   -- igual a la objetivo: sin atraso
         fecha_por_marcado = true          -- desmarcarla la devuelve a sin fecha
   where hecha
     and fecha_objetivo is null
     and fecha_real is not null;
  get diagnostics v_corregidas = row_count;

  -- Sin día de marcado guardado no se inventa una fecha: se quedan como
  -- están, y acá queda dicho cuántas son.
  select count(*) into v_sin_dia from tarea where hecha and fecha_objetivo is null;

  raise notice '#294 — corrección de datos: % tarea(s) hechas sin fecha corregidas con su día de marcado; % quedaron sin corregir por no tener día de marcado guardado.',
    v_corregidas, v_sin_dia;
end $$;

alter table tarea enable trigger user;
