-- =====================================================================
-- Seed inicial (opcional) — se ejecuta con `supabase db reset`.
-- Crea los responsables del plan y un proyecto de arranque con su
-- estructura de frentes/sub frentes y unas tareas de muestra.
-- El resto de las tareas se crean desde la UI (CRUD, Fase 1).
-- =====================================================================

-- Responsables del Plan PGP Arauco (DV/JB/FS/IC).
-- En la app real la Fase 2 limita a 2 admins; aqui van como responsables.
insert into usuario (id, nombre, iniciales, email, rol) values
  ('11111111-1111-1111-1111-111111111111', 'Daniela Vera',  'DV', 'dv@consultora.cl', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Josue Britos',  'JB', 'jb@consultora.cl', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'Felipe Soto',   'FS', 'fs@consultora.cl', 'admin'),
  ('44444444-4444-4444-4444-444444444444', 'Ignacia Cruz',  'IC', 'ic@consultora.cl', 'admin')
on conflict (id) do nothing;

-- Proyecto de arranque.
insert into proyecto (id, nombre, descripcion, color, estado, creado_por) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Plan PGP Arauco',
   'Implementacion del Plan de Gestion de Procesos — cliente Arauco.',
   '#2e7d32', 'activo', '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- Frentes.
insert into frente (id, proyecto_id, nombre, orden) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Levantamiento', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Diseño', 2)
on conflict (id) do nothing;

-- Sub frentes.
insert into sub_frente (id, frente_id, nombre, orden) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Procesos Comerciales', 1),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Procesos Financieros', 2),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Procesos Operacionales', 3),
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', 'Arquitectura de datos', 1),
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002', 'Configuracion y parametrizacion', 2)
on conflict (id) do nothing;

-- Tareas de muestra (para ver la app viva; el resto se crea desde la UI).
insert into tarea (sub_frente_id, titulo, responsable_id, fecha_original, fecha_objetivo, hecha, fecha_real, orden) values
  ('cccccccc-0000-0000-0000-000000000001', 'Entrevista area ventas',            '11111111-1111-1111-1111-111111111111', '2024-10-02', '2024-10-02', true,  '2024-10-02', 0),
  ('cccccccc-0000-0000-0000-000000000001', 'Mapeo de flujos comerciales',       '11111111-1111-1111-1111-111111111111', '2024-10-08', '2024-10-08', true,  '2024-10-10', 1),
  ('cccccccc-0000-0000-0000-000000000001', 'Documento de requerimientos',       '44444444-4444-4444-4444-444444444444', '2024-10-28', '2024-10-28', false, null,          2),
  ('cccccccc-0000-0000-0000-000000000002', 'Revision de reportes contables',    '33333333-3333-3333-3333-333333333333', '2024-10-03', '2024-10-03', true,  '2024-10-03', 0),
  ('cccccccc-0000-0000-0000-000000000002', 'Analisis de cuentas por cobrar',    '22222222-2222-2222-2222-222222222222', '2024-10-21', '2024-10-21', false, null,          1),
  ('cccccccc-0000-0000-0000-000000000004', 'Modelo conceptual de datos',        '22222222-2222-2222-2222-222222222222', '2024-10-22', '2024-10-22', true,  '2024-10-22', 0);

-- Ejemplo de replanificacion (via RPC para registrar el actor): mueve una tarea
-- y deja el rastro en el historial de forma automatica (trigger 5.6).
select replanificar_tarea(
  (select id from tarea where titulo = 'Analisis de cuentas por cobrar' limit 1),
  '2024-10-29',
  '22222222-2222-2222-2222-222222222222'
);
