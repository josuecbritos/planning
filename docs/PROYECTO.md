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
  proyectos, vencidas primero.
- **Resumen:** indicadores por proyecto (avance, contadores por estado).

**Modelo de estados (derivado, no editable a mano):** cada tarea cae en una de
cinco categorías excluyentes — Hecha (verde), Pendiente (sin color), Pendiente
replanificada (ámbar), Atrasada (rojo), Atrasada replanificada (morado). El
usuario solo marca "hecha"; el resto sale de la fecha y del historial.

**Replanificación con historial:** mover una fecha que ya venció cuenta como
replanificación (↻ ×N) y deja rastro; mover una fecha futura es planificación
(sin rastro). La fecha original se conserva. Es el diferenciador del producto.

**Colaboración:** comentarios acumulables por tarea (append-only; todos los
miembros comentan siempre). Panel lateral de detalle con la línea de tiempo.

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
| `DEPLOY.md` | Despliegue (Supabase, Vercel, Resend, Edge Functions). |
