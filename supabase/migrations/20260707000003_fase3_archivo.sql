-- =====================================================================
-- Fase 3 — Archivo de tareas canceladas
-- Documento Funcional v3.1, seccion 6.3: "Cancelada" no es un estado;
-- una tarea cancelada se ARCHIVA: sale del plan (vistas y contadores)
-- y conserva su historial para consulta. Puede restaurarse.
-- =====================================================================

alter table tarea add column if not exists archivada boolean not null default false;

-- Consultas frecuentes filtran por archivada.
create index if not exists idx_tarea_archivada on tarea(archivada) where archivada;
