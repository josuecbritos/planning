-- =====================================================================
-- Fase 1 — Esquema inicial
-- Herramienta de Planificacion de Proyectos (Documento Funcional v3.1)
-- Entidades de la seccion 5 + trigger de historial (5.6).
--
-- Fase 1 es "uso interno, sin login". La RLS queda permisiva (allow all)
-- a proposito; la Fase 2 la reemplaza por politicas por usuario/rol y la
-- regla "el cliente solo ve sus proyectos asignados" (tabla 5.7).
-- =====================================================================

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 5.1 Usuario
-- ---------------------------------------------------------------------
create table if not exists usuario (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  iniciales      text,                       -- conveniencia para el badge (DV/JB/...)
  email          text not null unique,
  rol            text not null check (rol in ('admin','cliente')),
  activo         boolean not null default true,
  fecha_creacion timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5.2 Proyecto
-- ---------------------------------------------------------------------
create table if not exists proyecto (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  descripcion    text,
  color          text,
  estado         text not null default 'activo' check (estado in ('activo','pausado','cerrado')),
  creado_por     uuid references usuario(id),
  fecha_creacion timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5.3 Frente
-- ---------------------------------------------------------------------
create table if not exists frente (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyecto(id) on delete cascade,
  nombre      text not null,
  orden       integer not null default 0
);
create index if not exists idx_frente_proyecto on frente(proyecto_id);

-- ---------------------------------------------------------------------
-- 5.4 Sub Frente
-- ---------------------------------------------------------------------
create table if not exists sub_frente (
  id        uuid primary key default gen_random_uuid(),
  frente_id uuid not null references frente(id) on delete cascade,
  nombre    text not null,
  orden     integer not null default 0
);
create index if not exists idx_subfrente_frente on sub_frente(frente_id);

-- ---------------------------------------------------------------------
-- 5.5 Tarea
-- Sin campo `estado`: el unico estado manual es `hecha` (seccion 6).
-- ---------------------------------------------------------------------
create table if not exists tarea (
  id             uuid primary key default gen_random_uuid(),
  sub_frente_id  uuid not null references sub_frente(id) on delete cascade,
  titulo         text not null,
  descripcion    text,
  responsable_id uuid references usuario(id),
  fecha_objetivo date not null,               -- fecha vigente
  fecha_original date not null,               -- compromiso inicial, nunca cambia
  hecha          boolean not null default false,
  fecha_real     date,                         -- se llena al marcar hecha
  comentarios    text,
  orden          integer not null default 0
);
create index if not exists idx_tarea_subfrente on tarea(sub_frente_id);

-- Regla critica (5.5): fecha_original nunca se modifica.
create or replace function bloquear_fecha_original()
returns trigger language plpgsql as $$
begin
  if new.fecha_original <> old.fecha_original then
    raise exception 'fecha_original es inmutable (compromiso inicial)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_fecha_original on tarea;
create trigger trg_bloquear_fecha_original
  before update on tarea
  for each row execute function bloquear_fecha_original();

-- ---------------------------------------------------------------------
-- 5.6 Historial de Replanificaciones
-- La regla vive a nivel de base de datos (trigger) para que ningun camino
-- de edicion la eluda.
-- ---------------------------------------------------------------------
create table if not exists replanificacion (
  id             uuid primary key default gen_random_uuid(),
  tarea_id       uuid not null references tarea(id) on delete cascade,
  fecha_anterior date not null,
  fecha_nueva    date not null,
  numero_cambio  integer not null,
  cambiado_por   uuid references usuario(id),  -- nullable en Fase 1 (sin login)
  timestamp      timestamptz not null default now()
);
create index if not exists idx_replan_tarea on replanificacion(tarea_id);

-- Cada vez que cambia fecha_objetivo se registra automaticamente el cambio.
-- El actor se toma de la GUC 'app.actor' (la setea el RPC replanificar_tarea);
-- si no esta seteada, cambiado_por queda NULL.
create or replace function registrar_replanificacion()
returns trigger language plpgsql as $$
declare
  v_actor text;
  v_num   integer;
begin
  if new.fecha_objetivo is distinct from old.fecha_objetivo then
    v_actor := nullif(current_setting('app.actor', true), '');
    select count(*) + 1 into v_num from replanificacion where tarea_id = new.id;
    insert into replanificacion (tarea_id, fecha_anterior, fecha_nueva, numero_cambio, cambiado_por)
    values (new.id, old.fecha_objetivo, new.fecha_objetivo, v_num,
            case when v_actor is null then null else v_actor::uuid end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registrar_replanificacion on tarea;
create trigger trg_registrar_replanificacion
  after update on tarea
  for each row execute function registrar_replanificacion();

-- RPC para replanificar pasando el actor en la misma transaccion, de modo
-- que el trigger pueda registrar cambiado_por. Devuelve la tarea actualizada.
create or replace function replanificar_tarea(p_tarea uuid, p_nueva date, p_actor uuid)
returns tarea language plpgsql as $$
declare
  v_row tarea;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  update tarea set fecha_objetivo = p_nueva where id = p_tarea returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 5.7 Acceso de Cliente a Proyecto (se usa en Fase 2; se crea ya)
-- ---------------------------------------------------------------------
create table if not exists acceso_cliente_proyecto (
  usuario_id       uuid not null references usuario(id) on delete cascade,
  proyecto_id      uuid not null references proyecto(id) on delete cascade,
  fecha_asignacion timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);

-- ---------------------------------------------------------------------
-- RLS — Fase 1 permisiva. OJO: reemplazar en Fase 2 (login + roles).
-- Sin login, el frontend usa la anon key; estas politicas permiten todo.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['usuario','proyecto','frente','sub_frente','tarea','replanificacion','acceso_cliente_proyecto']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists fase1_all on %I;', t);
    execute format('create policy fase1_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;
