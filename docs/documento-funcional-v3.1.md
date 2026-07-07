# DOCUMENTO FUNCIONAL — VERSIÓN 3.1

## Herramienta de Planificación de Proyectos

*Gestión interna + visibilidad controlada al cliente*

**Versión 3.1 · Julio 2026**

Actualiza el Documento Funcional v3.0 (febrero 2025) con las decisiones tomadas durante las iteraciones del dummy interactivo construido sobre el plan real "Plan PGP Arauco". Conserva el detalle completo de la especificación original; cada sección modificada queda marcada con la nota **△ Cambio respecto a v3.0**. Las alternativas probadas y descartadas están documentadas en el Anexo A.

---

# 1. Contexto y Problema a Resolver

Empresa de consultoría de 2 personas que gestiona proyectos internos y de cara al cliente. La gestión hoy está dispersa entre Excel, Sheets y Trello, lo que genera tres problemas concretos:

| **Problema 1 — Dispersión (dolor principal)** |
| --- |
| No existe un único lugar donde ver el estado de todos los proyectos. El equipo alterna entre hojas de cálculo y tableros, generando pérdida de información y confusión sobre cuál es la fuente de verdad. |

| **Problema 2 — Costo de usuarios externos** |
| --- |
| Las herramientas del mercado cobran por usuario externo. Para una empresa pequeña con múltiples clientes, dar visibilidad al cliente tiene un costo alto o simplemente no se hace. |

| **Problema 3 — Sin registro visible de replanificaciones** |
| --- |
| Cuando una tarea cambia de fecha, la herramienta sobreescribe la fecha original. No queda registro de cuántas veces se movió ni por cuáles fechas pasó. Esto impide mostrar transparencia al cliente y hacer seguimiento real del desempeño del proyecto. |

**△ Principio rector agregado en las iteraciones:** la herramienta debe poder entenderla rápido alguien que nunca la ha usado. Debe ser muy visible si una tarea se va atrasando o replanificando mucho, sin manuales, badges crípticos ni códigos que aprender.

# 2. Objetivos del Sistema

| **#** | **Objetivo** | **Resultado esperado** |
| --- | --- | --- |
| O1 | Centralizar todos los proyectos | Un solo lugar para proyectos internos y de cliente |
| O2 | Controlar visibilidad por proyecto | El cliente accede solo a los proyectos que el Admin le asigne |
| O3 | Registrar historial de replanificaciones | Cada cambio de fecha queda registrado. Se ve fácilmente por cuáles fechas pasó una tarea |
| O4 | Vista Gantt por proyecto | Cada proyecto tiene su propio Gantt en formato grilla, con lectura fila-tarea × columna-día |
| O5 | Vista tipo Monday por proyecto | Navegación por Frente y Sub Frente dentro de cada proyecto |

**△ Cambio respecto a v3.0:** O4 decía "Gantt con estados por color". Tras las iteraciones, el Gantt es una **grilla tipo Excel** (ver 4.3) y el color por estado se concentra en el **campo tarea**, no en la marca (ver sección 6).

# 3. Alcance de la Versión 1

La primera versión incluye tres módulos. Todo lo que esté fuera de este alcance queda como backlog.

| **Módulo 1 — Usuarios** | **Módulo 2 — Proyectos y Tareas** | **Módulo 3 — Mi Panel** |
| --- | --- | --- |
| Crear y editar usuarios. Asignar rol: Admin o Cliente. Asignar acceso por proyecto (proyecto a proyecto). Desactivar usuarios | Crear proyectos con Frentes y Sub Frentes. Agregar tareas con fecha objetivo. Marcar tareas como hechas (registra fecha real). Vista tabla tipo Monday. Vista Gantt en grilla por proyecto. Historial de fechas por tarea | Ver todas mis tareas de todos los proyectos. Filtrar por estado o proyecto. Indicador visual de tareas vencidas |

**△ Cambio respecto a v3.0:** en el Módulo 2, "agregar tareas con fecha objetivo y estado" pasa a "con fecha objetivo" + "marcar como hecha": el estado dejó de ser un campo que se asigna (ver sección 6). En el Módulo 3, "tareas atrasadas" pasa a "tareas vencidas" (nueva nomenclatura derivada).

