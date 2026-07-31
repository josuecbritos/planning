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

**Migración 20 — `20260707000020_tiempo_real_notificaciones.sql` (#255)**
- Publica `notificacion` —y SOLO esa tabla— en la publicación
  `supabase_realtime`. Realtime evalúa las políticas de RLS DEL SUSCRIPTOR
  para INSERT/UPDATE: el canal entrega a cada quien exactamente lo que la
  lectura normal le entregaría.
- REPLICA IDENTITY queda en DEFAULT **a propósito**: Realtime no aplica RLS a
  los DELETE (la fila ya no existe), así que lo único que puede viajar en
  ellos es lo que la replica identity incluya. Con DEFAULT es la clave
  primaria — un uuid opaco. Con FULL sería la fila completa, repartida a
  cualquier autenticado suscrito: una fuga silenciosa.
- La compuerta trae el caso "el canal de tiempo real no reparte de más": tres
  oyentes simultáneos sobre una notificación real (destinatario, otro usuario
  sin filtro y el admin sin filtro); solo el destinatario debe recibirla.

**Migración 21 — `20260707000021_tiempo_real_datos.sql` (#260)**
- Suma a la publicación las siete tablas de datos (`tarea`, `frente`,
  `sub_frente`, `proyecto`, `acceso_proyecto`, `comentario`,
  `replanificacion`), todas con REPLICA IDENTITY en DEFAULT — mismo
  razonamiento que la 20. `usuario` queda fuera a sabiendas.
- Sin filtro de servidor en el cliente para estas tablas: la barrera es la RLS
  por membresía, que Realtime evalúa con el JWT del suscriptor.
- La compuerta amplía el caso del canal: `tarea` como representante de la
  familia de datos — el MIEMBRO del proyecto de prueba recibe el INSERT; el no
  miembro, suscrito sin filtro, cero INSERT/UPDATE.

**Migración 22 — `20260707000022_reponer_cadena_visibilidad.sql` (#281)**
- Repone la definición canónica de `es_dueno_proyecto`, `es_invitado_proyecto`,
  `tiene_acceso_proyecto`, `comparte_proyecto` (tal como las dejó la migración
  12, con el régimen de EXECUTE de la 15) y de la vista `usuario_visible` (tal
  como la dejó la 18). Las migraciones del repo encadenan bien —verificado
  reproduciendo 1→21 en un Postgres 16 limpio: la vista entrega a todos los
  miembros y no expone a nadie de proyectos no compartidos—, así que el defecto
  de #281 (un consultor veía solo al admin y a sí mismo) solo puede venir de
  una **base desplegada divergente**: una función en versión anterior o una
  migración aplicada fuera de orden.
- Antes de reponer, **imprime con RAISE NOTICE las definiciones vivas**: la
  salida del SQL Editor al aplicarla es el registro de qué había desplegado.
- Deja también cerrado el hueco de la compuerta que dejó pasar esto: solo se
  comprobaba el AISLAMIENTO de `usuario_visible` (que nadie vea de más), nunca
  la ENTREGA (que un miembro vea a sus co-miembros). Ver caso nuevo abajo.
- **Desenlace (registro):** al aplicarla, el respaldo `pg_dump` previo mostró
  que toda esta cadena YA estaba canónica en la base desplegada — el defecto
  persistió y la pieza divergente resultó ser otra: la política
  `acceso_select` (ver migración 24). La 22 queda como red de seguridad
  idempotente sobre la cadena.

**Migración 24 — `20260707000024_reponer_politica_acceso.sql` (#281, causa raíz)**
- La política `acceso_select` desplegada era una **versión vieja**, ajena al
  registro de migraciones: `usuario_id = usuario_actual_id() OR es_admin() OR
  es_dueno_proyecto(proyecto_id)` — un INVITADO veía solo su propia fila de
  acceso. El selector de responsables exige dos entregas (la persona por
  `usuario_visible` Y su fila por `acceso_proyecto`); la primera funcionaba,
  la segunda no — de ahí el síntoma "solo yo y el dueño". Se detectó
  comparando el respaldo `pg_dump` contra la migración 12, después de que la
  22 descartara con evidencia la cadena de funciones.
- Repone la versión de la migración 12: `usuario_id = usuario_actual_id() or
  tiene_acceso_proyecto(proyecto_id)` — superconjunto de la vieja: nadie
  pierde visibilidad; los invitados recuperan la de los co-miembros.
  `acceso_insert`/`update`/`delete` estaban idénticas al repo y no se tocan.
- Moraleja para el runbook: las políticas se reponen con drop+create — una
  política vieja NO la pisa ningún `create or replace` posterior; si se
  sospecha divergencia, comparar TAMBIÉN las políticas del dump, no solo
  funciones y vistas.

**Migración 25 — `20260707000025_eliminar_usuario_rpc.sql` (#286)**
- **Regla de PostgreSQL que causó el defecto, y que conviene tener presente
  al escribir políticas:** en un UPDATE, si quien ejecuta tiene derechos de
  SELECT sobre la tabla, las políticas de **SELECT se aplican como WITH CHECK
  sobre la fila NUEVA**. Es deliberado —impide dejar una fila en un estado
  que uno ya no podría ver— y significa que **una política de SELECT
  restrictiva puede bloquear escrituras legítimas**, no solo lecturas. Aquí:
  `usuario_select` exige `not eliminado` (migración 19), así que marcar
  `eliminado = true` se rechazaba con «new row violates row-level security
  policy» — para todos, admin incluido.
- El borrado lógico pasa a la RPC `eliminar_usuario(uuid)`, SECURITY DEFINER
  con `search_path` fijo: el MISMO patrón que `crear_o_reactivar_usuario`
  (migración 16), su operación inversa, y por la misma razón — tiene que
  tocar filas que la política y la vista ocultan. La autorización se replica
  DENTRO (`es_admin()`, idéntica a lo que ya exigía la política para este
  caso): **no amplía quién puede modificar `usuario`**. RPC legítima del
  autenticado: se revoca EXECUTE solo a `anon` (invariante 5).
- **No se relajó `usuario_select`.** Habría "arreglado" el UPDATE a costa de
  exponer eliminados a los admins, rompiendo el invariante de #248 (la tabla
  no expone más que la vista) y una decisión del producto. Grants intactos:
  las mismas seis columnas, `email` sigue fuera.
- La compuerta suma el caso que faltaba: la cara POSITIVA del borrado — un
  admin elimina a un usuario **sin `auth_id`** (el perfil de las cuentas del
  reporte), desaparece de `usuario_visible`, no reaparece con "ver
  desactivados", se recupera dando de alta el mismo correo, y un no-admin es
  rechazado por la RPC.

**Migración 23 — `20260707000023_notificaciones_por_acceso.sql` (#283)**
- La política de `notificacion` (select y update) suma la condición
  `tiene_acceso_proyecto(proyecto_de_tarea(tarea_id))` al
  `usuario_id = usuario_actual_id()` que ya tenía: la ENTREGA de una
  notificación queda condicionada a que su destinatario hoy tenga acceso al
  proyecto de la tarea — el mismo criterio del resto de la app. Al perder el
  acceso las notificaciones no se borran: dejan de entregarse, y vuelven con
  su leída/no leída intacto si el acceso se restituye (misma lógica que los
  accesos guardados de un usuario desactivado).
- `proyecto_de_tarea` es SECURITY DEFINER (como `proyecto_de_subfrente`):
  dentro de una política, un subquery corre con la RLS del que consulta, y el
  recorrido tarea → sub frente → frente debe hacerse por debajo de ella. Es
  predicado de RLS: `authenticated` conserva EXECUTE (invariante 5); revocado
  a `anon`.
- La condición va TAMBIÉN en el update: sin ella, un "marcar todas como
  leídas" marcaría las ocultas y al reincorporar al usuario volverían leídas.
- La FK `tarea_id … on delete cascade` (migración 16) garantiza que la tarea
  de una notificación existe mientras la notificación exista: no hace falta
  rama para "tarea borrada".
- Tiempo real: los eventos de INSERT/UPDATE se filtran con la RLS del
  suscriptor, así que quien no tiene acceso tampoco recibe el aviso por el
  canal — coherente con lo que puede leer.

**Migración 26 — `20260707000026_vistas_guardadas.sql` (#289)**
- Tabla nueva `vista_guardada` (dueño, contexto, nombre, filtro, orden): las
  vistas guardadas dejan `localStorage` y siguen al usuario a cualquier
  computador. RLS habilitada; las CUATRO políticas son
  `usuario_id = usuario_actual_id()`, ninguna `USING (true)` y **sin bypass de
  admin a propósito**: una vista es preferencia personal, no dato del
  proyecto. `revoke all ... from anon` + grants acotados a `authenticated`.
- El dueño lo pone la BASE (`default usuario_actual_id()`), nunca el cliente
  — mismo criterio que el autor del historial y de las notificaciones—, y la
  política `with check` impide crear una vista a nombre de otro aunque el
  `usuario_id` venga forzado desde el navegador.
- **No crea ninguna función**, así que no hay EXECUTE que revocar. *(Nota que
  deja el pedido y conviene tener presente: en Postgres las funciones nacen
  ejecutables por `public`, y revocar solo a `anon` no basta. Revisarlo en las
  funciones ya existentes es trabajo aparte, fuera del alcance de #289.)*
- El puntero a "en qué vista estabas", el tema y el modo/ancho de la barra
  lateral **siguen en el navegador**, por máquina: son decisiones del pedido.
- La compuerta trae el caso nuevo: otro usuario no ve, no modifica ni borra
  una vista ajena, y no puede crear una a nombre de otro.

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
12. **Notificaciones privadas (#137) y condicionadas al acceso (#283).**
    `notificacion` scopea a su dueño Y al proyecto: `select`/`update` con
    `using (usuario_id = usuario_actual_id() and
    tiene_acceso_proyecto(proyecto_de_tarea(tarea_id)))` (migración 23) — nunca
    `USING (true)`, y la condición de acceso va en AMBAS políticas (sin ella en
    el update, "marcar leídas" pisaría el estado de las ocultas).
    **Sin política de insert/delete**: las generan triggers
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
20. **El canal de tiempo real respeta la RLS, y una tabla solo se publica con
    su RLS verificada (#255).** La publicación `supabase_realtime` define qué
    tablas emiten cambios por WebSocket; agregar una tabla ahí es abrirle un
    canal de salida a sus filas, filtrado por las políticas de RLS del
    suscriptor (INSERT/UPDATE) — así que NUNCA publicar una tabla cuya RLS no
    esté validada por la compuerta. Los DELETE son la excepción: Realtime no
    les aplica RLS, y lo que viaja lo decide REPLICA IDENTITY — por eso las
    tablas publicadas se quedan en DEFAULT (solo la clave primaria; FULL
    repartiría la fila entera a cualquier autenticado). Del lado del cliente,
    los eventos son AVISOS, no datos: la verdad se relee de la base
    (`data/tiempoReal.ts`, principio 1 del pedido); ningún código debe
    construir estado a partir del contenido de un evento. La entrega 2 (#260)
    sumó las siete tablas de datos a esta misma publicación y a esta misma
    cañería, con estos mismos tres candados; en ellas no hay filtro de
    servidor a propósito — la barrera es la RLS por membresía. Cualquier tabla
    futura entra igual: RLS validada, replica identity DEFAULT, eventos como
    avisos.

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
- **Caso de #255/#260**: `probarCanalTiempoReal` abre canales simultáneos
  sobre `notificacion` y sobre `tarea`, y genera el hecho real completo (el
  admin crea un proyecto de prueba, hace MIEMBRO al consultor A y le asigna
  una tarea). En `notificacion`: solo el destinatario recibe el INSERT; cero
  INSERT/UPDATE para otro usuario sin filtro y para el admin sin filtro (la
  política no tiene bypass de admin y el canal debe respetarlo). En `tarea`
  (representante de la familia de datos, que comparte los predicados de
  membresía): el miembro recibe el INSERT; el no miembro, suscrito sin filtro,
  cero. Requiere Realtime activo y las migraciones 20 y 21 aplicadas.
- **Caso de #248**: `compararTablaContraVista` pide `usuario` (la tabla) y
  `usuario_visible` (la vista) con la misma sesión y exige que la tabla no
  devuelva ninguna fila que la vista no tenga. Si el grant acotado se revocara
  del todo, la lectura falla y el caso se da por bueno igual: sin lectura
  directa no hay nada que comparar.
- **Caso de #281/#283**: `probarMiembrosYNotificaciones` arma un proyecto de
  prueba con dos cuentas como miembros (invitadas por el admin) y comprueba lo
  que a la compuerta le faltaba: la **entrega** — cada miembro VE al otro por
  `usuario_visible`, y el INVITADO ve las **filas de acceso** de sus
  co-miembros por `acceso_proyecto` (hasta esta ronda solo se probaba el
  aislamiento, y la base con la `acceso_select` vieja pasaba la compuerta
  entera — ese era el hueco por el que #281 llegó a producción). Con una
  notificación real de asignación recorre además el ciclo completo de #283:
  se entrega con acceso, se oculta al quitarlo, "marcar leída" no la alcanza
  mientras está oculta, y al devolver el acceso reaparece sin leer.

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
