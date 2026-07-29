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

**Migración 19 — `20260707000019_usuario_eliminado_fuera_de_la_tabla.sql` (#248)**
- `usuario_select` suma `not eliminado`: la lectura directa de la tabla deja de
  exponer lo que `usuario_visible` oculta. El grant de la migración 15 concede
  columnas, no filas; las filas las decide la política, y esa no miraba
  `eliminado`. Aplica a todos, admin incluido — igual que la vista desde #136.
- Acompañada en el front: `eliminarUsuario` deja de usar `UPDATE ... RETURNING`
  (Postgres aplica las políticas de SELECT también a las filas devueltas) y
  comprueba el borrado releyendo `usuario_visible`.
- La compuerta trae un caso nuevo: "la tabla `usuario` no expone más que la
  vista", corrido para el admin y para cada rol.

**Edge Functions — endurecimiento de #249 (redeploy manual de las tres)**
- Sin orígenes configurados (`SITE_URL` / `SITE_URLS` vacíos) la función
  **rechaza** con `503` en vez de caer en `'*'`.
- Los errores internos se registran en el servidor y al cliente le llega un
  mensaje genérico en español; los mensajes útiles del flujo no cambian.

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
   **La tabla tampoco expone más que la vista** (#248, migración 19): la
   migración 15 revocó el SELECT completo pero dejó un grant acotado a seis
   columnas no sensibles —lo necesita el `RETURNING` de los INSERT—, y un GRANT
   concede **columnas, no filas**; las filas las decide `usuario_select`, que no
   miraba `eliminado`. Ahora sí (`not eliminado`, para todos, admin incluido).
   Consecuencia a no olvidar: Postgres aplica las políticas de SELECT también a
   las filas de un `RETURNING`, así que **ningún `UPDATE ... RETURNING` puede
   pedir de vuelta la fila que acaba de marcar `eliminado`** — `eliminarUsuario`
   comprueba el efecto releyendo `usuario_visible`. La compuerta trae un caso
   nuevo que compara tabla contra vista, rol por rol.
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
7. **Política de contraseñas:** mínimo ≥10 con letras y números, aplicada en
   **las dos** Edge Functions que fijan contraseña (`aceptar-invitacion` y
   `recuperar-contrasena`). No bajarlo. El front comparte la regla en
   `src/lib/password.ts`, pero esa es de conveniencia: la que manda es la del
   servidor.
8. **CORS por lista de orígenes** en las Edge Functions, nunca `'*'`: `SITE_URL`
   más lo que traiga el secret opcional `SITE_URLS` (separado por comas). La
   respuesta refleja el `Origin` **solo si está en la lista**; cualquier otro
   recibe `SITE_URL` y el navegador lo bloquea. `SITE_URLS` existe para las URL
   de preview de Vercel, que son otro dominio: sin ella, probar los flujos de
   correo en un preview falla con un error que parece de conexión. No poner ahí
   dominios que no sean de este proyecto. **Si la lista queda vacía la función
   RECHAZA la petición** (#249): responde `503` sin cabecera
   `Access-Control-Allow-Origin` y deja constancia en los logs. Antes caía en un
   `'*'` de emergencia — precisamente el caso en que la configuración falta es
   cuando menos se puede confiar en quien llama. No reintroducir ese fallback.
   **Secretos solo server-side** (`RESEND_API_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, etc. nunca en el front; el front usa solo la
   `anon key`).
9. **Headers de `vercel.json`:** no quitarlos. Si se agrega un origen externo
   (p. ej. otro API), ajustar la CSP para permitirlo — la CSP debe seguir
   permitiendo `*.supabase.co` y las fuentes usadas.
10. **RLS habilitada en las 11 tablas con datos** (`usuario`, `proyecto`,
    `frente`, `sub_frente`, `tarea`, `replanificacion`, `acceso_proyecto`,
    `comentario`, `invitacion`, `notificacion`, `recuperacion`). Nunca una
    política `USING (true)`.
11. **Migraciones aditivas:** los cambios de base van como **archivos nuevos** en
    `supabase/migrations/`; no editar migraciones ya aplicadas.
12. **Notificaciones privadas (#137).** `notificacion` scopea a su dueño:
    `select`/`update` con `using (usuario_id = usuario_actual_id())` — nunca
    `USING (true)`. **Sin política de insert/delete**: las generan triggers
    (`notif_asignacion`, `registrar_replanificacion`, `notif_comentario` —que
    desde #208 cubre también las menciones—,
    SECURITY DEFINER con `search_path` fijo y sin `EXECUTE` para
    anon/authenticated, invariante 6) y se borran en cascada con la tarea. El
    autor sale de la sesión (`usuario_actual_id()` / `app.actor`), nunca del
    cliente. La compuerta verifica ambas cosas.
13. **Archivar/eliminar proyectos exige permiso en la base (#133/#134).** El
    trigger `validar_estado_proyecto` bloquea el cambio de `estado` salvo
    `es_admin()` o `permiso_proyecto('archivarEliminarProyectos')`; no basta con
    ocultar el botón en la UI.
14. **Los tokens de recuperación viven en `recuperacion`, NUNCA en
    `invitacion` (#205).** `invitacion.usada` significa "esta persona aceptó su
    invitación" y de eso depende el invariante 2; mezclar ahí los tokens de
    recuperación lo debilitaría sin que se note. `recuperacion` tiene RLS
    habilitada y **cero políticas**: solo la Edge Function la toca, con
    service_role. El flujo **no crea cuentas** — exige que `usuario.auth_id` ya
    exista—, así que no reabre el registro público (invariante 1). El enlace
    dura 1 hora, es de un solo uso y al consumirlo cierra todas las sesiones
    de esa cuenta.
15. **La auto-edición del perfil está acotada por un trigger, no por la UI
    (#207).** `usuario_update` pasó de "solo admin" a "admin o mi propia fila";
    lo que impide la escalada de privilegio es `validar_autoedicion_usuario`,
    que para un no-admin rechaza cualquier cambio en `rol`, `permisos`,
    `permisos_proyecto`, `activo`, `eliminado`, `email`, `auth_id` o `id`. Es
    **SECURITY INVOKER a propósito**: mira `current_user` para distinguir una
    petición del cliente (rol `authenticated`) de un UPDATE hecho dentro de una
    función SECURITY DEFINER como `crear_o_reactivar_usuario`. No convertirlo en
    DEFINER: perdería esa distinción y rompería el alta que reactiva usuarios.
16. **Un comentario lo edita SOLO su autor, y nadie lo borra (#209).**
    `comentario_update` usa `autor_id = usuario_actual_id()` **sin** la salida
    de emergencia `es_admin()` que tiene el resto del modelo: el hilo acompaña
    al registro de replanificaciones y es el respaldo de por qué pasó lo que
    pasó. No hay política de delete. El trigger `validar_edicion_comentario`
    congela `autor_id`, `tarea_id` y `timestamp`, y es quien pone la marca de
    editado (nunca el cliente).
17. **Los destinatarios de una mención se derivan del texto en la base
    (#208).** `notif_comentario` extrae los `@[uuid]` del comentario, comprueba
    con `usuario_tiene_acceso` que cada mencionado pueda ver el proyecto y solo
    entonces notifica; el cliente nunca manda una lista de destinatarios (es el
    invariante 4 aplicado a menciones). Menciones y responsable se resuelven en
    **un solo trigger** para garantizar una notificación por persona: con dos
    triggers la regla dependería del orden en que Postgres los dispara.
18. **Las Edge Functions no devuelven detalles internos (#249).** Un error de
    Auth, la respuesta de Resend o una excepción se **registran en el servidor**
    (`console.error` con el prefijo de la función; se leen en Edge Functions →
    Logs) y al cliente le llega un mensaje genérico en español que dice qué
    hacer. Lo que sí viaja son los mensajes que le sirven a quien mira la
    pantalla —"Esta invitación ya fue usada", "El enlace expiró", "Sin permiso
    para invitar"—: esos son parte del producto, no una fuga. La regla al
    escribir un `return` de error nuevo: si el texto sale de un objeto de error
    ajeno (`err.message`, el body de un fetch), va al log, no a la respuesta.
19. **El login no revela qué correos tienen cuenta (#252).** Un intento fallido
    responde siempre "Correo o contraseña incorrectos", sin distinguir si el
    correo no existe, si la contraseña está mal o si la cuenta no tiene ficha en
    `usuario`. Distinguirlos —por texto, por tiempo o por código— permitiría
    enumerar cuentas probando direcciones. Tampoco llega nunca el mensaje del
    servicio de autenticación: se clasifica por el `status`/`code` de la
    respuesta y se muestra uno de los textos fijos, y lo no previsto sale como
    genérico. La cuenta desactivada SÍ se distingue, pero solo **después** de
    autenticar correctamente: ahí quien pregunta ya demostró conocer la
    contraseña, así que no hay nada que enumerar.

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
  **Excepción, la migración 19 (#248):** va **después** del front. Ahí la
  dependencia se invierte —el front nuevo aguanta las dos políticas, el viejo se
  rompe con la nueva por el `RETURNING`—, así que aplicarla antes abriría la
  ventana rota en vez de cerrarla. La regla general no cambia; se comprueba en
  cada migración de qué lado está la dependencia.
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
- Resultado esperado actual: **0 fallas** (34 comprobaciones + una por rol
  disponible del caso nuevo de #248, así que el total sube según cuántas
  credenciales `RLS_*` estén configuradas).
- El script lee `usuario_visible` (invariante 3), tanto en `perfilDe` como en la
  consulta base del admin.
- **Caso de #248**: `compararTablaContraVista` pide `usuario` (la tabla) y
  `usuario_visible` (la vista) con la misma sesión y exige que la tabla no
  devuelva ninguna fila que la vista no tenga. Si el grant acotado se revocara
  del todo, la lectura falla y el caso se da por bueno igual: sin lectura
  directa no hay nada que comparar.

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
