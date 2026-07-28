-- =====================================================================
-- #248 — La lectura directa de `usuario` también excluye a los eliminados
-- (hallazgo 3.1 de la auditoría #233).
--
-- QUÉ PASABA. La migración 15 revocó el SELECT completo de la tabla y dejó
-- un grant acotado a seis columnas no sensibles:
--
--   grant select (id, nombre, iniciales, rol, activo, auth_id) on usuario
--     to authenticated;
--
-- Ese grant existe por una razón real —el RETURNING de los INSERT y pintar
-- responsables—, pero un GRANT concede COLUMNAS, no filas: las filas las
-- decide la política `usuario_select`, y esa política no miraba `eliminado`.
-- Resultado: un autenticado podía leer nombre, iniciales y rol de un usuario
-- ELIMINADO con el que hubiera compartido proyecto, saltándose el filtro que
-- sí tiene la vista `usuario_visible`. No expone correos ni permisos —esas
-- columnas no están en el grant—, así que la fuga es menor; pero contradice
-- lo que el producto declara: eliminado es "no entra y desaparece de la UI".
--
-- QUÉ HACE ESTA MIGRACIÓN. Añade `not eliminado` a la política de SELECT, con
-- lo que la tabla base deja de exponer lo que la vista oculta. Para TODOS,
-- admin incluido — igual que la vista, que desde la migración 16 filtra
-- eliminados también para el admin.
--
-- POR QUÉ NO ROMPE NADA:
--   · `usuario_visible` es SECURITY DEFINER (security_invoker = false): no
--     depende de la RLS de la tabla, así que sigue devolviendo lo mismo.
--   · `crear_o_reactivar_usuario` (alta y REACTIVACIÓN de un eliminado) es
--     SECURITY DEFINER: ve las filas que la política oculta. Sin ella no se
--     podría recuperar a nadie, y sigue funcionando igual.
--   · El alta directa por INSERT ... RETURNING sigue pasando: una fila recién
--     creada tiene `eliminado = false`.
--   · Los triggers y funciones internas son SECURITY DEFINER.
--
-- LO QUE SÍ CAMBIA, y va acompañado en el front: `UPDATE ... RETURNING` sobre
-- la fila que se acaba de marcar eliminada ya no devuelve nada, porque
-- PostgreSQL aplica las políticas de SELECT a las filas de un RETURNING y esa
-- fila ya no pasa. Es exactamente el borrado de usuarios: en esta misma
-- entrega, `supabaseRepo.eliminarUsuario` deja de pedir la fila de vuelta y
-- comprueba el efecto releyendo `usuario_visible`. El resto de operaciones
-- —crear, editar, desactivar, asignar, comentar— no toca `eliminado` y sigue
-- devolviendo su fila como siempre.
--
-- Aditiva: no edita ninguna migración aplicada. Solo reemplaza una política
-- por su versión con una condición más.
--
-- CUÁNDO APLICARLA: esta es la ÚNICA migración que va DESPUÉS de desplegar el
-- front, no antes. El front nuevo funciona con la política vieja y con la nueva
-- (la vista ya filtra eliminados desde la migración 16, así que la relectura da
-- el mismo resultado); el front VIEJO se rompe con la política nueva, por el
-- RETURNING que se explica arriba. Aplicarla después no deja ventana rota.
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (el plan gratuito de Supabase no
-- trae respaldos automáticos — DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que trae
-- un caso nuevo para este cambio (§ "tabla usuario no expone más que la vista").
-- =====================================================================

drop policy if exists usuario_select on usuario;

-- Misma regla de visibilidad de la migración 12 —uno mismo, los admins (que
-- aparecen como responsables) y quienes comparten proyecto— MÁS el filtro de
-- eliminados. El orden importa poco para el resultado y mucho para leerlo: el
-- filtro va primero porque es absoluto, no depende de quién pregunta.
create policy usuario_select on usuario for select using (
  not eliminado
  and (es_admin() or auth_id = auth.uid() or rol = 'admin' or comparte_proyecto(id))
);

-- Comprobación (opcional, para dejar constancia al aplicar): la tabla no debe
-- devolver ninguna fila que la vista no tenga. Con la política nueva, el
-- resultado esperado es CERO en cualquier sesión, admin incluida.
--
--   select u.id from usuario u
--   where u.id not in (select v.id from usuario_visible v);
