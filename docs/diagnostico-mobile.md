# Diagnóstico mobile — Andotek Planning

**Fecha:** julio 2026 · **Base:** `main` tras el PR #41 (solicitudes #187–#193).
**Alcance:** §1–§9 son el diagnóstico (análisis, sin cambios de código). **§10
registra la resolución** de las solicitudes #194–#203, con lo medido después.

**Método.** Build de producción servido en local, recorrido con Playwright en
viewport **390×844** (`isMobile` + `hasTouch`, escala 2) por el rol admin, con
mediciones del DOM en cada pantalla —anchos reales de columna, desbordes
horizontales, altura y scroll de los modales, áreas táctiles— más capturas. Las
cifras de este documento son medidas, no estimaciones.

Este diagnóstico **actualiza** al de julio anterior: parte de sus hallazgos se
resolvieron y aparecieron otros nuevos.

---

## 1. Resumen ejecutivo

El **núcleo de la operación diaria está sano**: ver el plan, revisar las tareas
propias, consultar el resumen y el drawer de navegación funcionan bien y sin
desbordes.

Hay **tres problemas críticos**:

1. **C1 — Configurar permisos es imposible desde el teléfono:** el modal se sale
   por arriba y por abajo y no tiene scroll, así que no se puede guardar ni cerrar.
2. **C2 — Las tablas de administración no dicen de quién son los datos:** la
   columna de identidad mide 0px, así que se ven los emails pero no los nombres.
3. **C3 — Los dos flotantes del sidebar caen fuera de pantalla:** el panel de
   notificaciones (se ve una franja de ~90px de él) y el menú ⋯ del proyecto.

Los tres son acotados y de arreglo aditivo (CSS mobile, sin tocar datos,
permisos ni desktop). **C3 es el más urgente en la práctica**: las notificaciones
son de uso diario, mientras que C1 y C2 son de administración —cuya frecuencia
real en móvil habría que confirmar (ver §9)—.

Vale la pena notar un patrón: **C2 y C3 nacen de escribir medidas de desktop sin
acotarlas por media query** (anchos de columna; `left: 240px`; `botón.right + 8`).
No son descuidos de diseño mobile, sino desktop que se filtró.

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
| **Navegación** (drawer ☰ + velo + 🌙) | Bien *el drawer* | Patrón correcto. **Pero lo que cuelga de él —panel de notificaciones y menú ⋯— está roto: ver §5** |
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
- Los **botones flotantes ☰ y 🌙 tapan el texto** de ayuda del modal (ver C4, §6).
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

## 5. 🔴 C3 — Los dos elementos flotantes del sidebar caen fuera de pantalla

