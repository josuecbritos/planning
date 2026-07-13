-- =====================================================================
-- Gran pedida §8 — Alta de usuarios por invitacion
--
-- El admin crea el usuario y le envia un correo con enlace de invitacion
-- (Edge Function `invitar-usuario`). El enlace caduca en 7 dias y puede
-- reenviarse (reemplaza el token anterior). El usuario abre el enlace,
-- define su contraseña (Edge Function `aceptar-invitacion`) y entra.
-- =====================================================================

create table if not exists invitacion (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references usuario(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  creada     timestamptz not null default now(),
  expira     timestamptz not null,
  usada      timestamptz
);
create index if not exists idx_invitacion_token on invitacion(token);

alter table invitacion enable row level security;

-- Solo los admins ven las invitaciones desde el cliente; las Edge Functions
-- operan con service_role (omiten RLS). No hay escritura desde el cliente.
drop policy if exists invitacion_select on invitacion;
create policy invitacion_select on invitacion for select using (es_admin());
