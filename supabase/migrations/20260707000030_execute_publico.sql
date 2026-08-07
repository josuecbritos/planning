-- =====================================================================
-- #290 — Cerrar el permiso de ejecución que quedó abierto a todos.
--
-- QUÉ PASABA. Las migraciones 15 y 22 quisieron cerrar el EXECUTE de las
-- funciones internas, pero revocaron `from anon, authenticated` y nunca
-- `from public`. En PostgreSQL las funciones NACEN con EXECUTE concedido a
-- PUBLIC: quitarle el permiso a dos roles no toca lo que tienen por
-- pertenecer a PUBLIC. El manual lo dice explícitamente — para restringir
-- una `security definer` hay que revocar de PUBLIC y después conceder
-- selectivamente. Auditoría #296 sobre la base real: la mayoría de las
-- funciones muestra `=X/postgres` (el permiso universal) en su ACL.
--
-- Las dos que importan, y por qué:
--   · `crear_notificacion(...)` — security definer, y su cuerpo solo
--     comprueba que el destinatario exista y no sea el autor. No mira
--     quién llama. Su permiso venía EXCLUSIVAMENTE de PUBLIC (la
--     migración 16 sí revocó anon y authenticated). Quien pudiera
--     invocarla fabricaría notificaciones ajenas con el autor que quisiera.
--   · `usuario_tiene_acceso(uuid, uuid)` — security definer, responde si
--     OTRO usuario tiene acceso a OTRO proyecto sin comprobar quién
--     pregunta. No expone contenido, pero permite sondear quién trabaja
--     en qué. Su permiso también venía solo de PUBLIC.
--
-- QUÉ HACE ESTA MIGRACIÓN. El criterio es deliberadamente conservador:
-- **quitar el permiso universal y dejar todo lo demás exactamente igual.**
-- Para cada función el resultado es su ACL de hoy MENOS la entrada
-- universal. No se concede nada nuevo, no se quita ningún permiso
-- explícito, no se toca ningún cuerpo ni se cambia ninguna a security
-- invoker (eso es otro problema y se decide aparte).
--
-- POR QUÉ NO ROMPE NADA (verificado, no supuesto — ver el informe):
--   1. Las funciones de TRIGGER las ejecuta el motor al dispararse el
--      trigger; quien provoca el cambio no necesita EXECUTE sobre ellas.
--   2. Las llamadas DESDE otra `security definer` corren con los
--      privilegios del definidor (postgres), que los conserva. Es el caso
--      de `crear_notificacion` (la llaman notif_asignacion,
--      notif_comentario y registrar_replanificacion) y de
--      `usuario_tiene_acceso` (la llama notif_comentario).
--   3. Las funciones que usan las POLÍTICAS DE RLS —es_admin,
--      tiene_acceso_proyecto, usuario_actual_id, permiso_bool_en,
--      permiso_tarea_en, es_dueno_proyecto, es_invitado_proyecto,
--      es_cliente, comparte_proyecto, rol_actual, permiso_proyecto,
--      proyecto_de_tarea, proyecto_de_subfrente— ya tienen HOY un grant
--      explícito para `authenticated` (viene de los default privileges de
--      Supabase; las migraciones 15/22 solo les revocaron `anon`).
--      Conservarlo es justamente lo que evita romperlas.
--
-- NO SE TOCAN LAS FUNCIONES DE EXTENSIONES (pgcrypto: armor, crypt,
-- digest, pgp_*, gen_random_*…): no son del proyecto y cerrarlas podría
-- romper cosas ajenas. Se excluyen por `pg_depend.deptype = 'e'`.
--
-- ANTES DE APLICAR: respaldo con `pg_dump`.
-- DESPUÉS DE APLICAR: correr `scripts/validar-rls.mjs`, que trae el caso
-- nuevo que se pone en rojo si alguna función conserva el permiso universal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · Quitar el permiso universal, función por función.
--     Se recorre en vez de usar `ALL FUNCTIONS IN SCHEMA` justamente para
--     poder excluir las de extensiones. GUARDAR la salida del NOTICE.
-- ---------------------------------------------------------------------