Ambos son novedades recientes del sidebar (#137/#159 y #178/#184), se posicionan
con **coordenadas absolutas pensadas para desktop** y **ninguno tiene regla en la
media query**. Es la misma causa raíz en dos lugares.

### C3.a — Panel de notificaciones: inutilizable

CSS: `position: fixed; top: 60px; left: 240px; width: 360px; max-width: 92vw`.
Ese **`left: 240px` es el ancho del sidebar de desktop**, escrito a mano.

| Métrica (390×844) | Valor |
| --- | --- |
| Caja del panel | x = **240 … 599** |
| Se sale por la derecha | **209px** (58% del panel) |
| Primer ítem alcanzable con el dedo | **No** (`elementFromPoint` no lo devuelve) |
| Botón "Ver todas" | borde derecho en 598 → **fuera de pantalla** |

Y hay un agravante que solo se ve en la captura: como el panel se abre desde el
drawer, **queda por detrás del drawer abierto** (que ocupa 0–300). Entre el
drawer que lo tapa por la izquierda y el borde que lo corta por la derecha, del
panel se ve una **franja de ~90px**: los textos aparecen mutilados por ambos
lados ("osue Britos te a…").

Es la vía principal a las notificaciones en mobile, y es de **uso diario**, no de
administración.

### C3.b — Menú ⋯ del proyecto: cortado, y ausente salvo en el proyecto activo

El popover se ancla en JS con `left = botón.right + 8`.

| Métrica (390×844) | Valor |
| --- | --- |
| Caja del menú | x = **288 … 456** (ancho 168) |
| Se sale por la derecha | **66px** — el texto de las tres opciones queda cortado |
| Opciones | Editar proyecto · Agregar frente · Archivar (las tres con el borde en 455) |

**Segundo problema, de fondo:** la regla es
`.nav-proyecto__menu-btn { visibility: hidden }`, y solo lo revelan
`:hover` o `.nav-proyecto--activo`. **En una pantalla táctil no hay hover**, así
que el ⋯ **solo existe en el proyecto activo**: para editar, archivar o agregar
un frente a cualquier otro proyecto hay que abrirlo primero. Es una limitación
funcional, no estética. *(El caso del proyecto activo está medido; el del no
activo se deduce de la regla CSS, que es inequívoca.)*

> **Por qué la primera pasada no los detectó.** El barrido de desbordes excluía
> los elementos `position: fixed` —para no contar el drawer, que legítimamente
> vive fuera de pantalla— y ambos son precisamente `position: fixed`. La lección
> para futuras auditorías: los flotantes hay que medirlos **abiertos y uno por
> uno**, no con un barrido general.

---

## 6. 🟡 Medio

**C4 — Botones flotantes por encima de los modales.** `☰` y `🌙` tienen
`z-index: 2200`, por encima del overlay de modales (`2000`): tapan contenido y
permiten abrir el drawer sobre un formulario a medio llenar. Ya estaba en el
diagnóstico de julio.

**C5 — Áreas táctiles bajo lo recomendado (≥44px).** Medidos: ✕ de modal 25×22 ·
segmentos de permisos 27px de alto · botones de modal 30px · `icon-btn` de las
tablas ~21px. Afecta sobre todo a las pantallas de administración.

## 7. 🔵 Menor

- **Encabezado del proyecto**: título + 5 contadores + barra de filtros consumen
  bastante alto antes del contenido. Aceptable, compactable.
- El botón **"+ Usuario"** es grande y desplaza el subtítulo (cosmético).

---

## 8. Plan de mejoras propuesto

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

### M3 — Flotantes del sidebar dentro de pantalla *(resuelve C3)*

- **Panel de notificaciones:** en mobile, dejar de anclarlo al ancho del sidebar
  de desktop. Lo natural es que ocupe el ancho útil de la pantalla (por ejemplo
  `left: 8px; right: 8px; width: auto`) o que se presente como hoja inferior.
  Debe quedar **por encima del drawer**, no detrás.
- **Menú ⋯:** acotar la posición calculada al viewport (si `left + ancho` excede
  la pantalla, anclar por la derecha), y **revelar el ⋯ sin depender de `:hover`**
  en pantallas táctiles, para que sea alcanzable en cualquier proyecto y no solo
  en el activo.

Es el más urgente de los tres críticos: las notificaciones son de uso diario.

### M4 — Áreas táctiles ≥44px *(resuelve C5)*

En `icon-btn`, `modal-x`, segmentos de permisos y checkboxes. Barato y toca los
mismos componentes que M1/M2.

### M5 — Capas *(resuelve C4)*

Bajar `☰`/`🌙` por debajo del overlay o, mejor, **ocultarlos mientras haya un
modal o el panel de detalle abiertos**.

### Secuencia sugerida

Dos bloques, en este orden:

1. **Sidebar en mobile** — **M3** (+ la parte de capas de **M5**). Es chico,
   toca lo de **uso diario** y desbloquea las notificaciones, que hoy son
   inalcanzables. Va primero aunque sea el hallazgo más nuevo.
2. **Administración usable en mobile** — **M1 + M2 + M4**. Bloque coherente y
   más grande; su urgencia depende de la respuesta a §9.

El encabezado del proyecto (🔵) queda para un pedido menor posterior.

**Qué no tocar:** tabla del proyecto, Mis Tareas, Resumen, el drawer en sí,
panel de detalle y la ausencia deliberada de Gantt — ya iterados y funcionando.

---

## 9. Pregunta abierta

El plan asume que **administrar desde el teléfono** (usuarios, permisos,
proyectos) es un caso de uso real. Si en la práctica eso siempre se hace desde el
computador, **M2 baja de prioridad**: bastaría con que las tablas se vean dignas
y sin datos invisibles (opción b), sin llegar a tarjetas. M1 sigue siendo
crítico en cualquier escenario, porque hoy un modal alto deja al usuario sin
forma de guardar ni cerrar.

**M3 no depende de esa respuesta:** las notificaciones son de uso diario para
cualquier rol, así que se arregla igual.

---

## 10. Resolución — solicitudes #194–#203

Implementado sobre este diagnóstico, con las reglas que fijó el pedido: **todo
aditivo dentro de `@media (max-width: 768px)`**, las reglas de tabla de #181
acotadas a `@media (min-width: 769px)`, y **sin cambios de estructura de base**.
La pregunta abierta de §9 la respondió el pedido: administrar desde el teléfono
**no** es el caso de uso principal, así que M2 se resolvió por la **opción (b)**
—anchos acotados a escritorio + columna de identidad con ancho propio— y **se
acepta el scroll horizontal**. Las tarjetas quedaron descartadas.

| # | Hallazgo | Qué se hizo | Medido en 390×844 |
| --- | --- | --- | --- |
| #194 | C1 — modal 🔑 de 999 px sin ✕ ni Guardar alcanzables | `max-height: calc(100dvh - 24px)` + `overflow-y: auto` en `.modal-card`, cabecera y botonera **sticky**, overlay con `align-items: flex-start`; filas del set de permisos a dos líneas | tarjeta 820 px (viewport 844), contenido 997→818 con scroll propio; ✕ y **Guardar** dentro del viewport y clicables **antes y después** de scrollear al fondo |
| #194 | No tocar los modales cortos | La regla es un techo, no una altura fija | «Miembros» 415 px sin scroll; «Nuevo usuario» y «Permisos de proyecto» 🔧 igual que antes |
| #195 | C3.a — panel de notificaciones fuera de pantalla y detrás del drawer | Al tocar «Notificaciones» **se cierra el drawer** y el panel entra a **pantalla completa**, con ✕ propio (solo en mobile) | panel 0→390 × 844; drawer cerrado; ítem alcanzable por `elementFromPoint`; «Ver todas» dentro; ✕ visible y cierra |
| #196 | C3.b — menú ⋯ cortado y solo en el proyecto activo | Posición acotada al viewport (`Math.min/Math.max` sobre `innerWidth`/`innerHeight`) y, en pantallas táctiles, el ⋯ **visible en todos los proyectos** | menú 202→370 de 390 (20 px de margen); ⋯ visible sin hover, también con rol consultor |
| #197 | C2 — la columna de identidad se comía el resto | Anchos de #181 acotados a `min-width: 769px`; en mobile, identidad con ancho propio | Usuarios: 170/170/96/92/76/132 · Proyectos: 170/130/76/92/132; nombre y proyecto legibles |
| #198 · #200 | Flotantes ☰/🌙 sobre el overlay y tapando el pie del drawer | Se **ocultan** mientras haya modal o panel abiertos (`body:has(…)`) | 0 flotantes visibles con el modal de Miembros, con el 🔑 y con el panel de notificaciones |
| #199 | Áreas táctiles < 44 px | `::before` transparente de `max(44px, 100%)` sobre `.icon-btn` — **no** engorda la fila | 0 botones bajo 44 px; alto de fila **29 px, sin cambio** |
| #201 | «Usuarios» sin contador | Contador ya no condicionado al rol; el número lo calcula `usuariosVisiblesPara` en `App`, la **misma regla** que arma la tabla | admin: contador 4 / tabla 4 · consultor: contador 0 / tabla 0 |
| #203 | Iconos ▯ en Android | 10 iconos SVG de trazo en `components/Iconos.tsx` reemplazan ✎ 🔧 ✉ ⏻ ↺ 🗑 👥 📦 🔑 ⓘ | 6 SVG en la tabla, **0** botones con glifo de texto; idéntico en escritorio |

**Corrección posterior en #194.** La primera pasada dejó las filas del set en
una sola línea: el segmento es `flex: none` (no encoge), así que la etiqueta más
larga —«Asignar responsable», con su descripción— lo empujaba fuera del borde
derecho de la tarjeta. Detectado en un Android real, no en las mediciones. Las
filas ahora se **apilan** en mobile (etiqueta arriba, segmento a ancho completo
abajo con `flex: 1` por opción), con lo que el ancho del segmento deja de
depender del largo de la etiqueta. Medido en 390×844 y en **360×740**: las 8
filas apiladas, segmento 54→336 uniforme, **16 px de margen** contra el borde y
cero scroll horizontal. En escritorio siguen en una línea, sin cambios.

**Causa de #203.** Los glifos que se usaban (✎ U+270E, ⏻ U+23FB, ✉ U+2709,
↺ U+21BA) son símbolos de **presentación de texto**: no están en el set de emoji
a color, así que si la fuente del sistema no los trae, Android dibuja el cuadro
vacío. En escritorio se veían porque esas fuentes sí los cubren. El SVG no
depende de ninguna fuente.

