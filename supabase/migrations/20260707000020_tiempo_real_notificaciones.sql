-- =====================================================================
-- #255 — Tiempo real, entrega 1 de 2: SOLO notificaciones.
--
-- QUÉ HACE. Publica la tabla `notificacion` en la publicación
-- `supabase_realtime`, que es lo único que Realtime necesita del lado de la
-- base para emitir los cambios de esa tabla por WebSocket. Ninguna otra tabla
-- se publica en esta entrega; la entrega 2 (#260) sumará las suyas a ESTA
-- MISMA publicación, con una migración nueva.
--
-- POR QUÉ ES SEGURO (el punto crítico del pedido):
--   · Realtime aplica las políticas de RLS DEL SUSCRIPTOR a los eventos de
--     INSERT y UPDATE: evalúa `notificacion_select` (usuario_id =
--     usuario_actual_id()) con el JWT de quien escucha, y solo le entrega las
--     filas que esa política le dejaría leer. Es la misma regla que rige la
--     lectura normal — el canal no abre nada que la API no abriera ya.
--   · Los eventos de DELETE son la excepción: Realtime NO les aplica RLS,
--     porque la fila ya no existe y no hay contra qué evaluar la política.
--     Lo que viaja en ellos lo decide REPLICA IDENTITY, y por eso esta
--     migración la deja EXPLÍCITAMENTE en DEFAULT: así un DELETE lleva solo
--     la clave primaria (un uuid opaco), no el contenido de la fila. Con
--     REPLICA IDENTITY FULL, el borrado de una notificación repartiría
--     usuario_id, tipo y tarea_id a cualquier suscriptor autenticado — una
--     fuga silenciosa, exactamente lo que el pedido pide evitar.
--   · El cliente no necesita el contenido de los eventos (principio 1 del
--     pedido): los trata como el aviso de que hay que RELEER la base, y esa
--     relectura sí pasa por RLS. Un uuid suelto de un DELETE ajeno no le
--     dice nada a nadie y dispara, a lo sumo, una relectura inocua.
--
-- Aditiva: no edita ninguna migración aplicada; no cambia tablas, políticas
-- ni grants. Quitarla (rollback) es sacar la tabla de la publicación:
--   alter publication supabase_realtime drop table notificacion;
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (el plan gratuito no trae
-- respaldos automáticos — DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que trae
-- un caso nuevo para este cambio (§ "el canal de tiempo real no reparte de
-- más"). Requiere que en el proyecto Supabase el servicio Realtime esté
-- activo (lo está por defecto).
-- =====================================================================

do $$
begin
  -- En Supabase la publicación `supabase_realtime` existe de fábrica; el
  -- guard cubre entornos locales recién creados donde aún no está.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Idempotente: re-ejecutar la migración no debe fallar por duplicado.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacion'
  ) then
    alter publication supabase_realtime add table notificacion;
  end if;
end $$;

-- Deliberado, no un olvido (ver cabecera): DEFAULT = los DELETE viajan solo
-- con la clave primaria. No cambiar a FULL sin releer el razonamiento.
alter table notificacion replica identity default;

-- Comprobación (opcional, para dejar constancia al aplicar): debe devolver
-- EXACTAMENTE una fila — notificacion, y ninguna otra tabla publicada.
--
--   select schemaname, tablename from pg_publication_tables
--   where pubname = 'supabase_realtime';
