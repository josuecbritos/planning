# Informe de auditoría de seguridad — Andotek Planning

**Fecha:** 2026-07-20 · **Alcance:** código definitivo en producción (roles/RLS reescritos + alta por correo desplegada) · **Tipo:** revisión de solo lectura, sin cambios. Las correcciones se pedirán por separado.

---

## 1. Resumen ejecutivo

La base de seguridad es **sólida**: todas las tablas con datos tienen RLS activa, la política permisiva inicial fue removida, el principio "dueño vs invitado" se hace cumplir en la base (no solo en la interfaz) y los secretos no están expuestos ni en el código ni en el historial de Git. La compuerta automatizada (31/31) ya confirmó el comportamiento de accesos.

Hay **un punto que hay que verificar sí o sí antes de salir en vivo**: que el **registro público de cuentas esté deshabilitado** en Supabase Auth. Si estuviera habilitado, alguien podría apropiarse de una cuenta ya creada (incluso de admin) registrándose con su correo. Todo lo demás son debilidades menores o de endurecimiento: una atribución de historial falsificable, permisos/correos de colegas visibles por API más allá de lo que la interfaz muestra, política de contraseñas floja y ajustes de hardening (search_path, RPC de funciones internas, headers HTTP). Ningún dato de proyecto de un cliente se filtra a quien no corresponde.

**Semáforo:** 🔴 1 (a verificar) · 🟡 4 · 🔵 7 · ✅ 20 verificaciones OK.

---

## 2. Hallazgos por gravedad

### 🔴 Crítico — verificar antes de salir en vivo

#### C1 · El registro público debe estar cerrado (linchpin del modelo de auth)

- **Qué es:** el trigger `vincular_usuario_auth` (`supabase/migrations/20260707000002_fase2_auth.sql:19-31`) enlaza **cualquier** cuenta nueva de `auth.users` a una fila de la tabla `usuario` **cuyo email coincida** (`update usuario set auth_id = new.id where lower(email) = lower(new.email) and auth_id is null`). El enlace se hace **solo por email**, sin exigir el token de invitación.
- **Dónde:** trigger de BD + configuración de Supabase Auth (dashboard, no está en el código).
- **Riesgo (en simple):** el admin pre-crea a cada usuario con su correo. Si el "registro público" de Supabase Auth está **activado**, un atacante que conozca el correo de un empleado aún no activado (un consultor, o incluso un admin) puede **registrarse él mismo** con ese correo y una contraseña que él elige. El trigger lo enlazaría a esa fila `usuario` y entraría **con ese rol** — apropiación de cuenta, saltándose por completo la invitación por correo. Es el único camino que rompería todo el modelo de roles.
- **Corrección recomendada:**
  1. **Verificar y deshabilitar** "Allow new users to sign up" en Supabase → Authentication → Providers/Sign In (o `Enable email signups` = off). El único alta debe ser vía la Edge Function `aceptar-invitacion` (que usa `admin.createUser` con service_role, protegida por token).
  2. Defensa en profundidad: endurecer `vincular_usuario_auth` para enlazar **solo** cuando exista una invitación usada para ese usuario (o exigir confirmación de correo), de modo que el enlace no dependa únicamente de que el registro público esté apagado.
