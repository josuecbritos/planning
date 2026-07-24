# Diagnóstico mobile — Andotek Planning

**Fecha:** julio 2026 · **Base:** `main` tras el PR #41 (solicitudes #187–#193).
**Alcance:** solo análisis; no se modificó código.

**Método.** Build de producción servido en local, recorrido con Playwright en
viewport **390×844** (`isMobile` + `hasTouch`, escala 2) por el rol admin, con
mediciones del DOM en cada pantalla —anchos reales de columna, desbordes
horizontales, altura y scroll de los modales, áreas táctiles— más capturas. Las
cifras de este documento son medidas, no estimaciones.

Este diagnóstico **actualiza** al de julio anterior: parte de sus hallazgos se
resolvieron y aparecieron otros nuevos.

---

## 1. Resumen ejecutivo

La **operación diaria en mobile está sana**: ver el plan, revisar las tareas
propias, consultar el resumen y navegar funcionan bien y sin desbordes. Lo que
está roto es la **administración**: configurar permisos es imposible desde el
teléfono, y las dos tablas de administración muestran los datos sin la columna
que dice **de quién** o **de qué proyecto** se trata.

Son dos problemas críticos, ambos acotados y de arreglo aditivo (solo CSS
mobile, sin tocar datos, permisos ni desktop).

---

## 2. Qué mejoró desde el diagnóstico anterior

