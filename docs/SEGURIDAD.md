# Seguridad — Andotek Planning

**Estado:** cerrado, aplicado y validado (compuerta **34/34**). **Propósito:** dejar
registrado qué se hizo en seguridad y —sobre todo— **los invariantes que todo
cambio futuro debe respetar**. Este es el documento de referencia de seguridad
del proyecto: **antes de tocar RLS, funciones de permisos, Edge Functions de
auth o el despliegue, leerlo.**

Cadena de trabajo: auditoría de solo lectura (`auditoria-seguridad.md`) →
correcciones (migraciones 14/15 + Edge Functions + `vercel.json`) → runbook
(`runbook-seguridad.md`) → compuerta (`scripts/validar-rls.mjs`).

---

## 1. Resumen

Auditoría de seguridad sobre el código definitivo (roles/RLS + alta por correo):
**1 crítico** (a verificar), **4 medios**, **7 menores**, **0 huecos de datos de
proyecto**. El crítico (registro público de Auth) se **verificó apagado**. Las
correcciones se aplicaron en dos migraciones (14 y 15), redeploy de las dos
Edge Functions y un `vercel.json`, y se validaron con la compuerta de RLS
(**34/34, 0 fallas**).

---

## 2. Cambios aplicados

**Migración 14 — `20260707000014_seguridad_auth_y_historial.sql`**
- `vincular_usuario_auth`: el enlace `auth.users` ↔ `usuario` exige una
  **invitación usada** (ya no basta con que coincida el email).
- `replanificar_tarea` / `desplanificar_tarea`: el autor del historial
  (`cambiado_por`) se deriva de `usuario_actual_id()`; se ignora el `p_actor`
  del cliente.
- `search_path` fijo en 6 funciones (`aplicar_default_consultor`,
  `replanificar_tarea`, `ajustar_dia_habil`, `normalizar_fechas_tarea`,
  `default_permisos_proyecto`, `default_permisos_tareas`).

**Migración 15 — `20260707000015_seguridad_exposicion_y_execute.sql`**
- `acceso_select` acotada (cada miembro ve solo su propio acceso; admin y dueño
  ven todos).
- Vista **`usuario_visible`** con `email` / `permisos_proyecto` enmascarados, y
  **revocación del SELECT directo sobre la tabla `usuario`** desde el cliente.
  De paso cierra una exposición a `anon` (la cláusula `rol='admin'` devolvía
  filas de admin, con email, a no autenticados).
- `REVOKE EXECUTE` de las funciones de trigger (a `anon` y `authenticated`) y de
  los predicados/RPC (solo a `anon`), sin romper la RLS.
- Decisión documentada: reordenar frentes/sub frentes sigue permitido a
  miembros; el renombre sigue restringido a admin/dueño.

**Edge Functions (redepliegadas)**
- `aceptar-invitacion`: marca la invitación como **usada antes** de crear la
  cuenta; contraseña **≥10 con letras y números**; CORS acotado a `SITE_URL`;
  rate limiting best-effort. Corre **sin Verify JWT** (por diseño: el invitado
  no tiene sesión; el token es la única llave).
- `invitar-usuario`: CORS acotado a `SITE_URL`. Verifica al invocador por JWT
  (admin, o consultor con `invitarClientes` para clientes de sus proyectos).

**Despliegue**
- `vercel.json` con headers: CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`.

---

## 3. Invariantes de seguridad — NO romper en cambios futuros

Son las reglas que hacen segura la aplicación. Cualquier cambio que las viole
reintroduce un hallazgo de la auditoría.

1. **Registro público de Auth = OFF.** "Allow new users to sign up"
   (Authentication → Sign In / Providers) debe permanecer desactivado. El único
   alta es vía `aceptar-invitacion` (service_role + token).
2. **Enlace auth↔usuario solo con invitación usada.** No debilitar
   `vincular_usuario_auth` para que enlace solo por email.
3. **La tabla `usuario` no se lee directo desde el cliente.** Usar la vista
   **`usuario_visible`** (enmascara `email` y `permisos_proyecto` para no-admin,
   y **filtra los `eliminado`**, #136). Todo código de front, script o
   herramienta que necesite la lista de usuarios debe leer la vista, no la tabla.
   La app (`supabaseRepo`, `supabaseAuth`) y la compuerta (`perfilDe` y la
   consulta base del admin) ya usan la vista. El alta que reactiva a un
   `eliminado` (por correo, invisible para el cliente) va por el RPC
   `crear_o_reactivar_usuario` (SECURITY DEFINER que replica la autorización de
   `usuario_insert`); no relajar esa autorización interna.
4. **El autor del historial de replanificación se deriva de la sesión**
   (`usuario_actual_id()`), nunca de un parámetro enviado por el cliente.
5. **Predicados de la RLS conservan `EXECUTE` para `authenticated`.** Funciones
   como `es_admin`, `es_cliente`, `es_dueno_proyecto`, `es_invitado_proyecto`,
   `tiene_acceso_proyecto`, `rol_actual`, `usuario_actual_id`, `permiso_proyecto`,
   `permiso_bool_en`, `permiso_tarea_en`, `permisos_en`,
   `invitado_puede_editar_algo_en`, `comparte_proyecto`: **NO revocar `EXECUTE` a
   `authenticated`** — la evaluación de las políticas RLS las llama como el rol
   que consulta y revocar rompería la RLS. A lo sumo revocar a `anon`.
6. **Funciones de trigger sin `EXECUTE` para `anon`/`authenticated`** (se disparan
   por trigger, no por RPC).
7. **Política de contraseñas:** mínimo ≥10 con letras y números en
   `aceptar-invitacion`. No bajarlo.
8. **CORS acotado a `SITE_URL`** en las Edge Functions; **secretos solo
   server-side** (`RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc. nunca en el
   front; el front usa solo la `anon key`).
