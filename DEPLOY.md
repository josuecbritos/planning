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
