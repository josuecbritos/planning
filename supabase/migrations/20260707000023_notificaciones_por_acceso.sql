-- =====================================================================
-- #283 — Las notificaciones sobrevivían a perder el acceso al proyecto.
--
-- QUÉ PASABA. La política de lectura de `notificacion` (migración 16) era
-- solo `usuario_id = usuario_actual_id()`: al sacar a alguien de un
-- proyecto, sus notificaciones de ese proyecto seguían llegando a la
-- campana — con texto genérico (la tarea ya no viaja), un mensaje falso al
-- hacer clic ("Esta tarea ya no existe") e información residual (quién
-- asignó y cuándo, de un proyecto al que ya no tiene acceso). Filtrar del
-- lado del cliente es imposible: el navegador no puede recorrer
-- tarea → sub frente → frente → proyecto sin leer la tarea.
--
-- QUÉ HACE ESTA MIGRACIÓN. Condiciona la ENTREGA (no la existencia) al
-- acceso al proyecto de la tarea, con el MISMO criterio que ya usa el
-- resto de la aplicación (`tiene_acceso_proyecto`, el de proyectos,
-- frentes y tareas). Las notificaciones NO se borran: quedan guardadas e
-- invisibles —igual que los accesos de un usuario desactivado— y vuelven
-- tal cual (leída/no leída intacto) si se le devuelve el acceso.
--
--   · SELECT: solo notificaciones de proyectos a los que HOY tiene acceso.
--     El contador del front sale de lo que llega, así que baja solo.
--   · UPDATE ("marcar leídas"): misma condición. Sin ella, un "marcar
--     todas como leídas" mientras no tiene acceso marcaría también las
--     ocultas, y al reincorporarlo volverían leídas — perdería estado.
--
-- La tarea de una notificación SIEMPRE existe mientras la notificación
-- exista (`tarea_id not null references tarea on delete cascade`, migración
-- 16): no hace falta rama para "tarea borrada", y el mensaje "Esta tarea ya
-- no existe" del front queda para el único caso en que aún puede darse
-- (estado local anterior al borrado), que es exactamente su caso legítimo.
--
-- El helper es SECURITY DEFINER por la misma razón que `proyecto_de_
-- subfrente` (migración 12): dentro de una política, un subquery corre con
-- la RLS del que consulta; el recorrido hasta el proyecto debe hacerse por
-- debajo de ella. Es un predicado de RLS: authenticated conserva EXECUTE
-- (invariante 5, docs/SEGURIDAD.md §3) y anon no lo evalúa.
--
-- Tiempo real (migraciones 20/21): los eventos de INSERT/UPDATE sobre
-- `notificacion` se filtran con la RLS del suscriptor, así que un usuario
-- sin acceso al proyecto tampoco recibe el aviso por el canal — coherente
-- con lo que puede leer. El caso de la compuerta "solo el destinatario
-- recibe sus eventos" sigue en pie (el destinatario del caso es miembro).
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs` (trae
-- casos nuevos: ocultarse al perder acceso, volver intactas al recuperarlo
-- y "marcar leídas" sin tocar las ocultas).
-- =====================================================================

/** Proyecto al que pertenece una tarea (tarea → sub frente → frente).
 *  Espejo de `proyecto_de_subfrente`, un eslabón más arriba. */
create or replace function proyecto_de_tarea(p_tarea uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select f.proyecto_id
  from tarea t
  join sub_frente sf on sf.id = t.sub_frente_id
  join frente f on f.id = sf.frente_id
  where t.id = p_tarea;
$$;
revoke execute on function proyecto_de_tarea(uuid) from anon;

-- Entrega condicionada: mías Y de un proyecto que hoy comparto.
drop policy if exists notificacion_select on notificacion;
create policy notificacion_select on notificacion for select using (
  usuario_id = usuario_actual_id()
  and tiene_acceso_proyecto(proyecto_de_tarea(tarea_id))
);

drop policy if exists notificacion_update on notificacion;
create policy notificacion_update on notificacion for update
  using (
    usuario_id = usuario_actual_id()
    and tiene_acceso_proyecto(proyecto_de_tarea(tarea_id))
  )
  with check (
    usuario_id = usuario_actual_id()
    and tiene_acceso_proyecto(proyecto_de_tarea(tarea_id))
  );

-- (Sigue sin políticas de INSERT/DELETE desde el cliente: las crean los
-- triggers —security definer— y se borran en cascada con su tarea.)
