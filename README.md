# Planificador de Proyectos (Documento Funcional v3.1)

Herramienta de planificación de proyectos con gestión interna y visibilidad
controlada al cliente. Implementa las vistas **Tabla** (tipo Monday) y **Gantt**
(grilla tipo Excel) con la lógica de estados derivados y colores de la sección 6
del Documento Funcional, el **CRUD** completo sobre **Supabase** (Fase 1),
**login con roles Admin/Cliente + acceso por proyecto** (Fase 2, Módulo 1) y el
**pulido de la Fase 3**: Mis Tareas, panel lateral de detalle, archivo de
canceladas e indicadores por proyecto.

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
npm run dev      # servidor de desarrollo (Vite)
npm run build    # typecheck + build de producción
npm run preview  # sirve el build
```

Sin `.env`, arranca en modo Local con datos semilla del Plan PGP Arauco.

## Conectar Supabase (Fase 1)

1. Crea un proyecto en [supabase.com](https://supabase.com) (capa gratuita).
2. Aplica el esquema. Con la CLI de Supabase:
   ```bash
   supabase link --project-ref TU_REF
   supabase db push          # aplica supabase/migrations/
   supabase db reset         # opcional: recrea + carga supabase/seed.sql
   ```
   O bien, pega el contenido de `supabase/migrations/20260707000001_init.sql`
   (y opcionalmente `supabase/seed.sql`) en el **SQL Editor** del panel de Supabase.
3. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` (Settings → API).
4. `npm run dev`. El chip del encabezado debe decir **Supabase**.

## Qué implementa

**Vistas** (sección 4, 6, 7.2)
- **Tabla tipo Monday:** navegación por Frente en el sidebar; cada Sub Frente es una
  tabla. Columnas (en este orden): Hecha (checkbox), Tarea, Responsable, **Estado**
  (pill de tamaño fijo con la categoría en texto — dos líneas si son dos palabras —
  como refuerzo del color de fila), F. objetivo (editable → replanifica) y
  F. original (referencia, siempre visible). La fecha de cierre no es columna: la
  marca de una hecha vive en su **última fecha planificada** y el día real del
  marcado queda solo como registro en el historial.
- **Gantt en grilla:** columnas fijas congeladas, celdas combinadas reales, una columna
  por día hábil, encabezado semana/día, columna de HOY, marcas de la sección 6.4 y
  tooltips con historial (6.6).
- **Modelo de 5 categorías excluyentes** (v2): el único estado manual es `hecha`;
  el color pinta la **fila completa** con gravedad creciente — Hecha (verde ✓) ·
  Pendiente (sin color) · Pendiente replanificada (ámbar) · Atrasada (rojo) ·
  **Atrasada replanificada (morado, lo más crítico)**. "Hecha" es terminal. Los 5
  contadores del encabezado suman el total y **cada uno lleva su cuadro de color**
  (Pendientes = blanco con borde, "sin color"). Junto al nombre, **↻ ×N** muestra
  las replanificaciones (solo tabla).
- **Regla de replanificación (v2):** mover una fecha **futura** es planificación
  (sin historial, y la fecha original acompaña); solo cuenta como replanificación
  mover una fecha que **vence hoy o ya venció** — ahí la fecha original se congela
  ("la última fecha comprometida antes de empezar a atrasarse").
- **Columna "Atraso"** (tabla y Mis Tareas desktop): reemplaza a Fecha Original.
  Muestra **"N días"** (hábiles) que la fecha vigente se corrió **hacia adelante**
  respecto de la comprometida original, o **"—"** si no hay atraso — incluidos los
  adelantos, que no interesan (un solo estado visual para "sin atraso"). Con el
  encabezado "Atraso" la columna es autoexplicativa, sin signos. La columna vacía
  es señal en sí misma. Font monoespaciado, como la fecha. La fecha original exacta
  queda consultable en el panel de información. El menú de orden ordena por la
  cantidad de días de atraso.
- **Fechas en cualquier día**, incluidos sábado y domingo. La Gantt alterna entre
  **solo días hábiles** (default) y **semana completa (7 días)**, con aviso de
  tareas de fin de semana ocultas.
- **Horizonte del Gantt:** *Alrededor de hoy* (default fijo: 2 semanas atrás +
  actual + 2 adelante, no persistido) y *Todo el proyecto*. Para ver un rango
  específico se usa el filtro de fechas con rango fijo, que define el horizonte.
  Al hacer scroll vertical, **ambas bandas del encabezado** (rango/período arriba
  + días abajo) quedan **fijas** como un único bloque sticky.