# 4. Estructura de un Proyecto

Cada proyecto tiene una jerarquía de tres niveles: Frente → Sub Frente → Tarea. Esta estructura es la base de ambas vistas (tabla y Gantt).

## 4.1 Jerarquía

| **Nivel** | **Qué es** | **Analogía en Excel** |
| --- | --- | --- |
| Proyecto | El contenedor mayor. Cada proyecto es independiente. | Un archivo Excel completo |
| Frente | Agrupación de alto nivel dentro del proyecto. | Celdas combinadas de primer nivel |
| Sub Frente | Agrupación dentro de un Frente. | Celdas combinadas de segundo nivel |
| Tarea | La unidad mínima de trabajo. Tiene fecha y puede marcarse como hecha. | Una fila dentro del Sub Frente |

## 4.2 Vista Tabla (tipo Monday)

La vista tabla organiza el contenido de un proyecto como una estructura de navegación y tablas anidadas:

- El proyecto es una carpeta en la barra lateral de navegación.
- Cada Frente es una página dentro de esa carpeta. Se navega entre frentes desde el menú lateral.
- Dentro de cada página de Frente, cada Sub Frente es una tabla independiente con su propio título.
- Cada fila de la tabla es una tarea, con sus columnas (ver especificación en 7.2).

| **Ejemplo de estructura** |
| --- |
| Proyecto: Implementación ERP |
| └ Frente: Levantamiento (página) |
| &nbsp;&nbsp;└ Sub Frente: Procesos Comerciales (tabla) |
| &nbsp;&nbsp;&nbsp;&nbsp;├ Tarea: Entrevista área ventas |
| &nbsp;&nbsp;&nbsp;&nbsp;└ Tarea: Mapeo de flujos actuales |
| &nbsp;&nbsp;└ Sub Frente: Procesos Financieros (tabla) |
| &nbsp;&nbsp;&nbsp;&nbsp;└ Tarea: Revisión de reportes contables |
| └ Frente: Diseño (página) |
| &nbsp;&nbsp;└ Sub Frente: Arquitectura de datos (tabla) |

## 4.3 Vista Gantt — formato grilla tipo Excel

**△ Sección reescrita respecto a v3.0.** La especificación original (eje temporal continuo, tareas como puntos sobre la línea de tiempo, escala semanas/meses) se probó en el dummy y resultó poco práctica: no era fácil identificar a qué día correspondía cada marca ni leer el anidado Frente → Sub Frente → Tarea. Se reemplaza por una grilla que replica la lectura del Excel de origen:

Cada proyecto tiene su propio Gantt. La grilla muestra todas las tareas del proyecto:

- **Eje vertical:** una fila por tarea. A la izquierda, cuatro columnas fijas — Frente, Sub Frente, Tarea, Responsable — **congeladas** al hacer scroll horizontal (equivalente a inmovilizar paneles en Excel).
- **Celdas combinadas reales:** el nombre del Frente aparece una vez y abarca visualmente todas sus filas (fondo verde institucional); lo mismo el Sub Frente (fondo gris), replicando las celdas combinadas del Excel de origen.
- **Eje horizontal: una columna por día hábil** (se omiten fines de semana, como en el plan de origen). Encabezado de dos niveles: arriba la semana ("7 oct – 11 oct"), abajo cada día con inicial y número ("lu 7", "ma 8"…).
- **Las marcas son celdas, no puntos:** cada marca ocupa la celda en la intersección exacta fila-tarea × columna-día. La semántica de las marcas se define en la sección 6.
- **Columna de HOY:** el día actual se destaca completo — encabezado en rojo y columna sombreada de arriba a abajo (reemplaza la "línea de hoy" de v3.0).
- **Grilla visible:** línea divisoria por día, línea más gruesa al inicio de cada semana (lunes), y separador horizontal entre sub frentes.
- **Leyenda** permanente sobre la grilla, en lenguaje llano, con máximo 5 elementos (ver sección 6).
- **Hover sobre una marca o sobre el nombre de la tarea:** tooltip con el detalle completo — estado, fecha comprometida original, fecha vigente, historial de fechas por las que pasó, y fecha real de término si está hecha.
- El cliente ve la misma grilla, sin diferencia visual, pero solo del proyecto que tiene asignado.

