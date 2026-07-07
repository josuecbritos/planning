# Planificador — Dummy interactivo (Documento Funcional v3.1)

Especificación viva de la **Herramienta de Planificación de Proyectos** descrita en el
Documento Funcional v3.1. Implementa las vistas **Tabla** (tipo Monday) y **Gantt**
(grilla tipo Excel) con la lógica completa de estados derivados y colores de la sección 6.

Es un *dummy*: trabaja **en memoria**, sin backend ni login. Sirve como referencia de
interfaz para migrar luego a React + Supabase (sección 9 del documento).

## Ejecutar

```bash
npm install
npm run dev      # servidor de desarrollo (Vite)
npm run build    # typecheck + build de producción
npm run preview  # sirve el build
```

## Qué implementa

- **Vista Tabla (4.2 / 7.2):** navegación por Frente en el sidebar; cada Sub Frente es
  una tabla. Columnas: Hecha (checkbox), Tarea (con color de gestión), Responsable,
  F. original (solo lectura), F. objetivo (editable) y F. real.
- **Vista Gantt (4.3):** grilla con columnas fijas (Frente/Sub Frente/Tarea/Responsable)
  congeladas al hacer scroll, celdas combinadas reales, una columna por día hábil
  (omite fines de semana), encabezado de dos niveles (semana / día), columna de HOY
  destacada, y separadores por semana y sub frente.
- **Un solo estado manual: `hecha`** (6.1). Todo lo demás se deriva (6.2):
  `vencida`, `pendiente` y el atributo `replanificada` (COUNT(historial) > 0).
- **Color del campo tarea (6.5):** verde = lista · rojo = haz algo (replanificar) ·
  ámbar = vigílala · sin color = en curso.
- **Marcas del Gantt (6.4):** `✕` pendiente · `■` verde hecha (en la columna de la
  fecha real) · `■` rojo no cumplida · `▪` rojo tenue por cada fecha anterior.
- **Historial de replanificaciones (5.6):** cambiar la fecha objetivo genera un registro
  automático; el detalle completo (cadena de fechas, veces que se movió, si se cerró
  tarde) vive en el **tooltip** al pasar el cursor (6.6).
- **Contadores del encabezado (7.2):** Hechas / Pendientes / Por replanificar / Replanificadas
  abiertas, recalculados según el frente filtrado.

## Interacciones para probar

- Marcar una tarea como **hecha** → registra la fecha real (= hoy simulado) y la pinta de verde.
- Cambiar la **fecha objetivo** de una tarea → genera historial; una tarea roja (vencida)
  pasa a ámbar; si la nueva fecha también vence, vuelve a rojo (ciclo de gestión, 6.5).
- **Hover** sobre el nombre de una tarea o una marca del Gantt → detalle completo.
- **Filtrar por frente** desde el sidebar → afecta ambas vistas y los contadores.

## Datos semilla

Muestra representativa del **Plan PGP Arauco**: 2 frentes, 5 sub frentes y responsables
DV/JB/FS/IC, con tareas que ejercitan todos los estados (hechas, hechas tarde, vencidas,
pendientes y replanificadas). **Hoy simulado:** 30-oct-2024 (mitad del plan). En la app
real, "hoy" sería la fecha del sistema.

## Stack

Vite + React + TypeScript. Pensado para migrar a Supabase (Postgres + Auth + RLS) y
desplegar en Vercel/Netlify, según el camino a producto de la sección 9.

## Estructura

```
src/
  types.ts            Modelo de datos (sección 5)
  data/seed.ts        Datos semilla + HOY simulado
  lib/
    dates.ts          Utilidades de días hábiles y formato
    derive.ts         Estados derivados, colores y marcas (sección 6)
    actions.ts        Acciones: marcar hecha, replanificar (genera historial)
  components/
    Sidebar, Header, TableView, GanttView,
    Marca, Legend, HoverCard, TaskDetail
```