- **En mobile la Gantt no se ofrece** (la grilla no funciona en pantalla
  angosta): dentro de un proyecto solo queda la Tabla, sin toggle de vistas. Mis
  Tareas se abre desde el menú izquierdo. En desktop se mantienen Tabla y Gantt.
- **Gantt editable — estándar por clics (sin arrastre):** clic izquierdo en una
  celda vacía planifica la tarea ese día; clic izquierdo sobre una marca **futura**
  la borra — si la marca venía de una replanificación, borrarla **deshace ese
  movimiento** (vuelve a la fecha anterior y elimina el registro del historial);
  si no, la tarea queda "sin planificar". Una tarea que vence hoy o ya venció
  **no se puede borrar** (mini-aviso: "No puedes eliminar tareas que ya pasaron") —
  se marca lista o se replanifica con un clic en **cualquier día, pasado o futuro**
  (sirve para registrar tareas que ya ocurrieron con su fecha real; cuenta como
  replanificación); **clic derecho sobre la marca alterna lista / no lista**
  (el menú contextual del navegador queda suprimido sobre la grilla). Cada celda
  explica su gesto con un **tooltip contextual** (con retardo corto) según su
  estado — planificar, quitar/deshacer, marcar lista o replanificar — en vez de
  una leyenda permanente. La ✓ de una
  lista queda en su última fecha planificada. "+" al pasar el mouse crea un hermano
  justo debajo (frente/sub frente/tarea) **inline en la propia grilla**, igual que
  los "+ agregar" de contenedores vacíos. Al pie, **filas de carga por persona**
  (cada tarea cuenta una sola vez, en su fecha vigente, hecha o no; nombres
  congelados al hacer scroll), una fila **"Sin asignar"** con las tareas sin
  responsable por día y una fila **"Total"** con la suma de todas.
- **Sidebar con dos modos:** fija (default) o **escondida** — se contrae a una
  franja de íconos (uno por proyecto) siempre clicable; al pasar el mouse la barra
  completa se despliega al lado y se repliega al salir. La preferencia se recuerda
  por usuario entre sesiones.
- **Menú "Ordenar"** (junto a Filtrar, en tabla y Gantt): la lista de campos
  ordenables está **a la vista**, cada uno con controles **↑ ascendente / ↓
  descendente**. Tocar una dirección **activa** ese campo como **prioridad 1**
  (el último activado manda) y muestra su número; activar otro lo antepone y
  renumera al resto. La dirección activa se **resalta**; volver a tocarla
  desactiva el campo. Es **multinivel** (varios campos con prioridad, armada por
  orden de activación). Campos: Responsable · Estado · Fecha Objetivo ·
  **Atraso** (más **Proyecto** en Mis Tareas). Estado ordena por **gravedad**
  (Hecha → Pendiente → Pendiente replanificada → Atrasada → Atrasada
  replanificada), no alfabético. Ordena **dentro de cada sub frente** sin mezclar
  tareas entre sub frentes (en la Gantt, reordena las filas del panel izquierdo
  dentro de cada bloque). **"Limpiar orden"** vive fuera del menú, junto al botón.
  Un orden sin guardar es **momentáneo**; sólo persiste si se guarda como parte de
  una vista. No se ordena haciendo clic en el encabezado de columna.
- **Filtros y orden guardables como "vista":** por Fecha Objetivo (relativas Hoy /
  Esta semana / Próxima semana / Este mes — semana de lunes a domingo —, rango
  fijo o **Sin fecha**), Responsable (incluye **Sin asignar**) y Estado, con
  multi-selección ("o" dentro del campo, "y" entre campos). Responsable y Estado
  incluyen **"Seleccionar todos"** (alterna a "Deseleccionar todos"). El **filtro y
  el orden se guardan juntos** como una sola vista, con nombre, **privados por
  usuario y por proyecto**; se aplican/actualizan/renombran/eliminan desde el
  desplegable "Vistas". El **filtro y el orden son por proyecto**: aplicarlos en un
  proyecto **no afecta** a otro; cada proyecto conserva su propio estado
  (momentáneo hasta guardarlo como vista). Cada campo tiene su "Limpiar filtro"
  además del Limpiar global. En la tabla filtran filas; en la Gantt, responsable y estado filtran
  tareas y **la fecha define el horizonte visible** — con la excepción de **Sin
  fecha**, que en la Gantt filtra (muestra solo las tareas sin fecha, como filas
  sin marca, planificables ahí mismo) sin tocar el horizonte. En la tabla, los
  filtros quedan **fijos arriba** al hacer scroll y los encabezados de columna se
  congelan justo debajo. Los desplegables de filtro se muestran **por encima del
  contenedor** (no se recortan aunque la tabla sea corta, p. ej. en Mis Tareas).