**Descartado de v3.0:** el botón de alternancia de escala semanas/meses (en formato grilla de días hábiles no aporta) y los puntos morados para fechas anteriores (ver sección 6 y Anexo A).

# 5. Modelo de Datos

Entidades principales del sistema y sus campos. Este modelo es la base de cualquier implementación.

## 5.1 Usuario

| **Campo** | **Tipo** | **Obligatorio** | **Notas** |
| --- | --- | --- | --- |
| id | UUID | Sí | Generado automáticamente |
| nombre | Texto | Sí | Nombre completo |
| email | Email | Sí | Único. Usado para login |
| rol | Enum | Sí | admin │ cliente |
| activo | Boolean | Sí | Permite desactivar sin borrar |
| fecha_creacion | Datetime | Sí | Automático |

| **Regla: dos Admins** |
| --- |
| El sistema admite exactamente 2 usuarios con rol Admin. Ambos tienen acceso total a todos los proyectos, usuarios y configuración. No existe restricción de proyectos para el rol Admin. |

## 5.2 Proyecto

| **Campo** | **Tipo** | **Obligatorio** | **Notas** |
| --- | --- | --- | --- |
| id | UUID | Sí | Automático |
| nombre | Texto | Sí | Nombre del proyecto |
| descripcion | Texto | No | Contexto general |
| color | Hex | No | Identificación visual |
| estado | Enum | Sí | activo │ pausado │ cerrado |
| creado_por | FK User | Sí | Siempre un Admin |
| fecha_creacion | Datetime | Sí | Automático |

*(El estado a nivel de proyecto se mantiene tal como en v3.0; la simplificación de estados de la sección 6 aplica solo a tareas.)*

## 5.3 Frente

| **Campo** | **Tipo** | **Obligatorio** | **Notas** |
| --- | --- | --- | --- |
| id | UUID | Sí | Automático |
| proyecto_id | FK | Sí | Proyecto al que pertenece |
| nombre | Texto | Sí | Nombre del frente. Ej: 'Levantamiento' |
| orden | Integer | Sí | Posición en la barra de navegación y en el Gantt |

## 5.4 Sub Frente

| **Campo** | **Tipo** | **Obligatorio** | **Notas** |
| --- | --- | --- | --- |
| id | UUID | Sí | Automático |
| frente_id | FK | Sí | Frente al que pertenece |
| nombre | Texto | Sí | Nombre del sub frente. Ej: 'Procesos Comerciales' |
| orden | Integer | Sí | Posición dentro del Frente |

## 5.5 Tarea

**△ Entidad modificada respecto a v3.0:** se elimina el campo `estado` (enum de 6 valores) y se agregan `hecha` y `fecha_real`. El detalle de la nueva lógica está en la sección 6.

| **Campo** | **Tipo** | **Obligatorio** | **Notas** |
| --- | --- | --- | --- |
| id | UUID | Sí | Automático |
| sub_frente_id | FK | Sí | Sub Frente al que pertenece |
| titulo | Texto | Sí | Nombre de la tarea |
| descripcion | Texto | No | Detalle o instrucciones |
| responsable_id | FK User | No | Admin asignado (solo hay 2 posibles) |
| fecha_objetivo | Date | Sí | Fecha de término esperada. La vigente actualmente |
| fecha_original | Date | Sí | Fecha con la que se creó la tarea. Nunca se modifica |
| **hecha** | **Boolean** | **Sí** | **△ Nuevo. Default false. El único estado que se marca a mano** |
| **fecha_real** | **Date** | **No** | **△ Nuevo. Fecha real de término; se registra al marcar hecha. Puede diferir de fecha_objetivo** |
| ~~estado~~ | ~~Enum~~ | — | **△ Eliminado.** Los estados se derivan; no se almacenan (ver sección 6) |
| comentarios | Texto | No | Notas libres sobre la tarea |
| orden | Integer | Sí | Posición dentro del Sub Frente |

