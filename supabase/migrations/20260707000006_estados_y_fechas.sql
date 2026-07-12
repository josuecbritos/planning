-- =====================================================================
-- Definiciones cerradas — Modelo de estados y fechas
--
-- 1) La tarea nace SIN FECHA. La primera fecha asignada se registra como
--    fecha_original (compromiso inicial) sin generar historial; solo los
--    cambios posteriores cuentan como replanificacion.
-- 2) No se permiten fechas de fin de semana: cualquier sabado/domingo se
--    ancla al dia habil mas cercano (sab -> viernes, dom -> lunes).
-- =====================================================================

-- Fechas opcionales: una tarea puede existir sin planificar.
alter table tarea alter column fecha_objetivo drop not null;
alter table tarea alter column fecha_original drop not null;

-- Dia habil mas cercano.
create or replace function ajustar_dia_habil(p_fecha date)
returns date language sql immutable as $$
  select case extract(isodow from p_fecha)
    when 6 then p_fecha - 1  -- sabado -> viernes
    when 7 then p_fecha + 1  -- domingo -> lunes
    else p_fecha
  end;
$$;

-- BEFORE insert/update:
--  * ancla toda fecha a dia habil
--  * la primera fecha objetivo fija la fecha_original
create or replace function normalizar_fechas_tarea()
returns trigger language plpgsql as $$
begin
  new.fecha_objetivo := ajustar_dia_habil(new.fecha_objetivo);
  new.fecha_original := ajustar_dia_habil(new.fecha_original);
  new.fecha_real     := ajustar_dia_habil(new.fecha_real);

  -- Primera planificacion: el compromiso inicial es esa primera fecha.
  if new.fecha_original is null and new.fecha_objetivo is not null then
    new.fecha_original := new.fecha_objetivo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalizar_fechas on tarea;
create trigger trg_normalizar_fechas
  before insert or update on tarea
  for each row execute function normalizar_fechas_tarea();

-- fecha_original sigue siendo inmutable, pero ahora se permite FIJARLA
-- (pasar de null a un valor) cuando llega la primera fecha.
create or replace function bloquear_fecha_original()
returns trigger language plpgsql as $$
begin
  if old.fecha_original is not null
     and new.fecha_original is distinct from old.fecha_original then
    raise exception 'fecha_original es inmutable (compromiso inicial)';
  end if;
  return new;
end;
$$;

-- El historial se registra SOLO en replanificaciones reales: cambios de
-- fecha_objetivo cuando ya habia una fecha. La primera asignacion no cuenta.
create or replace function registrar_replanificacion()
returns trigger language plpgsql as $$
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

-- Nota: registrar_replanificacion exige fecha_nueva not null; despejar la
-- fecha (volver a sin-fecha) no genera registro, y no esta expuesto en la UI.
