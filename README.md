# Planificador de Proyectos (Documento Funcional v3.1)

Herramienta de planificación de proyectos con gestión interna y visibilidad
controlada al cliente. Implementa las vistas **Tabla** (tipo Monday) y **Gantt**
(grilla tipo Excel) con la lógica de estados derivados y colores de la sección 6
del Documento Funcional, y el **CRUD** de proyectos / frentes / sub frentes / tareas
sobre **Supabase** (Fase 1 de la sección 9).

## Dos modos de ejecución

La app elige el backend automáticamente según las variables de entorno:

| Modo | Cuándo | Datos |
| --- | --- | --- |
| **Supabase** | Hay `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` en `.env` | Postgres real (persistente, multiusuario) |
| **Local** | No hay credenciales | En memoria + `localStorage` (para demos sin backend) |

El chip en el encabezado indica el modo activo. En modo Local, "hoy" es una fecha
simulada (30-oct-2024) para que el dataset de demo muestre tareas hechas, vencidas
y futuras; en Supabase, "hoy" es la fecha real del sistema.

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

## Modelo de datos y esquema

`supabase/migrations/20260707000001_init.sql` crea las entidades de la sección 5:
`usuario`, `proyecto`, `frente`, `sub_frente`, `tarea`, `replanificacion`,
`acceso_cliente_proyecto`, más el trigger de historial y el RPC de replanificación.

> **Seguridad (Fase 1):** la RLS queda **permisiva** a propósito (uso interno, sin login).
> La **Fase 2** la reemplaza por políticas por usuario/rol y la regla "el cliente solo ve
> sus proyectos asignados" (tabla 5.7).

## Estructura

```
src/
  types.ts               Modelo de datos (sección 5)
  lib/
    dates.ts             Días hábiles y formato
    derive.ts            Estados derivados, colores y marcas (sección 6)
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
    TaskDetail, Modal, TextPromptModal, ProyectoModal, TareaModal
supabase/
  migrations/…_init.sql  Esquema + trigger + RPC + RLS
  seed.sql               Datos de arranque (opcional)
docs/
  documento-funcional-v3.1.md
```

## Roadmap (sección 9)

- **Fase 1 — Uso interno (esta entrega):** base de datos + CRUD + las dos vistas. Sin login.
- **Fase 2 — Clientes:** login, roles admin/cliente, asignación de proyectos por cliente,
  RLS real (Módulo 1).
- **Fase 3 — Pulido:** Mi Panel (Módulo 3), panel lateral de detalle, archivo de canceladas,
  indicadores por proyecto.

## Stack

Vite + React + TypeScript + Supabase (Postgres + Auth + RLS). Pensado para desplegar en
Vercel/Netlify (capa gratuita), con costo de operación cercano a cero.
