-- =====================================================================
-- #289 — Las vistas guardadas pasan del navegador a la base.
--
-- POR QUÉ. Vivían en `localStorage`, por usuario y por pantalla. Entrar
-- desde otro computador empezaba sin ninguna vista y las guardadas no
-- aparecían por ningún lado. Nunca fue una decisión de producto: la
-- solicitud que las creó (#87) definía campos y comportamiento, no dónde
-- se guardan; `localStorage` se eligió al implementar. Un consultor que
-- trabaja en la oficina y en su casa perdía su configuración en cada
-- cambio de máquina.
--
-- QUÉ GUARDA. La misma forma que ya tenía `FiltroGuardado` en el front
-- (`id`, `nombre`, `filtro`, `orden`) más su dueño y su contexto. El
-- CONTEXTO es el id del proyecto, o el literal 'mis-tareas': cada
-- proyecto lleva sus vistas por separado y Mis Tareas las suyas — eso no
-- cambia. Es `text` y NO una FK a `proyecto` justamente porque
-- 'mis-tareas' no es un proyecto; si un proyecto se elimina, sus vistas
-- quedan sin dueño visible, no se ven en ninguna parte y no molestan
-- (consecuencia aceptada del pedido: no hay que limpiarlas).
--
-- `filtro` y `orden` van como jsonb, igual que `usuario.permisos_proyecto`
-- y `notificacion.dato`: son la forma serializada que el front ya usa, y
-- las opciones de filtro/orden cambian con el producto sin que la base
-- tenga que enterarse.
--
-- PRIVACIDAD. Cada quien ve y modifica SOLO las suyas — tampoco un admin
-- ve las de otro. Las cuatro políticas son `usuario_id =
-- usuario_actual_id()`; ninguna `USING (true)`, y sin bypass de admin a
-- propósito: una vista guardada es preferencia personal, no dato del
-- proyecto. El SELECT se acota además revocando a `anon`.
--
-- El default de `usuario_id` llama a `usuario_actual_id()`, que ya existe
-- desde la fase 2; esta migración no la redefine.
--
-- NO CREA NINGUNA FUNCIÓN. El pedido advierte que en Postgres las
-- funciones nacen ejecutables por `public` y que revocar solo a `anon` no
-- basta. Acá no hay nada que revocar: la tabla se gobierna con RLS y
-- grants, sin RPC de por medio.
--
-- LO QUE NO VIAJA, a propósito (decisión del pedido): el puntero a "en qué
-- vista estabas" se queda en el navegador — la vista guardada es tuya,
-- dónde quedaste es de esa máquina—, y tampoco viajan el tema ni el modo o
-- ancho de la barra lateral. Tampoco se traspasa lo ya guardado en cada
-- navegador: se parte de cero y se vuelven a crear una vez.
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que
-- trae el caso nuevo: nadie lee ni modifica las vistas de otro.
-- =====================================================================

create table if not exists vista_guardada (
  id         uuid primary key default gen_random_uuid(),
  -- El dueño lo pone la BASE, nunca el cliente (mismo criterio que el autor
  -- del historial y de las notificaciones): default + `with check` en la
  -- política. Mandar el id de otro no funciona — la RLS lo rechaza.
  usuario_id uuid not null default usuario_actual_id() references usuario(id) on delete cascade,
  -- id de proyecto, o 'mis-tareas'. Ver cabecera: no es FK a propósito.
  contexto   text not null,
  nombre     text not null,
  filtro     jsonb not null default '{}'::jsonb,
  orden      jsonb not null default '[]'::jsonb,
  creada     timestamptz not null default now()
);

-- Consulta de cada carga: mis vistas, agrupadas por pantalla.
create index if not exists idx_vista_guardada_usuario
  on vista_guardada (usuario_id, contexto);

alter table vista_guardada enable row level security;

-- Cada quien, solo lo suyo. Las cuatro operaciones con la misma condición:
-- no hay vistas compartidas ni lectura de admin.
drop policy if exists vista_select on vista_guardada;
create policy vista_select on vista_guardada for select
  using (usuario_id = usuario_actual_id());

drop policy if exists vista_insert on vista_guardada;
create policy vista_insert on vista_guardada for insert
  with check (usuario_id = usuario_actual_id());

drop policy if exists vista_update on vista_guardada;
create policy vista_update on vista_guardada for update
  using (usuario_id = usuario_actual_id())
  with check (usuario_id = usuario_actual_id());

drop policy if exists vista_delete on vista_guardada;
create policy vista_delete on vista_guardada for delete
  using (usuario_id = usuario_actual_id());

-- Privilegios explícitos: `anon` no toca la tabla; el autenticado hace las
-- cuatro operaciones y la RLS decide sobre qué filas.
revoke all on table vista_guardada from anon;
grant select, insert, update, delete on table vista_guardada to authenticated;
