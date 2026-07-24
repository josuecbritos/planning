-- =====================================================================
-- Migración 17 — Eliminar proyecto SOLO si está archivado (defensa en
-- profundidad).
--
-- La definición (PROYECTO.md §4) exige "eliminar en cascada solo sobre
-- archivados": hay que archivar el proyecto antes de poder borrarlo. La UI
-- ya lo respeta (el botón 🗑 solo aparece en filas archivadas), pero la
-- política `proyecto_delete` de la migración 12 autorizaba el DELETE por
-- admin/dueño+permiso SIN verificar el estado. Por API directa, un usuario
-- con el permiso podía eliminar un proyecto ACTIVO, saltándose el paso
-- "archivar primero".
--
-- Aquí se reescribe la política para exigir `estado = 'archivado'` además de
-- la autorización previa. Espejo del trigger `validar_estado_proyecto`
-- (migración 16) que gobierna el archivado.
-- =====================================================================

drop policy if exists proyecto_delete on proyecto;
create policy proyecto_delete on proyecto for delete using (
  estado = 'archivado'
  and (
    es_admin()
    or (creado_por = usuario_actual_id() and permiso_proyecto('archivarEliminarProyectos'))
  )
);