- **Nota:** si al verificar el registro público **ya está deshabilitado**, este punto baja a 🔵 (recomendación de defensa en profundidad #2). Lo marco 🔴 porque, sin confirmarlo, es la falla de mayor impacto posible y el pedido pide validarlo explícitamente.

---

### 🟡 Medio — debilidad real, corregir pronto

#### M1 · Atribución del historial de replanificaciones falsificable (`p_actor`)

- **Qué es:** `replanificar_tarea(p_tarea, p_nueva, p_actor)` (`20260707000001_init.sql:140`) y `desplanificar_tarea(p_tarea, p_actor)` (`20260707000012_roles_y_permisos.sql:556`) reciben `p_actor` del cliente y lo usan como el autor (`cambiado_por`) del registro de historial, **sin validarlo contra el usuario autenticado**.
- **Riesgo:** la **autorización** es correcta (se decide con la sesión real: `es_admin()` / `es_dueno_proyecto()` / permiso, no con `p_actor`), así que **no hay escalada de acceso**. Pero un usuario con permiso de editar fechas puede pasar un `p_actor` arbitrario y **falsificar quién replanificó** una tarea — se corrompe la traza de auditoría ("quién movió esto").
- **Corrección recomendada:** ignorar `p_actor` y derivar el actor **dentro** de la función con `usuario_actual_id()`; o validar `p_actor = usuario_actual_id()` salvo para admin. (El frontend ya envía el id correcto; el problema es que la API permite mentir.)

#### M2 · Permisos y correos de co-miembros visibles por API más allá de la interfaz

- **Qué es:** `acceso_select` (`…roles_y_permisos.sql:315`) permite a cualquier miembro de un proyecto (`tiene_acceso_proyecto`) leer **todas** las filas de `acceso_proyecto` de ese proyecto, incluida la columna `permisos` de los demás. `usuario_select` (`:264`) expone `email` y `permisos_proyecto` de los admins y de quienes comparten proyecto. La RLS es por **fila**, no por columna: la interfaz oculta los permisos (punto §7), pero la API los devuelve.
- **Riesgo:** contradice el §7 ("el dueño ve quién está, no sus permisos") a nivel de base, y **un cliente puede leer por API el correo y la configuración de permisos de los otros miembros** (otros clientes, consultores, admins) de su proyecto. No se filtran datos de proyecto (tareas/fechas están bien acotadas); es exposición de metadatos (correos + flags de permisos).
- **Corrección recomendada:** restringir a nivel de columna — exponer los miembros vía una **vista** que no incluya `permisos`/`permisos_proyecto` (y limite `email`), o separar las columnas sensibles a otra tabla con su propia RLS. Alternativa mínima: aceptarlo y documentarlo si el correo de colegas se considera no sensible en este contexto B2B.

#### M3 · Política de contraseñas floja + protección de contraseñas filtradas desactivada

- **Qué es:** `aceptar-invitacion` solo exige **8 caracteres** de largo (`index.ts:24`), sin complejidad; y `auth_leaked_password_protection` está **desactivada** (Security Advisor §d).
- **Riesgo:** los usuarios pueden fijar contraseñas débiles o ya filtradas en brechas conocidas, facilitando el robo de credenciales.
- **Corrección recomendada:** activar **Leaked Password Protection** (chequeo contra HaveIBeenPwned) en Supabase → Authentication → Policies. Opcional: subir el mínimo y exigir algo de complejidad.

#### M4 · Dependencias con vulnerabilidades conocidas (solo toolchain de build)

- **Qué es:** `npm audit` → 2 vulnerabilidades: **`vite` ≤6.4.2 (high, GHSA-fx2h-pf6j-xcff)** y **`esbuild` ≤0.24.2 (moderate, GHSA-67mh-4wv8-2f99)**. Ambas son **devDependencies**.
- **Riesgo:** afectan únicamente al **servidor de desarrollo** (`vite dev`), no al sitio estático desplegado en Vercel. Riesgo real bajo si el dev server no se expone en red.
- **Corrección recomendada:** actualizar a Vite 8 cuando se pueda (es un cambio mayor/breaking); mientras tanto, no exponer el dev server. Sin impacto en producción.

---

### 🔵 Menor / recomendación — higiene y endurecimiento

#### L1 · `search_path` mutable en 6 funciones (Advisor §a)

`aplicar_default_consultor`, `replanificar_tarea`, `ajustar_dia_habil`, `normalizar_fechas_tarea`, `default_permisos_proyecto`, `default_permisos_tareas` no fijan `search_path`. Las dos `default_permisos_*` son `immutable` y no tocan tablas (riesgo casi nulo); las demás son triggers/RPC. **Explotabilidad baja** (en Supabase solo roles privilegiados pueden crear objetos en un esquema del path), pero es hardening estándar. **Fix:** agregar `set search_path = ''` (con nombres calificados) o `= public` a cada una.

#### L2 · Funciones SECURITY DEFINER invocables por RPC (Advisor §b) — con matiz importante

El Advisor marca 22 funciones llamables vía `/rest/v1/rpc/…`. El fix **no es uniforme** (el pedido pide no romper la RLS):

- **Funciones de trigger** (`registrar_replanificacion`, `validar_cambios_frente`, `validar_cambios_subfrente`, `validar_permisos_tarea`, `aplicar_default_acceso`, `aplicar_default_consultor`, `default_dueno_proyecto`, `vincular_usuario_auth`): **se puede revocar `EXECUTE` a `anon` y `authenticated`** sin romper nada — se disparan por el trigger, no por llamada directa. Cierra la superficie de RPC. **Seguro.**
- **Predicados de la RLS** (`es_admin`, `es_cliente`, `es_dueno_proyecto`, `es_invitado_proyecto`, `tiene_acceso_proyecto`, `rol_actual`, `usuario_actual_id`, `permiso_proyecto`, `permiso_bool_en`, `permiso_tarea_en`, `permisos_en`, `invitado_puede_editar_algo_en`, `comparte_proyecto`): **NO revocar `EXECUTE` a `authenticated`** — la evaluación de las políticas RLS las llama como el rol que consulta; revocar **rompería la RLS**. Riesgo residual mínimo: solo devuelven un booleano sobre el **propio** usuario, sin datos. A lo sumo revocar a `anon` (que no tiene sesión) como reducción de superficie.
- **RPC legítimas** (`replanificar_tarea`, `desplanificar_tarea`): mantener `EXECUTE` para `authenticated`, revocar a `anon`.
- **Después de aplicar, re-confirmar con la compuerta 31/31.**

#### L3 · `proyecto_de_subfrente` filtra el id de proyecto de cualquier sub frente

Es SECURITY DEFINER llamable por `authenticated` y devuelve el `proyecto_id` de **cualquier** sub frente (omite RLS). Fuga menor (los UUID son opacos, no revelan datos). Incluir en el conjunto de "revocar a `anon`" de L2. Bajo.

#### L4 · Sin headers de seguridad en el despliegue

No existe `vercel.json` ni configuración de headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS). **Fix:** agregar un `vercel.json` con al menos `X-Frame-Options: DENY` (anti-clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una CSP. Defensa en profundidad (la app es una SPA sin render de HTML de usuario, así que el riesgo actual es bajo).

#### L5 · CORS `*` en las Edge Functions

Ambas funciones usan `Access-Control-Allow-Origin: '*'`. Es **aceptable** aquí: `invitar-usuario` exige JWT de admin/consultor (otro sitio no puede robar ese JWT por CORS), y `aceptar-invitacion` es token-en-cuerpo público por diseño. Recomendación menor: acotar a `SITE_URL`.

#### L6 · Sin rate limiting a nivel de aplicación en las Edge Functions públicas

`aceptar-invitacion` no tiene rate limiting propio. El token es UUID v4 (122 bits) → adivinarlo es impracticable, y Supabase aplica algún límite de plataforma. Recomendación menor: considerar un límite explícito.

#### L7 · Cualquier miembro puede reordenar frentes/sub frentes

`frente_update` / `subfrente_update` usan `USING (tiene_acceso_proyecto(...))` para permitir corrimientos de orden; el trigger solo bloquea el **renombre**, no el `orden`. Un cliente sin permisos de estructura podría reordenar frentes. Integridad menor. **Fix opcional:** gatear los cambios de `orden` a un permiso de estructura, o aceptarlo como interacción de arrastre permitida a miembros.

---

## 3. Verificaciones que pasaron OK ✅

**RLS y políticas**
- ✅ Las 9 tablas con datos tienen **RLS habilitada** (`usuario`, `proyecto`, `frente`, `sub_frente`, `tarea`, `replanificacion`, `acceso_proyecto`, `comentario`, `invitacion`). Ninguna tabla con datos queda sin RLS.
- ✅ La política permisiva inicial `fase1_all USING (true)` fue **eliminada en las 7 tablas** (migración 2). No queda ningún `USING (true)` vivo en el esquema.
- ✅ **Visibilidad correcta por rol** en los SELECT: admin todo; dueño/invitado por proyecto; cliente solo invitados. Confirmado además por la compuerta 31/31.
- ✅ El **principio dueño-vs-invitado se cumple en la base**, no solo en la UI: policies + triggers de validación campo a campo (`validar_permisos_tarea`, `validar_cambios_frente/subfrente`).
- ✅ `proyecto_select` usa **expresión directa sobre la fila** (evita el bug de recursión/snapshot del `RETURNING`, ya resuelto en la migración 4).
- ✅ Las **tablas relacionadas** (`comentario`, `replanificacion`, `acceso_proyecto`) tienen SELECT acotado por `tiene_acceso_proyecto` → no filtran datos de proyectos ajenos.
- ✅ Los **filtros guardados y preferencias** viven en `localStorage` del cliente (no hay tabla en BD) → sin exposición server-side.
- ✅ `usuario_update`/`usuario_delete` solo admin; `usuario_insert` solo admin o consultor con `invitarClientes` creando **clientes**. Escritura de configuración (rol/activo/permisos) reservada a admin.

**Secretos y frontend**
- ✅ El frontend usa **solo la anon key** (`VITE_SUPABASE_ANON_KEY`); la `service_role` aparece únicamente en las Edge Functions vía `Deno.env.get(...)` (server-side).
- ✅ **Sin secretos** en el código ni en el **historial de Git**; `.env.example` solo trae placeholders; `.gitignore` ignora `.env` y `.env.*` (excepto el example).
- ✅ **Sin patrones de XSS** (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`) en `src/`. React escapa por defecto.

**Auth, invitaciones y Edge Functions**
- ✅ **Token de invitación** UUID v4 (impredecible), único por usuario, **un solo uso** (marca `usada` + unicidad de email en Auth), caduca a 7 días; reinvitar **reemplaza** el token (`upsert onConflict usuario_id`).
- ✅ Tabla `invitacion` con RLS: **solo admin la lee**, sin escritura desde el cliente (las Edge Functions usan service_role).
- ✅ `invitar-usuario` **verifica al invocador** por JWT (admin, o consultor con `invitarClientes` y solo clientes de sus proyectos). Un usuario sin permiso no puede disparar invitaciones por la API.
- ✅ `aceptar-invitacion` corre sin JWT (por diseño) pero **el token es la única llave**: valida token vigente, no usado, usuario activo y `auth_id` nulo; mapea a un `usuario_id` **fijo** → no permite activar cuentas arbitrarias ni de otro usuario. `email_confirm: true` está justificado (recibir el enlace prueba control del correo).
- ✅ Con token inválido/expirado/ya usado responde 404/410/409 respectivamente; contraseña < 8 → 400.
- ✅ El **historial de replanificaciones** se escribe **solo por trigger** (SECURITY DEFINER); ningún camino de edición lo elude. Escritura directa de `replanificacion` reservada a admin.

**Dependencias**
- ✅ Dependencias de **producción** (`react`, `react-dom`, `@supabase/supabase-js`, `@fontsource/*`) **sin vulnerabilidades conocidas**.

---

## 4. Acciones sugeridas por prioridad (para el pedido de correcciones posterior)

1. **[🔴 antes de salir en vivo]** Verificar/deshabilitar el registro público de Supabase Auth (C1) y, como defensa, atar el enlace `auth ↔ usuario` a una invitación usada.
2. **[🟡 pronto]** Derivar el actor del historial del usuario autenticado (M1); acotar `permisos`/`email` de co-miembros a nivel de columna/vista (M2); activar Leaked Password Protection (M3).
3. **[🔵 higiene]** Fijar `search_path` (L1); revocar `EXECUTE` a los triggers y a `anon` según L2/L3 y re-correr la compuerta; agregar `vercel.json` con headers (L4); el resto (L5–L7) según se estime.
4. **[🔵 mantenimiento]** Planificar la subida a Vite 8 (M4), sin urgencia de producción.

*Fin del informe. No se modificó código de la aplicación en esta pasada.*