**Sin regresiones en escritorio** (1440×900, medido): anchos de tabla intactos
(449/230/116/112/92/148 y 635/160/92/112/148), modales centrados y sin
`max-height`, ⋯ oculto sin hover, panel de notificaciones como popover de 360 px
y sin ✕. El `::before` táctil no existe fuera de mobile (`content: none`).

### #202 — proyectos `__prueba_rls_*`

Cerrado, en dos partes:

- **(b) La compuerta ya no deja basura.** `scripts/validar-rls.mjs` limpia en un
  `finally`, así que arrastra los proyectos de prueba **aunque un test falle**.
  La causa de la acumulación era propia: el cliente `admin` del script es un
  admin **bajo RLS**, no `service_role`, y la migración 17 exige
  `estado = 'archivado'` para poder borrar — el `delete` afectaba 0 filas **sin
  devolver error**. Ahora archiva y después borra, y reporta lo que quede.
- **(a) Producción limpia.** Había 4 proyectos `__prueba_rls_<timestamp>`, todos
  del 24-jul en dos pares separados por ~4 s: el patrón crear→borrar del ciclo
  del consultor A. Se listaron, se confirmaron uno a uno y se borraron por id
  explícito; el conteo posterior dio 0.

**Cómo limpiar esto desde el SQL Editor** (por si vuelve a hacer falta). Listar
primero — la columna de fecha es `fecha_creacion`, y la tabla de accesos se
llama `acceso_proyecto` desde la migración 12:

