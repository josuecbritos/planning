-- =====================================================================
-- #286 — Eliminar un usuario fallaba con
--   «new row violates row-level security policy for table "usuario"»
--
-- CAUSA (reproducida contra las migraciones 1→24 en un Postgres 16 limpio,
-- con los MISMOS grants que el pg_dump de producción):
--
--   PostgreSQL aplica las políticas de SELECT como WITH CHECK sobre la FILA
--   NUEVA de un UPDATE cuando quien ejecuta tiene derechos de SELECT sobre la
--   tabla. Es deliberado: impide dejar una fila en un estado que uno ya no
--   podría ver. Y eso es EXACTAMENTE lo que hace eliminar: `usuario_select`
--   exige `not eliminado` (migración 19), así que marcar `eliminado = true`
--   deja la fila fuera de la política y Postgres rechaza el UPDATE.
--
-- Aislado columna por columna: `nombre` y `activo` pasan; SOLO `eliminado`
-- falla. Y con `usuario_select` relajada a `using (true)` el mismo UPDATE
-- pasa — la política de SELECT es el bloqueo, no la de UPDATE.
--
-- NO era lo que parecía: falla IGUAL con y sin `auth_id`. Que los tres casos
-- reportados no hubieran completado el registro es coincidencia (son cuentas
-- de prueba recientes); el defecto alcanza a CUALQUIER usuario. La política
-- de UPDATE nunca estuvo implicada: su `WITH CHECK` empieza por `es_admin()`,
-- que para el actor es verdadero (comprobado en la misma sesión).
--
-- QUÉ HACE ESTA MIGRACIÓN. Mueve el borrado lógico a una RPC SECURITY
-- DEFINER —el MISMO patrón que ya usa `crear_o_reactivar_usuario` (migración
-- 16) para la operación inversa, y por la misma razón: tiene que tocar filas
-- que la vista y la política ocultan—. La autorización se replica DENTRO
-- (`es_admin()`, idéntica a la política `usuario_update` para este caso), así
-- que **no se amplía quién puede modificar `usuario`**.
--
-- LO QUE NO SE TOCA, a propósito:
--   · `usuario_select` sigue con `not eliminado` para TODOS, admin incluido:
--     un eliminado desaparece de la interfaz y la tabla no expone más que la
--     vista (invariante de #248, con su caso en la compuerta). Relajar esa
--     política habría "arreglado" el UPDATE exponiendo eliminados: es lo que
--     el producto decidió NO hacer.
--   · Los grants no cambian: `authenticated` conserva SELECT sobre las mismas
--     seis columnas y `email` sigue fuera.
--   · Tareas, comentarios, historial y accesos del usuario quedan intactos
--     (el borrado sigue siendo lógico; #258 sigue fuera de alcance).
--   · La reactivación por alta con el mismo correo sigue igual.
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que trae
-- el caso nuevo pedido: un admin marca como eliminado a un usuario SIN
-- `auth_id`, y un consultor NO puede.
-- =====================================================================

/**
 * Borrado LÓGICO de un usuario (#136): `activo = false` + `eliminado = true`.
 * No hay borrado físico: la fila y su historial quedan intactos y se
 * recuperan dando de alta el mismo correo (`crear_o_reactivar_usuario`).
 *
 * SECURITY DEFINER por la misma razón que su inversa: la fila resultante no
 * pasa la política de SELECT, y Postgres aplica esa política como WITH CHECK
 * sobre la fila nueva del UPDATE.
 *
 * Autorización: admin, la misma que ya exigía la política para esta
 * operación. No se amplía nada — un consultor o un cliente reciben el error.
 */
create or replace function eliminar_usuario(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then
    raise exception 'Sin permiso para eliminar usuarios';
  end if;

  update usuario
    set activo = false, eliminado = true
    where id = p_usuario;

  if not found then
    raise exception 'El usuario no existe';
  end if;
end;
$$;

-- RPC legítima del usuario autenticado (como `crear_o_reactivar_usuario`):
-- se revoca solo a `anon`. Invariante 5 de docs/SEGURIDAD.md intacto.
revoke execute on function eliminar_usuario(uuid) from anon;
