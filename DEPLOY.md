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
Requiere desplegar dos Edge Functions y conectar un proveedor de correo:

1. **Cuenta en [Resend](https://resend.com)** (capa gratuita: 100 correos/día):
   crea una API key y verifica tu dominio remitente (o usa `onboarding@resend.dev`
   para pruebas).
2. **Desplegar las funciones** (con la CLI de Supabase; instálala con
   `npm i -g supabase` si aún no la tienes):
   ```bash
   supabase functions deploy invitar-usuario
   supabase functions deploy aceptar-invitacion --no-verify-jwt
   supabase functions deploy recuperar-contrasena --no-verify-jwt
   ```
   (`aceptar-invitacion` y `recuperar-contrasena` las invoca alguien **sin
   sesión** —por eso `--no-verify-jwt`—; ambas validan su propio token.)
3. **Secrets**:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx \
     EMAIL_FROM="Andotek Planning <planning@tudominio.cl>" \
     SITE_URL=https://planning-andotek.vercel.app
   ```
   > `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los usa el código de las
   > funciones, pero **Supabase los inyecta automáticamente** en el entorno de
   > las Edge Functions: no hace falta configurarlos a mano.

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