| **Regla crítica: fecha_original vs fecha_objetivo** |
| --- |
| fecha_original: se asigna al crear la tarea y NUNCA se modifica. Es el compromiso inicial. |
| fecha_objetivo: es la fecha vigente. Cada vez que se modifica, se crea automáticamente un registro en el Historial de Replanificaciones. |
| **△ Actualización:** en v3.0 este cambio además mutaba el estado a "Replanificada x N". Ese estado ya no existe: la replanificación es historia (queda en el historial y se refleja en el color ámbar del campo tarea), no un estado. |

| **△ Regla nueva: toda tarea vencida exige nueva fecha** |
| --- |
| Si fecha_objetivo ya pasó y la tarea no está hecha, la interfaz la señaliza en rojo con la indicación "Replanificar →" hasta que se le asigne una nueva fecha objetivo. El rojo siempre demanda acción. |

## 5.6 Historial de Replanificaciones

Entidad diferenciadora del sistema. Se crea un registro automáticamente cada vez que fecha_objetivo de una tarea cambia. **Recomendación de implementación:** esta regla debe vivir a nivel de base de datos (trigger), no solo de interfaz, para que ningún camino de edición la eluda.

| **Campo** | **Tipo** | **Obligatorio** | **Notas** |
| --- | --- | --- | --- |
| id | UUID | Sí | Automático |
| tarea_id | FK | Sí | Tarea a la que pertenece |
| fecha_anterior | Date | Sí | La fecha objetivo antes del cambio |
| fecha_nueva | Date | Sí | La nueva fecha objetivo |
| numero_cambio | Integer | Sí | 1 para el primer cambio, 2 para el segundo, etc. |
| cambiado_por | FK User | Sí | Quién hizo el cambio |
| timestamp | Datetime | Sí | Cuándo se hizo el cambio |

| **Lo que esto permite mostrar** |
| --- |
| Al ver el detalle de una tarea (tooltip): lista de todas las fechas por las que pasó (fecha original → fecha 2 → … → fecha vigente). |
| En la vista Gantt: **△** marcas rojas tenues en cada fecha anterior donde estuvo la tarea (en v3.0 eran puntos morados; se unificó en rojo = fecha incumplida, ver sección 6). |
| **△** El color ámbar del campo tarea (replanificada y abierta) se deriva de COUNT(historial) > 0. La etiqueta "Replanificada x N" de v3.0 ya no se muestra como estado. |

## 5.7 Acceso de Cliente a Proyecto

Tabla de relación que controla qué proyectos puede ver cada usuario Cliente. Los Admin no necesitan esta tabla (ven todo).

| **Campo** | **Tipo** | **Notas** |
| --- | --- | --- |
| usuario_id | FK User | El usuario Cliente que recibe acceso |
| proyecto_id | FK Proyecto | El proyecto al que se le da acceso |
| fecha_asignacion | Datetime | Automático al momento de asignar |

# 6. Estados de una Tarea

**△ Sección reescrita por completo respecto a v3.0.** El modelo original definía 6 estados (Planificada, Replanificada x N, Atrasada, Pausada, Cancelada, Finalizada) con reglas de transición, prioridades y coexistencias. En las iteraciones se concluyó que era demasiada taxonomía para una herramienta que debe entenderse sin manual. El principio del nuevo modelo:

| **El usuario marca una sola cosa: hecha o no hecha. Todo lo demás se deriva automáticamente.** |
| --- |

## 6.1 Estado manual único

- **Hecha** (checkbox en la vista tabla / equivalente en el detalle). Al marcarla se registra la **fecha_real** de término, que puede diferir de la fecha_objetivo (una tarea puede cerrarse tarde). Al desmarcarla, fecha_real se limpia.

## 6.2 Estados derivados (automáticos, no se almacenan)

```
hecha       → tarea.hecha = true
vencida     → NOT hecha AND fecha_objetivo < hoy      (se recalcula cada día)
pendiente   → NOT hecha AND fecha_objetivo >= hoy
replanificada (atributo) → COUNT(historial) > 0        (coexiste con los anteriores)
```

