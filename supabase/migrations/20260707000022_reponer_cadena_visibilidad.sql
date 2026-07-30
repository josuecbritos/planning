-- =====================================================================
-- #281 — Un consultor no puede asignar tareas a todos los miembros de su
-- proyecto: el selector le ofrece solo al admin y a sí mismo.
--
-- DIAGNÓSTICO. La lista de candidatos sale de `usuario_visible`, cuya
-- tercera condición (`comparte_proyecto`) es la que decide si un miembro
-- ajeno llega al navegador. Se REPRODUJO el escenario completo en un
-- Postgres 16 limpio aplicando las migraciones 1–21 en orden: la vista
-- devuelve a los cuatro miembros, tanto para el consultor como para el
-- cliente, y NO expone a gente de proyectos no compartidos. Es decir: las
-- migraciones del repositorio son correctas y encadenan bien.
--
-- La conclusión es la primera hipótesis del reporte: LA BASE DESPLEGADA NO
-- COINCIDE CON LAS MIGRACIONES — alguna pieza de la cadena quedó en una
-- versión anterior o se aplicó fuera de orden. El síntoma acota cuál:
-- `tiene_acceso_proyecto` funciona en la base viva (los proyectos y sus
-- tareas SÍ se ven), así que la pieza divergente es `comparte_proyecto`
-- o el cuerpo de la vista `usuario_visible`.
--
-- QUÉ HACE ESTA MIGRACIÓN. Repone la definición correcta —no reescribe la
-- regla—: vuelve a declarar las cuatro funciones de la cadena tal como las
-- dejaron las migraciones 12/15 y recrea la vista tal como la dejó la 18.
-- Sobre una base que ya coincide es un no-op de comportamiento; sobre la
-- base divergente, la corrige. Antes de tocar nada, RADIOGRAFÍA: imprime
-- (RAISE NOTICE) las definiciones vivas, de modo que la salida del editor
-- SQL al aplicarla deja registrado qué había — esa salida es el registro
-- de la causa que pide el reporte.
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (plan gratuito sin respaldos
-- automáticos — DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que
-- suma el caso positivo que faltaba: un consultor VE a los demás miembros
-- de su proyecto vía usuario_visible (hasta ahora solo se comprobaba el
-- aislamiento, no la entrega).
--
-- Invariantes (docs/SEGURIDAD.md §3): la 3 se conserva (el cliente sigue
-- leyendo usuario_visible, nunca la tabla); la 5 se conserva (EXECUTE de
-- los predicados sigue en authenticated; solo se revoca anon).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0 · Radiografía de lo que hay ANTES de reponer. Queda en la salida.
-- ---------------------------------------------------------------------
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'es_dueno_proyecto(uuid)',
    'es_invitado_proyecto(uuid)',
    'tiene_acceso_proyecto(uuid)',
    'comparte_proyecto(uuid)'
  ] loop
    begin
      select pg_get_functiondef(to_regprocedure('public.' || f)) into def;
      raise notice E'--- definición viva de % ---\n%', f, coalesce(def, '(NO EXISTE)');
    exception when others then
      raise notice '--- definición viva de % --- (no se pudo leer: %)', f, sqlerrm;
    end;
  end loop;
  begin
    select pg_get_viewdef('public.usuario_visible'::regclass, true) into def;
    raise notice E'--- definición viva de la vista usuario_visible ---\n%', def;
  exception when others then
    raise notice '--- vista usuario_visible --- (no se pudo leer: %)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 1 · La cadena de funciones, tal como la dejó la migración 12.
-- ---------------------------------------------------------------------

/** ¿El usuario actual es el dueño del proyecto? (creado_por) */
create or replace function es_dueno_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto where id = p_proyecto and creado_por = usuario_actual_id()
  );
$$;

/** ¿El usuario actual tiene un ACCESO (fila) a este proyecto? */
create or replace function es_invitado_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acceso_proyecto a
    where a.proyecto_id = p_proyecto and a.usuario_id = usuario_actual_id()
  );
$$;

/** Visibilidad del proyecto: admin, dueño o invitado. */
create or replace function tiene_acceso_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_admin() or es_dueno_proyecto(p_proyecto) or es_invitado_proyecto(p_proyecto);
$$;

/** ¿`u` comparte algún proyecto visible con el usuario actual? (para ver
 *  nombres/avatares de responsables y la lista de miembros, 7). */
create or replace function comparte_proyecto(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto p
    where tiene_acceso_proyecto(p.id)
      and (p.creado_por = p_usuario or exists (
        select 1 from acceso_proyecto a
        where a.proyecto_id = p.id and a.usuario_id = p_usuario
      ))
  );
$$;

-- Mismo régimen de EXECUTE que dejó la migración 15: son predicados de RLS,
-- authenticated los necesita (invariante 5); anon no evalúa estas políticas.
-- Idempotente sobre una base ya correcta; si alguna función NO existía y
-- recién nace aquí, la deja con el régimen correcto.
revoke execute on function es_dueno_proyecto(uuid)     from anon;
revoke execute on function es_invitado_proyecto(uuid)  from anon;
revoke execute on function tiene_acceso_proyecto(uuid) from anon;
revoke execute on function comparte_proyecto(uuid)     from anon;

-- ---------------------------------------------------------------------
-- 2 · La vista, tal como la dejó la migración 18 (la versión vigente:
--     con `iniciales_manual` y filtrando eliminados).
-- ---------------------------------------------------------------------
drop view if exists usuario_visible;
create view usuario_visible with (security_invoker = false) as
  select
    u.id, u.nombre, u.iniciales, u.iniciales_manual, u.rol, u.activo, u.auth_id,
    case when es_admin() or u.auth_id = auth.uid() or rol_actual() = 'consultor'
         then u.email else null end as email,
    case when es_admin() or u.auth_id = auth.uid()
         then u.permisos_proyecto else '{}'::jsonb end as permisos_proyecto
  from usuario u
  where not u.eliminado
    and (es_admin() or u.auth_id = auth.uid() or u.rol = 'admin' or comparte_proyecto(u.id));
grant select on usuario_visible to authenticated;

-- Comprobación (opcional, para dejar constancia al aplicar): entrando luego
-- con un consultor, `select nombre from usuario_visible` debe devolver a
-- TODOS los miembros activos de sus proyectos (más los admins y él mismo),
-- y a nadie de proyectos que no comparte. La compuerta lo automatiza.
