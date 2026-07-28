# Andotek Planning

Herramienta de planificación de proyectos, **en producción**. Jerarquía
Proyecto → Frente → Sub Frente → Tarea, con dos vistas del mismo plan —**Tabla**
y **Gantt**—, un módulo **Mis Tareas** que cruza proyectos, y tres roles (Admin /
Consultor / Cliente) con acceso por proyecto respaldado por RLS en la base.
Su diferenciador es el **registro de replanificaciones**: mover una fecha ya
vencida deja rastro, y ese rastro es el producto.

> **Este README cubre uso y desarrollo**: qué es, cómo levantarlo, cómo
> desplegarlo y dónde vive cada cosa.
>
> - **Qué hace hoy y por qué** → [`docs/PROYECTO.md`](docs/PROYECTO.md) (fuente
>   de verdad del estado actual).
> - **Cómo se desplegó y cómo se opera** → [`DEPLOY.md`](DEPLOY.md).
> - **Antes de tocar RLS, permisos, Edge Functions de auth o el despliegue** →
>   [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) (invariantes que no se rompen).
> - **Historial de cambios**, solicitud por solicitud →
>   [`CHANGELOG.md`](CHANGELOG.md).
> - `docs/documento-funcional-v3.1.md` es **histórico** (modelo anterior de 2
>   roles / 4 estados).

## Dos modos de ejecución

La app elige el backend automáticamente según las variables de entorno:

| Modo | Cuándo | Datos |
| --- | --- | --- |
| **Supabase** | Hay `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` en `.env` | Postgres real (persistente, multiusuario) |
| **Local** | No hay credenciales | En memoria + `localStorage` (para demos sin backend) |

El chip en el encabezado indica el modo activo. En modo Local, "hoy" es una fecha
simulada (30-oct-2024) para que el dataset de demo muestre tareas hechas, vencidas
y futuras; en Supabase, "hoy" es la fecha real del sistema.

**Login por modo:** en Supabase el login es real (email + contraseña, Supabase Auth).
En modo Local es un selector "entrar como…" con los usuarios del seed (2 admins,
1 consultor con proyecto propio y 1 cliente), para demostrar los roles sin backend.

## Ejecutar

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm run typecheck  # solo chequeo de tipos (tsc -b --noEmit)
npm run build      # typecheck + build de producción
npm run preview    # sirve el build
```

Sin `.env`, arranca en modo Local con datos semilla del Plan PGP Arauco.

## Conectar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (capa gratuita).
2. Aplica el esquema **completo**, las 19 migraciones en orden:
   ```bash
   supabase link --project-ref TU_REF
   supabase db push          # aplica supabase/migrations/ en orden
   supabase db reset         # opcional: recrea + carga supabase/seed.sql
   ```
   Sin la CLI, el orden exacto para pegar en el SQL Editor está en
   [`DEPLOY.md`](DEPLOY.md) (Paso 2).

   > **No hay atajo.** Aplicar solo la primera migración deja el esquema a
   > medias **y con la RLS permisiva de la Fase 1**: la aplicación parece
   > funcionar y la base queda abierta. Es todo o nada, y en orden (#235).
3. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` (Settings → API).
4. `npm run dev`. El chip del encabezado debe decir **Supabase**.

Para una instalación nueva, el camino completo —migraciones, primer admin,
Edge Functions y sus secretos, despliegue en Vercel— es
[`DEPLOY.md`](DEPLOY.md).

## Modelo de datos y esquema

- `supabase/migrations/20260707000001_init.sql` — entidades de la sección 5:
  `usuario`, `proyecto`, `frente`, `sub_frente`, `tarea`, `replanificacion`,
  `acceso_cliente_proyecto`, más el trigger de historial y el RPC de replanificación.
  (RLS permisiva provisional de Fase 1.)
- `supabase/migrations/20260707000002_fase2_auth.sql` — Fase 2: vínculo con
  `auth.users`, helpers de sesión (`es_admin()`, `usuario_actual_id()`,
  `proyectos_visibles()`), trigger del límite de 2 admins, y **RLS real por rol**
  que reemplaza la permisiva.
- `supabase/migrations/20260707000003_fase3_archivo.sql` — Fase 3: campo
  `archivada` en `tarea` (archivo de canceladas).