## 6.3 Estados eliminados de v3.0 y su reemplazo

| **Estado v3.0** | **Qué pasa con él en v3.1** |
| --- | --- |
| Planificada | Pasa a ser el estado derivado "pendiente" (sin color, marca ✕) |
| Replanificada x N | Deja de ser estado. Es historia: queda en el historial, se refleja en el color ámbar del campo tarea y en el rastro de marcas del Gantt. El conteo exacto se ve en el tooltip |
| Atrasada | Pasa a ser el estado derivado "vencida". Desaparece la marca manual de atraso |
| Pausada | **Eliminado.** Pausar una tarea es, en la práctica, moverle la fecha — y así queda registrado como replanificación en vez de esconderse bajo una etiqueta neutra |
| Cancelada | **Eliminado como estado.** Una tarea cancelada se archiva: sale del plan y queda en historial. *(Mecanismo de archivo: pendiente de diseñar)* |
| Finalizada | Pasa a ser "hecha", con registro de fecha_real |

Con esto también desaparecen las reglas de prioridad y coexistencia de v3.0 ("Finalizada no se marca Atrasada", "Replanificada x2 + Atrasada predomina rojo", etc.): ya no hay estados que compitan.

## 6.4 Marcas en la grilla Gantt

Un solo principio de color: **el rojo significa una única cosa en todo el sistema — una fecha que llegó y no se cumplió.**

| **Marca** | **Significado** | **Regla** |
| --- | --- | --- |
| **✕** | Pendiente | NOT hecha, fecha_objetivo >= hoy. Se ubica en la columna de fecha_objetivo. Es la X del Excel de origen |
| **■ Verde con ✓** | Hecha | Se ubica en la columna de **fecha_real** (no de fecha_objetivo) |
| **■ Rojo** | No se cumplió — replanificar | NOT hecha, fecha_objetivo < hoy. Se ubica en la columna de fecha_objetivo |
| **▪ Rojo tenue (pequeño)** | Fecha anterior que pasó sin cumplirse | Una por cada fecha_anterior del historial. Además, si la tarea se hizo tarde (fecha_real > fecha_objetivo), la fecha_objetivo incumplida también se marca así |

Lecturas que emergen solas, sin explicación: `rojo tenue → rojo tenue → ✕` es una tarea corrida dos veces que sigue abierta; `rojo tenue → verde ✓` es una que se hizo tarde.

## 6.5 Color del campo tarea — la señal principal de gestión

El nombre de la tarea (columna congelada, siempre visible) toma un color de fondo según su situación. Un barrido vertical por esa columna muestra la salud del plan sin leer una sola fecha.

| **Color** | **Condición** | **Lectura para el usuario** |
| --- | --- | --- |
| **Verde con ✓** | hecha | Lista |
| **Rojo** | vencida (no se cumplió y no tiene fecha nueva) | **Haz algo:** asignar nueva fecha ("Replanificar →") |
| **Ámbar** | pendiente con historial (se replanificó, sigue abierta) | **Vigílala** |
| **Sin color** | pendiente sin historial | En curso, todo en orden |

**Ciclo de gestión resultante:** una tarea roja a la que se le asigna nueva fecha pasa a ámbar; si la nueva fecha también se vence, vuelve a rojo. El color siempre dice qué hacer, no qué categoría es.

| **Regla de oro (para onboarding en una frase)** |
| --- |
| Rojo = haz algo · Ámbar = vigílala · Verde = lista · Blanco = en curso |

## 6.6 Detalle bajo demanda

La pantalla muestra solo el color y la marca. Todo el detalle vive en el tooltip al posar el cursor sobre la tarea o sobre una marca: estado en lenguaje llano, fecha comprometida original, cuántas veces se movió y por cuáles fechas pasó, fecha vigente, y fecha real de término (con indicación de si fue tarde). Sin badges ni códigos en pantalla.

# 7. Módulos Funcionales

## 7.1 Módulo de Usuarios

Solo accesible para Admins. Gestiona las cuentas y los accesos a proyectos. *(Sin cambios respecto a v3.0.)*

