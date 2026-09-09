-- =====================================================================
-- 35 · El correo del resumen diario se ve como Mis Tareas (#272, ajustes)
--
-- El correo ya llega. Lo que faltaba era que su tabla se viera igual que la
-- tabla de Mis Tareas, y dos de esas diferencias necesitan datos que la
-- migración 34 no entregaba:
--
--   · el NÚMERO de replanificaciones, para el ↻ ×N que va junto al nombre.
--     La categoría solo dice SI hubo o no (`atrasada_replan`), no cuántas.
--   · el COLOR del proyecto, para el punto que va al principio de Ubicación.
--
-- Se agregan a lo que devuelve `resumen_diario_datos()` en vez de que el
-- correo los busque por su cuenta. La razón es la misma que fijó #272: lo que
-- la base entrega NO lleva ids, así que cualquier cruce hecho después tendría
-- que ser por nombre de tarea y de proyecto, y dos tareas con el mismo título
-- se llevarían el ↻ ×N o el color de la otra.
--
-- ADITIVA Y SIN CAMBIOS DE DATOS: `create or replace` de UNA función. No toca
-- ninguna tabla, ninguna columna, ninguna política, ningún permiso. La firma y
-- las columnas de retorno quedan idénticas —solo cambia lo que va dentro del
-- jsonb de cada tarea—, así que nada que dependa de ella se entera.
--
-- Lo que NO cambia, y es la mitad del punto: A QUIÉN se le manda, QUÉ tareas
-- entran y EN QUÉ ORDEN. Las tres reglas quedan palabra por palabra como las
-- dejó la migración 34.
--
-- ANTES DE APLICAR: respaldo del dueño (`pg_dump`). El plan gratuito no tiene
-- respaldos automáticos.
-- DESPUÉS DE APLICAR: redesplegar la función `resumen-diario` (lee los campos
-- nuevos) y correr la compuerta `scripts/validar-rls.mjs`.
-- =====================================================================

/** Una fila por persona QUE TIENE ALGO QUE RECIBIR. Ver la migración 34 para
 *  las reglas de a quién, qué y en qué orden: acá solo se suman dos campos al
 *  jsonb de cada tarea.
 *
 *  SECURITY DEFINER y concedida SOLO a `service_role`: lee correos de
 *  terceros, que es justo lo que la aplicación tiene prohibido (invariante 3). */
create or replace function resumen_diario_datos()
returns table (
  usuario_id uuid,
  nombre     text,
  email      text,
  atrasadas  jsonb,
  vencen_hoy jsonb,
  semana     integer
)
language sql stable security definer set search_path = public as $$
  with param as (
    select hoy_chile() as hoy,
           hoy_chile() + (7 - extract(isodow from hoy_chile()))::int as domingo
  ),
  destinatario as (
    select u.id, u.nombre, u.email
    from usuario u
    where u.resumen_diario
      and u.activo
      and not u.eliminado
      and u.auth_id is not null
  ),
  mia as (
    select
      d.id as usuario_id,
      p.nombre as proyecto,
      -- #272 (ajustes): el color del proyecto, para el punto de Ubicación. El
      -- respaldo es el mismo que usa la pantalla cuando un proyecto no tiene
      -- color asignado.
      coalesce(p.color, '#607d8b') as color_proyecto,
      f.nombre as frente,
      f.orden  as frente_orden,
      sf.nombre as sub_frente,
      sf.orden  as sub_frente_orden,
      t.titulo,
      t.fecha_objetivo,
      -- #272 (ajustes): CUÁNTAS, no si hubo. `nReplanificaciones` de la
      -- pantalla es exactamente este conteo.
      (select count(*) from replanificacion r where r.tarea_id = t.id)::int as n_replan,
      greatest(coalesce(dias_habiles_entre(t.fecha_original, t.fecha_objetivo), 0), 0) as atraso
    from destinatario d
    join tarea t on t.responsable_id = d.id and not t.archivada and not t.hecha
    join sub_frente sf on sf.id = t.sub_frente_id
    join frente f on f.id = sf.frente_id
    join proyecto p on p.id = f.proyecto_id
    where p.estado <> 'archivado'
      and (
        p.creado_por = d.id
        or exists (select 1 from acceso_proyecto a where a.proyecto_id = p.id and a.usuario_id = d.id)
      )
      and t.fecha_objetivo is not null
  ),
  fila as (
    select
      m.usuario_id,
      m.proyecto, m.color_proyecto, m.frente, m.sub_frente, m.titulo,
      m.fecha_objetivo, m.atraso, m.n_replan,
      m.frente_orden, m.sub_frente_orden,
      case
        when m.fecha_objetivo < (select hoy from param)
          then case when m.n_replan > 0 then 'atrasada_replan' else 'atrasada' end
        else case when m.n_replan > 0 then 'pendiente_replan' else 'pendiente' end
      end as categoria,
      case
        when m.fecha_objetivo < (select hoy from param) then 'atrasada'
        when m.fecha_objetivo = (select hoy from param) then 'hoy'
        when m.fecha_objetivo <= (select domingo from param) then 'semana'
        else 'despues'
      end as bloque
    from mia m
  ),
  json_fila as (
    select
      f.usuario_id,
      f.bloque,
      jsonb_build_object(
        'titulo', f.titulo,
        'proyecto', f.proyecto,
        'colorProyecto', f.color_proyecto,
        'frente', f.frente,
        'subFrente', f.sub_frente,
        'fecha', to_char(f.fecha_objetivo, 'YYYY-MM-DD'),
        'categoria', f.categoria,
        'atraso', f.atraso,
        'replanificaciones', f.n_replan
      ) as tarea,
      f.atraso, lower(f.proyecto) as proy_orden, f.frente_orden, f.sub_frente_orden, f.titulo
    from fila f
  )
  select
    d.id,
    d.nombre,
    d.email,
    coalesce((
      select jsonb_agg(j.tarea order by j.atraso desc, j.proy_orden, j.frente_orden, j.sub_frente_orden, j.titulo)
      from json_fila j where j.usuario_id = d.id and j.bloque = 'atrasada'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(j.tarea order by j.proy_orden, j.frente_orden, j.sub_frente_orden, j.titulo)
      from json_fila j where j.usuario_id = d.id and j.bloque = 'hoy'
    ), '[]'::jsonb),
    (select count(*)::int from json_fila j where j.usuario_id = d.id and j.bloque = 'semana')
  from destinatario d
  where exists (
    select 1 from json_fila j where j.usuario_id = d.id and j.bloque in ('atrasada', 'hoy')
  )
  order by d.nombre;
$$;

-- #290: `create or replace` sobre una función que YA existía conserva sus
-- permisos, así que en teoría acá no haría falta nada. Se repite igual —el
-- revoke a PUBLIC primero— porque la trampa es que "en teoría" no se mide, y
-- la comprobación del final sí.
revoke execute on function resumen_diario_datos() from public;
revoke execute on function resumen_diario_datos() from anon, authenticated;
grant execute on function resumen_diario_datos() to service_role;

do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas from permiso_ejecucion_abierto;
  if v_abiertas > 0 then
    raise exception '#272/#290 — quedaron % función(es) con el permiso universal', v_abiertas;
  end if;
  raise notice '#272 — comprobado: la función redefinida sigue cerrada.';
end $$;

-- Comprobación (para dejar constancia al aplicar): los dos campos nuevos
-- viajan en cada tarea.
--
--   select jsonb_pretty(atrasadas -> 0) from resumen_diario_datos() limit 1;
--
-- Tiene que traer `replanificaciones` y `colorProyecto`.
