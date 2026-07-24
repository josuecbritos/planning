# Andotek Planning — Visión general

Documento de contexto: qué es la herramienta, para qué existe, qué hace hoy y
cómo está construida. Es el punto de entrada para entender el proyecto en su
**estado actual** (posterior a todas las iteraciones). Para el detalle:
`documento-funcional-v3.1.md` (especificación), `README.md` (uso y desarrollo),
`SEGURIDAD.md` (invariantes de seguridad) y `DEPLOY.md` (despliegue).

---

## 1. Contexto y problema

Andotek es una consultoría pequeña que gestiona proyectos internos y de cara al
cliente. Antes, la gestión estaba dispersa entre Excel, Sheets y Trello. Tres
dolores concretos:

1. **Dispersión (dolor principal):** no existe un único lugar con el estado de
   todos los proyectos; la información se pierde entre planillas y tableros.
2. **Costo de usuarios externos:** las herramientas del mercado cobran por
   usuario externo, así que dar visibilidad al cliente sale caro o no se hace.
3. **Sin registro de replanificaciones:** al cambiar la fecha de una tarea, las
   herramientas sobrescriben la original; no queda rastro de cuántas veces se
   movió ni por qué fechas pasó, lo que impide mostrar transparencia real.

**Principio rector:** la herramienta debe entenderse rápido, sin manual. Debe
saltar a la vista si una tarea se atrasa o se replanifica mucho, sin badges
crípticos ni códigos que aprender.

## 2. Objetivos

- **Fuente única de verdad** del estado de todos los proyectos.
- **Visibilidad controlada al cliente** sin costo por usuario externo, con
  permisos finos por proyecto.
- **Transparencia de la planificación:** todo cambio de fecha queda registrado
  (historial de replanificaciones) y se muestra de forma legible.
- **Claridad inmediata:** colores y contadores comunican el estado sin
  explicación.

## 3. Usuarios y modelo de acceso

Tres roles, con visibilidad por proyecto y permisos configurables:

- **Admin** — personal de la consultora. Ve y gestiona todo. Puede haber varios
  (ya no hay tope de 2). No queda asociado a un proyecto por default: se agrega o
  saca como miembro desde el Módulo de Usuarios (ser miembro = verlo en la barra).
- **Consultor** — personal de la consultora. Ve **sus** proyectos (de los que es
  dueño) y los que un admin le asigne. Accede a un Módulo de Usuarios acotado
  para invitar y configurar a los **clientes de sus proyectos**.
- **Cliente** — externo. Ve solo los proyectos donde lo invitan; opera según los
  permisos configurados.

**Principio dueño vs invitado:** el **creador** de un proyecto (su dueño) tiene
control total dentro de él, sin configuración. Todo **invitado** (cliente o
consultor por igual) opera según los permisos de su acceso. El admin queda fuera
del principio: hace todo en cualquier proyecto.

**Dos niveles de permisos:**
- **De proyecto** (por consultor, los fija el admin): crear proyectos,
  archivar/eliminar los suyos, invitar clientes, configurar permisos de clientes.
- **De tareas** (por acceso, usuario × proyecto): crear frentes/sub frentes/
  tareas; editar fechas, marcar hechas, editar, archivar/eliminar y asignar
  responsable — con alcance "todas" o "solo asignadas".

**Los permisos se hacen cumplir en la base de datos** (RLS + triggers), no solo
en la interfaz. Ver `SEGURIDAD.md`.

## 4. Funcionalidades

**Estructura de trabajo:** Proyecto → Frentes → Sub Frentes → Tareas. CRUD
completo con creación y edición **inline** (sin formularios).

**Vistas:**
- **Tabla** (estilo Monday): estado, responsable, fechas, atraso, comentarios;
  filtros y orden guardables como "vista" por proyecto.
- **Gantt** (grilla tipo Excel): planificación por clics, horizonte configurable,
  filas de carga por persona, rastro de replanificaciones. (Oculta en mobile.)