```sql
select id, nombre, estado, fecha_creacion from proyecto
where nombre like '__prueba_rls_%' order by fecha_creacion;
```

Y borrar **por id explícito**, tras revisar esa lista y con respaldo hecho. Nada
de `update ... set estado = 'archivado'` antes: el trigger
`trg_validar_estado_proyecto` (migración 16) exige permiso de admin para cambiar
`estado`, y en el SQL Editor no hay sesión de usuario, así que falla con «Sin
permiso para archivar o desarchivar proyectos». El `delete` directo no pasa por
ese trigger, y la regla que exige archivar primero es una **política RLS**, que
el editor no aplica. Esa asimetría —el script tiene que archivar, el editor no
debe— es la que conviene recordar.

### Correcciones tras la verificación en el teléfono (#212–#214)

Lo medido en el emulador no bastó: tres cosas solo se ven con el aparato en la
mano. Todo aditivo dentro de `@media (max-width: 768px)`, sin tocar la base.

| # | Qué pasaba | Qué se hizo | Medido en 390×844 |
| --- | --- | --- | --- |
| **#212** | Tocar una notificación abría el panel de detalle, que mide 359 px de 390 y **tapaba justo el plan** al que se acababa de navegar | En mobile se navega, se resalta y **no** se abre el panel; el detalle queda a un toque | mobile: 0 paneles con la tarea resaltada · escritorio: 1 panel, igual que antes |
| **#213** | El nombre de la primera columna se seguía cortando, y en táctil un "…" es ilegible para siempre porque no hay hover | Se trunca con "…" y **al tocarlo** se abre un globo con el nombre entero y su pill; se envuelve en varias líneas | globo dentro de pantalla en primera fila, última fila y con nombre de 75 caracteres (2 líneas); el toque no dispara nada más |
| **#214** | Al tocar un icono se activaba el de al lado (querer 👥 y que saliera 📦) | **Separación** entre iconos: los centros pasan de 26 a **46 px**, así cada área de 44 px es exclusiva | icono sigue en 16 px, fila sigue en 29 px, y cada icono recibe su propio toque en Proyectos y en Usuarios |

**Por qué #214 no se detectó antes.** La medición de #199 comprobaba que cada
área llegara a 44 px, y llegaba. Lo que no comprobaba es que **no se pisaran
entre sí**: con los botones a 26 px de distancia, dos áreas de 44 se solapan 18
px y el punto tocado cae en las dos. El problema nunca fue el tamaño sino la
falta de espacio, y solo se manifiesta con un dedo real.

**El globo de #213 va en un portal con `position: fixed`,** no dentro de la
celda. Es la lección del menú de Vistas: un globo que se abre hacia arriba
dentro de un contenedor con `overflow` queda recortado por más z-index que
tenga. Fuera del árbol de la tabla, el overflow de nadie lo alcanza.

**Un detalle que apareció al verificar:** el primer toque sobre un nombre justo
después de cerrar un modal no abría nada. Al cerrarse el modal el navegador
devuelve el scroll al body y dispara un evento `scroll` en el mismo tick que la
apertura, que cerraba el globo antes de que se viera. Los cierres se enganchan
ahora en el frame siguiente.