- **"En horizonte visible (Gantt)"** (opción del filtro de Fecha): muestra las
  tareas con Fecha Objetivo **dentro del horizonte actual** de la Gantt, más las
  **sin fecha**. Solo se **activa desde la Gantt**; una vez activa **filtra ambas
  vistas** (tabla y Gantt) usando ese mismo rango; se puede **desactivar desde
  cualquier vista**. Es un modo de fecha excluyente y momentáneo (el rango es
  siempre "lo que está visible ahora").
- **Vista congelada ("foto"):** con un filtro y/u orden activo, el conjunto de
  filas visibles y su orden quedan **congelados**: editar una tarea (planificar,
  mover fecha, marcar hecha, renombrar, reasignar) **no la saca de la vista ni la
  reordena**, aunque deje de calzar. Cuando la foto queda desactualizada aparece,
  junto a "Vistas", un control discreto **"Actualizar vista"** que la recalcula (y
  desaparece). Sin filtro ni orden, la vista es **live**. Aplica a tabla y Gantt.
- **Modo oscuro:** por defecto **sigue el modo del sistema** del dispositivo
  (`prefers-color-scheme`), en vivo — un teléfono en oscuro ve la app oscura sin
  configurar nada. El botón 🌙/☀ es un **override manual** persistente por usuario:
  una vez que eliges claro u oscuro, esa elección manda por sobre el sistema. El
  botón vive al pie de la sidebar y, en mobile, también como **botón flotante
  junto al ☰** (siempre alcanzable). Los cinco colores de estado conservan su
  identidad con variantes ajustadas para fondo oscuro; el rastro de fechas
  anteriores queda visible incluso en tareas hechas (memoria histórica de la
  grilla; el color de fila y los contadores sí las tratan como Hecha).
- **Roles y permisos (reestructuración):** tres roles — **Admin** (ve y
  gestiona absolutamente todo; puede haber **varios admins**), **Consultor**
  (los proyectos que **él creó** + los que el admin le asigne; no ve los de
  otros consultores) y **Cliente** (solo los proyectos donde lo invitan).
  **Principio rector — dueño vs invitado:** si creaste el proyecto tienes
  **control total** dentro de él, sin configuración de permisos; si te
  invitaron/asignaron, operas según los permisos configurados **en tu acceso**
  (un invitado es un invitado, sea cliente o consultor). El admin queda fuera
  del principio: control total en todo.
- **Dos niveles de permisos:** (1) **Permisos de proyecto** del consultor
  (crear proyectos, archivar/eliminar los suyos, invitar clientes, configurar
  permisos de sus clientes) — pantalla propia (🔧 en Usuarios), los configura
  el admin. (2) **Set de ocho sobre tareas**, POR ACCESO (usuario × proyecto):
  crear frentes/sub frentes/tareas; editar fechas, marcar hechas, editar,
  archivar/eliminar, asignar responsable — con alcance "todas" o "solo
  asignadas" (asignar con "solo asignadas" = puede soltar lo suyo, no tomar lo
  ajeno). El mismo componente (🔑) sirve para clientes y consultores invitados.
  Todo se refuerza en la base de datos (RLS + triggers campo a campo).
- **Defaults por rol (al crear/asignar):** consultor → crear proyectos ✓,
  archivar/eliminar los suyos ✓, invitar clientes ✓, configurar permisos ✗.
  Cliente (ejecutor del plan) → crear tareas ✓, fechas y hechas "solo
  asignadas", asignar responsable "todas", estructura ✗. Consultor invitado a
  proyecto ajeno → todo habilitado ("un colega, no un cliente"). Ajustables
  caso a caso; ya no arranca todo en "No". **Los comentarios no se configuran:
  todos comentan siempre** (append-only).
- **Miembros:** el dueño de un proyecto ve **quiénes** están asignados
  (botón "Miembros" en el encabezado), pero **no sus permisos**; configura solo
  a los clientes de sus proyectos y solo con el permiso habilitado. Solo el
  admin asigna consultores a proyectos (propios o ajenos).
- **Ser miembro = ver el proyecto en la barra lateral.** El admin **no** queda
  asociado por default a cada proyecto (ni a los que crean los consultores): se
  **agrega o saca** a sí mismo como miembro desde el Módulo de Usuarios. Su
  poder no cambia — sigue viendo y gestionando cualquier proyecto desde ahí —,
  pero su barra solo muestra los proyectos donde es miembro. La lista de
  miembros de un proyecto no incluye admins que no se agregaron.
