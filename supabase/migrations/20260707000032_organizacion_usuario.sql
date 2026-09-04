-- =====================================================================
-- 32 · Organización del usuario (#339)
--
-- Hasta acá un usuario veía a otro si compartía un proyecto con él, si él
-- mismo era administrador o si el otro lo era. Nada más. Consecuencia: dos
-- consultores de la misma consultora que no comparten ningún proyecto NO se
-- ven entre sí, así que ninguno puede agregar al otro a un proyecto nuevo y
-- hay que pasar por el administrador. Y no había ningún campo que dijera a
-- qué empresa pertenece una persona.
--
-- Esta migración agrega ese campo y le suma UN caso a la regla de
-- visibilidad: dos usuarios se ven si los DOS son consultores y tienen la
-- MISMA organización.
--
-- Lo que NO cambia:
--   · Los proyectos y las tareas siguen protegidos por membresía. Verse en
--     una lista no da acceso a ningún dato de ningún proyecto: esta migración
--     no toca ninguna política que no sea la de `usuario`.
--   · El correo sigue enmascarado con la misma regla de hoy.
--   · Quién puede crear usuarios no cambia.
--   · La regla vive en DOS lugares —la política de lectura de la tabla y la
--     vista enmascarada— y los dos quedan diciendo lo mismo, como hoy.
--
-- ADITIVA: no borra ni reescribe ninguna migración anterior. Recrea la
-- política `usuario_select` y la vista `usuario_visible` sobre su versión
-- vigente (migraciones 19 y 22) sumándoles el caso nuevo.
--
-- ANTES DE APLICAR: respaldo del dueño (`pg_dump`). El plan gratuito no tiene
-- respaldos automáticos.
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que trae
-- casos nuevos para este cambio (§ "#339").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · La columna
-- ---------------------------------------------------------------------
-- Opcional y vacía en todos los usuarios existentes: el pedido no asigna
-- ninguna organización a nadie, se van llenando caso a caso desde la pantalla
-- de administración.
alter table usuario add column if not exists organizacion text;

comment on column usuario.organizacion is
  '#339 · Empresa a la que pertenece la persona. Opcional. Dos CONSULTORES '
  'con la misma organización se ven entre sí aunque no compartan proyecto. '
  'Se guarda normalizada (sin espacios al borde; vacío = NULL).';

-- La normalización vive en la BASE y no en la pantalla. Escrita a mano,
-- "Andotek" y "Andotek " son dos organizaciones distintas, y dos personas de
-- la misma empresa no se verían entre sí sin nada en pantalla que lo
-- explique. El desplegable del formulario evita el caso normal; esto lo cierra
-- para cualquier camino de escritura, incluido un UPDATE directo.
create or replace function normalizar_organizacion()
returns trigger language plpgsql set search_path = public as $$
begin
  new.organizacion := nullif(btrim(new.organizacion), '');
  return new;
end;
$$;
-- #290: una función NUEVA nace con EXECUTE para PUBLIC, y `revoke ... from
-- anon` no lo quita —anon lo conserva por la vía de PUBLIC—. Es exactamente el
-- error que cerró la migración 30, y vuelve a aparecer con cada función nueva:
-- por eso el revoke a PUBLIC va PRIMERO y los demás después.
-- Medido: sin esta línea, `permiso_ejecucion_abierto` devolvía esta función.
revoke execute on function normalizar_organizacion() from public;
revoke execute on function normalizar_organizacion() from anon, authenticated;
drop trigger if exists trg_normalizar_organizacion on usuario;
create trigger trg_normalizar_organizacion
  before insert or update of organizacion on usuario
  for each row execute function normalizar_organizacion();

-- ---------------------------------------------------------------------
-- 2 · El caso nuevo de la regla de visibilidad
-- ---------------------------------------------------------------------
/** ¿`p_usuario` y quien pregunta son AMBOS consultores de la misma
 *  organización?
 *
 *  SOLO CONSULTORES, y es deliberado: si esto alcanzara a los clientes, los de
 *  una misma empresa empezarían a verse entre ellos sin compartir nada, y eso
 *  cambiaría lo que ven los clientes actuales sin que nadie lo haya pedido. Un
 *  administrador ya ve a todos por otra vía.
 *
 *  SIN ORGANIZACIÓN NO CAMBIA NADA: `organizacion is not null` en el lado de
 *  quien pregunta, y la igualdad descarta el otro lado por sí sola —en SQL
 *  `null = null` no es cierto—, así que dos usuarios sin organización NO se ven
 *  entre sí por el hecho de estar los dos vacíos. La condición explícita está
 *  igual, porque leerlo no debería depender de recordar esa regla de SQL.
 *
 *  SECURITY DEFINER como el resto de los predicados de RLS: se evalúa DENTRO de
 *  la política de `usuario`, así que no puede volver a pasar por ella. */
create or replace function misma_organizacion(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from usuario yo
    join usuario otro on otro.id = p_usuario
    where yo.auth_id = auth.uid()
      and yo.activo
      and yo.rol = 'consultor'
      and otro.rol = 'consultor'
      and yo.organizacion is not null
      and otro.organizacion is not null
      and yo.organizacion = otro.organizacion
  );
$$;

-- Mismo régimen de EXECUTE que el resto de los predicados de RLS (invariante
-- 5): authenticated lo necesita para evaluar la política; anon no la evalúa.
-- El revoke a PUBLIC va primero y no es una formalidad: una función nueva nace
-- con EXECUTE para PUBLIC, así que sin él `anon` seguiría pudiendo ejecutarla
-- por esa vía aunque se le revoque a él por nombre (#290).
-- Medido: sin esta línea, `permiso_ejecucion_abierto` devolvía esta función y
-- `has_function_privilege('anon', ...)` daba cierto.
revoke execute on function misma_organizacion(uuid) from public;
revoke execute on function misma_organizacion(uuid) from anon;
grant execute on function misma_organizacion(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3 · La regla, en los DOS lugares donde está escrita
-- ---------------------------------------------------------------------
-- Las dos expresiones son la misma palabra por palabra —solo cambia el
-- calificador `u.` de la vista—, y la compuerta lo comprueba comparando lo que
-- la base tiene vivo, no lo que este archivo dice.

drop policy if exists usuario_select on usuario;
create policy usuario_select on usuario for select using (
  not eliminado
  and (
    es_admin()
    or auth_id = auth.uid()
    or rol = 'admin'
    or comparte_proyecto(id)
    or misma_organizacion(id)
  )
);

-- La vista de la compuerta (punto 3b) depende de esta, así que se retira
-- primero y se vuelve a crear más abajo. Se nombra explícitamente en vez de
-- usar `cascade`: `cascade` se llevaría por delante cualquier dependiente que
-- nadie recuerde, que es justo lo que no se quiere en una migración.
drop view if exists regla_visibilidad_usuario;
drop view if exists usuario_visible;
create view usuario_visible with (security_invoker = false) as
  select
    u.id, u.nombre, u.iniciales, u.iniciales_manual, u.rol, u.activo, u.auth_id,
    case when es_admin() or u.auth_id = auth.uid() or rol_actual() = 'consultor'
         then u.email else null end as email,
    case when es_admin() or u.auth_id = auth.uid()
         then u.permisos_proyecto else '{}'::jsonb end as permisos_proyecto,
    -- La organización se entrega con la misma regla que `permisos_proyecto`:
    -- al administrador —el único que la asigna y el único que arma el
    -- desplegable— y a cada quien la suya. El pedido no pidió mostrarle a
    -- nadie más a qué empresa pertenece otro, y la regla de visibilidad no
    -- depende de esta columna: se evalúa en la base, contra la tabla.
    case when es_admin() or u.auth_id = auth.uid()
         then u.organizacion else null end as organizacion
  from usuario u
  where not u.eliminado
    and (
      es_admin()
      or u.auth_id = auth.uid()
      or u.rol = 'admin'
      or comparte_proyecto(u.id)
      or misma_organizacion(u.id)
    );
grant select on usuario_visible to authenticated;

-- El grant por columnas de la tabla NO se toca (migración 15): el cliente lee
-- por la vista, nunca la tabla (invariante 3), así que `organizacion` no entra
-- en esa lista — como tampoco entra `email`.

-- ---------------------------------------------------------------------
-- 3b · La vista que le permite a la compuerta vigilar que sigan diciendo
--      lo mismo.
--
--      La regla vive en dos sitios y tiene que decir lo mismo en los dos.
--      Eso solo se puede comprobar contra lo que la base tiene VIVO, no
--      contra lo que este archivo dice. La compuerta habla por la API REST,
--      que únicamente expone el esquema `public` y no puede leer el
--      catálogo: esta vista es el mínimo para que ese caso exista. Mismo
--      patrón que `permiso_ejecucion_abierto` (#290).
--
--      Entrega UN BOOLEANO y no los textos: la comparación es lo que hace
--      falta, y publicar la expresión de una política a `authenticated` sería
--      contar de más sin necesidad.
--
--      La comparación quita espacios y paréntesis —la política y la vista
--      escriben la misma condición con distinto paréntesis— y el
--      calificador `u.` que la vista pone y el deparser a veces conserva, más
--      el punto y coma con que termina la definición de la vista.
--      La prueba local (`docs/prueba-339-organizacion-base.mjs`) hace además
--      la comparación ESTRICTA, volviendo a deparsar las dos expresiones con
--      el mismo código de PostgreSQL; acá se prefiere lo que se puede
--      calcular en una vista.
-- ---------------------------------------------------------------------
create or replace view regla_visibilidad_usuario as
  select
    replace(
      translate(
        coalesce((select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'usuario_select'), ''),
        ' ();' || chr(10), ''),
      'u.', '')
    =
    replace(
      translate(
        coalesce(
          substring(
            pg_get_viewdef('public.usuario_visible'::regclass, true)
            from position('WHERE' in pg_get_viewdef('public.usuario_visible'::regclass, true)) + 5),
          ''),
        ' ();' || chr(10), ''),
      'u.', '')
    as coinciden;

revoke all on regla_visibilidad_usuario from public, anon;
grant select on regla_visibilidad_usuario to authenticated, service_role;

-- Comprobación en la misma transacción: si las dos escrituras no coinciden,
-- esta migración FALLA en vez de dejar la regla partida en dos.
do $$
declare v_ok boolean;
begin
  select coinciden into v_ok from regla_visibilidad_usuario;
  if not v_ok then
    raise exception '#339 — la política `usuario_select` y la vista `usuario_visible` no dicen lo mismo';
  end if;
  raise notice '#339 — comprobado: la regla de visibilidad dice lo mismo en los dos lugares.';
end $$;

-- ---------------------------------------------------------------------
-- 4 · El candado de auto-edición
-- ---------------------------------------------------------------------
-- Sin esto, cualquiera podría ponerse "Andotek" en su propia fila y pasar a
-- ver a todos los consultores de Andotek: la política `usuario_update` deja
-- que uno toque SU fila, y el trigger es lo que enumera qué no puede tocar.
-- La organización entra en esa lista por la misma razón que el rol y los
-- permisos: cambiarla amplía lo que uno ve.
create or replace function validar_autoedicion_usuario()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if es_admin() then return new; end if;
  -- Quien no es admin solo puede tocar nombre e iniciales de SU fila. Se
  -- enumeran las columnas prohibidas una por una (lista blanca implícita):
  -- rol y permisos serían escalada de privilegio; activo y eliminado, evadir
  -- una baja; email y auth_id, apoderarse de otra cuenta; organizacion (#339),
  -- ganar visibilidad sobre los consultores de otra empresa.
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.eliminado is distinct from old.eliminado
     or new.auth_id is distinct from old.auth_id
     or new.permisos is distinct from old.permisos
     or new.permisos_proyecto is distinct from old.permisos_proyecto
     or new.organizacion is distinct from old.organizacion
  then
    raise exception 'Solo puedes cambiar tu nombre y tus iniciales';
  end if;
  return new;
end;
$$;
revoke execute on function validar_autoedicion_usuario() from anon, authenticated;

-- Comprobación en la misma transacción, con el mismo criterio de #290: si
-- alguna de las funciones nuevas quedó con el permiso universal, esta
-- migración FALLA en vez de dejar un agujero abierto.
do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas from permiso_ejecucion_abierto;
  if v_abiertas > 0 then
    raise exception '#339/#290 — quedaron % función(es) con el permiso universal', v_abiertas;
  end if;
  raise notice '#339 — comprobado: las funciones nuevas nacen cerradas.';
end $$;

-- Comprobación (opcional, para dejar constancia al aplicar): la tabla no debe
-- devolver ninguna fila que la vista no tenga, en ninguna sesión.
--
--   select u.id from usuario u
--   where u.id not in (select v.id from usuario_visible v);
--
-- Y las dos expresiones de la regla tienen que coincidir:
--
--   select pg_get_expr(polqual, polrelid) from pg_policy
--    where polname = 'usuario_select';
--   select pg_get_viewdef('public.usuario_visible'::regclass, true);
--
-- La compuerta automatiza las dos.