### Qué queda fuera

- **Verificación en teléfono Android real** (#203): no es posible desde este
  entorno. Lo medido es Chromium en viewport 390×844 con `hasTouch`, que
  confirma que ya **no hay glifos de texto**; la confirmación visual en el
  dispositivo la hizo el usuario, y ahí apareció el desborde del segmento que
  la medición no veía (la comprobación era contra el viewport, no contra el
  borde de la tarjeta). Queda pendiente confirmar en el teléfono el apilado ya
  corregido.
- Por decisión del pedido: tarjetas para las tablas de administración, primera
  columna fija con scroll horizontal y compactar el encabezado del proyecto.
- El icono ⓘ de la tabla del proyecto y de la Gantt tiene el **mismo riesgo de
  ▯** que los ya corregidos, pero **no se tocó**: el pedido prohíbe expresamente
  modificar la tabla del proyecto. Queda anotado para un pedido futuro.

---

## 12. Menú ⋯ de los frentes (#222) — mobile

Ronda posterior (#222–#224). Solo #222 toca mobile; se registra aquí porque
continúa la misma línea de trabajo de §10 y §11.

**Qué pasaba.** Las acciones del frente eran dos iconos (✎ y 🗑) que aparecían
al pasar el mouse. En escritorio le quitaban ancho al nombre al aparecer: un
nombre medianamente largo se partía en dos líneas, la fila crecía de alto y la
barra "saltaba" con el movimiento del mouse. En mobile, donde no hay hover,
directamente no había forma de renombrar ni eliminar un frente desde la barra.

**Qué se hizo.** Los frentes adoptan el patrón que los proyectos ya tenían desde
#178/#184/#196: un botón **⋯** con dos opciones —"Renombrar frente" y "Eliminar
frente"— desplegadas en un **portal fijo sobre `document.body`**, acotado al
viewport. El botón se oculta con `visibility`, no con `display`: **reserva su
lugar siempre**, así el ancho disponible para el nombre no cambia al pasar el
mouse. El nombre pasa a una sola línea con elipsis y el completo en el tooltip.

Tres detalles que costaron:

- **El estado del menú es uno solo** para proyectos y frentes
  (`{tipo: 'proyecto'|'frente', id}`). No hace falta coordinar dos estados para
  que abrir uno cierre el otro: es la misma variable.
- **La regla de visibilidad del ⋯ del proyecto era descendente**
  (`.nav-proyecto--activo .nav-proyecto__menu-btn`). Como los frentes se
  renderizan **dentro** del proyecto activo, esa regla habría dejado visibles
  también los ⋯ de los frentes en escritorio, donde deben aparecer solo con
  hover. Se acotó a su propia fila con el combinador hijo (`> .nav-proyecto__fila >`),
  igual que ya se hacía con `.nav-proyecto__title`.
- **El área tocable de 44 px** se consigue sumando `.nav-frente__menu-btn` a la
  lista del `::before` absoluto de #199. Al no ocupar lugar en el flujo, el alto
  de la fila no cambia: medido en 30 px con y sin el botón.

| Criterio (teléfono) | Medido en 390×844, `hasTouch` |
| --- | --- |
| ⋯ visible en todos los frentes sin tocar nada | 2/2 frentes en `visibility: visible` |
| Toque impreciso abre el menú del frente | tap a +8/+14 px del centro → abre "Renombrar frente" / "Eliminar frente" |
| El menú no se corta por la derecha | x=202, ancho=168 → borde derecho en 370 de 390 |
| El alto de la fila no crece | 30 px por fila; área tocable 44×44 sobre un botón visible de 34×26 |

---

## 13. Ancho del nombre del frente y barra ajustable (#225–#226)

Ronda siguiente. **#225 toca ambos entornos** (la alineación aplica también en
teléfono); **#226 es solo de escritorio** y se registra por completitud.

### #225 — El ⋯ deja de cobrar ancho en escritorio, pero no en el teléfono

#222 le dio al ⋯ un lugar reservado de forma permanente. Eso es lo que impide
que la barra se deforme al aparecer el botón, pero le cobra ese ancho al nombre
todo el tiempo: en `main`, el nombre de un frente disponía de **132px** de los
244 que mide la barra, y se cortaba con "…" en casos normales ("Desarrollo
Herrami…").

Dos cambios, y la razón por la que son distintos según el entorno:

- **Escritorio:** el ⋯ sale del flujo (`position: absolute`) y se monta sobre el
  extremo derecho de la fila. Como nunca ocupó ancho, el nombre dispone del
  total **con y sin el mouse encima**: la deformación que corrigió #222 no
  vuelve por esta puerta. Se verificó midiendo el ancho disponible en reposo y
  en hover, además del `scrollWidth`/`clientWidth` del texto.
- **Teléfono:** ahí el botón está **siempre** visible porque no hay hover, así
  que montarlo taparía el nombre de forma permanente. Conserva su lugar, tal
  como quedó en #222. La regla del montaje va en `@media (min-width: 769px)`,
  no como base con un revert en mobile: el requisito es que el teléfono no
  cambie, y una excepción explícita es más difícil de romper por accidente que
  una anulación.

Para que el ⋯ montado se lea **sobre** el texto y no **contra** él, el fondo de
la fila pasó del botón del nombre a la fila (`--fila-fondo`). El ⋯ lo hereda con
`background: var(--fila-fondo)` y un `::after` de 22px lo degrada hacia la
izquierda, así que sirve igual para la fila normal (`#27272a`) y la seleccionada
(`#333338`) sin duplicar reglas.

**La sangría, que era un problema anterior a #222.** El nombre del proyecto
arrancaba a 48px del borde de la barra y el del frente a 50px: prácticamente
alineados, así que la sangría no comunicaba jerarquía —esa la dan el punto de
color, la negrita y el hecho de que los frentes solo aparecen bajo el proyecto
abierto— pero sí consumía ancho. Los frentes se alinean ahora con el
**cuadradito de color** (30px), en escritorio y en teléfono.

| Medida (escritorio 1440×900, barra en 244px) | `main` | con #225 |
| --- | --- | --- |
| Ancho disponible para el nombre | 132px | **186px (+41%)** |
| Inicio del nombre del frente | 50px | **30px** (= el punto de color) |
| Ancho con y sin el mouse encima | — | 186 → 186px, fila 30 → 30px |

El pedido estimaba llegar a ~214px. No es alcanzable **manteniendo la
alineación con el punto**, que es el requisito explícito: `.nav-proyecto` aporta
12px de padding a cada lado que la estimación no consideraba. 186px es el techo
con esa alineación; para ir más allá está #226.

### #226 — Ancho de la barra ajustable (solo escritorio)

El ancho vive en la variable CSS `--sidebar-w` que App fija en `.app`. La leen
la columna de la grilla, la barra desplegada del modo escondido y el panel de
notificaciones (que estaba clavado en `left: 240px` y, con la barra ensanchada,
habría quedado debajo de ella; ahora es `calc(var(--sidebar-w) - 4px)`, idéntico
a lo de siempre con el ancho por defecto).

Tres decisiones de implementación:

- **`setPointerCapture`,** no listeners en `window`: el gesto sobrevive a que el
  cursor salga de la manija o pase sobre una tabla con su propio scroll.
- **El ancho se recalcula desde el DELTA** del puntero, no desde `clientX`
  absoluto. Así vale igual con la barra fija (empieza en 0) que escondida
  (empieza en 54px), sin ramificar.
- **`.app--redimensionando`** mantiene desplegada la barra escondida mientras
  dura el arrastre —si no, al alejarse el cursor del riel la barra se replegaría
  a mitad del gesto— y desactiva su transición, que convertiría el arrastre en
  un movimiento con inercia.

| Criterio | Medido en 1440×900 |
| --- | --- |
| Señal de arrastre | `col-resize` sobre una zona de 7px; la línea aparece al acercarse (transparente → `#6b6b75`) |
| Cambio en vivo y contenido reacomodado | 244 → 284 → 350px durante el gesto; `.main` 1196 → 1090px |
| Nombres más largos | ancho disponible del frente 186 → 292px |
| Topes | el arrastre se detiene en 400px y en 244px |
| Persistencia | sobrevive a recargar y a cerrar/abrir sesión; **por usuario** (otro usuario arranca en 244px) |
| Doble clic | vuelve a 244px |
| Sin desbordes | con la barra en 340px: `scrollWidth - clientWidth` = 0 en `documentElement`, `body` y `.app`, en Tabla, Gantt, Resumen y Mis Tareas |
| Modo escondido | se despliega en los 340px elegidos, tras el riel de 54px, y la manija acompaña al borde |
| Teléfono | panel `fixed` de 300px, manija en `display: none`, aun con 400px guardados para ese usuario |

---

## 14. La línea superior de las tablas al congelarse los encabezados (#227)

Bug preexistente, no introducido por #222–#226. Aplica a la vista Tabla del
proyecto y a Mis Tareas, que comparten `table.tareas`; se corrigen juntas
porque es el mismo mecanismo. El teléfono se verifica aquí porque el criterio 11
del pedido lo pide expresamente, aunque el problema no era específico de mobile.

**Qué pasaba.** El recuadro gris del sub frente no lleva línea abajo: se apoya
en la de arriba de la tabla, y los dos se leen como un bloque. Pero esa línea
era `table.tareas { border-top }`, es decir, de la **caja de la tabla**, y los
encabezados son `position: sticky`. Al despegarse, los `th` se quedaban sin
línea arriba mientras la de la tabla se iba con el scroll: el bloque se veía
abierto por el borde superior, y como depende de si en ese momento están
congelados o no, la línea aparecía y desaparecía durante el recorrido.

**Qué se hizo.** Una línea de CSS: el `border-top` pasa de la tabla al `th`.
Como el `th` es el que se congela, la línea viaja con él. Con
`border-collapse: separate` y `border-spacing: 0` cae en el mismo píxel que
antes, así que **el estado en reposo no cambia**: la tabla pierde 1px de borde y
el `th` lo gana, y el alto total es el mismo.

**Cómo se verificó.** Por píxeles, no a ojo. Se recorta una franja de 6px
alrededor del borde superior del `thead`, se dibuja en un canvas y se comparan
dos bandas contra el color de borde computado del propio `th`: la del borde
superior (¿está la línea?) y la inmediatamente anterior (¿está doblada?).

Dos trampas del método que costaron encontrar:

- **El recuadro gris del sub frente no es una línea.** El primer detector
  marcaba "línea" cualquier fila de píxeles distinta del fondo del encabezado, y
  `--gris-sf` (#ececee) difiere de `--superficie-2` (#fafafa) lo bastante como
  para colarse. Se cambió a comparar contra el color de borde real.
- **Cuando el `th` llega al final de su tabla, la sticky lo empuja hacia
  arriba** y termina **por detrás de la barra de filtros**. Ahí la franja
  muestra la barra, no el encabezado: esas posiciones se descartan en vez de
  contarse como "línea ausente".

| Medición | `main` | con #227 |
| --- | --- | --- |
| Foto del bloque en reposo (SHA-256) | `a94c1be15b70cad4` | **`a94c1be15b70cad4`** (idéntica) |
| Línea en el borde superior del `th` — Tabla, recorrido de 10 posiciones (8 con el encabezado congelado) | ausente en las 10 | **presente en las 10, nunca doble** |
| Mis Tareas, 10 posiciones | ausente en las 10 | **presente en las 10** |
| Modo oscuro, reposo + 8 posiciones | ausente | **presente** |
| Teléfono 390×844 — Tabla (8 posiciones) y Mis Tareas (7) | ausente | **presente** |
| Sub frente contraído | `border-bottom: 1px`, radio 8px | igual |
| Contraer y volver a expandir | — | foto idéntica a la previa |

En `main` la línea también aparece "ausente" **en reposo**: no es que no se vea
—ahí la dibuja la tabla, 1px más arriba— sino que no está donde tiene que estar,
que es en el encabezado. Eso es exactamente el bug, y la foto idéntica del
bloque en reposo confirma que el resultado visual sin scroll no cambió.

### #227, segunda pasada: la línea salía a media tinta con el zoom en 110% y 125%

La primera corrección (mover el `border-top` de la tabla al `th`) puso la línea
donde va, y se verificó a **dpr 1**. Con el zoom del sistema en 110% o 125% —lo
habitual en portátiles Windows— seguía viéndose mal, y el reporte fue exacto:
*"no sé si es muy delgada o si derechamente no está"*.

**Qué pasaba.** Con el encabezado congelado, su borde superior cae en una
fracción de píxel de dispositivo (155 CSS × 1.25 = 193.75) y comparte ese píxel
con el borde inferior de la barra de filtros. La barra también es sticky y su
capa se redondea hacia afuera, así que se comía cerca de la mitad de la tinta:
la línea salía a ~50%, claramente más floja que la de reposo.

**Lo que se descartó midiendo**, no razonando:

| Se probó | Resultado a dpr 1.25 |
| --- | --- |
| Sombra interior, degradado de fondo, contorno, pseudo-elemento, `contain: paint`, capa propia | idénticos al borde: ~50% |
| Poner la línea en la propia barra (`border-bottom`, `box-shadow`) | también se parte |
| `thead` sticky en vez de `th` | la línea desaparece |
| Correr el congelado al píxel entero (`--filtros-h` ajustado, con y sin la retícula de 1/64 px de Chromium) | abre un hilo por el que asoma el contenido de atrás — peor |
| Estirar la barra unas milésimas para que su borde caiga en píxel entero | igual: Chromium trunca a 1/64 px |

Dos mediciones acotaron el problema: el borde **inferior** del mismo `th` sticky
sale sólido (o sea, la capa no se reescala), y en **reposo** el borde superior
también sale sólido. Solo se lava el borde de arriba cuando está congelado, que
es justo el que comparte píxel con la barra.

**La salida.** Pintar la misma línea varias veces sobre el mismo píxel: un
`::before` anclado al borde superior del `th` (`top: -1px`, contra la caja de
relleno) que aporta su fondo más cuatro sombras interiores idénticas. Donde la
línea ya sale sólida —dpr 1, 1.5, 1.75, 2— repintar encima **no cambia un solo
píxel**; donde sale parcial, las coberturas se componen (`1-(1-a)^n`) y sube a
tinta plena.

| Zoom | Antes de la 2ª pasada | Después |
| --- | --- | --- |
| 100% | 0 | 0 |
| 110% | 26 | **3 (claro) / 5 (oscuro)** |
| 125% | 26 | **1 (claro) / 2 (oscuro)** |
| 150% / 175% / 200% | 0 | 0 |
| Teléfono 390×844 (dpr 2) | 0 | 0 |

*(Desvío del color de la línea respecto del color de borde declarado; 0 = tinta
plena, 26 ≈ mitad de la tinta.)*

Verificado además: la foto del bloque en reposo sigue dando el **mismo SHA-256
que `main`** (`a94c1be15b70cad4`); la línea está presente y **nunca doble** en
las 21 posiciones de un recorrido de scroll, a dpr 1 y 1.25; el sub frente
contraído no cambia; y contraer y expandir devuelve una foto idéntica.

**La lección para la próxima verificación por píxeles:** medir a dpr 1 no basta.
Los zooms no enteros (110%, 125%) mueven los bordes a fracciones de píxel de
dispositivo y sacan a la luz problemas que a 100% no existen.

### #227, cierre: un solo criterio — desplegado igual que contraído

El criterio final reemplaza a los anteriores: **el borde superior de un bloque
desplegado se ve siempre igual que el de uno contraído**, en reposo, mientras se
scrollea y con los encabezados congelados, a cualquier zoom. El contraído es la
vara porque lo dibuja un elemento estático y siempre sale bien.

Verificado comparando las dos líneas **en la misma captura**: se contrae el
segundo sub frente para que su recuadro quede por debajo del encabezado
congelado del primero, y se mide cuánto se aleja cada una del color de borde
declarado. Diferencia 0 = indistinguibles.

Aparecieron dos cosas al medir así:

- **A 110% el que salía flojo era la VARA**, no el bloque (desvío 11 contra 3).
  O sea: con la tinta repetida el encabezado congelado ya estaba mejor que el
  recuadro contraído. Se le aplicó la misma técnica al `border-bottom` del
  recuadro, con **capas de fondo** en vez de un pseudo-elemento: el fondo se
  recorta al `border-radius` y las esquinas redondeadas se conservan.
- **Dos trampas de medición propias**, no del producto: en modo oscuro "la fila
  de píxeles más oscura" captura el fondo de página, que es más oscuro que la
  línea (hay que comparar contra el color de borde declarado); y muestrear cerca
  del borde izquierdo del recuadro contraído cae sobre la **esquina redondeada**,
  que está suavizada.

| Zoom | claro | oscuro |
| --- | --- | --- |
| 100% | 0 | 0 |
| 110% | 3 | 4 |
| 125% | 1 | 2 |
| 150% / 175% / 200% | 0 | 0 |
| Teléfono 390×844 | 0 | 0 |

*(Mayor diferencia entre la línea del bloque desplegado y la del contraído, en
17 posiciones de scroll por caso, 11 de ellas con el encabezado congelado.)*

**Permanencia.** Las dos reglas de tinta repetida llevan su explicación al lado
en `styles.css` (`table.tareas thead th::before` y `.subfrente__titulo--colapsado`).
Sin ese comentario parecen redundancia y una limpieza las borraría, devolviendo
el problema.
