-- =====================================================================
-- #296 — Auditoría de la base viva contra el repo. SOLO LECTURA.
--
-- Se pega ENTERO en el SQL Editor de Supabase (o se corre con psql). No
-- escribe nada: solo SELECT sobre catálogos. Cada bloque imprime el estado
-- REAL de la base; al lado, en el informe `docs/informe-296-auditoria-
-- seguridad.md`, está lo que el repo ESPERA, para comparar.
--
-- Qué busca (Parte B del pedido): políticas de RLS de TODAS las tablas,
-- tablas sin RLS o con reglas incondicionales, funciones y su modo/ACL,
-- triggers, vistas y su modo, columnas, y la publicación de tiempo real.
-- =====================================================================

-- ---------------------------------------------------------------------
-- B.1 · POLÍTICAS DE RLS de todas las tablas (nombre, comando, condición).
--       Comparar contra la lista del informe: cualquier política que
--       exista acá y NO en el repo es una divergencia (como #281).
-- ---------------------------------------------------------------------
select 'B.1 POLITICAS' as bloque;
select tablename, policyname, cmd, permissive,
       qual        as using_expr,
       with_check  as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ---------------------------------------------------------------------
-- B.2 · TABLAS con RLS: activada o no, y si es forzada. Una tabla con
--       datos y RLS 'off' es acceso sin barrera. También se listan las
--       políticas INCONDICIONALES (using = true): dan acceso sin filtro.
-- ---------------------------------------------------------------------
select 'B.2 RLS POR TABLA' as bloque;
select c.relname as tabla,
       c.relrowsecurity  as rls_activada,
       c.relforcerowsecurity as rls_forzada
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by c.relname;

select 'B.2 POLITICAS INCONDICIONALES (using=true o check=true)' as bloque;
select tablename, policyname, cmd, qual as using_expr, with_check as check_expr
from pg_policies
where schemaname = 'public'
  and (btrim(coalesce(qual,'')) = 'true' or btrim(coalesce(with_check,'')) = 'true')
order by tablename, policyname;

-- ---------------------------------------------------------------------
-- B.3 + A.3 · FUNCIONES del esquema public: modo (DEFINER bypasa RLS),
--       y quién puede ejecutarlas HOY — con foco en PUBLIC, que es lo que
--       responde #290. `pub_execute = true` significa que cualquiera
--       (incluido anon y authenticated) puede ejecutarla, sin importar los
--       `revoke ... from anon, authenticated` de las migraciones 15/22.
--       Las de extensiones (pgcrypto: armor, crypt, pgp_*, digest…) son
--       ruido conocido: no son del proyecto.
-- ---------------------------------------------------------------------
select 'A.3 FUNCIONES: modo + quien ejecuta' as bloque;
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as funcion,
       case when p.prosecdef then 'DEFINER' else 'invoker' end as modo,
       has_function_privilege('public'||'',       p.oid, 'EXECUTE') as pub_execute,
       has_function_privilege('anon',             p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',    p.oid, 'EXECUTE') as auth_execute,
       p.proacl as acl_crudo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by (p.prosecdef and has_function_privilege('public'||'', p.oid, 'EXECUTE')) desc,
         p.proname;

-- ---------------------------------------------------------------------
-- B.4 · TRIGGERS (no internos) por tabla. Comparar contra el repo: falta
--       o sobra alguno.
-- ---------------------------------------------------------------------
select 'B.4 TRIGGERS' as bloque;
select c.relname as tabla, t.tgname as trigger,
       pg_get_triggerdef(t.oid) as definicion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relnamespace = 'public'::regnamespace
order by c.relname, t.tgname;

-- ---------------------------------------------------------------------
-- B.5 · VISTAS y su modo. `security_invoker = true` → corre con los
--       privilegios de quien consulta; `false` (o ausente) → con los del
--       dueño de la vista (definer), que bypasa la RLS de las tablas base.
--       En el repo, `usuario_visible` es DEFINER a propósito (invariante 3):
--       lleva su propio filtro de filas y enmascara columnas. Cualquier
--       OTRA vista en definer, o `usuario_visible` en invoker, es divergencia.
-- ---------------------------------------------------------------------
select 'B.5 VISTAS: modo' as bloque;
select c.relname as vista,
       case when 'security_invoker=true' = any(coalesce(c.reloptions, '{}'))
            then 'invoker' else 'DEFINER' end as modo,
       c.reloptions as opciones
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
order by c.relname;

-- ---------------------------------------------------------------------
-- B.6 · TABLAS y COLUMNAS. Para cotejar contra el esquema del repo:
--       columnas o tablas de más o de menos.
-- ---------------------------------------------------------------------
select 'B.6 COLUMNAS' as bloque;
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- ---------------------------------------------------------------------
-- B.7 · PUBLICACIÓN DE TIEMPO REAL. Qué tablas están efectivamente
--       publicadas en `supabase_realtime`. El repo declara ocho
--       (migraciones 20 y 21): notificacion + tarea, frente, sub_frente,
--       proyecto, acceso_proyecto, comentario, replanificacion. Ni una
--       más (nada que exponga filas que no deba), ni una menos.
-- ---------------------------------------------------------------------
select 'B.7 PUBLICACION supabase_realtime' as bloque;
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- Y si hubiera OTRAS publicaciones (no debería haber ninguna fuera de esa):
select 'B.7 OTRAS PUBLICACIONES' as bloque;
select pubname, puballtables, pubinsert, pubupdate, pubdelete
from pg_publication
order by pubname;
