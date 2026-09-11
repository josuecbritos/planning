# Guía de despliegue — de la rama a la URL productiva

Pasos para dejar la herramienta corriendo con Supabase real y una URL
accesible para el equipo y los clientes (sección 9 del Documento Funcional).
Tiempo estimado: 30–45 minutos. Costo: $0 (capas gratuitas).

---

## Paso 1 — Crear el proyecto Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Elige nombre (ej. `planificador`), contraseña de base de datos (guárdala) y
   región (para Chile: `South America (São Paulo)` es la más cercana).
3. Espera ~2 minutos a que el proyecto quede listo.

## Paso 2 — Aplicar el esquema

En el panel de Supabase → **SQL Editor** → New query. Pega y ejecuta **en este
orden** el contenido de:

1. `supabase/migrations/20260707000001_init.sql` — tablas, trigger de historial, RPC
2. `supabase/migrations/20260707000002_fase2_auth.sql` — auth, límite 2 admins, RLS
3. `supabase/migrations/20260707000003_fase3_archivo.sql` — archivo de canceladas
4. `supabase/migrations/20260707000004_fix_rls_insert_proyecto.sql` — fix: creación
   de proyectos violaba RLS (políticas de SELECT reescritas con expresión directa)
5. `supabase/migrations/20260707000005_comentarios.sql` — comentarios acumulables
   por tarea (hilo append-only; migra el texto legado de `tarea.comentarios`)
6. `supabase/migrations/20260707000006_estados_y_fechas.sql` — la tarea nace sin
   fecha (la primera fecha fija el compromiso inicial, sin historial) y ninguna
   fecha puede caer en fin de semana (se ancla al día hábil más cercano)
7. `supabase/migrations/20260707000007_estados_v2.sql` — modelo de estados v2:
   la replanificación solo cuenta si la fecha movida vence hoy o ya venció; la
   fecha original acompaña durante la planificación y se congela en la primera
   replanificación; se permiten fechas de fin de semana (reemplaza el punto 6)
8. `supabase/migrations/20260707000008_permisos_cliente.sql` — permisos por
   cliente (jsonb + RLS por permiso + trigger de validación campo a campo)
9. `supabase/migrations/20260707000009_invitaciones.sql` — tabla de invitaciones
   (token de 7 días, un solo uso)
10. `supabase/migrations/20260707000010_estandar_planificacion.sql` — estándar de
    planificación por clics: se permite desplanificar (borrar la fecha de) una
    tarea futura, pero una tarea que vence hoy o ya venció no puede quedar sin
    fecha (solo marcarse lista o replanificarse)
11. `supabase/migrations/20260707000011_desplanificar_deshace.sql` — RPC
    `desplanificar_tarea`: borrar la marca de una tarea replanificada deshace la
    última replanificación (vuelve a la fecha anterior y elimina ese registro
    del historial); sin historial, deja la tarea sin planificar
12. `supabase/migrations/20260707000012_roles_y_permisos.sql` — rol consultor,
    dueño de proyecto, accesos con set de permisos por proyecto; RLS reescrita
    (admin / consultor dueño / invitado / cliente)
13. `supabase/migrations/20260707000013_fix_replan_fecha_origen.sql` — la
    replanificación solo cuenta si la fecha movida vence hoy o ya venció
14. `supabase/migrations/20260707000014_seguridad_auth_y_historial.sql` — enlace
    auth↔usuario solo con invitación usada; autor del historial desde la sesión
15. `supabase/migrations/20260707000015_seguridad_exposicion_y_execute.sql` —
    vista `usuario_visible` (enmascara `email`/`permisos_proyecto`); `EXECUTE`
    acotado (predicados conservan `authenticated`, triggers no)
