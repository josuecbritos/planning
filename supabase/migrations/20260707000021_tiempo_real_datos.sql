-- =====================================================================
-- #260 — Tiempo real, entrega 2 de 2: los datos.
--
-- QUÉ HACE. Suma a la publicación `supabase_realtime` las tablas que faltaban
-- para cumplir el criterio del dueño: TODO lo que genera notificaciones debe
-- poder verse sin recargar. Son siete:
--
--   tarea            "te asignaron una tarea" → la tarea aparece
--   frente           el contenedor de la tarea — una tarea sin su frente
--   sub_frente         y sub frente no se puede mostrar
--   proyecto         nombre y estado, en la barra lateral y el Resumen
--   acceso_proyecto  te agregan a un proyecto → aparece solo
--                    (el pedido la nombra por su nombre histórico
--                    `acceso_cliente_proyecto`; se renombró en la migración 12)
--   comentario       "comentaron/te mencionaron" → el hilo al día
--   replanificacion  la entrada del historial, no solo la fecha nueva
--
-- Queda fuera A SABIENDAS `usuario` (un cambio de nombre se ve al recargar),
-- e `invitacion`/`recuperacion` (nada de la pantalla vive de ellas).
-- `notificacion` ya está publicada desde la migración 20.
--
-- POR QUÉ ES SEGURO — el mismo razonamiento de la migración 20, que es la
-- referencia y no se repite entero acá:
--   · Para INSERT/UPDATE, Realtime evalúa las políticas de RLS DEL SUSCRIPTOR
--     con su JWT. En estas tablas la visibilidad la deciden los predicados de
--     membresía ya validados por la compuerta (proyectos propios o asignados);
--     quien no es miembro de un proyecto no recibe sus cambios. No hay filtro
--     de servidor a propósito: la barrera ES la RLS.
--   · Para DELETE, Realtime no aplica RLS (la fila ya no existe): viaja lo
--     que diga REPLICA IDENTITY. Por eso las siete quedan EXPLÍCITAMENTE en
--     DEFAULT — solo la clave primaria. Un DELETE de `tarea` con REPLICA
--     IDENTITY FULL repartiría títulos y responsables a cualquier autenticado
--     suscrito. Mismo razonamiento, mismas palabras que la migración 20: no
--     cambiar a FULL sin releer aquella cabecera.
--   · El cliente sigue tratando los eventos como AVISOS de releer, nunca como
--     datos (data/tiempoReal.ts, principio 1): la relectura pasa por RLS.
--
-- Aditiva: solo agrega tablas a la publicación. Rollback por tabla:
--   alter publication supabase_realtime drop table <tabla>;
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (el plan gratuito no trae
-- respaldos automáticos — DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs` — el caso
-- del canal ahora también comprueba que `tarea` no reparte a no miembros.
-- =====================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'tarea', 'frente', 'sub_frente', 'proyecto',
    'acceso_proyecto', 'comentario', 'replanificacion'
  ] loop
    -- Idempotente: re-ejecutar no falla por duplicado.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Deliberado, no un olvido (ver cabecera y la de la migración 20): DEFAULT =
-- los DELETE viajan solo con la clave primaria.
alter table tarea replica identity default;
alter table frente replica identity default;
alter table sub_frente replica identity default;
alter table proyecto replica identity default;
alter table acceso_proyecto replica identity default;
alter table comentario replica identity default;
alter table replanificacion replica identity default;

-- Comprobación (opcional, para dejar constancia al aplicar): debe devolver
-- EXACTAMENTE ocho filas — notificacion (migración 20) más las siete de arriba.
--
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' order by tablename;