- **Alta por invitación (§8):** el admin crea el usuario y le envía un correo con
  enlace (caduca en 7 días, reenviable); el invitado define su contraseña. Un
  consultor con el permiso "invitar clientes" también puede invitar a los
  clientes de sus proyectos. Ver DEPLOY.md para el proveedor de correo y las
  Edge Functions.

**CRUD (Fase 1) — con interacción inline (Bloque 2)**
- Proyectos: crear / editar (nombre, descripción, color, estado) / eliminar. Multi-proyecto.
- Frentes: crear / renombrar / eliminar (sidebar). Un proyecto **sin frentes**
  ofrece además **"Agregar frente"** en el cuerpo de la Gantt y la Tabla, para
  crear el primero sin ir a la sidebar (si tienes el permiso). Sub Frentes:
  **crear y renombrar inline** en la tabla (sin ventanas) / eliminar.
- Tareas: **creación inline** ("+ Tarea" abre una fila vacía con el cursor en el
  título; Enter guarda y encadena la siguiente), **edición inline** de título y
  responsable (click directo en la celda), marcar hecha, replanificar (un click en
  la fecha abre el calendario; elegir guarda), archivar y eliminar.
- **Comentarios acumulables** por tarea (N5): hilo con autor y fecha, append-only —
  cada comentario suma, nunca reemplaza. Chip 💬 en la fila; el hilo vive en el
  panel de detalle. **Todos los miembros comentan, siempre**; no se editan.

**Historial de replanificaciones (5.6)**
- En Supabase, un **trigger nativo** registra cada cambio de `fecha_objetivo`, de modo
  que ningún camino de edición lo eluda (recomendación del documento). El actor se pasa
  vía el RPC `replanificar_tarea`. En modo Local, la misma regla se aplica en código.

**Usuarios y roles (Fase 2 — reestructurado)**
- **Login**: Supabase Auth (email + contraseña). El Admin crea al usuario con su email;
  cuando esa persona inicia sesión por primera vez, un trigger vincula su cuenta.
- **Módulo de Usuarios** — **Admins**: listar, crear (con 3 roles y defaults),
  editar, desactivar/reactivar; asignar proyectos a **consultores y clientes**
  (cualquier proyecto, propio o de otro consultor, e **incluirse/excluirse a sí
  mismos** como miembro); 🔧 permisos de proyecto del consultor; 🔑 permisos del
  acceso (por proyecto). **Consultores** acceden al **mismo módulo, acotado**:
  ven solo a la gente con acceso a **sus** proyectos (clientes y otros
  consultores); invitan y configuran a los **clientes** de esos proyectos según
  sus permisos (`invitarClientes` / `configurarPermisosClientes`); a los demás
  consultores los ven pero no los editan; no ven usuarios ni proyectos ajenos.
- **Sin límite de admins**: se eliminó la regla de "exactamente 2".
- **RLS real**: las políticas de Postgres garantizan a nivel de base de datos la
  visibilidad por rol (admin todo; consultor dueño + asignados; cliente
  invitados) y la escritura por permisos — la interfaz es una capa de
  conveniencia, no la barrera de seguridad. `scripts/validar-rls.mjs` la valida
  rol por rol contra la API.

**Migración a roles (runbook — aplicar en este orden)**
0. **Respaldo**: export manual de la base (Dashboard → Database, o `pg_dump`).
   El plan gratuito no trae backups automáticos.
1. **Migración 12** (`20260707000012_roles_y_permisos.sql`): modelo + backfill
   (rol consultor, dueño = admin creador, accesos generalizados con permisos,
   los clientes demo conservan su configuración) + RLS completa. Todo junto.
2. **Redeploy de la Edge Function** `invitar-usuario` (`supabase functions deploy
   invitar-usuario`): ahora autoriza también a consultores con permiso.
3. **Migración 13** (`20260707000013_fix_replan_fecha_origen.sql`): corrige la
   regla de replanificación (§1 del pedido post-validación). La migración 12,
   al pasar el trigger de historial a `security definer`, perdió la guardia
   `old.fecha_objetivo <= current_date`; sin ella, mover una fecha **futura**
   contaba como replanificación. La migración 13 la restaura (evaluar sobre la
   fecha de **origen**). Se aplica sola, sin dependencias de datos.