do $$
declare
  r record;
  v_cerradas int := 0;
  v_ya_estaban int := 0;
begin
  for r in
    select p.oid,
           p.oid::regprocedure::text as firma,
           exists (
             select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as tiene_publico
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      -- Excluir lo que pertenece a una extensión (no es del proyecto).
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
    order by 1
  loop
    if r.tiene_publico then
      execute format('revoke execute on routine %s from public', r.firma);
      v_cerradas := v_cerradas + 1;
    else
      v_ya_estaban := v_ya_estaban + 1;
    end if;
  end loop;

  raise notice '#290 — permiso universal retirado de % función(es) del esquema public; % ya estaban cerradas (migraciones 27/28/29). Las de extensiones no se tocaron.',
    v_cerradas, v_ya_estaban;
end $$;

-- ---------------------------------------------------------------------
-- 2 · Que las funciones NUEVAS nazcan cerradas — NO SE HACE AQUÍ, y el
--     porqué es un hallazgo que conviene no perder.
--
--     Lo natural sería:
--         alter default privileges in schema public
--           revoke execute on functions from public;
--     **Esa línea NO HACE NADA.** Medido en PostgreSQL 16: el ACL que
--     guarda `pg_default_acl` para un esquema se FUSIONA con el default
--     del motor (que incluye EXECUTE para PUBLIC), no lo reemplaza, así
--     que la función nueva igual nace con `=X`. Comprobado creando una
--     función después de ejecutarla: seguía abierta a todos.
--
--     Es EL MISMO ERROR que estamos corrigiendo —un revoke que parece
--     correcto y no surte efecto—, así que escribirlo habría sido dejar
--     un blindaje de mentira. Se prefiere no ponerlo.
--
--     La única variante que SÍ funciona es la GLOBAL, sin acotar esquema:
--         alter default privileges revoke execute on functions from public;
--     pero alcanza a todo objeto creado por este rol en CUALQUIER esquema
--     —incluidas las funciones que instale una extensión futura—, que es
--     más de lo que este pedido autoriza. Queda como decisión de Josué.
--
--     Mientras tanto, lo que de verdad atrapa el olvido es el punto 3 +
--     el caso nuevo de la compuerta: si alguna función vuelve a quedar
--     abierta, la compuerta se pone en rojo y no deja pasar el cambio.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 3 · La vista que le permite a la compuerta vigilarlo.
--
--     La compuerta habla con la base por la API REST, que solo expone el
--     esquema `public`: no puede leer `pg_proc` directamente. Esta vista
--     es el mínimo necesario para que el caso nuevo exista, y muestra
--     SOLO las infracciones — en una base sana devuelve CERO filas, así
--     que no revela la configuración de permisos de nada.
--
--     Se concede a `authenticated` (la compuerta corre con una sesión de
--     usuario) y se cierra a `anon` y a `public`: los default privileges
--     de Supabase conceden las tablas nuevas a anon, así que hay que
--     revocarlo explícitamente. Mismo error que estamos corrigiendo.
-- ---------------------------------------------------------------------

create or replace view permiso_ejecucion_abierto as
  select p.oid::regprocedure::text as funcion,
         p.prosecdef              as es_security_definer
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
    )
    and exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    );

revoke all on permiso_ejecucion_abierto from public, anon;
grant select on permiso_ejecucion_abierto to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4 · Comprobación en la misma transacción: si algo quedó abierto, esta
--     migración FALLA en vez de dejar el trabajo a medias.
-- ---------------------------------------------------------------------

do $$
declare v_quedan int;
begin
  select count(*) into v_quedan from permiso_ejecucion_abierto;
  if v_quedan > 0 then
    raise exception '#290 — quedaron % función(es) con el permiso universal; la migración no cerró lo que debía', v_quedan;
  end if;
  raise notice '#290 — comprobado: ninguna función del proyecto conserva el permiso universal.';
end $$;
