# Planificador de Proyectos (Documento Funcional v3.1)

Herramienta de planificación de proyectos con gestión interna y visibilidad
controlada al cliente. Implementa las vistas **Tabla** (tipo Monday) y **Gantt**
(grilla tipo Excel) con la lógica de estados derivados y colores de la sección 6
del Documento Funcional, el **CRUD** completo sobre **Supabase** (Fase 1),
**login con roles Admin/Cliente + acceso por proyecto** (Fase 2, Módulo 1) y el
**pulido de la Fase 3**: Mi Panel, panel lateral de detalle, archivo de
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
En modo Local es un selector "entrar como…" con los usuarios del seed (2 admins y
1 cliente), pensado para demostrar los roles sin backend.

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
  tabla. Columnas: Hecha (checkbox), Tarea (con color de gestión), Responsable,
  F. original (solo lectura), F. objetivo (editable → replanifica), F. real.
- **Gantt en grilla:** columnas fijas congeladas, celdas combinadas reales, una columna
  por día hábil, encabezado semana/día, columna de HOY, marcas de la sección 6.4 y
  tooltips con historial (6.6).
- **Estados derivados (6.2):** el único estado manual es `hecha`; `vencida`,
  `pendiente` y el atributo `replanificada` se derivan.
- **Colores de gestión (6.5):** verde = lista · rojo = replanificar · ámbar = vigílala ·
  sin color = en curso.

**CRUD (Fase 1)**
- Proyectos: crear / editar (nombre, descripción, color, estado) / eliminar. Multi-proyecto.
- Frentes y Sub Frentes: crear / renombrar / eliminar.
- Tareas: crear / editar / eliminar; marcar hecha; replanificar (cambiar fecha objetivo).

**Historial de replanificaciones (5.6)**
- En Supabase, un **trigger nativo** registra cada cambio de `fecha_objetivo`, de modo
  que ningún camino de edición lo eluda (recomendación del documento). El actor se pasa
  vía el RPC `replanificar_tarea`. En modo Local, la misma regla se aplica en código.

**Usuarios y roles (Fase 2 — Módulo 1 / 7.1)**
- **Login**: Supabase Auth (email + contraseña). El Admin crea al usuario con su email;
  cuando esa persona inicia sesión por primera vez, un trigger vincula su cuenta.
- **Módulo de Usuarios** (solo Admins): listar, crear, editar, desactivar/reactivar,
  y asignar/desasignar proyectos a usuarios Cliente, proyecto a proyecto (tabla 5.7).
- **Regla de 2 Admins** (5.1): el sistema admite exactamente 2 admins activos. La regla
  vive como trigger en la base de datos y la UI deshabilita la opción al llegar al límite.
- **Cliente**: ve **solo los proyectos asignados**, con las mismas vistas Tabla y Gantt
  (sin diferencia visual, como pide 4.3) pero **solo lectura**: sin botones de edición,
  sin checkbox, sin replanificar, sin módulo de usuarios.
- **RLS real**: las políticas de Postgres garantizan a nivel de base de datos que el
  cliente solo lee sus proyectos asignados y que solo los admins escriben — la interfaz
  es una capa de conveniencia, no la barrera de seguridad.

**Fase 3 — Pulido**
- **Mi Panel (Módulo 3)**: todas mis tareas de todos los proyectos, ordenadas con las
  vencidas primero, filtro por estado (todas / pendientes / vencidas / replanificadas
  abiertas / hechas) y por proyecto.
- **Panel lateral de detalle** (backlog de 7.2): click sobre una tarea o una marca del
  Gantt abre un panel con el detalle completo, la línea de tiempo del historial y las
  acciones operativas (marcar hecha, replanificar, archivar) para admins.
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

Para crear los usuarios en Supabase Auth: panel → Authentication → Add user (con el
mismo email que registraste en el Módulo de Usuarios). Al primer login se vinculan.

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
- **Fase 3 — Pulido:** ✅ Mi Panel (Módulo 3), panel lateral de detalle, archivo de
  canceladas, indicadores por proyecto.

Con esto, el alcance de la Versión 1 del Documento Funcional v3.1 está completo.
Siguiente hito natural: **despliegue** (Vercel/Netlify + proyecto Supabase productivo).

## Stack

Vite + React + TypeScript + Supabase (Postgres + Auth + RLS). Pensado para desplegar en
Vercel/Netlify (capa gratuita), con costo de operación cercano a cero.
