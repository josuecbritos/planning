-- =====================================================================
-- #293 — Mover tareas arrastrándolas: las reglas de la base.
--
-- El pedido agrega el gesto de tomar una tarea con el mouse y soltarla en
-- otra posición — dentro de su sub frente o en otro sub frente del mismo
-- proyecto. La interfaz pone el gesto; ESTA migración pone las dos reglas
-- que tienen que vivir en la base, no solo en la pantalla:
--
--   1. REORDENAR dentro del sub frente (solo cambia `orden`) lo puede
--      hacer CUALQUIER MIEMBRO del proyecto, sin permiso especial. Es la
--      misma decisión ya tomada para frentes y sub frentes (migración 12:
--      "update alcanzable para miembros; los invitados solo mueven
--      orden"): el orden no expone ni destruye datos, solo cambia la
--      presentación. Hoy la política `tarea_update` exige tener ALGÚN
--      permiso de edición, así que un miembro sin permisos no podía ni
--      corregir el orden — se amplía al espejo exacto de `frente_update`.
--      La ampliación es segura porque el trigger `validar_permisos_tarea`
--      valida CAMPO A CAMPO todo lo demás (título, responsable, hecha,
--      fechas, archivada… y ahora el sub frente): la fila queda alcanzable,
--      los datos no.
--
--   2. MOVER a otro sub frente (cambia `sub_frente_id`) exige el permiso
--      `editarTareas`, con su alcance evaluado contra el responsable
--      PREVIO al cambio — igual que el resto del trigger. No se crea
--      ningún permiso nuevo: cambiar dónde vive la tarea es del mismo
--      orden que cambiarle el título, ya cubierto por `editarTareas`.
--      Hasta hoy el trigger NO mencionaba `sub_frente_id`: cualquier
--      invitado con cualquier permiso de edición podía cambiar el sub
--      frente por petición directa. Ese es el hueco que se cierra.
--
-- Además, para un INVITADO el destino tiene que ser un sub frente DEL
-- MISMO PROYECTO. La interfaz solo ofrece destinos a la vista (el
-- proyecto abierto), pero la petición directa podía apuntar a cualquier
-- sub frente donde el invitado tuviera algún acceso; se cierra también en
-- la base. Admin y dueño quedan fuera de esta restricción, como de todas
-- las del trigger (principio rector: hacen todo dentro de lo suyo).
--
-- QUÉ NO HACE mover una tarea: no escribe en el historial de
-- replanificaciones (el trigger de historial solo mira `fecha_objetivo`,
-- que no cambia) y no genera notificación (ninguna función de
-- notificación mira `sub_frente_id` ni `orden`). No hay nada que apagar:
-- se verificó que ya es así, y la compuerta lo comprueba.
--
-- POLÍTICAS: drop + create, nunca "reemplazo" — una política vieja no se
-- pisa sola (lección de #281, documentada en SEGURIDAD.md).
--
-- ANTES DE APLICAR: respaldo con `pg_dump` (DEPLOY.md §Mantenimiento).
-- DESPUÉS DE APLICAR: correr la compuerta `scripts/validar-rls.mjs`, que
-- trae los casos nuevos del movimiento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · La política de UPDATE queda alcanzable para todo miembro — espejo
--     de `frente_update` (migración 12). El trigger valida campo a campo.
-- ---------------------------------------------------------------------

drop policy if exists tarea_update on tarea;
create policy tarea_update on tarea for update
  using (tiene_acceso_proyecto(proyecto_de_subfrente(sub_frente_id)))
  with check (tiene_acceso_proyecto(proyecto_de_subfrente(sub_frente_id)));

-- ---------------------------------------------------------------------
-- 2 · `validar_permisos_tarea` — cuerpo de la migración 12, intacto salvo
--     el bloque NUEVO de `sub_frente_id` (numeral 2 de la cabecera).
-- ---------------------------------------------------------------------

create or replace function validar_permisos_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proyecto uuid;
begin
  v_proyecto := proyecto_de_subfrente(old.sub_frente_id);
  -- Principio rector (2): admin y dueño hacen todo dentro del proyecto.
  if es_admin() or es_dueno_proyecto(v_proyecto) then return new; end if;

  -- #293: mover la tarea a otro sub frente = editarTareas (contra el
  -- responsable PREVIO, como todo el trigger), y solo dentro del proyecto.
  if new.sub_frente_id is distinct from old.sub_frente_id then
    if not permiso_tarea_en(v_proyecto, 'editarTareas', old.responsable_id) then
      raise exception 'Sin permiso para mover la tarea de sub frente';
    end if;
    if proyecto_de_subfrente(new.sub_frente_id) is distinct from v_proyecto then
      raise exception 'La tarea solo puede moverse dentro de su proyecto';
    end if;
  end if;

  if (new.titulo is distinct from old.titulo
      or new.descripcion is distinct from old.descripcion
      or new.comentarios is distinct from old.comentarios)
     and not permiso_tarea_en(v_proyecto, 'editarTareas', old.responsable_id) then
    raise exception 'Sin permiso para editar la tarea';
  end if;

  if new.responsable_id is distinct from old.responsable_id
     and not permiso_tarea_en(v_proyecto, 'asignarResponsable', old.responsable_id) then
    raise exception 'Sin permiso para cambiar el responsable';
  end if;

  if (new.hecha is distinct from old.hecha or new.fecha_real is distinct from old.fecha_real)
     and not permiso_tarea_en(v_proyecto, 'marcarHechas', old.responsable_id) then
    raise exception 'Sin permiso para marcar tareas como hechas';
  end if;

  if new.fecha_objetivo is distinct from old.fecha_objetivo
     and not permiso_tarea_en(v_proyecto, 'editarFechas', old.responsable_id) then
    raise exception 'Sin permiso para editar fechas';
  end if;

  if new.archivada is distinct from old.archivada
     and not permiso_tarea_en(v_proyecto, 'archivarEliminar', old.responsable_id) then
    raise exception 'Sin permiso para archivar tareas';
  end if;

  return new;
end;
$$;

-- El trigger `trg_validar_permisos_tarea` ya apunta a esta función; el
-- CREATE OR REPLACE lo deja usando el cuerpo nuevo sin recrearlo.

-- #290: `create or replace` conserva el ACL previo, pero se cierra contra
-- `public` explícito por si alguna base desplegada arrastra el grant
-- implícito de Postgres. Es función de trigger: nadie la llama directo.
revoke execute on function validar_permisos_tarea() from public;