4. **Compuerta de validación** (crítica): correr `scripts/validar-rls.mjs`, que
   verifica rol por rol que la RLS **impide** el acceso indebido — no solo que
   la UI lo oculta. Sin entorno local, se corre desde **GitHub Actions**:
   cargar los secrets del repo (ver cabecera de
   `.github/workflows/validar-rls.yml`) y lanzar el workflow **"Validar RLS
   (compuerta)"** desde la pestaña Actions (Run workflow). Verde = pasa;
   rojo = la RLS deja pasar algo indebido.
5. **Recién entonces** invitar usuarios reales.

**Fase 3 — Pulido**
- **Mis Tareas (Módulo 3)**: únicamente las tareas donde el usuario
  es responsable, de todos sus proyectos, con las vencidas primero. Mismo formato que
  las demás tablas (check, pills, colores de fila) con columnas Proyecto y Ubicación;
  usa el sistema común de filtros (Fecha Objetivo / Estado / **Proyecto**) con
  guardados propios del contexto, separados de los de cada proyecto. En mobile,
  Proyecto se fusiona dentro de Ubicación (ruta completa) y sale Atraso.
- **Panel lateral de detalle** (backlog de 7.2): click sobre una tarea o una marca del
  Gantt abre un panel con el detalle completo, la línea de tiempo del historial y las
  acciones operativas (marcar hecha, replanificar, archivar) para admins. Se cierra
  con ✕, con Escape o al hacer click fuera.
- **Archivo de canceladas (6.3)**: archivar una tarea la saca del plan (vistas y
  contadores) conservando su historial; queda consultable por sub frente y puede
  restaurarse. Distinto de eliminar (definitivo).
- **Resumen / indicadores por proyecto**: tarjetas con % de avance, barra de progreso y
  contadores (hechas, pendientes, por replanificar, replanificadas abiertas) de todos
  los proyectos visibles. Disponible también para clientes (con sus proyectos).

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
  (hilo acumulable por tarea, append-only; comentan admins, leen todos los
  que ven la tarea). Migra el texto legado de `tarea.comentarios`.
- `supabase/migrations/20260707000006_estados_y_fechas.sql` — fechas opcionales
  (la tarea nace sin fecha; la primera fija `fecha_original` sin historial) y
  anclaje de toda fecha al día hábil más cercano, ambos como triggers.
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

Para crear los usuarios en Supabase Auth: panel → Authentication → Add user (con el
mismo email que registraste en el Módulo de Usuarios). Al primer login se vinculan.
**Importante (seguridad, migración 14):** el enlace auth↔usuario ahora exige una
invitación **usada**; el flujo normal es invitar desde el Módulo de Usuarios y que
la persona active su cuenta por el enlace del correo. Para el **primer admin** de
una instalación nueva (sin invitación), enlazar su `auth_id` manualmente por SQL.

## Estructura

```
src/
  types.ts               Modelo de datos (sección 5)
  lib/
    dates.ts             Días hábiles y formato
    derive.ts            Estados derivados, colores y marcas (sección 6)
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
    seed.ts              Datos semilla + HOY simulado
  components/
    Sidebar, Header, TableView, GanttView, Marca, Legend, HoverCard,
    TaskDetail, Modal, TextPromptModal, ProyectoModal, TareaModal,
    LoginPage, UsersView, UsuarioModal, TaskPanel, MiPanelView, ResumenView
supabase/
  migrations/
    …_init.sql           Esquema + trigger de historial + RPC
    …_fase2_auth.sql     Auth, límite 2 admins y RLS por rol
    …_fase3_archivo.sql  Campo archivada (archivo de canceladas)
  seed.sql               Datos de arranque (opcional)
docs/
  documento-funcional-v3.1.md
```

## Roadmap (sección 9)

- **Fase 1 — Uso interno:** ✅ base de datos + CRUD + las dos vistas. Sin login.
- **Fase 2 — Clientes:** ✅ login, roles admin/cliente, asignación de proyectos por
  cliente, RLS real (Módulo 1).
- **Fase 3 — Pulido:** ✅ Mis Tareas (Módulo 3), panel lateral de detalle, archivo de
  canceladas, indicadores por proyecto.

Con esto, el alcance de la Versión 1 del Documento Funcional v3.1 está completo.
Siguiente hito: **despliegue** — la guía paso a paso está en [DEPLOY.md](DEPLOY.md).

## Stack

Vite + React + TypeScript + Supabase (Postgres + Auth + RLS). Pensado para desplegar en
Vercel/Netlify (capa gratuita), con costo de operación cercano a cero.
