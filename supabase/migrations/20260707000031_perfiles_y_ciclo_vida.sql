-- =====================================================================
-- #300 y #301 — Cambiar el perfil de un usuario, y qué significan
-- archivar y eliminar.
--
-- Migración ADITIVA: no edita ninguna ya aplicada. Reemplaza dos funciones
-- por `create or replace` (`eliminar_usuario`, `crear_o_reactivar_usuario`)
-- y agrega dos nuevas (`cambiar_rol_usuario`, `validar_cambio_rol`).
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`.
--
-- ---------------------------------------------------------------------
-- LA REGLA QUE ESTABLECE #301
--
--   Archivar PAUSA y se deshace.  Eliminar CORTA, y lo que vuelve es
--   alguien nuevo con el mismo correo.
--
-- Hasta ahora las dos cosas significaban casi lo mismo: `eliminar_usuario`
-- solo marcaba `activo = false, eliminado = true`, así que la persona
-- conservaba su cuenta de acceso, su perfil y sus accesos a proyectos. Por
-- eso, al dar de alta ese correo otra vez, volvía con el perfil anterior y
-- sin correo de invitación —`invitar-usuario` rechaza a quien ya tiene
-- `auth_id`—, que es el síntoma reportado.
--
-- LO QUE NO CAMBIA, a propósito (§3 del pedido):
--   · La FILA del usuario se conserva al eliminar. Es lo que sostiene que su
--     nombre siga en tareas, comentarios e historial: eso es registro.
--   · Las TAREAS asignadas se conservan en los dos casos, con las iniciales
--     apagadas (regla #229). Soltarlas dejaría tareas huérfanas y borraría
--     de la vista quién era responsable de qué.
--   · Un correo eliminado que vuelve reutiliza esa misma fila, así que
--     RECUPERA sus tareas asignadas si se le devuelve el acceso al proyecto.
--     Consecuencia aceptada por el pedido.
--
-- LO QUE NO SE TOCA, y es una decisión tomada en este pedido:
--   · Las políticas de `acceso_proyecto` quedan IGUAL. Su `es_cliente(
--     usuario_id)` vive dentro de la rama del dueño-consultor, no de la del
--     admin: un ADMIN ya puede retirar o ajustar el acceso de un consultor
--     (`es_admin()` es el primer disyuntor de las tres políticas), que es lo
--     que pide el criterio 3. Y ese `es_cliente` es justamente la regla que
--     impide que un consultor meta consultores en sus proyectos (migración
--     12, deliberado). Consecuencia asumida: el dueño de un proyecto no
--     podrá retirarle el acceso a un invitado que pasó a consultor; eso lo
--     hace un administrador, coherente con que invitar consultores ya sea
--     cosa de administradores.
--   · El bloqueo de inicio de sesión de un archivado YA existía en el
--     cliente (`auth/supabaseAuth.ts`: tras autenticar se exige un perfil
--     activo, y si no lo hay se cierra la sesión con el mensaje de #244).
--     No hace falta nada en la base para eso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · ELIMINAR corta: revoca identidad, suelta accesos y limpia el perfil
-- ---------------------------------------------------------------------
/**
 * Borrado LÓGICO de un usuario. La fila se conserva —sostiene el registro—,
 * pero la persona deja de existir como identidad de la herramienta:
 *
 *   · `auth_id = null`  — se suelta el vínculo con la cuenta de acceso. La
 *     cuenta de Auth propiamente dicha la revoca la Edge Function
 *     `eliminar-usuario`, que es donde vive el Admin API; acá no se toca el
 *     esquema `auth` (hacerlo por SQL sería saltarse el sistema de
 *     autenticación). Soltar el vínculo es además lo que hace que un alta
 *     posterior del mismo correo SÍ reciba invitación: `invitar-usuario`
 *     rechaza a quien ya tiene `auth_id`, y ese era el síntoma reportado.
 *   · Sus filas de `acceso_proyecto` se retiran.
 *   · `permisos_proyecto` se vacía: los poderes de consultor no sobreviven.
 *
 * SECURITY DEFINER por la razón de #286: `usuario_select` exige
 * `not eliminado`, y PostgreSQL aplica las políticas de SELECT como WITH
 * CHECK sobre la fila nueva de un UPDATE. La autorización se replica dentro.
 */
create or replace function eliminar_usuario(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then
    raise exception 'Sin permiso para eliminar usuarios';
  end if;

  if not exists (select 1 from usuario where id = p_usuario) then
    raise exception 'El usuario no existe';
  end if;

  -- #301: eliminar SUELTA los accesos. Archivar no (esa es la diferencia).
  delete from acceso_proyecto where usuario_id = p_usuario;

  update usuario
    set activo = false,
        eliminado = true,
        auth_id = null,
        permisos_proyecto = '{}'::jsonb
    where id = p_usuario;
end;
$$;

-- ---------------------------------------------------------------------
-- 2 · Dar de alta un correo ELIMINADO es un alta nueva
-- ---------------------------------------------------------------------
/**
 * Alta que reactiva si el correo ya existe. La novedad de #301 está en
 * distinguir los dos casos que antes se trataban igual:
 *
 *   · La fila estaba DESACTIVADA (archivada): se reactiva conservándolo
 *     todo —perfil, accesos, permisos—, como hasta ahora. Archivar se
 *     deshace.
 *   · La fila estaba ELIMINADA: es alguien NUEVO con el mismo correo. Toma
 *     el perfil que se elige en el alta (no el anterior), arranca sin
 *     permisos de consultor —el trigger `trg_default_consultor` le pone los
 *     de su rol si corresponde— y sin proyectos heredados.
 *
 * El `delete from acceso_proyecto` de acá es para las filas eliminadas
 * ANTES de esta migración, que conservaron sus accesos bajo la regla vieja:
 * sin él, un correo eliminado el mes pasado volvería con los proyectos de
 * su vida anterior. No es un backfill de la tabla —solo alcanza a la fila
 * que se está dando de alta—, así que no toca datos de nadie más.
 */
create or replace function crear_o_reactivar_usuario(
  p_nombre text, p_iniciales text, p_email text, p_rol text
) returns usuario language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_row usuario;
begin
  if not (
    es_admin()
    or (rol_actual() = 'consultor' and permiso_proyecto('invitarClientes') and p_rol = 'cliente')
  ) then
    raise exception 'Sin permiso para crear usuarios';
  end if;

  select * into v_row from usuario where lower(email) = v_email;
  if found then
    if not v_row.eliminado and v_row.activo then
      raise exception 'Ya existe un usuario activo con ese correo';
    end if;

    if v_row.eliminado then
      -- Alta NUEVA sobre la misma fila: nada de la vida anterior sobrevive
      -- salvo el registro (tareas, comentarios, historial).
      delete from acceso_proyecto where usuario_id = v_row.id;
      update usuario
        set eliminado = false, activo = true,
            nombre = p_nombre, iniciales = p_iniciales,
            rol = p_rol,
            permisos_proyecto = '{}'::jsonb
        where id = v_row.id
        returning * into v_row;
    else
      -- Reactivación de un archivado: conserva perfil, accesos y permisos.
      update usuario
        set eliminado = false, activo = true,
            nombre = p_nombre, iniciales = p_iniciales
        where id = v_row.id
        returning * into v_row;
    end if;
    return v_row;
  end if;

  insert into usuario (nombre, iniciales, email, rol)
    values (p_nombre, p_iniciales, v_email, p_rol)
    returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 3 · #300 — Cambiar el perfil entre consultor y cliente
-- ---------------------------------------------------------------------
/**
 * Un ADMIN cambia el perfil de un usuario entre `consultor` y `cliente`.
 *
 * Las cinco salvaguardas, todas dentro de la función porque la restricción
 * tiene que vivir en la base y no solo en la pantalla:
 *
 *   1. Solo un admin.
 *   2. Solo entre consultor y cliente. El perfil de ADMINISTRADOR queda
 *      fuera en los dos sentidos: no se promueve ni se degrada desde aquí.
 *      (Se evaluó incluirlo y se descartó: abre el riesgo de quedarse sin
 *      ningún administrador.)
 *   3. Nadie cambia el suyo propio, ni un admin.
 *   4. Pasar a cliente se BLOQUEA si es dueño de algún proyecto, y el
 *      mensaje dice cuántos: un cliente no puede ser dueño, y el traspaso de
 *      proyectos no existe todavía (#302).
 *   5. Un usuario eliminado no cambia de perfil: ya no es nadie.
 *
 * Qué pasa con lo que tenía:
 *   · Sus ACCESOS a proyectos se conservan tal cual, con los mismos
 *     permisos. El acceso no depende del perfil —`es_invitado_proyecto`
 *     solo mira si existe la fila— y los ocho permisos viven en esa fila.
 *   · A consultor: `permisos_proyecto` se vacía y el trigger
 *     `trg_default_consultor` le aplica los de `default_permisos_proyecto()`.
 *     No se le suben los permisos de los proyectos ajenos donde es invitado:
 *     ser consultor no da derechos sobre proyectos de otros.
 *   · A cliente: pierde los poderes de consultor (crear proyectos, invitar
 *     clientes…), que es justamente lo que un cliente no debe tener.
 */
create or replace function cambiar_rol_usuario(p_usuario uuid, p_rol text)
returns usuario language plpgsql security definer set search_path = public as $$
declare
  v_row usuario;
  v_propios integer;
begin
  if not es_admin() then
    raise exception 'Sin permiso para cambiar el perfil de un usuario';
  end if;

  if p_rol not in ('consultor', 'cliente') then
    raise exception 'El perfil solo se cambia entre consultor y cliente';
  end if;

  select * into v_row from usuario where id = p_usuario;
  if not found then
    raise exception 'El usuario no existe';
  end if;

  if v_row.eliminado then
    raise exception 'El usuario fue eliminado';
  end if;

  if v_row.id = usuario_actual_id() then
    raise exception 'No puedes cambiar tu propio perfil';
  end if;

  if v_row.rol = 'admin' then
    raise exception 'El perfil de administrador no se cambia desde aquí';
  end if;

  if v_row.rol = p_rol then
    return v_row; -- nada que hacer
  end if;

  if p_rol = 'cliente' then
    select count(*) into v_propios from proyecto where creado_por = p_usuario;
    if v_propios > 0 then
      raise exception
        'No se puede pasar a cliente: es dueño de % proyecto(s). Traspasa esos proyectos a otro consultor antes de cambiar el perfil.',
        v_propios;
    end if;
  end if;

  -- `permisos_proyecto` se vacía en los dos sentidos. Para consultor, el
  -- trigger `trg_default_consultor` —que dispara con `rol` en el SET— lo
  -- rellena con los de su rol; para cliente, vacío es lo correcto.
  update usuario
    set rol = p_rol,
        permisos_proyecto = '{}'::jsonb
    where id = p_usuario
    returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 4 · El perfil NO se cambia con un UPDATE directo
-- ---------------------------------------------------------------------
/**
 * Sin esto, un admin podría cambiar su propio perfil —o el de otro admin—
 * con una petición PATCH a `usuario`: `validar_autoedicion_usuario` deja
 * pasar a los admins sin mirar qué columna tocan.
 *
 * SECURITY INVOKER a propósito, igual que su hermana: necesita ver el
 * `current_user` REAL. Una petición del cliente entra como `authenticated`;
 * `cambiar_rol_usuario` —que ya trae las cinco salvaguardas— entra como el
 * dueño de la función, y por eso pasa.
 */
create or replace function validar_cambio_rol()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rol is not distinct from old.rol then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  raise exception 'El perfil se cambia con cambiar_rol_usuario, no con un update directo';
end;
$$;
revoke execute on function validar_cambio_rol() from public, anon, authenticated;

drop trigger if exists trg_validar_cambio_rol on usuario;
create trigger trg_validar_cambio_rol before update of rol on usuario
  for each row execute function validar_cambio_rol();

-- ---------------------------------------------------------------------
-- 5 · Permisos de ejecución (#290)
-- ---------------------------------------------------------------------
-- Toda función NACE con EXECUTE concedido a PUBLIC: se cierra primero y
-- después se concede a quien la necesita. `create or replace` conserva el
-- ACL de las que ya existían, pero se reafirma igual (es idempotente).
revoke execute on function cambiar_rol_usuario(uuid, text) from public, anon;
revoke execute on function eliminar_usuario(uuid) from public, anon;
revoke execute on function crear_o_reactivar_usuario(text, text, text, text) from public, anon;

grant execute on function cambiar_rol_usuario(uuid, text) to authenticated, service_role;
grant execute on function eliminar_usuario(uuid) to authenticated, service_role;
grant execute on function crear_o_reactivar_usuario(text, text, text, text) to authenticated, service_role;

-- Comprobación: ninguna de las tres queda abierta a todos.
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('cambiar_rol_usuario', 'eliminar_usuario',
                      'crear_o_reactivar_usuario', 'validar_cambio_rol')
    and array_to_string(coalesce(p.proacl, '{}'), ',') like '%=X%'
    and array_to_string(coalesce(p.proacl, '{}'), ',') like '%{=X%';
  if v_abiertas is not null then
    raise exception 'Quedaron funciones con EXECUTE para PUBLIC: %', v_abiertas;
  end if;
end;
$$;