- Listar usuarios con nombre, email, rol y estado (activo/inactivo)
- Crear usuario: nombre, email, rol (Admin o Cliente)
- Editar usuario: nombre o estado
- Desactivar usuario: pierde acceso, sus datos se conservan
- Asignar proyectos a un usuario Cliente: se puede asignar y desasignar proyecto a proyecto
- Ver qué proyectos tiene asignados cada usuario Cliente

| **Regla: límite de Admins** |
| --- |
| El sistema permite exactamente 2 usuarios con rol Admin. Si ya existen 2 Admins activos, el botón de crear nuevo Admin estará deshabilitado. |

## 7.2 Módulo de Proyectos y Tareas

El núcleo de la aplicación. Contiene la vista tabla y la vista Gantt.

**Vista Tabla**

Navegación: barra lateral muestra todos los proyectos. Al abrir un proyecto, aparecen sus Frentes como subpáginas. Dentro de cada Frente, los Sub Frentes se muestran como tablas apiladas.

**△ Columnas actualizadas respecto a v3.0** (sale la columna Estado con dropdown de 6 valores y la columna Replanificaciones "x N"; entran Hecha y F. real):

| **Columna en vista tabla** | **Editable** | **Notas** |
| --- | --- | --- |
| Hecha | Sí | Checkbox. Al marcar, registra fecha_real; al desmarcar, la limpia |
| Tarea (título) | Sí | Click para editar inline. La celda toma el color de la sección 6.5 (verde ✓ / rojo / ámbar / sin color). Hover muestra el tooltip con el detalle completo |
| Responsable | Sí | Dropdown con los 2 Admins disponibles |
| Fecha original | No | Solo lectura. Siempre visible como referencia |
| Fecha objetivo | Sí | Date picker. Al cambiar, dispara registro en historial automáticamente. Si la tarea está vencida, el campo se destaca en rojo con la señal "Replanificar →" |
| Fecha real | No | Se llena al marcar Hecha. Si fecha_real > fecha_objetivo se muestra en rojo con la indicación "(tarde)" |
| Comentarios | Sí | Click para abrir campo de texto libre |

**Vista Gantt**

Especificación completa del formato grilla en la sección 4.3; semántica de marcas y colores en las secciones 6.4 y 6.5. Comportamientos de interfaz:

- Leyenda permanente sobre la grilla (máximo 5 elementos, lenguaje llano: "Pendiente", "Hecha", "No se cumplió — replanificar", "Fecha anterior", "Tarea replanificada, sigue abierta")
- Hover sobre una marca o el nombre de la tarea: tooltip con el detalle completo (sección 6.6)
- **△ Backlog (era parte de v3.0):** click sobre una marca abre panel lateral con el detalle completo de la tarea e historial. En v3.1 el detalle se resuelve por tooltip; el panel queda para una iteración posterior

**Encabezado del proyecto (ambas vistas)**

**△ Agregado en las iteraciones:** resumen permanente con contadores por estado derivado — Hechas, Pendientes, Por replanificar (rojas), Replanificadas abiertas (ámbar) — que se recalculan según el frente filtrado.

**Historial de Replanificaciones (detalle de tarea)**

Visible en el tooltip de la tarea, tanto en vista tabla como en Gantt. Muestra:

- Fecha original: el compromiso inicial (siempre primera en la lista)
- Cada replanificación: la secuencia completa de fechas (original → fecha 2 → … → vigente)
- Fecha vigente: la fecha_objetivo actual
- Fecha real de término si la tarea está hecha, con indicación de si fue después de la fecha comprometida
- Si hay 0 replanificaciones, se muestra solo la fecha original y la vigente (que coinciden)

# 8. Estado del Dummy (referencia de implementación)

Existe un dummy funcional en React (`planificador-dummy.jsx`) que implementa las vistas Tabla y Gantt con la lógica completa de las secciones 4, 6 y 7.2, y sirve como especificación viva de la interfaz:

