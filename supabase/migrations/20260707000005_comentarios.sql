-- =====================================================================
-- Bloque 2 / N5 — Comentarios acumulables
-- Los comentarios de una tarea son un registro en el tiempo (hilo), no un
-- campo que se sobrescribe. Alcance de esta iteracion: append-only (no se
-- editan ni borran, igual que el historial de fechas) y comentan solo los
-- admins; el cliente los lee junto con la tarea.
-- =====================================================================

create table if not exists comentario (
  id        uuid primary key default gen_random_uuid(),
  tarea_id  uuid not null references tarea(id) on delete cascade,
  autor_id  uuid references usuario(id),
  texto     text not null check (length(trim(texto)) > 0),
  timestamp timestamptz not null default now()
);
create index if not exists idx_comentario_tarea on comentario(tarea_id);

alter table comentario enable row level security;

-- Lectura: misma visibilidad que la tarea (admin todo; cliente sus proyectos).
drop policy if exists comentario_select on comentario;
create policy comentario_select on comentario for select
  using (exists (
    select 1 from tarea t
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    where t.id = tarea_id and tiene_acceso_proyecto(f.proyecto_id)
  ));

-- Escritura: solo admins, y solo insercion (append-only: sin update/delete).
drop policy if exists comentario_insert on comentario;
create policy comentario_insert on comentario for insert
  with check (es_admin());

-- Migra el texto libre legado de tarea.comentarios al hilo (sin autor).
insert into comentario (tarea_id, texto)
select id, comentarios from tarea
where comentarios is not null and length(trim(comentarios)) > 0
  and not exists (select 1 from comentario c where c.tarea_id = tarea.id);

-- El campo legado deja de usarse desde la app; se limpia para no duplicar.
update tarea set comentarios = null where comentarios is not null;