- `supabase/migrations/20260707000004_fix_rls_insert_proyecto.sql` — fix: el
  `INSERT … RETURNING` de proyecto violaba RLS porque la política de SELECT
  dependía de una función que consulta la propia tabla con el snapshot previo
  al insert; se reescriben las políticas con expresión directa.
- `supabase/migrations/20260707000005_comentarios.sql` — tabla `comentario`
  (hilo acumulable por tarea, append-only; leen todos los que ven la tarea).
  Migra el texto legado de `tarea.comentarios`. _(La 12 amplía el comentar a
  todos los miembros, no solo admins.)_
- `supabase/migrations/20260707000006_estados_y_fechas.sql` — fechas opcionales
  (la tarea nace sin fecha; la primera fija `fecha_original` sin historial) y
  anclaje de toda fecha al día hábil más cercano, ambos como triggers.
- `…_000007_estados_v2.sql` a `…_000011_desplanificar_deshace.sql` — modelo de
  estados v2 (replan solo si la fecha vencía; se **permiten** fines de semana,
  reemplaza el anclaje de la 6), permisos por cliente (jsonb + RLS), tabla de
  invitaciones (token 7 días), estándar de planificación por clics y RPC
  `desplanificar_tarea` (deshace la última replanificación).
- `supabase/migrations/20260707000012_roles_y_permisos.sql` — **reestructuración
  de roles**: rol `consultor` y fin del límite de 2 admins; dueño de proyecto
  (`creado_por`, con backfill al admin creador); `acceso_cliente_proyecto` →
  `acceso_proyecto` con `permisos` jsonb POR ACCESO (backfill desde
  `usuario.permisos`: los clientes demo conservan su configuración);
  `usuario.permisos_proyecto` para consultores; defaults por rol vía triggers;
  y **RLS reescrita completa** (dueño vs invitado). Corrige de paso el
  historial de replanificaciones para invitados (trigger security definer) y
  habilita comentar a todos los miembros. **Aplicar con el runbook de arriba.**
- `supabase/migrations/20260707000013_fix_replan_fecha_origen.sql` — fix §1
  post-validación: restaura la guardia `old.fecha_objetivo <= current_date` en
  `registrar_replanificacion` (perdida al pasarla a security definer en la 12).
  La replanificación se evalúa sobre la fecha de **origen**: mover una fecha
  futura es planificación (sin ↻), no replanificación.
- `supabase/migrations/20260707000014_seguridad_auth_y_historial.sql` y
  `…20260707000015_seguridad_exposicion_y_execute.sql` — **correcciones de
  seguridad post-auditoría**: enlace auth↔usuario atado a invitación usada
  (defensa C1), autor del historial derivado de la sesión (M1), `search_path`
  fijo (L1), `acceso_select` acotada + vista `usuario_visible` que enmascara
  email/permisos (M2), y `revoke execute` de funciones internas sin romper la
  RLS (L2/L3). **Aplicar con `docs/runbook-seguridad.md`.**
- `supabase/migrations/20260707000016_mejoras_desktop.sql` — proyecto
  activo/archivado con gate por permiso; `usuario.eliminado` + vista
  `usuario_visible` que lo filtra + RPC `crear_o_reactivar_usuario`; tabla
  `notificacion` + RLS por dueño + triggers que la generan (asignación /
  replanificación / comentario, nunca por acción propia).
- `supabase/migrations/20260707000017_delete_solo_archivado.sql` — endurece
  `proyecto_delete`: solo se elimina un proyecto **archivado** (la regla
  "archivar primero" pasa de la UI a la base).
