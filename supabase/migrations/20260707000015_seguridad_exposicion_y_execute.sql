-- =====================================================================
-- Correcciones de seguridad post-auditoría (tanda 2)
--
-- 3 (M2): que la API no devuelva permisos ni correo de terceros.
--   a) acceso_proyecto: un miembro solo ve SU propio acceso; admin y dueño
--      ven todos (el dueño los necesita para Miembros y para configurar a
--      sus clientes). Cierra la fuga de la columna `permisos` entre miembros.
--   b) usuario: se revoca el SELECT directo de la tabla y se expone la lista
--      por una VISTA (`usuario_visible`) que enmascara `email` (oculto a
--      clientes) y `permisos_proyecto` (solo admin/uno mismo). Se conservan
--      los nombres/iniciales para mostrar responsables y para el RETURNING de
--      las altas. De paso cierra una exposición a `anon` (la cláusula
--      rol='admin' devolvía filas de admin —con email— a no autenticados).
-- 6 (L2/L3): revocar EXECUTE de las funciones internas sin romper la RLS.
-- 10 (L7): decisión sobre el reordenamiento de estructura por miembros.
-- =====================================================================

-- ---- 3.a  acceso_proyecto: cada miembro solo ve su propio acceso ----
drop policy if exists acceso_select on acceso_proyecto;
create policy acceso_select on acceso_proyecto for select using (
  usuario_id = usuario_actual_id()      -- tu propio acceso (lo usa makeCan)
  or es_admin()                         -- admin: visibilidad completa
  or es_dueno_proyecto(proyecto_id)     -- dueño: gestiona a sus clientes (§7 lista, §5 config)
);

-- ---- 3.b  usuario: vista con enmascarado de email y permisos ---------
-- Se revoca el SELECT de la tabla base y se conceden SOLO las columnas no
-- sensibles (nombres/rol/estado), que se necesitan para pintar responsables
-- y para el RETURNING de INSERT en las altas.
revoke select on usuario from anon, authenticated;
grant select (id, nombre, iniciales, rol, activo, auth_id) on usuario to authenticated;

-- Vista con permisos del PROPIETARIO (omite la RLS de la tabla base, por eso
-- el WHERE replica exactamente la visibilidad de usuario_select). El email se
-- muestra a admin, a uno mismo y al personal (consultor); nunca a un cliente
-- sobre terceros. `permisos_proyecto` solo a admin y a uno mismo.
drop view if exists usuario_visible;
create view usuario_visible with (security_invoker = false) as
  select
    u.id, u.nombre, u.iniciales, u.rol, u.activo, u.auth_id,
    case when es_admin() or u.auth_id = auth.uid() or rol_actual() = 'consultor'
         then u.email else null end as email,
    case when es_admin() or u.auth_id = auth.uid()
         then u.permisos_proyecto else '{}'::jsonb end as permisos_proyecto
  from usuario u
  where es_admin() or u.auth_id = auth.uid() or u.rol = 'admin' or comparte_proyecto(u.id);

grant select on usuario_visible to authenticated;

-- Nota de alcance (§7 / M2): la fuga sensible entre miembros —los permisos de
-- tarea por acceso— queda cerrada por 3.a. El correo se sigue mostrando al
-- personal (admin/consultor) porque la interfaz lo usa (Miembros, Usuarios);
-- a un cliente ya no se le entrega el correo de terceros. Enmascarar el correo
-- también para el personal exigiría cambiar lo que hoy muestra la interfaz.

-- =====================================================================
-- 6 · Revocar EXECUTE de funciones internas (L2/L3), sin romper la RLS.
-- =====================================================================

-- Funciones de TRIGGER: se disparan por el trigger, nunca por llamada directa.
-- Revocar a anon y authenticated cierra su superficie de RPC sin efecto.
revoke execute on function registrar_replanificacion()   from anon, authenticated;
revoke execute on function validar_cambios_frente()       from anon, authenticated;
revoke execute on function validar_cambios_subfrente()    from anon, authenticated;
revoke execute on function validar_permisos_tarea()       from anon, authenticated;
revoke execute on function aplicar_default_acceso()       from anon, authenticated;
revoke execute on function aplicar_default_consultor()    from anon, authenticated;
revoke execute on function default_dueno_proyecto()       from anon, authenticated;
revoke execute on function vincular_usuario_auth()        from anon, authenticated;

-- Predicados de la RLS: la evaluación de las políticas los llama como el rol
-- que consulta, así que NO se revoca a `authenticated` (rompería la RLS). Solo
-- se revoca a `anon` (sin sesión, no evalúa estas políticas en la práctica).
revoke execute on function es_admin()                         from anon;
revoke execute on function usuario_actual_id()                from anon;
revoke execute on function rol_actual()                       from anon;
revoke execute on function es_dueno_proyecto(uuid)            from anon;
revoke execute on function es_invitado_proyecto(uuid)         from anon;
revoke execute on function tiene_acceso_proyecto(uuid)        from anon;
revoke execute on function permiso_proyecto(text)             from anon;
revoke execute on function permisos_en(uuid)                  from anon;
revoke execute on function permiso_bool_en(uuid, text)        from anon;
revoke execute on function permiso_tarea_en(uuid, text, uuid) from anon;
revoke execute on function invitado_puede_editar_algo_en(uuid, uuid) from anon;
revoke execute on function proyecto_de_subfrente(uuid)        from anon;  -- L3
revoke execute on function es_cliente(uuid)                   from anon;
revoke execute on function comparte_proyecto(uuid)           from anon;

-- RPC legítimas: las usa el usuario autenticado desde la app; revocar a anon.
revoke execute on function replanificar_tarea(uuid, date, uuid) from anon;
revoke execute on function desplanificar_tarea(uuid, uuid)      from anon;

-- =====================================================================
-- 10 · Reordenamiento de estructura por miembros (L7) — DECISIÓN.
-- Se mantiene DELIBERADAMENTE: mover el `orden` de frentes/sub frentes es una
-- interacción colaborativa (arrastre) disponible a los miembros del proyecto;
-- no expone ni destruye datos, solo cambia el orden de presentación. El
-- trigger sigue restringiendo el RENOMBRE a admin/dueño. No se añade
-- restricción para no arriesgar la RLS ya validada (compuerta 31/31).
-- =====================================================================