| Hallazgo de julio | Estado hoy |
| --- | --- |
| Tabla de Usuarios con envoltura **letra por letra en vertical**, filas de +600px | ✅ **Resuelto** (#181/#183/#185: `table-layout: fixed`, anchos explícitos, filas delgadas) |
| Chips de proyecto y de rol partidos en vertical | ✅ Resuelto |
| Segmentos `No / Solo asignadas / Todas` **cortados contra el viewport** | ✅ Resuelto (ya no exceden el ancho de pantalla) |

Y sigue sano lo que ya estaba bien:

| Pantalla | Estado | Evidencia |
| --- | --- | --- |
| **Login** | Bien | 0 desborde, 0 controles chicos |
| **Tabla del proyecto** | Bien | Encaja exacto en 390px. Columnas: Hecha 32 · Tarea 147 · Resp. 34 · Estado 62 · Fecha 64 · acciones 26. `Atraso` se colapsa a 0 **a propósito** en mobile |
| **Mis Tareas** | Bien | Sin desborde |
| **Resumen** | Bien | Sin desborde |
| **Navegación** (drawer ☰ + velo + 🌙) | Bien | Patrón correcto |
| **Panel de detalle de tarea** | Bien | 359px de ancho, alto completo, `overflow-y: auto` → scrollea |
| **Gantt** | Ausente a propósito | Incluida la nueva de Mis Tareas (#190), que también se oculta bien |

Sin errores de consola en todo el recorrido.

---

## 3. 🔴 C1 — El modal de permisos (🔑) no se puede usar

**Medición del modal "Permisos de … en …" (set de ocho) en 390×844:**

| Métrica | Valor |
| --- | --- |
| Alto del modal | **999px** (viewport: 844) |
| Borde superior | `top: -77` → **cabecera y ✕ fuera de pantalla por arriba** |
| Borde inferior | `bottom: 922` → **Guardar / Cancelar fuera de pantalla por abajo** |
| Scroll interno | **No** (`overflow-y: hidden`) |

**Consecuencia:** no se puede guardar ni cerrar. La única salida es tocar fuera
del modal, que **descarta los cambios**. Configurar permisos desde el teléfono
hoy es imposible.

Problemas asociados, visibles en la misma pantalla:

- Los controles segmentados **se salen del borde derecho de la tarjeta** (no del
  viewport, por eso una medición contra el ancho de pantalla no los detecta).
- Los **botones flotantes ☰ y 🌙 tapan el texto** de ayuda del modal (ver C3).
- Etiquetas quebradas en 2–3 líneas ("Marcar como hechas", "Archivar / eliminar").

> Corresponde a los puntos P2 y P3 del diagnóstico de julio: **siguen abiertos**.

**Nota:** los modales cortos sí funcionan bien — Nuevo usuario (452px), Miembros
(415px) y Permisos de proyecto 🔧 (591px) caben, con cabecera y pie visibles. El
problema aparece cuando el contenido supera el alto de la pantalla, porque
`.modal-card` no tiene `max-height` ni scroll propio.

---

## 4. 🔴 C2 — Las tablas de administración pierden la columna de identidad

| Tabla | Ancho real | Exceso sobre 390px | Columna 1 | Celda de acciones |
| --- | --- | --- | --- | --- |
| **Usuarios** | 723px | **+333px** | `Usuario` = **0px** | x 563–711 → **fuera del viewport** |
| **Admin → Proyectos** | 537px | **+147px** | `Proyecto` = **0px** | x 377–525 → **fuera del viewport** |

En Usuarios se ven los **emails pero no los nombres**; en Proyectos no se ve el
**nombre del proyecto**. Además hay que arrastrar horizontalmente ~333px para
alcanzar los botones de acción, momento en que la fila ya perdió su referencia.

**Causa — y es una regresión.** La solicitud #181 estabilizó el desktop con
`table-layout: fixed` y anchos explícitos (`col-email: 230`, `col-rol: 116`,
`col-estado-adm: 112`, `col-dueno: 160`, `col-acc: 148`…), **pero los declaró
fuera de la media query**. En 390px esos anchos suman ~698px y la única columna
sin ancho propio —la primera, la de identidad— se colapsa a **cero**.

Afecta igual a la **vista acotada del consultor**, que usa la misma tabla.

> El diagnóstico de julio ya recomendaba tarjetas para Usuarios (su P1). No se
> hizo; en cambio se arregló el desktop con anchos fijos, que es lo que produjo
> esta regresión. **Mientras las reglas de tabla no estén acotadas por media
> query, cada ajuste de desktop puede volver a romper mobile sin que se note.**

---

## 5. 🟡 Medio

**C3 — Botones flotantes por encima de los modales.** `☰` y `🌙` tienen
`z-index: 2200`, por encima del overlay de modales (`2000`): tapan contenido y
permiten abrir el drawer sobre un formulario a medio llenar. Ya estaba en el
diagnóstico de julio.

**C4 — Áreas táctiles bajo lo recomendado (≥44px).** Medidos: ✕ de modal 25×22 ·
segmentos de permisos 27px de alto · botones de modal 30px · `icon-btn` de las
tablas ~21px. Afecta sobre todo a las pantallas de administración.

## 6. 🔵 Menor

- **Encabezado del proyecto**: título + 5 contadores + barra de filtros consumen
  bastante alto antes del contenido. Aceptable, compactable.
- El botón **"+ Usuario"** es grande y desplaza el subtítulo (cosmético).

---

## 7. Plan de mejoras propuesto

**Principio:** aditivo, **solo dentro de `@media (max-width: 768px)`** — cero
impacto en desktop, que está validado. Sin tocar datos, permisos ni RLS.

### M1 — Modales operables en mobile *(resuelve C1)*

Regla genérica para `.modal-card` en mobile: `max-height: calc(100dvh - 24px)` +
`overflow-y: auto`, **cabecera sticky** con la ✕ siempre visible y **botonera
sticky** abajo; `.modal-overlay` con `align-items: flex-start` y scroll propio.
Además, filas de permisos a **dos líneas** (etiqueta arriba; segmento a ancho
completo abajo, con `flex: 1` por opción).

Beneficia a **todos** los modales, no solo al 🔑, y previene el mismo fallo en
cualquier modal futuro.

### M2 — Administración legible *(resuelve C2)*

Dos caminos:

- **(a) Tarjetas en mobile — recomendado.** `thead` oculto y `tr → display: grid`
  con áreas: nombre + chips arriba, datos secundarios debajo, acciones táctiles
  al pie. Es CSS sobre la tabla existente, **sin bifurcar el render** ni duplicar
  la lógica de `UsersView` / `AdminProyectosView`. Cubre automáticamente la vista
  del consultor.
- **(b) Más barato.** Acotar los anchos de #181 a `@media (min-width: 769px)` y
  dejar scroll horizontal con la **primera columna sticky**. Resuelve la
  invisibilidad del nombre, pero mantiene el arrastre lateral.

En ambos casos conviene **acotar por media query las reglas de tabla**, para que
un futuro ajuste de desktop no vuelva a romper mobile.

### M3 — Áreas táctiles ≥44px *(resuelve C4)*

En `icon-btn`, `modal-x`, segmentos de permisos y checkboxes. Barato y toca los
mismos componentes que M1/M2.

### M4 — Capas *(resuelve C3)*

Bajar `☰`/`🌙` por debajo del overlay o, mejor, **ocultarlos mientras haya un
modal o el panel de detalle abiertos**.

### Secuencia sugerida

Un solo pedido con **M1 + M2 + M4**, con **M3** incluido por cercanía: es un
bloque coherente —"administración usable en mobile"— y es donde está todo lo
roto. El encabezado del proyecto (🔵) queda para un pedido menor posterior.

**Qué no tocar:** tabla del proyecto, Mis Tareas, Resumen, navegación, panel de
detalle y la ausencia deliberada de Gantt — ya iterados y funcionando.

---

## 8. Pregunta abierta

El plan asume que **administrar desde el teléfono** (usuarios, permisos,
proyectos) es un caso de uso real. Si en la práctica eso siempre se hace desde el
computador, **M2 baja de prioridad**: bastaría con que las tablas se vean dignas
y sin datos invisibles (opción b), sin llegar a tarjetas. M1 sigue siendo
crítico en cualquier escenario, porque hoy un modal alto deja al usuario sin
forma de guardar ni cerrar.
