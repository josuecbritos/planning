-- =====================================================================
-- 33 · Un consultor suma a un colega de su organización (#353)
--
-- EL OBJETIVO, en una frase:
--
--   Un consultor con el permiso correspondiente puede sumar a un colega de
--   su misma organización a un proyecto suyo, quitarlo, y configurar sus
--   permisos en ese proyecto — sin pasar por el administrador.
--
-- #339 abrió la VISIBILIDAD —dos consultores de la misma organización se ven
-- entre sí— pero no tocó ninguna de las reglas que gobiernan la ACCIÓN para la
-- que esa visibilidad servía. Las tres políticas de `acceso_proyecto` seguían
-- diciendo `es_cliente(usuario_id)` dentro de la rama del dueño-consultor
-- (migración 12), así que un consultor no notaba ninguna diferencia.
--
-- Esta migración:
--   1 · acota la organización a los CONSULTORES —en la base, no solo en la
--       pantalla— y limpia la que hubiera quedado en otros perfiles;
--   2 · cambia el "solo clientes" de las tres políticas por "clientes o
--       colegas de mi organización";
--   3 · publica la lista de agregables COMO FUNCIÓN, para que la pantalla no
--       vuelva a escribir la regla por su cuenta.
--
-- Lo que NO cambia:
--   · La membresía sigue protegiendo los datos. Ver a un colega no da acceso
--     a ningún proyecto ni tarea.
--   · Quién puede CREAR usuarios. Esto es sobre agregar a un proyecto.
--   · El administrador sigue siendo global.
--   · Un cliente no gana nada.
--   · La regla de VISIBILIDAD de #339 no se toca: sigue viviendo en dos
--     lugares y diciendo lo mismo (la comprobación de la migración 32 se
--     vuelve a correr acá).
--   · Los permisos por defecto de quien recibe un acceso.
--   · El nombre de los permisos en la BASE (`invitarClientes`,
--     `configurarPermisosClientes`): lo que cambia es lo que dice la pantalla
--     y lo que habilitan. Renombrar el dato obligaría a reescribir cada fila
--     de `permisos_proyecto` sin ganar nada.
--
-- ADITIVA: no borra ni reescribe ninguna migración anterior.
--
-- ANTES DE APLICAR: respaldo del dueño (`pg_dump`). El plan gratuito no tiene
-- respaldos automáticos.
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que trae
-- un caso propio para la regla nueva (§ "#353").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · La organización es cosa de consultores
-- ---------------------------------------------------------------------
-- Se ofrecía para cualquier perfil, también para los clientes, donde no hace
-- absolutamente nada: la regla de #339 solo une consultores. Es un campo que
-- invita a asignar una empresa y esperar un efecto que no ocurre.
--
-- La que hubiera quedada asignada a un no-consultor SE BORRA, no se ignora:
-- guardada e invisible, cambiar después el perfil de esa persona a consultor
-- ACTIVARÍA esa organización sola, dándole una visibilidad que nadie decidió.
update usuario set organizacion = null where rol <> 'consultor' and organizacion is not null;

-- Y la base tampoco la acepta de vuelta, por ningún camino. Va en el trigger
-- que ya normaliza la columna en vez de en un CHECK: el CHECK también miraría
-- las filas que cambian de `rol` sin tocar `organizacion` —el cambio de perfil
-- a cliente, por ejemplo— y las haría fallar en vez de limpiarlas.
create or replace function normalizar_organizacion()
returns trigger language plpgsql set search_path = public as $$
begin
  new.organizacion := nullif(btrim(new.organizacion), '');
  -- #353: solo un consultor puede llevar organización. Si el perfil no es
  -- consultor, la columna queda vacía — se limpia en vez de rechazar, porque
  -- este trigger también corre cuando lo que cambia es el PERFIL: pasar a
  -- alguien a cliente tiene que quitarle la organización, no fallar.
  if new.rol is distinct from 'consultor' then
    new.organizacion := null;
  end if;
  return new;
end;
$$;
revoke execute on function normalizar_organizacion() from public;
revoke execute on function normalizar_organizacion() from anon, authenticated;

-- El disparador pasa a mirar TAMBIÉN el rol: antes solo despertaba cuando el
-- UPDATE tocaba `organizacion`, así que un cambio de perfil a cliente dejaba
-- la organización puesta.
drop trigger if exists trg_normalizar_organizacion on usuario;
create trigger trg_normalizar_organizacion
  before insert or update of organizacion, rol on usuario
  for each row execute function normalizar_organizacion();

-- ---------------------------------------------------------------------
-- 2 · A quién puede sumar el dueño de un proyecto
-- ---------------------------------------------------------------------
/** ¿`p_usuario` es un colega —consultor de MI misma organización— de quien
 *  pregunta?
 *
 *  Es la misma condición que `misma_organizacion` de #339, y por eso NO se
 *  duplica: se apoya en ella. Ahí está escrito una sola vez que hacen falta
 *  dos consultores, que los dos tengan organización y que sea la misma.
 *
 *  Separarla en una función propia igual tiene sentido: lo que #339 preguntaba
 *  era "¿lo VEO?" y lo que esta migración pregunta es "¿lo puedo AGREGAR?".
 *  Hoy la respuesta coincide; el día que una de las dos cambie, el nombre dice
 *  cuál es cuál. */
create or replace function es_colega_de_organizacion(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select misma_organizacion(p_usuario);
$$;
revoke execute on function es_colega_de_organizacion(uuid) from public;
revoke execute on function es_colega_de_organizacion(uuid) from anon;
grant execute on function es_colega_de_organizacion(uuid) to authenticated;

/** ¿A quién puede el DUEÑO de un proyecto darle o quitarle acceso?
 *
 *  A un cliente —como hasta hoy— o a un colega de su misma organización. A
 *  nadie más: un consultor de otra organización, o sin organización, queda
 *  fuera. El administrador no pasa por acá; es el primer disyuntor de las tres
 *  políticas y puede con cualquiera.
 *
 *  Existe como UNA función y no como una condición repetida tres veces porque
 *  la regla es una sola: quien puede sumar a alguien puede quitarlo y puede
 *  configurarlo. Escribirla tres veces es la forma segura de que se separen. */
create or replace function puede_dar_acceso_a(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_cliente(p_usuario) or es_colega_de_organizacion(p_usuario);
$$;
revoke execute on function puede_dar_acceso_a(uuid) from public;
revoke execute on function puede_dar_acceso_a(uuid) from anon;
grant execute on function puede_dar_acceso_a(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3 · Las tres políticas de `acceso_proyecto`
-- ---------------------------------------------------------------------
-- Idénticas a las de la migración 12 salvo por el reemplazo de
-- `es_cliente(usuario_id)` por `puede_dar_acceso_a(usuario_id)`. `acceso_select`
-- NO se toca (la repuso la migración 24 y no tiene nada que ver con esto).

drop policy if exists acceso_insert on acceso_proyecto;
-- Agregar: admin (a cualquiera); o dueño con el permiso, a un cliente o a un
-- colega de su organización.
create policy acceso_insert on acceso_proyecto for insert with check (
  es_admin()
  or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('invitarClientes')
      and puede_dar_acceso_a(usuario_id))
);

drop policy if exists acceso_update on acceso_proyecto;
-- Configurar los permisos del acceso: admin; o dueño con SU permiso, sobre las
-- mismas personas. Sin esto, un consultor podría sumar a un colega y quedarse
-- sin poder ajustarle nada, teniendo que pedírselo al administrador — que es
-- justo lo que este pedido viene a evitar.
create policy acceso_update on acceso_proyecto for update
  using (
    es_admin()
    or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('configurarPermisosClientes')
        and puede_dar_acceso_a(usuario_id))
  )
  with check (
    es_admin()
    or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('configurarPermisosClientes')
        and puede_dar_acceso_a(usuario_id))
  );

drop policy if exists acceso_delete on acceso_proyecto;
-- Quitar: las mismas reglas que agregar, como hasta hoy.
create policy acceso_delete on acceso_proyecto for delete using (
  es_admin()
  or (es_dueno_proyecto(proyecto_id) and permiso_proyecto('invitarClientes')
      and puede_dar_acceso_a(usuario_id))
);

-- ---------------------------------------------------------------------
-- 4 · La lista de agregables la entrega LA BASE
-- ---------------------------------------------------------------------
/** Los usuarios que quien pregunta puede sumar a `p_proyecto`, ya filtrados.
 *
 *  La pantalla no decide a quién puede agregar el dueño: recibe la lista. La
 *  regla de quién puede ser agregado ya vive en la política que autoriza la
 *  operación; si además el navegador la calculara por su cuenta, quedaría
 *  escrita en dos lugares y tarde o temprano se separan.
 *
 *  Devuelve las MISMAS columnas que `usuario_visible`, con el mismo
 *  enmascarado: la organización de otro sigue siendo un dato del
 *  administrador (#339), y el navegador no la necesita para armar la lista.
 *
 *  La condición es, literalmente, la de `acceso_insert`. */
create or replace function usuarios_agregables(p_proyecto uuid)
returns setof usuario_visible language sql stable security definer set search_path = public as $$
  select v.*
  from usuario_visible v
  where v.activo
    and v.id <> coalesce((select creado_por from proyecto where id = p_proyecto), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (
      select 1 from acceso_proyecto a
      where a.proyecto_id = p_proyecto and a.usuario_id = v.id
    )
    and (
      es_admin()
      or (es_dueno_proyecto(p_proyecto) and permiso_proyecto('invitarClientes')
          and puede_dar_acceso_a(v.id))
    );
$$;
revoke execute on function usuarios_agregables(uuid) from public;
revoke execute on function usuarios_agregables(uuid) from anon;
grant execute on function usuarios_agregables(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5 · Comprobaciones en la misma transacción
-- ---------------------------------------------------------------------
-- #290: toda función nueva nace con EXECUTE para PUBLIC y `revoke ... from
-- anon` NO la cierra —anon lo conserva por esa vía—. La trampa reaparece con
-- cada función nueva, así que la migración falla si dejó alguna abierta.
do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas from permiso_ejecucion_abierto;
  if v_abiertas > 0 then
    raise exception '#353/#290 — quedaron % función(es) con el permiso universal', v_abiertas;
  end if;
  raise notice '#353 — comprobado: las funciones nuevas nacen cerradas.';
end $$;

-- #339: la regla de visibilidad no se tocó, pero se vuelve a comprobar. Es
-- barato y atrapa cualquier divergencia que hubiera entrado por otro lado.
do $$
declare v_ok boolean;
begin
  select coinciden into v_ok from regla_visibilidad_usuario;
  if not v_ok then
    raise exception '#353/#339 — la política `usuario_select` y la vista `usuario_visible` no dicen lo mismo';
  end if;
  raise notice '#353 — comprobado: la regla de visibilidad sigue diciendo lo mismo en los dos lugares.';
end $$;

-- Criterio 16c: ningún usuario que no sea consultor queda con organización.
do $$
declare v_sobran int;
begin
  select count(*) into v_sobran from usuario where rol <> 'consultor' and organizacion is not null;
  if v_sobran > 0 then
    raise exception '#353 — quedaron % usuario(s) que no son consultores con organización guardada', v_sobran;
  end if;
  raise notice '#353 — comprobado: la organización quedó solo en consultores.';
end $$;