- **Mis Tareas:** las tareas donde el usuario es responsable, en todos sus
  proyectos, vencidas primero. Tiene el mismo conmutador **Tabla / Gantt** que
  un proyecto (#190): la Gantt muestra la **carga propia repartida en el
  tiempo**, cruzando proyectos, con una columna extra y muy angosta a la
  izquierda —nombre del proyecto **rotado** sobre su color— que se repite en
  cada frente; si no cabe, se trunca y el nombre completo queda en el tooltip
  (el globo propio de la app, inmediato — no el `title` nativo, cuyo retardo lo
  fija el navegador, #192).
  Es de **lectura y replanificación**: mover fechas, marcar hechas y abrir el
  detalle, sin crear ni eliminar nada (una tarea creada ahí no sería del
  usuario hasta asignársela). Al pie, una sola fila con su total diario.
- **Resumen:** indicadores por proyecto (avance, total y desglose de las cinco
  categorías).

En la Tabla, frentes y sub frentes se **colapsan** con un chevron (▸/▾) para
enfocar; el colapso es momentáneo (no se guarda).

**Modelo de estados (derivado, no editable a mano):** cada tarea cae en una de
cinco categorías excluyentes — Hecha (verde), Pendiente (sin color), Pendiente
replanificada (ámbar), Atrasada (rojo), Atrasada replanificada (morado). El
usuario solo marca "hecha"; el resto sale de la fecha y del historial.

**Replanificación con historial:** mover una fecha que ya venció cuenta como
replanificación (↻ ×N) y deja rastro; mover una fecha futura es planificación
(sin rastro). La fecha original se conserva. Es el diferenciador del producto.

**Colaboración:** comentarios acumulables por tarea (append-only; todos los
miembros comentan siempre). Panel lateral de detalle con la línea de tiempo.

**Administración → Proyectos (#132):** módulo de admin, hermano de Usuarios.
Dueño de la relación usuario↔proyecto (miembros, 🔑) y del ciclo de vida:
**archivar** (#133) saca el proyecto de la barra, Resumen y Mis Tareas pero lo
conserva; **eliminar en cascada** (#134) solo sobre archivados. Ambas acciones
exigen el permiso `archivarEliminarProyectos`, verificado en la base.
_Administrar ≠ ser miembro_ (#146/#179): el admin **ve y administra todos** los
proyectos aunque no sea miembro; su barra lateral, Resumen y Mis Tareas muestran
**solo aquellos donde es miembro** (dueño o con acceso), para todos los roles.
Al llegar desde una notificación a un proyecto ajeno, se abre la tarea de forma
transitoria sin sumarlo a la barra. Cada fila marca la relación de la sesión con un pill excluyente
**Dueño / Miembro** (#165); unirse o salir de un proyecto se hace desde el
**modal de Miembros** (#164), donde uno se ve a sí mismo. El conteo de miembros
son solo usuarios **activos** (#167). "Ver archivados" **suma** los archivados;
sobre un proyecto archivado solo aparecen desarchivar y eliminar (#166). El
módulo de **Usuarios** está homologado con este: filas delgadas, mismos iconos y
un checkbox **"Ver desactivados"** que por defecto muestra solo activos (#170).
Ambas tablas comparten la **fila delgada** de Proyectos: es Usuarios el que
adelgaza su contenido (avatar, chips y número de proyectos), no Proyectos el que
engorda (#185).

En la barra lateral, hacer clic en un proyecto abre directamente **todos sus
frentes**; editar, **agregar frente** y archivar viven en un menú **⋯** junto al
nombre (#178/#189) — la lista de frentes contiene **solo frentes**. Ni los
proyectos ni los frentes muestran contador de tareas (#188): la lista se navega
por color, nombre y jerarquía. Los contadores de **Administración** (usuarios y
proyectos activos) sí se conservan. El control de plegar la barra es un
**chevron doble**, no un pin: contrae, no ancla (#187). Con la barra contraída
se ve solo el del riel y, al desplegarse, solo el de la cabecera: nunca los dos
a la vez (#191).

**Notificaciones in-app (#137):** tres eventos sobre tus tareas — te asignaron,
replanificaron o comentaron (nunca por acciones propias). Entrada en la barra
con contador naranja si hay sin leer; el panel emergente muestra las últimas,
marca todo como leído **al cerrarlo** (#156, para no perder de vista lo nuevo
mientras se lee), y el clic navega a la tarea (la **resalta** y abre su detalle;
si un filtro la excluye, permanece visible hasta navegar o "Actualizar vista",
#157/#158). El realce **no usa el fondo de la fila** —chocaba con el color de
categoría (verde/ámbar/rojo/morado), justo las que llegan por notificación—:
atenúa el resto de las filas y dibuja un **contorno naranja** alrededor de la
tarea, legible sobre cualquier categoría y en ambos temas (#186). Con la barra
contraída, una **campana fija** con el contador abre el mismo panel (#159). Las
genera la base, no el cliente.

**Baja de usuarios (#136):** eliminar = desactivar + invisible (sin borrado
físico, para no huérfanar el historial). Dar de alta el mismo correo reactiva la
fila y recupera sus accesos.

**Miembros:** el dueño ve quién está asignado (no sus permisos) e invita/config.
según sus permisos.

**Alta por invitación:** el admin (o un consultor con permiso, para clientes de
sus proyectos) crea al usuario y le envía un correo con enlace (caduca a 7 días,
un solo uso, reenviable). La persona define su contraseña y entra.

**Otros:** archivo de canceladas, tema claro/oscuro (sigue el sistema, con
override manual persistente por usuario), diseño responsive (mobile prioriza
Tabla y Mis Tareas).

## 5. Arquitectura

- **Frontend:** Vite + React 18 + TypeScript (estricto), single-page, sin router.
- **Backend dual, tras una interfaz `Repo`:**
  - **Memoria** (modo Local, sin backend): estado en `localStorage`, con un
    selector "entrar como…" para probar los roles. "Hoy" simulado.
  - **Supabase** (producción): Postgres + Auth + **RLS**. Mapeo snake_case ↔
    camelCase. La seguridad vive en la base (políticas RLS, funciones SECURITY
    DEFINER, triggers de validación campo a campo, RPC).
- **Auth:** Supabase Auth (email + contraseña); el admin crea el `usuario` con su
  email y, al activarse por el enlace de invitación, un trigger enlaza ambos.
- **Edge Functions (Deno):** `invitar-usuario` y `aceptar-invitacion` (correo via
  Resend). Secretos solo server-side.
- **Despliegue:** Vercel (frontend estático + `vercel.json` con headers de
  seguridad). Migraciones en `supabase/migrations/`, aplicadas desde el dashboard.

## 6. Estado y roadmap

- **Estado:** desplegado, con roles/permisos y alta por correo; auditoría de
  seguridad cerrada y validada (compuerta 34/34). Listo para usuarios reales tras
  el runbook de seguridad.
- **Pendientes no bloqueantes** (ver `SEGURIDAD.md` §6): features de plan Pro de
  Supabase (Leaked Password Protection, backups automáticos) y la actualización a
  Vite 8 (solo toolchain de desarrollo).

## 7. Mapa de documentos

| Documento | Para qué |
| --- | --- |
| `PROYECTO.md` (este) | Visión general y estado actual. |
| `documento-funcional-v3.1.md` | Especificación funcional detallada (incluye historia de decisiones). |
| `README.md` | Uso, funcionalidades por bloque, estructura del código, migraciones. |
| `SEGURIDAD.md` | Invariantes de seguridad — leer antes de tocar RLS/auth/deploy. |
| `auditoria-seguridad.md` | Informe de la auditoría (hallazgos por gravedad). |
| `runbook-seguridad.md` | Pasos para aplicar las correcciones de seguridad. |
| `diagnostico-mobile.md` | Estado de la vista mobile medido en 390×844 y plan de mejoras propuesto. |
| `DEPLOY.md` | Despliegue (Supabase, Vercel, Resend, Edge Functions). |
