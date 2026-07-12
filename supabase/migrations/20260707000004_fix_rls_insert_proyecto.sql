-- =====================================================================
-- Fix — "new row violates row-level security policy for table proyecto"
-- al crear un proyecto desde la app (INSERT ... RETURNING).
--
-- Causa raiz: proyecto_select dependia de proyectos_visibles(), una
-- funcion STABLE que consulta la PROPIA tabla proyecto. Postgres evalua
-- esa funcion con el snapshot del inicio de la sentencia, donde la fila
-- recien insertada todavia no existe; el RETURNING del insert no pasaba
-- entonces la politica de SELECT y el insert completo fallaba.
-- (Crear frentes/tareas si funcionaba: sus politicas consultan al padre,
-- que ya existe en el snapshot.)
--
-- Solucion: politicas de SELECT con expresion directa — es_admin() o
-- membresia en acceso_cliente_proyecto — sin consultar la tabla objetivo.
-- =====================================================================

-- Helper: ¿el usuario actual puede ver este proyecto?
-- (admin: siempre; cliente: si esta en la tabla de accesos 5.7)
create or replace function tiene_acceso_proyecto(p_proyecto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from acceso_cliente_proyecto a
    where a.proyecto_id = p_proyecto and a.usuario_id = usuario_actual_id()
  );
$$;

-- proyecto: expresion directa sobre la fila (cubre el RETURNING del insert).
drop policy if exists proyecto_select on proyecto;
create policy proyecto_select on proyecto for select
  using (tiene_acceso_proyecto(id));

-- frente / sub_frente / tarea / replanificacion: mismo criterio, resolviendo
-- el proyecto por joins a tablas padre (que si existen en el snapshot).
drop policy if exists frente_select on frente;
create policy frente_select on frente for select
  using (tiene_acceso_proyecto(proyecto_id));

drop policy if exists subfrente_select on sub_frente;
create policy subfrente_select on sub_frente for select
  using (exists (
    select 1 from frente f
    where f.id = frente_id and tiene_acceso_proyecto(f.proyecto_id)
  ));

drop policy if exists tarea_select on tarea;
create policy tarea_select on tarea for select
  using (exists (
    select 1 from sub_frente sf
    join frente f on f.id = sf.frente_id
    where sf.id = sub_frente_id and tiene_acceso_proyecto(f.proyecto_id)
  ));

drop policy if exists replan_select on replanificacion;
create policy replan_select on replanificacion for select
  using (exists (
    select 1 from tarea t
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    where t.id = tarea_id and tiene_acceso_proyecto(f.proyecto_id)
  ));

-- proyectos_visibles() queda obsoleta para politicas; se conserva por si
-- algo externo la usa, pero ya ninguna politica depende de ella.