- **Datos semilla:** las 93 tareas reales del Plan PGP Arauco (2 frentes, 5 sub frentes, responsables DV/JB/FS/IC). Las X múltiples del Excel se interpretaron como replanificaciones (primera X = fecha original, última = vigente) — licencia de simulación para exhibir el historial; en el Excel real esas X representan días de trabajo.
- **Hoy simulado:** fijo al 30-oct-2024 (mitad del plan) para que convivan tareas hechas, hechas tarde, vencidas y futuras. En la app real, "hoy" es la fecha del sistema.
- **Interacciones operativas:** marcar hecha (registra fecha real), cambiar fecha objetivo (genera historial y ciclo rojo → ámbar), filtro por frente desde el sidebar, contadores del encabezado, tooltips con historial completo.
- **Fuera del dummy:** módulo de Usuarios, roles y acceso de clientes, Mi Panel, multi-proyecto real, persistencia, edición inline de títulos, comentarios, archivo de tareas.

# 9. Camino a Herramienta Usable

Lo pendiente para pasar del dummy a producto son tres capas: **persistencia** (base de datos con las entidades de la sección 5), **usuarios y acceso** (login, 2 admins, clientes con visibilidad por proyecto) y **despliegue** (URL accesible para equipo y clientes).

**Stack propuesto:**

- **Supabase** (Postgres + autenticación): la capa gratuita cubre decenas de miles de usuarios, con lo que los clientes externos cuestan $0 — ataca directamente el Problema 2. Su row-level security implementa a nivel de base de datos la regla "el cliente solo ve sus proyectos asignados" (tabla 5.7). El trigger de historial (5.6) se implementa nativo en Postgres.
- **React** en el frontend (el dummy migra casi directo), desplegado en **Vercel o Netlify** (capa gratuita suficiente).
- Costo de operación cercano a cero a la escala actual. Se descartó la vía no-code (Airtable, Softr, etc.): reintroduce el cobro por usuario externo y limita el Gantt custom de la sección 4.3.

**Fases incrementales, cada una usable por sí misma:**

1. **Uso interno:** base de datos + CRUD de proyectos/frentes/sub frentes/tareas + las dos vistas. Sin login. Reemplaza el Excel.
2. **Clientes:** login, roles admin/cliente, asignación de proyectos por cliente (Módulo 1 completo).
3. **Pulido:** Mi Panel (Módulo 3), panel lateral de detalle, archivo de canceladas, indicadores por proyecto, y lo que el uso real vaya pidiendo.

---

# Anexo A — Alternativas probadas y descartadas

Registro de decisiones de las iteraciones, para no re-litigar en el futuro:

| **Alternativa probada** | **Por qué se descartó** |
| --- | --- |
| Gantt como línea de tiempo continua con puntos flotantes (v3.0) | No se identificaba a qué día correspondía cada marca ni se leía el anidado Frente → Sub Frente → Tarea. Reemplazado por grilla tipo Excel (4.3) |
| Toggle de escala semanas/meses en el Gantt | En formato grilla de días hábiles no aporta |
| 6 estados con reglas de prioridad y coexistencia (v3.0) | Demasiada taxonomía; mezclaba en un campo tres cosas distintas (avance, puntualidad, movimiento). Reemplazado por hecha/no hecha + derivados (sección 6) |
| Estados Pausada y Cancelada | Pausada = mover la fecha (queda como replanificación); Cancelada = archivar (mecanismo pendiente) |
| Tachado sobre tareas hechas | Se leía como "cancelada". Reemplazado por ✓ verde con fondo verde suave |
| Badge "x2 · +5d" (replanificaciones + deriva en días hábiles) junto al nombre | Críptico; contradecía el principio de entenderse sin manual. El detalle se movió al tooltip |
| Semáforo de reincidencia por niveles (leve / reincidente / crónica) según conteo y deriva | Misma razón: exigía aprender umbrales. Reemplazado por los 4 colores de la sección 6.5 |
| Puntos morados para fechas anteriores (v3.0) | Un color extra que aprender. Unificado en rojo tenue: el rojo ya significa "fecha incumplida" |

---

*Documento generado a partir del Documento Funcional v3.0 (febrero 2025), el archivo 241008_Plan_PGP_Arauco.xlsx y las iteraciones del dummy (julio 2026).*