9. **Headers de `vercel.json`:** no quitarlos. Si se agrega un origen externo
   (p. ej. otro API), ajustar la CSP para permitirlo — la CSP debe seguir
   permitiendo `*.supabase.co` y las fuentes usadas.
10. **RLS habilitada en las 10 tablas con datos** (`usuario`, `proyecto`,
    `frente`, `sub_frente`, `tarea`, `replanificacion`, `acceso_proyecto`,
    `comentario`, `invitacion`, `notificacion`). Nunca una política `USING (true)`.
11. **Migraciones aditivas:** los cambios de base van como **archivos nuevos** en
    `supabase/migrations/`; no editar migraciones ya aplicadas.
12. **Notificaciones privadas (#137).** `notificacion` scopea a su dueño:
    `select`/`update` con `using (usuario_id = usuario_actual_id())` — nunca
    `USING (true)`. **Sin política de insert/delete**: las generan triggers
    (`notif_asignacion`, `registrar_replanificacion`, `notif_comentario`,
    SECURITY DEFINER con `search_path` fijo y sin `EXECUTE` para
    anon/authenticated, invariante 6) y se borran en cascada con la tarea. El
    autor sale de la sesión (`usuario_actual_id()` / `app.actor`), nunca del
    cliente. La compuerta verifica ambas cosas.
13. **Archivar/eliminar proyectos exige permiso en la base (#133/#134).** El
    trigger `validar_estado_proyecto` bloquea el cambio de `estado` salvo
    `es_admin()` o `permiso_proyecto('archivarEliminarProyectos')`; no basta con
    ocultar el botón en la UI.

---

## 4. Cómo aplicar cambios de base (flujo sin CLI)

El proyecto se opera **desde el dashboard**, no con la CLI de Supabase:
- **Migraciones:** pegar el SQL del archivo en el **SQL Editor** y ejecutarlo.
- **Edge Functions:** editar/deploy desde **Edge Functions** (confirmar que
  `aceptar-invitacion` queda con **Verify JWT desactivado**).
- **Frontend + `vercel.json`:** se despliegan al mergear a `main` (Vercel).
  **Orden obligatorio:** aplicar las migraciones de base **antes** de mergear el
  frontend, porque el front nuevo depende de objetos de la base (p. ej.
  `usuario_visible`).
- **Respaldo previo:** `pg_dump` (Session pooler, contraseña sin corchetes) antes
  de cada cambio estructural. El plan gratuito no trae backups automáticos.

---

## 5. Compuerta de RLS — obligatoria

`scripts/validar-rls.mjs` consulta la API rol por rol y confirma que la RLS
**impide** el acceso indebido (no solo que la UI lo oculta). **Debe pasar antes
de invitar usuarios reales y después de cualquier cambio de RLS, políticas o
funciones de permisos.**

- Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, y las credenciales `RLS_ADMIN_*`
  (obligatoria) + `RLS_CONSULTOR_A_*`, `RLS_CONSULTOR_B_*`, `RLS_CLIENTE_*` (para
  cobertura completa).
- Correr local: `node --env-file=.env scripts/validar-rls.mjs`. También corre por
  GitHub Actions (workflow **"Validar RLS (compuerta)"**, ya en Node 22).
- Resultado esperado actual: **34/34, 0 fallas**.
- El script lee `usuario_visible` (invariante 3), tanto en `perfilDe` como en la
  consulta base del admin.

---

## 6. Pendientes conocidos (no bloquean el lanzamiento)

- **Requieren plan Pro de Supabase** (hoy gratuito): **Leaked Password Protection**
  (HaveIBeenPwned; la política de contraseñas por código ya está: ≥10 con letras
  y números) y **backups automáticos** (hoy: `pg_dump` manual).
- **M4 — Vite 8:** `npm audit` marca `vite` (high) y `esbuild` (moderate), ambas
  **devDependencies** que solo afectan al server de desarrollo, no a producción.
  Subir a Vite 8 es un cambio mayor; se planifica aparte. No correr
  `npm audit fix --force`.
- **Limpieza:** cuentas de prueba (Auth + perfiles: `consultor.a@`, `consultor.b@`,
  `cliente@andotek.cl`) y secretos `RLS_...` de GitHub, cuando ya no se usen.

## 7. Hallazgos aceptados/documentados (no son bugs)

- **L7** — reordenar frentes/sub frentes está permitido a cualquier miembro con
  acceso (interacción de arrastre); el renombre sigue restringido a admin/dueño.
  Decisión deliberada.
- **§3 (correo del personal)** — el correo se sigue mostrando al personal
  (admin/consultor), porque la interfaz lo usa (Miembros/Usuarios); a un cliente
  ya no se le entrega el correo ni los permisos de terceros. La fuga sensible
  (permisos de tarea entre miembros) queda cerrada a nivel de fila.
- **L5/L6** — CORS y rate limiting quedaron en su versión endurecida mínima;
  suficientes para el contexto.