- `supabase/migrations/20260707000018_cuenta_y_comentarios.sql` — tabla
  `recuperacion` (token de un solo uso, 1 hora, con RLS y **sin políticas**: no
  se lee desde el cliente) para el "olvidé mi contraseña" (#205);
  `usuario.iniciales_manual` y auto-edición del **perfil propio** —solo nombre e
  iniciales— acotada por un trigger (#207); menciones `@` derivadas del texto
  del comentario **en la base**, que resuelven mención y responsable en una sola
  notificación (#208); y **edición del propio comentario** con marca de editado,
  restringida al autor y sin borrado (#209).
- `supabase/migrations/20260707000019_usuario_eliminado_fuera_de_la_tabla.sql` —
  `usuario_select` suma `not eliminado`: la lectura directa de la tabla deja de
  exponer lo que la vista `usuario_visible` oculta (#248). Va **junto con el
  front de la misma entrega**: como Postgres aplica las políticas de SELECT
  también a las filas de un `RETURNING`, `eliminarUsuario` dejó de pedir la fila
  de vuelta y comprueba el borrado releyendo la vista.

> La lista **completa y ordenada** de las 19 migraciones (1→19), lista para
> pegar en el SQL Editor, está en [`DEPLOY.md`](DEPLOY.md) (Paso 2).

Para crear los usuarios en Supabase Auth: panel → Authentication → Add user (con el
mismo email que registraste en el Módulo de Usuarios).
**Importante (seguridad, migración 14):** el enlace auth↔usuario exige una
invitación **usada**; el flujo normal es invitar desde el Módulo de Usuarios y que
la persona active su cuenta por el enlace del correo. Para el **primer admin** de
una instalación nueva (sin invitación) hay que enlazar su `auth_id` manualmente
por SQL — el procedimiento exacto (bootstrap) está en [`DEPLOY.md`](DEPLOY.md)
Paso 3.

## Estructura

```
src/
  types.ts               Modelo de datos (sección 5)
  lib/
    dates.ts             Días hábiles y formato
    derive.ts            Estados derivados, colores y marcas (sección 6)
    permisos.ts          makeCan + dueño/invitado (espejo de la RLS)
    filtros.ts           Filtro de fecha/responsable/estado, igual en las dos vistas
    orden.ts             Orden multinivel y escala de gravedad de los estados
    vistaCongelada.ts    "Foto" de filas visibles + orden (P1)
    password.ts          Política de contraseña, compartida por los dos flujos (#204)
    vistas.ts            Vista guardada activa y su persistencia (#215)
    errores.ts           Traducción de fallos de red a lenguaje humano (#210)
    menciones.ts         Menciones @ en comentarios: marcador por id (#208)
  auth/
    auth.ts              Interfaz del servicio de autenticación
    memoryAuth.ts        Login simulado ("entrar como…") para modo Local
    supabaseAuth.ts      Login real con Supabase Auth
  data/
    repo.ts              Interfaz de la capa de datos + tipos de entrada
    memoryRepo.ts        Adapter en memoria + localStorage
    supabaseRepo.ts      Adapter Postgres (Supabase)
    client.ts            Cliente Supabase (por env)
    apply.ts             Aplicar mutaciones al estado local (con cascada)
    index.ts             Selección de adapter
    seed.ts              Datos semilla + HOY simulado (solo modo Local: se carga
                         bajo demanda, no viaja en el bundle de producción)
  components/
    Sidebar, Header, TableView, GanttView, MisTareasView, ResumenView,
    TaskPanel, TaskDetail, FiltrosBar, FechaEditable, RespPicker,
    AdminProyectosView, ProyectoModal, MiembrosModal, UsersView,
    UsuarioModal, PermisosModal, PermisosProyectoModal, Notificaciones,
    LoginPage, DefinirPassword, ConfiguracionView, NombreTocable,
    CampoPassword, Modal, TextPromptModal, …
    Iconos.tsx           Iconos de acción como SVG de trazo (#203)
supabase/
  migrations/            19 migraciones (1→19). Lista ordenada en DEPLOY.md.
  functions/             Edge Functions (Deno): invitar-usuario, aceptar-invitacion,
                         recuperar-contrasena
  seed.sql               Datos de arranque (opcional)
scripts/
  validar-rls.mjs        Compuerta de RLS (rol por rol contra la API)
docs/
  PROYECTO.md            Fuente de verdad del estado actual
  SEGURIDAD.md           Invariantes de seguridad (leer antes de tocar RLS/auth)
  runbook-seguridad.md / auditoria-seguridad.md
  documento-funcional-v3.1.md  (histórico)
```

## Estado

**Desplegado y en uso, con usuarios reales.** Las tres fases del alcance inicial
—base de datos y las dos vistas, roles con RLS real, y el pulido (Mis Tareas,
panel de detalle, archivo de canceladas, indicadores)— están completas, más los
módulos posteriores: Administración de Proyectos y Usuarios, notificaciones,
cuenta propia y recuperación de contraseña.

Lo que se hizo después de cada solicitud está en [`CHANGELOG.md`](CHANGELOG.md);
el estado funcional completo, en [`docs/PROYECTO.md`](docs/PROYECTO.md).

## Stack

Vite + React + TypeScript + Supabase (Postgres + Auth + RLS). Pensado para desplegar en
Vercel/Netlify (capa gratuita), con costo de operación cercano a cero.