16. `supabase/migrations/20260707000016_mejoras_desktop.sql` — proyecto
    activo/archivado con gate por permiso (#133); `usuario.eliminado` +
    `usuario_visible` lo filtra + RPC `crear_o_reactivar_usuario` (#136); tabla
    `notificacion` + RLS por dueño + triggers que la generan (#137)
17. `supabase/migrations/20260707000017_delete_solo_archivado.sql` — endurece
    `proyecto_delete`: solo se puede eliminar un proyecto **archivado** (la
    restricción "archivar primero" ahora vive en la base, no solo en la UI)
18. `supabase/migrations/20260707000018_cuenta_y_comentarios.sql` — cuenta de
    usuario y comentarios: tabla `recuperacion` para los enlaces de restablecer
    contraseña (1 hora, un solo uso, RLS sin políticas), auto-edición del propio
    nombre e iniciales acotada por trigger, `iniciales_manual` (las escritas a
    mano se respetan; las derivadas siguen al nombre), edición del propio
    comentario con marca de editado —sin borrado— y menciones `@` que notifican
    sin duplicar la notificación de comentario
19. `supabase/migrations/20260707000019_usuario_eliminado_fuera_de_la_tabla.sql` —
    la política `usuario_select` suma `not eliminado`: la lectura directa de la
    tabla `usuario` deja de exponer lo que la vista `usuario_visible` oculta
    (#248).
    ⚠️ **ÚNICA EXCEPCIÓN al orden "migración antes que front": esta va
    DESPUÉS.** El front nuevo (`eliminarUsuario` sin `RETURNING`, que comprueba
    el borrado releyendo `usuario_visible`) funciona con la política vieja y con
    la nueva; el front VIEJO se rompe con la política nueva —pediría de vuelta
    una fila que la política ya no deja ver, y mostraría "no se pudo eliminar"
    en un borrado que sí ocurrió—. Aplicarla después de que el front esté en
    producción no deja ninguna ventana rota.
20. `supabase/migrations/20260707000020_tiempo_real_notificaciones.sql` —
    tiempo real, entrega 1 (#255): publica `notificacion` (y SOLO esa tabla)
    en la publicación `supabase_realtime`, con REPLICA IDENTITY en DEFAULT a
    propósito (los DELETE viajan solo con la clave primaria; el porqué está
    en la cabecera del archivo). El orden con el front es indiferente: el
    front nuevo sin la migración simplemente no recibe eventos y funciona
    como siempre (degradación silenciosa), y el front viejo con la migración
    no escucha nada. Aplicar la migración cuando se quiera encender el vivo.
21. `supabase/migrations/20260707000021_tiempo_real_datos.sql` — tiempo real,
    entrega 2 (#260): suma a la publicación las siete tablas de datos —`tarea`,
    `frente`, `sub_frente`, `proyecto`, `acceso_proyecto`, `comentario`,
    `replanificacion`—, todas con REPLICA IDENTITY en DEFAULT (mismo
    razonamiento que la 20: los DELETE viajan solo con la clave primaria).
    `usuario` queda fuera a sabiendas. Igual que la 20, el orden con el front
    es indiferente: la migración es lo que enciende los datos en vivo.
22. `supabase/migrations/20260707000022_reponer_cadena_visibilidad.sql` —
    corrección de #281 (un consultor no veía a los demás miembros de su
    proyecto en el selector de responsable). Repone la definición canónica de
    la cadena `es_dueno_proyecto` / `es_invitado_proyecto` /
    `tiene_acceso_proyecto` / `comparte_proyecto` y de la vista
    `usuario_visible`: las migraciones del repo son correctas (verificado
    reproduciendo 1→21 en un Postgres limpio), así que el defecto solo puede
    estar en una base desplegada que divergió. Antes de reponer, **imprime
    (RAISE NOTICE) las definiciones vivas**. Sobre una base ya correcta es
    inofensiva. *(Resultado al aplicarla: el respaldo demostró que toda esta
    cadena YA estaba canónica en la base — la pieza divergente resultó ser la
    política `acceso_select`; ver migración 24.)*
23. `supabase/migrations/20260707000023_notificaciones_por_acceso.sql` —
    corrección de #283: la entrega de notificaciones queda condicionada al
    acceso al proyecto de la tarea (`tiene_acceso_proyecto(proyecto_de_tarea(...))`,
    el mismo criterio del resto de la app). Al quitar a alguien de un
    proyecto sus notificaciones de ahí dejan de llegarle (no se borran); si se
    lo vuelve a agregar, reaparecen con su leída/no leída intacto. La
    condición va también en el UPDATE ("marcar leídas") para no pisar el
    estado de las ocultas. El orden con el front es indiferente: el front de
    esta entrega replica el filtro para el modo Local y no depende de la
    política. **Correr la compuerta después.**
24. `supabase/migrations/20260707000024_reponer_politica_acceso.sql` — **la
    causa raíz de #281**, encontrada comparando el respaldo `pg_dump` contra
    las migraciones: la política `acceso_select` desplegada era una versión
    vieja (invitado ve solo SU fila de acceso; el selector de responsables
    exige ver las de todos los miembros). Repone la versión de la migración
    12 (`usuario_id = usuario_actual_id() or tiene_acceso_proyecto(...)`),
    que es un superconjunto de la vieja: nadie pierde visibilidad, los
    invitados recuperan la que faltaba. Las otras tres políticas de la tabla
    estaban idénticas al repo y no se tocan. **Correr la compuerta después**
    (trae el caso que atrapa exactamente esta divergencia).
25. `supabase/migrations/20260707000025_eliminar_usuario_rpc.sql` — corrige
    #286 (eliminar un usuario fallaba con «new row violates row-level
    security policy»). PostgreSQL aplica las políticas de SELECT como WITH
    CHECK sobre la fila NUEVA de un UPDATE cuando quien ejecuta tiene
    derechos de SELECT; como `usuario_select` exige `not eliminado`
    (migración 19), marcar `eliminado = true` se rechazaba solo. El borrado
    lógico pasa a la RPC `eliminar_usuario` (SECURITY DEFINER, mismo patrón
    que `crear_o_reactivar_usuario`, su inversa), con la autorización
    replicada adentro (`es_admin()`): **no amplía quién puede modificar
    `usuario`** y no toca políticas ni grants. Va **junto con el front de la
    misma entrega** (`supabaseRepo.eliminarUsuario` llama a la RPC): el front
    viejo con la migración aplicada sigue fallando igual que hoy, y el front
    nuevo sin la migración no encuentra la función. **Correr la compuerta
    después** (trae el caso nuevo: un admin elimina a un usuario sin
    `auth_id`, y un no-admin no puede).

26. `supabase/migrations/20260707000026_vistas_guardadas.sql` — #289: las
    vistas guardadas (filtro + orden con nombre) pasan de `localStorage` a la
    tabla nueva `vista_guardada`, atadas al usuario y al contexto (id de
    proyecto, o 'mis-tareas'), y siguen a la persona a cualquier computador.
    RLS habilitada con las cuatro políticas en `usuario_id =
    usuario_actual_id()` — nadie ve las de nadie, tampoco un admin—; `anon`
    sin privilegios. NO crea funciones. Va **junto con el front de la misma
    entrega**: el front nuevo sin la tabla no puede leer ni guardar vistas, y
    el front viejo con la tabla las sigue guardando en el navegador. **No hay
    traspaso de lo ya guardado**: cada quien vuelve a crear sus vistas una
    vez (decisión del pedido). **Correr la compuerta después** (caso nuevo:
    nadie lee ni modifica las vistas de otro).

27. `supabase/migrations/20260707000027_hoy_chile.sql` — #291: la base y la
    aplicación pasan a coincidir en qué día es hoy, y ese día es el de
    **Chile**. La base comparaba contra `current_date` (UTC en Supabase), así
    que desde las 20:00 de Chile ya creía que era el día siguiente y una tarea
    de MAÑANA le parecía comprometida: registraba **replanificaciones falsas**,
    congelaba una fecha original que nunca existió y bloqueaba desplanificar
    con "No puedes eliminar tareas que ya pasaron". Crea `hoy_chile()` —un
    único lugar, con la zona por NOMBRE (`America/Santiago`), que resuelve
    solo el cambio de hora— y redefine las tres funciones vigentes
    (`registrar_replanificacion`, `normalizar_fechas_tarea`,
    `desplanificar_tarea`) cambiando **únicamente** `current_date` por
    `hoy_chile()`. `EXECUTE` cerrado **contra `public`** (#290), con grant
    explícito a `authenticated` y `service_role`. El orden con el front es
    indiferente: no hay cambios de front en esta entrega.
    ✅ **Aplicada y con la compuerta corrida en verde** (31-jul-2026),
    incluido el caso nuevo de la ventana de la tarde.
    📋 Se corrió además
    `docs/consulta-291-replanificaciones-falsas.sql` en el SQL Editor —solo
    lectura, no borra nada—: **2 registros falsos sobre 16**. Se decidió **no
    corregir el histórico**; el detalle y su consecuencia (esas 2 tareas
    muestran un atraso mayor al real) quedan en la cabecera de esa consulta.

28. `supabase/migrations/20260707000028_mover_tarea.sql` — #293: reglas del
    movimiento de tareas (arrastrar y soltar). Dos cosas: la política
    `tarea_update` pasa a ser **alcanzable para todo miembro** del proyecto
    —espejo exacto de `frente_update` (migración 12): el trigger valida campo
    a campo, así que la ampliación solo libera el reordenamiento (`orden`)—;
    y el trigger `validar_permisos_tarea` suma el caso de **`sub_frente_id`**:
    moverse de sub frente exige `editarTareas` (alcance contra el responsable
    previo) y solo **dentro del mismo proyecto**. Hasta esta migración el
    trigger no mencionaba ese campo: cualquier invitado con cualquier permiso
    de edición podía cambiarlo por petición directa. Va **junto con el front
    de la misma entrega** (el front nuevo necesita la política ampliada para
    que un miembro sin permisos pueda reordenar); el front viejo con la
    migración funciona igual que siempre. **Correr la compuerta después**
    (casos nuevos del movimiento).

29. `supabase/migrations/20260707000029_hecha_sin_fecha.sql` — #294: la tarea
    sin fecha que se marca hecha queda con la fecha del día del marcado (la
    original igual: sin atraso), y al desmarcarla vuelve a quedar sin fecha;
    una que ya tenía fecha la conserva en ambos sentidos. Columna nueva
    `tarea.fecha_por_marcado` (interna, el cliente no la escribe) + redefine
    `normalizar_fechas_tarea` y `validar_permisos_tarea` (con `marcarHechas`
    alcanza: el valor lo fuerza el trigger). ⚠️ **Incluye una CORRECCIÓN DE
    DATOS**: a las tareas ya hechas y sin fecha les graba su día de marcado
    (`fecha_real`) como fecha; las que no lo tienen guardado no se tocan. El
    `RAISE NOTICE` informa cuántas se corrigieron y cuántas quedaron —
    **guardar esa salida**. Respaldo `pg_dump` previo obligatorio (es la
    única red y esta migración modifica datos). El front de la misma entrega
    replica la regla en modo Local; el orden con el despliegue del front es
    indiferente (en Supabase la regla vive entera en la base). **Correr la
    compuerta después** (casos nuevos del marcado).

30. `supabase/migrations/20260707000030_execute_publico.sql` — #290: cierra el
    permiso de ejecución que quedó abierto **a todos**. Las migraciones 15 y 22
    revocaron `from anon, authenticated` y nunca `from public`, y en PostgreSQL
    las funciones nacen con `EXECUTE` concedido a `PUBLIC`: el permiso siguió
    abierto. Retira ese permiso universal de las **36** funciones del proyecto
    que lo conservaban (las de extensiones **no** se tocan), dejando intacto
    todo permiso explícito — el resultado por función es *su ACL de antes menos
    la entrada universal*, sin altas ni bajas. Cierra en particular
    `crear_notificacion` y `usuario_tiene_acceso`, que solo tenían el universal.
    Crea además la vista `permiso_ejecucion_abierto` (solo lista infracciones;
    cero filas en una base sana) para que la compuerta pueda vigilarlo, y
    **falla sola** si algo quedara abierto. No cambia ninguna funcionalidad
    visible: si algo del producto cambia de comportamiento, es un error de este
    cambio. El orden con el front es indiferente (no hay cambios de front).
    **Correr la compuerta después** (caso nuevo `probarExecutePublico`).
31. `supabase/migrations/20260707000031_perfiles_y_ciclo_vida.sql` — #300/#301:
    el perfil de un usuario se cambia entre consultor y cliente con la RPC
    `cambiar_rol_usuario` (admin, nunca el propio, nunca desde/hacia
    administrador, y bloqueo con conteo si es dueño de proyectos), y un trigger
    nuevo rechaza cualquier UPDATE directo de `rol` que llegue del cliente.
    Redefine además `eliminar_usuario` —que ahora **suelta los accesos a
    proyectos, vacía `permisos_proyecto` y pone `auth_id = null`**— y
    `crear_o_reactivar_usuario`, que distingue reactivar un ARCHIVADO
    (conserva todo) de dar de alta un correo ELIMINADO (alta nueva: toma el
    perfil elegido, sin proyectos heredados).
    **ORDEN OBLIGATORIO:** desplegar antes la Edge Function `eliminar-usuario`
    (Paso 3), porque el front pasa a llamarla para eliminar; después aplicar
    esta migración; después mergear el front. **Correr la compuerta después**
    (casos nuevos `probarCambioDePerfil` y `probarEliminarCorta`).

> **Esta lista llega hasta la 31.** Las migraciones **32** (organización del
> usuario), **33** (un consultor suma a un colega) y **34** a **36** (resumen
> diario por correo) se aplican igual, en orden, desde el SQL Editor; cada una
> lleva su propia cabecera con qué hace y qué comprobar. Las tres del resumen
> diario están documentadas más abajo, en *Resumen diario por correo*.

*(Alternativa con CLI: instala primero la CLI de Supabase —`npm i -g supabase`
o `brew install supabase/tap/supabase`— y luego
`supabase link --project-ref TU_REF && supabase db push`. Todo el esquema puede
aplicarse también desde el SQL Editor del panel, sin CLI.)*

## Paso 3 — Crear los usuarios iniciales

⚠️ **Antes de ejecutar el seed**, edita en `supabase/seed.sql` los emails de los
2 admins (hoy son `dv@consultora.cl` / `jb@consultora.cl`) y del cliente demo,
poniendo los **emails reales** que usarán para entrar. Luego ejecuta el seed en
el SQL Editor (o `supabase db reset` con CLI, que aplica migraciones + seed).

> Si prefieres partir sin datos de ejemplo, ejecuta solo los `insert into usuario`
> y `acceso_proyecto` del seed y omite proyecto/frentes/tareas.
> Si ya ejecutaste el seed con los emails placeholder, corrígelos con:
> `update usuario set email = 'tu@email.real' where email = 'jb@consultora.cl';`

Después, en el panel → **Authentication → Users → Add user → Create new user**:

- Crea una cuenta por cada admin inicial, con el **mismo email** que quedó en la
  tabla `usuario` y una contraseña.
- Marca **Auto Confirm User** para no depender del correo de confirmación.

**Enlazar el primer admin (bootstrap).** Desde la migración 14, el trigger
`vincular_usuario_auth` solo enlaza una cuenta de Auth con su fila de `usuario`
si existe una **invitación consumida** (endurecimiento de seguridad: nadie entra
sin haber sido invitado). Los admins iniciales del seed **no** tienen invitación,
así que hay que enlazarlos **a mano una sola vez**. En el **SQL Editor**, después
de crear sus cuentas de Auth, ejecuta:

```sql
-- Bootstrap: enlaza los admins iniciales (sin invitación previa) con su cuenta
-- de Auth por email. Solo para el arranque; el resto de usuarios entra por el
-- flujo de invitación (Módulo de Usuarios → ✉).
update usuario u
set auth_id = a.id
from auth.users a
where a.email = u.email
  and u.auth_id is null
  and u.rol = 'admin';
```

Verifica que quedaron enlazados: `select email, auth_id from usuario where rol = 'admin';`
(los `auth_id` no deben ser nulos). A partir de aquí esos admins pueden entrar, y
los demás usuarios se dan de alta **por invitación** desde el Módulo de Usuarios
(su enlace auth↔usuario se resuelve solo al aceptar la invitación).

## Paso 4 — Cerrar el registro público (importante)

Por defecto Supabase permite que cualquiera se registre por API. La RLS impide
que un desconocido vea datos (sin fila en `usuario` no ve nada), pero igual
conviene cerrarlo: **Authentication → Sign In / Providers → Email** →
desactiva **"Allow new users to sign up"**. Los usuarios los creas siempre tú
desde el panel (paso 3) + el Módulo de Usuarios de la app.

## Paso 5 — Probar en local contra Supabase

```bash
cp .env.example .env
```

Completa `.env` con los valores de **Settings → API** del proyecto:

```
VITE_SUPABASE_URL=https://TU-REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # la "anon public" key
```

> La anon key es pública por diseño; la seguridad la pone la RLS.
> La **service_role** key NUNCA va en el frontend ni en el repo.

```bash
npm install
npm run dev
```

Verifica: el chip del encabezado debe decir **Supabase** (no "Local"), el login
pide contraseña, y al entrar como admin ves el proyecto del seed.

## Paso 6 — Desplegar en Vercel (recomendado)

1. [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo
   `josuecbritos/planning` desde GitHub.
2. Vercel detecta Vite solo. Verifica: Build Command `npm run build`,
   Output Directory `dist`.
3. En **Environment Variables** agrega las mismas dos variables del `.env`:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Obtienes una URL `https://planificador-xxx.vercel.app`.
5. (Opcional) Settings → Domains para un dominio propio.

Desde aquí, cada push a `main` redepliega automáticamente.

### Alternativa: Netlify

Add new site → Import from Git → mismo build (`npm run build`, publish `dist`)
→ mismas variables de entorno → Deploy. Para que las rutas funcionen igual no
se necesita nada extra (la app es una sola página, sin rutas de servidor).

## Paso 7 — Checklist final

- [ ] Entrar con los 2 admins desde la URL productiva.
- [ ] Crear un usuario Cliente desde el Módulo de Usuarios y asignarle un proyecto.
- [ ] Crear la cuenta Auth de ese cliente (panel, paso 3) y probar que al entrar
      **solo ve el proyecto donde lo invitaste** — ningún otro, ni en la barra
      lateral ni en Resumen ni en Mis Tareas.
- [ ] Con esa misma cuenta, comprobar que **sí puede** hacer lo que le
      corresponde por los permisos por defecto de un cliente (#236): **crear
      tareas**, **cambiar la fecha** y **marcar hechas las tareas asignadas a
      él**, y **asignar responsable**. Un cliente **no** es de solo lectura por
      defecto: eso se configura por acceso, en el 🔑 del Módulo de Usuarios.
      Lo que **no** puede es crear frentes ni sub frentes, ni administrar
      usuarios o proyectos.
- [ ] Cambiar una fecha objetivo y verificar que el historial aparece en el
      tooltip / panel de detalle (el trigger funciona).
- [ ] Confirmar que el registro público está desactivado (paso 4).

## Invitaciones por correo (§8 de la gran pedida)

El alta de usuarios funciona por invitación: el admin crea el usuario y le envía
un correo con un enlace que caduca en 7 días; el invitado define su contraseña.
Requiere desplegar las Edge Functions y conectar un proveedor de correo:

1. **Cuenta en [Resend](https://resend.com)** (capa gratuita: 100 correos/día):
   crea una API key y verifica tu dominio remitente (o usa `onboarding@resend.dev`
   para pruebas).
2. **Desplegar las funciones** (con la CLI de Supabase; instálala con
   `npm i -g supabase` si aún no la tienes):
   ```bash
   supabase functions deploy invitar-usuario
   supabase functions deploy eliminar-usuario
   supabase functions deploy aceptar-invitacion --no-verify-jwt
   supabase functions deploy recuperar-contrasena --no-verify-jwt
   ```
   (`aceptar-invitacion` y `recuperar-contrasena` las invoca alguien **sin
   sesión** —por eso `--no-verify-jwt`—; ambas validan su propio token.)

   > **`eliminar-usuario` (#301)** es la que revoca la cuenta de acceso al
   > eliminar a alguien: el Admin API solo corre con `service_role`, que nunca
   > llega al navegador. No lleva secretos propios —usa los que inyecta la
   > plataforma— pero sí necesita `SITE_URL` para el CORS, como las otras.
   > **Desplegarla ANTES de aplicar la migración 31 y de mergear el front**,
   > porque desde ese momento eliminar pasa por ella.
3. **Secrets**:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx \
     EMAIL_FROM="Andotek Planning <planning@tudominio.cl>" \
     SITE_URL=https://planning-andotek.vercel.app
   ```
   > `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los usa el código de las
   > funciones, pero **Supabase los inyecta automáticamente** en el entorno de
   > las Edge Functions: no hace falta configurarlos a mano.

   > ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` está marcada como obsoleta en este
   > proyecto** (la vigente es `SUPABASE_SECRET_KEYS`). Estas cuatro funciones
   > la USAN para construir su cliente admin —no comparan contra ella, que era
   > el defecto de #272—, así que **siguen funcionando mientras la plataforma la
   > inyecte**. El día que deje de inyectarse, las cuatro se caen a la vez: el
   > `createClient` se construiría con `undefined`. Es un cambio de una línea
   > por función (tomar la primera de `SUPABASE_SECRET_KEYS` cuando la anterior
   > falte, como hace `resumen-diario/credenciales.ts`), y obliga a
   > **redesplegar las cuatro**. Anotado acá para que la decisión sea deliberada
   > y no una sorpresa.

   **Para probar en un preview de Vercel** hace falta un secret más. Las
   funciones responden con CORS acotado a `SITE_URL`, así que desde el dominio
   del preview el navegador bloquea la respuesta y la app lo reporta como si
   fuera un problema de conexión. Se agrega el origen del preview a la lista:
   ```bash
   supabase secrets set SITE_URLS="https://planning-git-<rama>-<cuenta>.vercel.app"
   ```
   Admite varios separados por coma. Es opcional: en producción no hace falta.

   > **Desde #249, `SITE_URL` (o `SITE_URLS`) es obligatorio.** Si no hay
   > ningún origen configurado, las tres funciones **rechazan la petición** con
   > `503` y "El servicio no está configurado" en vez de abrirse a cualquier
   > origen con `'*'`. Si tras un despliegue las invitaciones o el recuperar
   > contraseña dejan de funcionar con ese mensaje, el secret falta o quedó
   > vacío: revísalo en Edge Functions → Secrets.
4. Desde el Módulo de Usuarios, **crear un usuario ya le envía la invitación**
   (#257): no hay un segundo paso. El botón ✉ de cada fila queda para
   **reenviarla** —hace falta, porque caduca a los 7 días— y sigue apareciendo
   solo mientras esa persona no haya activado su cuenta. Si el envío falla, el
   usuario queda creado igual y el aviso dice que se reintente con el sobre.
5. **Recuperar contraseña (#205).** Sale por el mismo Resend y la misma
   `SITE_URL`, así que no hay secretos nuevos que configurar. El enlace es
   `SITE_URL/#recuperar=<token>`, dura **1 hora** y sirve una vez; al usarlo se
   cierran todas las sesiones abiertas de esa cuenta. Solo funciona para
   usuarios **activos y con cuenta ya creada**: a un invitado que nunca aceptó,
   a un desactivado o a un eliminado se les responde lo mismo y **no** se les
   manda correo — su camino sigue siendo que el admin les reenvíe la invitación.
6. **Errores de las funciones (#249).** Lo que llega al navegador es un mensaje
   genérico en español —"No pudimos completar la operación…" / "No pudimos
   enviar el correo…"— que dice qué hacer (reintentar, avisar al administrador).
   El detalle técnico (error de Auth, respuesta de Resend, excepción) **queda en
   el servidor**: dashboard de Supabase → **Edge Functions → la función → Logs**,
   con el prefijo `[nombre-de-la-función]`. Ahí se diagnostica. Los mensajes que
   sí le sirven a quien mira la pantalla —"Esta invitación ya fue usada", "El
   enlace expiró", "El usuario ya tiene cuenta activa"— siguen llegando tal cual.

## Resumen diario por correo (#272)

Cada mañana a las **8:00 de Chile**, cada persona con el interruptor encendido
recibe un correo con sus tareas atrasadas y las que vencen ese día. Es el único
correo del producto que **no lo dispara nadie**: lo dispara el programador de
la base.

**No hay secretos nuevos.** Sale por el mismo Resend y el mismo `EMAIL_FROM`
que la invitación, que ya está validado de punta a punta. Lo único nuevo es la
parte que corre sola.

### 1. Aplicar las migraciones 34, 35 y 36

`supabase/migrations/20260707000034_resumen_diario.sql` y, encima,
`20260707000035_resumen_diario_formato.sql`, con **`pg_dump` antes** (el plan
gratuito no tiene respaldos automáticos, ver *Mantenimiento*).

La **34** agrega la columna `usuario.resumen_diario`, amplía `usuario_visible`, y
crea el turno, los datos del correo y el registro de corridas. La **35** es un
`create or replace` de una sola función —`resumen_diario_datos()`— que suma a
cada tarea el número de replanificaciones y el color de su proyecto, para que la
tabla del correo pueda verse igual que la de Mis Tareas. La **36** hace que un
intento fallido deje de costar el día entero (ver más abajo). Ninguna toca datos,
y después de la 35 y de la 36 hay que **redesplegar la función**.

> **Los usuarios que ya existen quedan APAGADOS y los nuevos nacen encendidos.**
> No es un descuido: nadie de los que ya están pidió este correo. La migración
> hace los dos pasos en ese orden a propósito.

Después, correr la compuerta `scripts/validar-rls.mjs`: trae casos nuevos.

### 2. Desplegar la función `resumen-diario`

Dashboard → **Edge Functions** → *Deploy a new function*, con el nombre
`resumen-diario`. **Lleva DOS archivos** y hay que subir los dos:

| Archivo | Qué es |
|---|---|
| `index.ts` | toma el turno, pide los datos y envía por Resend |
| `plantilla.ts` | el correo: asunto, cuerpo con formato y cuerpo en texto plano |
| `credenciales.ts` | qué credenciales acepta como "el programador" |

> ⚠️ **La plantilla lleva los estilos escritos EN CADA ELEMENTO, y no es
> descuido.** La primera versión los emitía en un bloque `<style>` y **Gmail lo
> descartó entero**: el correo llegó sin colores de fila, sin bordes, sin anchos
> de columna y sin tipografías. Medido en producción el **09-sep-2026** con una
> corrida forzada. Por lo mismo no hay `display:flex` —el punto del proyecto va
> en línea—, los bordes van `collapse`, los anchos se repiten en el atributo
> `width` de cada celda porque varios clientes ignoran los de estilo, y ningún
> color usa `var(--x)` porque Outlook de escritorio no entiende variables CSS.
> **Es exactamente el tipo de cosa que alguien "limpiaría" en seis meses sin
> saber por qué estaba así.** La prueba `docs/prueba-272-correo.mjs` lo vigila.

Los tres están separados para que las pruebas puedan comprobar **lo que la
función usa de verdad** —el correo y la puerta— en vez de una copia.

Se deja con la verificación de JWT **activada** (el valor por defecto), y además
la función comprueba que la credencial sea **una clave del proyecto**. No lleva
CORS: no la llama ningún navegador.

> **Las dos generaciones de claves.** La variable vigente es
> **`SUPABASE_SECRET_KEYS`** —en plural, porque un proyecto puede tener varias a
> la vez, que es lo que permite rotar una sin cortar el servicio— y
> `SUPABASE_SERVICE_ROLE_KEY` es la anterior. La función **acepta todas las
> vigentes y también la anterior mientras el proyecto la tenga**, así que
> funciona antes y después del cambio, sin una ventana en la que el resumen deje
> de salir. Si el entorno no tiene ninguna, responde **503** y no se abre.

### 3. Dejar el programador

Dashboard → **Database → Extensions**, y activar **`pg_cron`** y **`pg_net`**.
Después, en el **SQL Editor**:

```sql
select cron.schedule(
  'resumen-diario',
  '0 * * * *',                        -- CADA HORA, en punto (UTC)
  $$
  select net.http_post(
    url     := 'https://<REF-DEL-PROYECTO>.supabase.co/functions/v1/resumen-diario',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <CLAVE-SECRETA-DEL-PROYECTO>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

**Cada hora y no una vez al día, y es el punto entero.** Por dos razones:

1. **La hora.** El programador trabaja en UTC y **Chile cambia de hora dos veces
   al año**: un horario fijo en UTC daría las 8:00 la mitad del año y las 7:00 o
   las 9:00 la otra mitad. Quien decide es `resumen_diario_tomar_turno()`, **en
   la base, mirando `America/Santiago` por su nombre** (#291).
2. **El reintento (#358).** El disparo del programador es de *lanzar y olvidar*:
   no reintenta ante un error ni avisa ante una respuesta incorrecta. Así que
   quien tiene que aguantar un tropiezo es la función — **se la puede llamar
   muchas veces sin daño** — y el programador tiene que pasar seguido. **Si a
   las 8:00 falla, a las 9:00 sale.** Pasó el 11-sep-2026: un `Gateway Timeout`
   de cinco segundos costó el día entero, porque la pregunta era "¿son las
   8:00?" y solo había una oportunidad.

Cada correo va además con una **clave de idempotencia** por persona y día, que
Resend guarda 24 horas: reintentar no puede duplicar.

Sábado y domingo tampoco corre: el atraso se cuenta en días hábiles y el sábado
repetiría lo del viernes.

> La clave queda guardada en la definición del trabajo
> (`cron.job`), que solo pueden leer `postgres` y `service_role`. Si se prefiere
> no tenerla escrita ahí, se puede guardar en Vault
> (`vault.create_secret(...)`) y leerla dentro del `$$ ... $$`.

### 4. Verificar

Antes de esperar a las 8:00, se puede forzar una corrida. Es lo mismo en todo
salvo el día y la hora: los mismos destinatarios y las mismas tareas.

```bash
curl -X POST 'https://<REF>.supabase.co/functions/v1/resumen-diario' \
  -H 'Authorization: Bearer <CLAVE-SECRETA-DEL-PROYECTO>' \
  -H 'Content-Type: application/json' \
  -d '{"forzar": true}'
```

Para verificar contra la casilla del dueño sin molestar a nadie: encender el
interruptor **solo para él** (Administración → Usuarios → ficha) y forzar.

> **`forzar` saltea el día y la hora, pero NO el estado.** Con el correo del día
> ya enviado no manda un segundo — que es justo lo que #358 vino a garantizar.
> Para repetir un envío a propósito hay que borrar la fila del día:
> `delete from resumen_diario_corrida where fecha = hoy_chile();`

**Qué pasó en cada corrida:**

```sql
select * from resumen_diario_corrida order by fecha desc limit 5;
```

Una fila por día en que el resumen intentó correr. **La fila se escribe al
EMPEZAR el intento**, con su estado:

| `estado` | Qué significa |
|---|---|
| `en_curso` | alguien lo está intentando ahora |
| `cerrado` | el correo del día **salió**; nadie más envía hoy |
| `fallido` | el intento no llegó a buen puerto y el día queda **abierto** |

**Solo un envío logrado cierra el día** (#358). Un intento que falla lo deja
abierto, anota el motivo en `detalle` —que acumula los de todos los intentos— y
suma uno a `intentos`; el disparo de la hora siguiente vuelve a probar. A quien
ya le llegó no le llega de nuevo: cada envío va con su clave de idempotencia.
El detalle técnico va además a **Edge Functions → resumen-diario → Logs**, con
el prefijo `[resumen-diario]`.

### 5. Lo que este correo NO lleva

**No lleva la cabecera de baja** que pone el botón de "darse de baja" de Gmail.
Evaluado y descartado por ahora: exige una función de servidor nueva, abierta
sin sesión, que reciba el aviso del proveedor y apague el interruptor. **No
afecta la entrega** —lo que decide si el correo entra es la autenticación del
dominio, que ya está montada, y el volumen está lejos del umbral de remitente
masivo (5.000 mensajes diarios a cuentas personales)—. Se agrega si aparece la
primera queja de spam.

## Mantenimiento

- **Nuevos usuarios**: Módulo de Usuarios (app) + Authentication → Add user (panel),
  siempre con el mismo email.
- **Cambios de esquema futuros**: nuevos archivos en `supabase/migrations/`,
  aplicados por SQL Editor o `supabase db push`.
- **Respaldo**: ⚠️ **el plan gratuito de Supabase NO tiene respaldos
  automáticos** — los respaldos diarios son de los planes Pro, Team y
  Enterprise; en el gratuito la retención es de cero días (#234). La **única**
  red que existe es el respaldo manual: `pg_dump` (o Settings → Database →
  exportar dump) **antes de cada migración**. No es una recomendación: si algo
  sale mal en una migración y no hiciste el dump, no hay desde dónde volver.
  Es lo mismo que dicen el README, `docs/SEGURIDAD.md` §4 y
  `docs/runbook-seguridad.md` §0.
