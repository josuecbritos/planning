-- =====================================================================
-- #291 — Replanificaciones FALSAS ya escritas: identificación.
--
-- SOLO LECTURA. Este archivo no borra nada y no forma parte de las
-- migraciones: se pega en el SQL Editor de Supabase y se lee el resultado.
--
-- QUÉ CUENTA COMO FALSA. Hasta la migración 27, la base comparaba las
-- fechas contra `current_date`, que en Supabase es UTC. Desde las 20:00 de
-- Chile la base ya creía que era el día siguiente, así que una tarea
-- planificada para MAÑANA le parecía comprometida y su movimiento quedaba
-- registrado como replanificación. Un registro es falso si, **en hora de
-- Chile**, la fecha anterior todavía era futura cuando se escribió.
--
-- QUÉ HACER CON EL RESULTADO: nada todavía. El historial de
-- replanificaciones es el diferenciador del producto; qué se hace con los
-- registros falsos lo decide Josué con los números a la vista.
-- =====================================================================

-- 1 · Cuántas son.
select count(*) as replanificaciones_falsas
from replanificacion r
where r.fecha_anterior > (r.timestamp at time zone 'America/Santiago')::date;

-- 2 · El listado, con su tarea y su proyecto.
select r.id,
       r.tarea_id,
       t.titulo                                            as tarea,
       p.nombre                                            as proyecto,
       r.fecha_anterior,
       r.fecha_nueva,
       r.numero_cambio,
       r.timestamp                                         as registrada_utc,
       (r.timestamp at time zone 'America/Santiago')       as registrada_chile,
       (r.timestamp at time zone 'America/Santiago')::date as dia_en_chile
from replanificacion r
join tarea t       on t.id  = r.tarea_id
join sub_frente sf on sf.id = t.sub_frente_id
join frente f      on f.id  = sf.frente_id
join proyecto p    on p.id  = f.proyecto_id
where r.fecha_anterior > (r.timestamp at time zone 'America/Santiago')::date
order by r.timestamp desc;

-- 3 · Las tareas afectadas arrastran además una FECHA ORIGINAL equivocada:
--     se conservó como "compromiso inicial" una fecha que en su momento
--     todavía era futura, en vez de rehacerse.
select distinct t.id, t.titulo, t.fecha_original, t.fecha_objetivo
from replanificacion r
join tarea t on t.id = r.tarea_id
where r.fecha_anterior > (r.timestamp at time zone 'America/Santiago')::date
order by t.titulo;

-- 4 · Contexto, para dimensionar: total de registros del historial y cuántos
--     de ellos quedan marcados como falsos.
select count(*) as total_replanificaciones,
       count(*) filter (
         where fecha_anterior > (timestamp at time zone 'America/Santiago')::date
       ) as falsas
from replanificacion;
