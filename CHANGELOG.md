# Historial de cambios

Crónica de lo que se fue construyendo, solicitud por solicitud. Vivía en el
README, que con eso pasaba de las 600 líneas y costaba usar para lo que un
README sirve: entender qué es esto y cómo levantarlo (#235). Acá no se perdió
nada — es el mismo texto, movido entero.

Para el **estado actual** —qué hace hoy la aplicación y por qué— la fuente de
verdad es [`docs/PROYECTO.md`](docs/PROYECTO.md). Este archivo es historia: las
entradas describen el momento en que se hicieron y algunas fueron revisadas
después por solicitudes posteriores.

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
  específico se usa el filtro de fechas, que **filtra las tareas y define el
  horizonte** (#250): si el filtro deja las de esta semana, la ventana es esa
  semana. Mientras hay filtro de fecha el selector de modo no se ofrece (en su
  lugar, el aviso "Horizonte definido por el filtro de fecha").
  Al hacer scroll vertical, **ambas bandas del encabezado** (rango/período arriba
  + días abajo) quedan **fijas** como un único bloque sticky.
- **En mobile la Gantt no se ofrece** (la grilla no funciona en pantalla
  angosta): dentro de un proyecto solo queda la Tabla, sin toggle de vistas. Mis
  Tareas se abre desde el menú izquierdo. En desktop se mantienen Tabla y Gantt.
- **Mobile — administración y flotantes (#194–#203):** todo aditivo dentro de
  `@media (max-width: 768px)`; las reglas de ancho de tabla quedan acotadas a
  `@media (min-width: 769px)` para que un ajuste de escritorio no rompa mobile.
  Los **modales altos** tienen techo `calc(100dvh - 24px)` con scroll propio,
  cabecera y botonera **sticky** (la ✕ y Guardar siempre alcanzables); los
  cortos no cambian. El **panel de notificaciones** cierra el drawer y entra a
  **pantalla completa** con ✕ propio. El menú **⋯** se acota al viewport y, en
  pantallas táctiles, se muestra en **todos** los proyectos y **todos los
  frentes** (en escritorio sigue apareciendo con hover), con la misma área
  tocable de ≥44 px sin aumentar el alto de la fila. En el frente, ese ⋯
  **conserva su lugar en el teléfono** —está siempre visible y montarlo sobre el
  texto lo taparía— mientras que en escritorio se monta sobre el extremo derecho
  para no quitarle ancho al nombre (#225). Las tablas de administración dan **ancho propio a la
  columna de identidad** y aceptan scroll horizontal. Los flotantes ☰/🌙 se
  **ocultan** mientras haya un modal o el panel abiertos. Las áreas táctiles
  llegan a **≥44 px** con un `::before` transparente, sin engordar las filas.
  Los iconos de acción son **SVG de trazo** (`components/Iconos.tsx`), no
  glifos: los símbolos de presentación de texto (✎ ⏻ ✉ ↺) salían como ▯ en
  Android porque no están en el set de emoji a color.
- **Vistas guardadas persistentes (#215):** la regla es **lo que se guardó
  explícitamente persiste; lo que no, es temporal**. Aplicar una vista desde el
  desplegable **entra** en ella: el botón pasa a decir `Vistas · <nombre>` y la
  vista queda marcada en la lista. Sobrevive a salir de la pantalla y a
  **recargar** (se guarda en `localStorage`, por usuario y por pantalla — cada
  proyecto por su lado, Mis Tareas por el suyo). **Salir de la pantalla
  descarta todo lo que no se guardó**, y **cambiar de proyecto cuenta como
  salir** (#221): un filtro puesto a mano no persiste, y los cambios sin
  guardar sobre una vista se descartan —al volver aparece tal como está
  guardada, sin asterisco—. Lo único que sobrevive es la vista guardada, y
  solo con su contenido guardado. Estando en una vista, **cambiar o limpiar** filtro u orden deja
  dentro de ella y la marca con un **asterisco**; el **💾** lo hace
  desaparecer, y salir sin guardar descarta lo no guardado. Se sale de una
  vista **deseleccionándola** en el desplegable (queda todo limpio); borrarla
  con el 🗑 deja los filtros puestos pero ya como temporales. Ninguna acción de
  filtro entra ni saca de una vista — eso pasa solo por el desplegable.
  *No confundir con el botón* **↻ Actualizar vista**, que es el mecanismo
  independiente de la foto congelada.
- **Mobile — correcciones del teléfono real (#212–#214):** tocar una
  **notificación** navega y resalta la tarea pero **no abre el panel de
  detalle**, que en 390 px taparía justo el plan al que se acaba de llegar (en
  escritorio se abre como siempre). En las tablas de administración, el nombre
  de la primera columna se **trunca** y **al tocarlo** un globo muestra el
  nombre entero con su pill, envuelto en varias líneas si hace falta — en
  táctil no hay hover, así que un "…" sin salida es ilegible para siempre; el
  globo va en un portal con `position: fixed` para que ningún `overflow` lo
  recorte. Y los iconos de acción se **separan** hasta que sus áreas de 44 px
  dejan de solaparse (centros a 46 px): el problema no era el tamaño sino la
  falta de espacio, y por eso tocar 👥 disparaba 📦.
- **#216–#220 (correcciones):** la separación de iconos baja a **4 px** y su
  área tocable **vuelve a coincidir con lo visible** — con 44 px invisibles,
  cuatro iconos no caben en la columna de Usuarios (#216). Cada campo de
  contraseña de la aplicación lleva su **propio ojo** (#217). El pie de la
  barra lateral **no dibuja recuadro**: lo pulsable es el nombre (#218). Una
  notificación **siempre** lleva a su tarea y la resalta, aunque ya estés en
  ese proyecto o toques la misma dos veces (#219). El filtro de **Proyecto**
  tiene "Seleccionar todos", como Responsable y Estado (#220).
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
- **Ancho de la barra ajustable (#226):** se arrastra el **borde derecho**, que
  al acercar el cursor muestra una línea y cambia a `col-resize`. Va entre
  **244px** (el ancho de siempre; más angosta no aporta y para eso está el modo
  escondido) y **400px**, y el arrastre se detiene en los topes. El cambio se ve
  **en vivo** y el contenido se reacomoda con él; **doble clic** en el borde
  devuelve el ancho por defecto. El ancho se recuerda **por usuario** con el
  mismo mecanismo que el tema y el modo de la barra —`localStorage`, sin tocar
  la base de datos— y la barra **escondida se despliega con ese mismo ancho**.
  El valor vive en la variable CSS `--sidebar-w`, que leen la columna de la
  grilla, la barra desplegada y el panel de notificaciones (anclado a su borde).
  Solo en escritorio: en el teléfono la barra es un panel superpuesto de ancho
  fijo y no hay nada que arrastrar.
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
  fijo, **Con fecha** o **Sin fecha**), Responsable (incluye **Sin asignar**) y Estado, con
  multi-selección ("o" dentro del campo, "y" entre campos). Responsable y Estado
  incluyen **"Seleccionar todos"** (alterna a "Deseleccionar todos"). El **filtro y
  el orden se guardan juntos** como una sola vista, con nombre, **privados por
  usuario y por proyecto**; se aplican/actualizan/renombran/eliminan desde el
  desplegable "Vistas". El **filtro y el orden son por proyecto**: aplicarlos en un
  proyecto **no afecta** a otro; cada proyecto conserva su propio estado
  (momentáneo hasta guardarlo como vista). Cada campo tiene su "Limpiar filtro"
  además del Limpiar global. **El filtro filtra filas en las dos vistas, con la
  misma regla** (#250): los tres campos —fecha, responsable y estado— dejan
  exactamente las mismas tareas en la tabla y en la Gantt. Antes la fecha era la
  excepción: en la Gantt no filtraba, **solo** se traducía al horizonte, así que
  con "Hoy" puesto seguían apareciendo las tareas de otros días y las que no
  tienen fecha. Ahora la fecha hace **las dos cosas a la vez**: filtra las tareas
  y define la ventana de días, que es lo que corresponde —si quedan las de esta
  semana, se muestra esa semana—. En la tabla, los
  filtros quedan **fijos arriba** al hacer scroll y los encabezados de columna se
  congelan justo debajo. Los desplegables de filtro se muestran **por encima del
  contenedor** (no se recortan aunque la tabla sea corta, p. ej. en Mis Tareas).
- **"Con fecha"** (#223 — opción del filtro de Fecha, justo encima de "Sin
  fecha"): muestra **solo las tareas que tienen Fecha Objetivo**, cualquiera sea.
  Es **excluyente** dentro del campo: activarla apaga cualquier otra opción de
  fecha —incluida "Sin fecha"— y elegir otra la apaga a ella; nunca quedan dos
  encendidas. Sumarla a "Esta semana" anularía esa opción (todo lo de esta semana
  ya tiene fecha) y sumarla a "Sin fecha" equivaldría a no filtrar. Volver a
  tocarla la desactiva. **Filtra filas en las dos vistas** (como el resto de las
  opciones de fecha desde #250) pero **no define el horizonte**: no es una
  ventana temporal, así que el selector "Alrededor de hoy" / "Todo el proyecto"
  sigue disponible y no aparece el aviso "Horizonte definido por el filtro de
  fecha". Está en las vistas de proyecto y en
  Mis Tareas, y se guarda como parte de una vista. El comportamiento de "Sin
  fecha" **no cambia** (sigue sumándose al resto); lo único nuevo entre ambas es
  que se apagan mutuamente.
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
  Todo lo que se pinta **sobre un fondo destacado** usa la variable
  `--sobre-primario` (blanco en claro, casi negro en oscuro), nunca `#fff` fijo:
  con el color quemado, el contenido desaparecía al invertirse el fondo. Era el
  caso del **número de prioridad y la flecha seleccionada del menú "Ordenar"**,
  que quedaban blancos sobre un fondo casi blanco (#224); en modo claro el
  resultado es idéntico al anterior, porque ahí la variable vale `#ffffff`.
- **Los botones siguen el tema por defecto (#230):** un `<button>` **no hereda**
  el color del texto de su contenedor; si no se le declara uno, el navegador le
  pone su negro. La regla base de la aplicación tampoco lo declaraba, así que
  cualquier botón que se olvidara quedaba expuesto: en claro se veía bien por
  casualidad —fondo claro— y en oscuro desaparecía. Le pasaba al **menú de
  responsable**, cuyas opciones son botones sin color propio. La corrección va
  **en la raíz** (`button { color: inherit }`), no en ese menú, para que el fallo
  no pueda repetirse por olvido. Se auditaron todos los botones en ambos temas
  antes de tocar nada: los únicos que dependían del negro por defecto eran el
  disparador del selector de responsable y las opciones de su menú, ninguno sobre
  un fondo claro fijo. Las zonas oscuras en los dos temas —barra lateral,
  tooltips, tarjeta flotante de la Gantt— **declaran su propio color** (los
  globos, su `#fff`; la tarjeta no tiene botones), así que no cambian. Único
  efecto en modo claro: los nombres del menú de responsable pasan de `#000000` a
  `#1a1c1d`, el color de texto de la aplicación — que es exactamente lo pedido.
- **El campo de comentario nuevo sigue el tema (#231):** no declaraba fondo ni
  color, así que usaba los del navegador —blanco y negro— y en oscuro quedaba un
  recuadro blanco dentro de un panel oscuro. Ahora usa `var(--texto)` sobre
  `var(--superficie)`, lo mismo que los campos de los modales y el de agregar
  miembros; el borde de foco verde y el texto de ayuda ya eran legibles en los
  dos temas. No cambia el tamaño, la forma ni el comportamiento.
- **Colores que apuntaban a una variable inexistente (#232):** el campo de la
  pantalla **sin frentes** pedía `var(--borde)`, que no existe en ningún tema y
  no llevaba respaldo; una declaración con una variable indefinida se descarta
  entera, así que el campo se quedaba **sin borde**. Ahora usa `--borde-input`,
  el de los demás campos —cambia también en claro, y es lo que pide el criterio:
  el mismo borde en los dos temas—. El nombre de la sesión en el pie de la barra
  lateral pedía `var(--primario-claro, #9fd0a8)`: funcionaba **por el respaldo**,
  no porque el color existiera. Se le dio nombre propio, `--sidebar-acento`, con
  el mismo `#9fd0a8` de siempre; es fijo a propósito, porque la barra es oscura
  en los dos temas. El aspecto del pie no cambia.
- **Responsable de una tarea = miembro del proyecto (#228):** los candidatos son
  exactamente el **dueño y los usuarios activos con acceso**, sin excepción por
  rol. Antes se colaban además **todos los admins activos**, fueran o no
  miembros, y eso chocaba con la regla que gobierna el resto de la aplicación:
  barra lateral, Resumen y Mis Tareas muestran **solo los proyectos donde la
  persona es miembro**. Una tarea asignada a un admin no miembro no le aparecía
  por ningún lado. La lista sale de un único `miembrosDeProyecto` en
  `lib/permisos.ts`, usado por la tabla, la Gantt, el panel de detalle, la
  creación de tareas y el filtro de Responsable, para que no puedan divergir. Es
  una regla **de interfaz**: no hay cambios en la base ni en las reglas de
  acceso, y ninguna tarea existente se modifica.
- **El responsable siempre se muestra, aunque ya no esté disponible (#229):**
  una tarea con responsable en la base **nunca** se ve vacía. Si esa persona ya
  no es candidata —dejó de ser miembro, o fue desactivada/eliminada— se sigue
  mostrando, **apagada** (atenuada y en gris) y con el motivo en el tooltip. Al
  abrir el selector no aparece entre las opciones: se reasigna a un miembro o se
  deja sin responsable, y el aspecto vuelve a la normalidad. Cuando el cliente
  **no tiene la ficha** de la persona se muestra una **marca neutra «?»**, no un
  hueco: con Supabase la lista de usuarios sale de la vista `usuario_visible`,
  que excluye a los eliminados y, para quien no es admin, a quien ya no comparte
  ningún proyecto. Los responsables normales se ven exactamente igual que antes.
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
- **Administración → Proyectos** (hermano de Usuarios): módulo dueño de la
  relación usuario↔proyecto (miembros, 🔑) y del ciclo de vida — **archivar**
  (lo saca de la barra, Resumen y Mis Tareas conservándolo) y **eliminar en
  cascada** (solo sobre archivados), ambas con el permiso
  `archivarEliminarProyectos` verificado en la base. _Administrar ≠ ser
  miembro_: el admin ve y gestiona todos los proyectos aunque su barra solo
  muestre los suyos. Unirse/salir se hace desde el **modal de Miembros**.
- **Notificaciones in-app:** tres eventos sobre tus tareas — te asignaron,
  replanificaron o comentaron (nunca por acciones propias) —, **generadas por
  triggers en la base**. Entrada en la barra con contador naranja, panel
  emergente que marca leído **al cerrarlo**, y clic que **navega a la tarea con
  un realce** (contorno que no tapa el color de categoría). Con la barra
  contraída, una **campana fija** abre el mismo panel.
- **Baja de usuarios:** eliminar = desactivar + invisible (sin borrado físico,
  para no huérfanar el historial); dar de alta el mismo correo **reactiva** la
  fila y recupera sus accesos.

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
  Tiene además el **conmutador Tabla / Gantt** (#190): la misma grilla del
  proyecto aplicada a las tareas propias, cruzando proyectos, con una **columna
  extra muy angosta** a la izquierda —nombre del proyecto **rotado** sobre su
  color, repetida en cada frente, truncada con "…" y nombre completo en el
  tooltip cuando no cabe—. Es de **lectura y replanificación** (mover fechas,
  marcar hechas, abrir el detalle): sin crear ni eliminar, y con una sola fila
  de carga al pie (el total diario del usuario). El filtro y el orden se
  comparten entre ambas vistas. En mobile no hay Gantt.
- **Panel lateral de detalle** (backlog de 7.2): click sobre una tarea o una marca del
  Gantt abre un panel con el detalle completo, la línea de tiempo del historial y las
  acciones operativas (marcar hecha, replanificar, archivar) para admins. Se cierra
  con ✕, con Escape o al hacer click fuera.
- **Cuenta de usuario (#207)**: desde el pie de la barra lateral se entra a
  **Mi cuenta**, donde cada quien cambia su **nombre**, sus **iniciales** y su
  **contraseña** (pidiendo la actual). El correo, el rol y el estado no se
  tocan desde ahí: los gestiona el admin. Las **iniciales escritas a mano se
  respetan para siempre**; las que nunca se escribieron siguen al nombre y se
  recalculan al cambiarlo — la salida para cuando dos personas de nombre
  parecido chocan.
- **Recuperar contraseña (#205)**: desde el login, "¿Olvidaste tu contraseña?"
  manda por Resend un enlace de **1 hora y un solo uso**; al usarlo se cierran
  todas las sesiones abiertas de esa cuenta. Solo sirve para usuarios activos
  **con cuenta ya creada** — un invitado que nunca aceptó, un desactivado y un
  correo inexistente reciben el mismo mensaje y ningún correo. La pantalla que
  define la contraseña es **la misma** que la de la invitación (#204): mismas
  validaciones, distinto texto. Si el enlace venció o ya se usó, se explica qué
  pasó y qué hacer (#206) — el reenvío sigue siendo una acción del admin.
- **Menciones en comentarios (#208)**: escribir `@` ofrece a las personas **con
  acceso a ese proyecto** y el mencionado recibe un aviso. Una sola
  notificación por persona y comentario: si el mencionado es además el
  responsable, gana el texto de la mención. En el texto guardado la mención es
  un **id**, no un nombre, así que sigue apuntando a la persona correcta aunque
  después se cambie el nombre.
- **Editar el propio comentario (#209)**: solo el autor, sin límite de tiempo y
  con marca visible de editado. **No se borra** ningún comentario: el hilo
  acompaña al registro de replanificaciones y es el respaldo de por qué pasó lo
  que pasó. Editar no genera notificaciones nuevas.
- **Archivo de canceladas (6.3)**: archivar una tarea la saca del plan (vistas y
  contadores) conservando su historial; queda consultable por sub frente y puede
  restaurarse. Distinto de eliminar (definitivo). En el panel de detalle el botón
  dice **"Archivar tarea"**, a secas: antes decía "Archivar (cancelar)" y el
  paréntesis se leía como si el botón cancelara la acción en curso, no la tarea.
  Qué implica archivar lo explica el tooltip y lo confirma el diálogo.
- **Resumen / indicadores por proyecto**: tarjetas con % de avance, barra de progreso y
  contadores (hechas, pendientes, por replanificar, replanificadas abiertas) de todos
  los proyectos visibles. Disponible también para clientes (con sus proyectos).


## Auditoría de estado #233 — segunda entrega: hallazgos complejos (#243–#249)

La auditoría de estado (informe en `docs/auditoria-seguridad.md` y el reporte
#233) se resolvió en dos pedidos. El primero cubrió los hallazgos simples
(#234–#242, #251) y sus efectos ya están descritos arriba. Este es el segundo:
siete hallazgos que tocaban permisos, sesión, base de datos y Edge Functions.

- **#243 — El panel de detalle usaba los permisos del proyecto equivocado.**
  Calculaba sus acciones con el `can` del proyecto **activo** de la barra, pero
  el panel se abre también desde Mis Tareas y desde una notificación, que cruzan
  proyectos. Alguien con control total en A veía acciones que no le corresponden
  al abrir una tarea de B, y quien tenía permisos en B no los veía. Ahora el
  `can` se construye con el proyecto **de la tarea**, el mismo camino que ya
  usaban las filas de Mis Tareas.
- **#244 — Sesión inválida o cuenta desactivada: vuelta al login con el motivo.**
  Antes la aplicación se quedaba mostrando errores sueltos. Ahora hay dos
  mensajes fijos —"Tu sesión ha expirado. Vuelve a ingresar." y "Tu cuenta fue
  desactivada. Para volver a activarla ponte en contacto con tu administrador."—
  que se ven en el login al llegar y se retiran al reintentar. El caso se
  distingue preguntando por el **estado** (hay sesión, existe el usuario, su
  perfil sigue activo), **nunca** leyendo el texto de un error: si esa consulta
  falla no hay evidencia de nada y no se echa a nadie. Se distingue además la
  salida voluntaria de la involuntaria, para no mostrar un aviso a quien
  simplemente cerró sesión.
- **#245 — La fecha de una tarea hecha no se edita, en las cuatro vistas.** La
  Gantt ya lo hacía; tabla, Mis Tareas y panel lo escribían distinto. La regla
  vive ahora en un solo lugar (`puedeEditarFecha`). La fecha sigue a la vista
  como texto —desaparece el control, no el dato— y quien podría editarla ve por
  qué. El check sigue siendo reversible: desmarcar, corregir, volver a marcar.
- **#246 — Notificación de una tarea que ya no existe.** El clic no hacía nada y
  la notificación parecía rota. Ahora avisa "Esta tarea ya no existe." y la
  retira de la lista. Además, borrar una tarea, un sub frente, un frente o un
  proyecto se lleva por delante sus notificaciones en **los dos** backends (en
  Supabase ya lo hacía la cascada; faltaba en el modo Local).
- **#247 — "Hoy" se recalcula solo.** Se fijaba al abrir la aplicación: una
  pestaña abierta al cruzar la medianoche seguía calculando categorías, atrasos,
  la columna de HOY y la fecha de "marcar hecha" con el día anterior. Se revisa
  cada minuto y al volver a la pestaña (foco / `visibilitychange`), y solo
  cambia el estado si el día cambió.
- **#248 — La lectura directa de `usuario` también excluye a los eliminados**
  (migración 19). La migración 15 revocó el SELECT completo pero dejó un grant
  de seis columnas no sensibles; un GRANT concede columnas, no filas, y la
  política `usuario_select` no miraba `eliminado`. Ahora sí, para todos, admin
  incluido. Como Postgres aplica las políticas de SELECT también a las filas de
  un `RETURNING`, `eliminarUsuario` dejó de pedir la fila de vuelta y comprueba
  el borrado releyendo `usuario_visible`. La compuerta de RLS trae un caso nuevo
  que compara tabla contra vista, rol por rol.
- **#249 — Edge Functions: CORS sin `'*'` y errores sin detalles internos.** Si
  no hay ningún origen configurado (`SITE_URL` / `SITE_URLS`), las tres
  funciones **rechazan** la petición con `503` en vez de abrirse a cualquiera —
  el momento en que falta la configuración es justo cuando menos se puede
  confiar en quien llama. Y el detalle técnico (error de Auth, respuesta de
  Resend, excepción) se registra en el servidor; al cliente le llega un mensaje
  genérico en español que dice qué hacer. Los mensajes útiles del flujo —"Esta
  invitación ya fue usada", "El enlace expiró"— no cambian.

## Correcciones para la salida en vivo (#252–#259)

Seis correcciones salidas del uso real, necesarias para entregar la herramienta
a clientes. Sin cambios en la base de datos. (#255, tiempo real, y #258, borrado
definitivo de usuarios, van aparte.)

- **#252 — Los mensajes del login, en español.** Al equivocarse en la contraseña
  la pantalla mostraba "Invalid login credentials", el texto crudo del servicio
  de autenticación. Es el mismo patrón ya corregido en #244 (sesión inválida) y
  #249 (funciones de servidor), pero el login había quedado fuera de los dos
  porque no pasa por las funciones: llama directo a Auth. Ahora hay **cuatro
  textos fijos** —credenciales incorrectas, cuenta desactivada, demasiados
  intentos, fallo de conexión— y un genérico para lo no previsto; el texto
  original **nunca** llega a la pantalla. Se clasifica por el `status`/`code` de
  la respuesta, no por su mensaje, que viene en inglés y cambia entre versiones.
  El de credenciales dice "correo o contraseña" **sin precisar cuál falló**
  (decir que el correo no existe permitiría enumerar cuentas), el de cuenta
  desactivada es literalmente la misma constante que el de #244, y el de
  demasiados intentos no promete ningún plazo, porque el límite lo fija Auth y
  no es exacto.
- **#253 — La tarea recién creada aparece aunque haya un orden aplicado.** Con la
  vista congelada, crear una tarea encendía el aviso "↻ Actualizar vista" y nada
  más: la tarea no se veía, y eso se lee como que no se guardó. Ahora se fuerza
  su aparición con el **mismo mecanismo** que ya usaba la llegada desde una
  notificación —el mismo `forzarIds`, ampliado de un id a un conjunto porque
  encadenando con Enter se crean varias—. La lista **no se reordena sola**: la
  nueva entra al final de su sub frente y el resto se queda donde está hasta
  tocar "Actualizar vista". Vale igual con filtro aplicado, caso que se da en la
  Gantt (la tabla esconde su fila de creación mientras se filtra).
- **#254 — El cliente ve Mis Tareas.** El producto define al cliente como
  ejecutor del plan —le asigna tareas, le da permisos sobre las suyas y le manda
  notificaciones— pero no le daba ninguna pantalla donde verlas juntas: con tres
  o cuatro proyectos tenía que entrar uno por uno y filtrar a mano. Es la
  **misma** pantalla que ven admins y consultores, no una variante recortada: ya
  filtra por responsable dentro de los proyectos donde uno es miembro. No le da
  permisos nuevos a nadie.
- **#256 — La fila de creación planifica con el botón "Planificar".** Mostraba
  un campo `dd/mm/aaaa` mientras que una tarea sin fecha muestra el botón:
  planificar tiene peso en este producto —queda registrado y moverlo después
  genera una replanificación con historial— y un campo de fecha suelto invita a
  poner una fecha de pasada. Misma pieza, mismo comportamiento; la tarea sigue
  pudiendo nacer sin fecha.
- **#257 — Crear un usuario le envía la invitación.** El correo salía recién al
  tocar el sobre, en un paso aparte, pero la interfaz prometía otra cosa ("+
  Cliente", "Invita a alguien con + Cliente"): se creaba el usuario, se creía
  haber invitado y la persona nunca se enteraba. Ya pasó en el uso real. El
  sobre se conserva para **reenviar** —la invitación caduca a los 7 días— y al
  crear se ve la misma confirmación que muestra el reenvío. Si la creación
  funciona pero el envío falla, el usuario **queda creado** y se avisa que la
  invitación no salió y que se reintenta con el sobre.
- **#259 — La fila de creación ya no arrastra el responsable y la fecha.**
  Heredarlos al guardar con Enter es deliberado y útil: encadenar varias tareas
  de la misma persona para la misma fecha. El problema era que sobrevivían al
  **cierre** de la fila: se volvía a abrir con "+ Tarea" y seguían puestos, así
  que se asignaban tareas a alguien sin querer. Encadenar hereda; reabrir empieza
  en blanco.

## Tiempo real, entrega 1 de 2: la campana (#255)

El cambio más complejo del proyecto hasta ahora, partido en dos a propósito:
esta entrega cubre **solo las notificaciones** (una tabla, riesgo acotado); la
entrega 2 (#260) llevará los datos del proyecto al mismo mecanismo. El riesgo
principal no era que no funcionara, sino que funcionara **de más**: el canal
nuevo tenía que respetar exactamente las mismas reglas de acceso que la lectura
normal.

- **La campana refleja el estado real sin recargar.** Llega una notificación y
  el contador sube solo; si el panel está abierto, la nueva aparece en la lista
  y la que dejó de existir desaparece. Sin destello ni aviso emergente, por
  decisión de producto.
- **Migración 20** (aditiva): publica `notificacion` —y solo esa tabla— en la
  publicación `supabase_realtime`. Realtime evalúa la RLS **del suscriptor**
  para INSERT/UPDATE; los DELETE, a los que no puede aplicar RLS, viajan solo
  con la clave primaria porque REPLICA IDENTITY queda en DEFAULT a propósito
  (con FULL, el borrado repartiría la fila entera a cualquier autenticado).
- **La cañería es una** (`data/tiempoReal.ts`): conexión, reconexión con
  espera creciente, degradación silenciosa y la semántica de los avisos viven
  ahí; la entrega 2 suma tablas a ese módulo, no construye otro.
- **El canal avisa; la verdad se relee.** Cada evento, la reconexión y el
  despertar de la pestaña disparan la misma relectura
  (`repo.loadNotificaciones`), cuyo resultado reemplaza la lista. El eco
  desaparece por construcción (marcar leídas baja el contador UNA vez) y una
  pestaña dormida queda bien al despertar aunque haya perdido eventos.
- **Si el canal no conecta, no pasa nada visible:** la aplicación funciona
  exactamente como antes, todo al recargar. El modo Local sigue sin tiempo
  real, intacto.
- **La compuerta de RLS trae el caso "el canal no reparte de más":** tres
  oyentes simultáneos sobre una notificación real — el destinatario (debe
  recibirla), otro usuario suscrito sin filtro (cero eventos con contenido) y
  el admin sin filtro (tampoco: la política de notificaciones no tiene bypass
  de admin, y el canal lo respeta).
- Invariante 20 nuevo en `SEGURIDAD.md`: una tabla solo se publica en
  `supabase_realtime` con su RLS validada, replica identity en DEFAULT, y los
  eventos son avisos, nunca datos.

## Tiempo real, entrega 2 de 2: los datos (#260)

Completa el alcance definido por el criterio del dueño: **todo lo que genera
notificaciones debe poder verse sin recargar**. Bloqueaba la salida en vivo —
las notificaciones avisaban de tareas que no se podían ver hasta recargar.

- **Migración 21** (aditiva): suma a la publicación `supabase_realtime` las
  siete tablas de datos — `tarea`, `frente` y `sub_frente` (una tarea sin su
  contenedor no se puede mostrar), `proyecto`, `acceso_proyecto` (te agregan a
  un proyecto y aparece solo), `comentario` y `replanificacion` (la entrada del
  historial, no solo la fecha nueva). Todas con REPLICA IDENTITY en DEFAULT,
  mismo razonamiento que la migración 20. `usuario` queda fuera a sabiendas: un
  cambio de nombre se ve al recargar.
- **La cañería no se tocó**: `data/tiempoReal.ts` quedó byte a byte igual; el
  efecto de App la llama con siete tablas más. Sin filtro de servidor en las de
  datos: la barrera es la RLS por membresía, evaluada con el JWT del suscriptor.
- **La relectura es una y es completa** (`loadState`), a propósito: la
  notificación y su tarea llegan en el mismo estado, atómicamente. Con
  relecturas separadas la campana podía anunciar una tarea que el navegador no
  tenía — y el clic diría "Esta tarea ya no existe" siendo mentira. Ahora el
  texto de la notificación muestra el nombre de la tarea, el clic lleva a ella
  sin recargar, y ese mensaje vuelve a significar exactamente lo que dice. (El
  método de relectura ligera de la entrega 1 quedaba muerto y se retiró.)
- **Los cambios ajenos pasan por la vista congelada, igual que los propios**:
  con filtro u orden nada se reordena solo, se enciende "↻ Actualizar vista", y
  una tarea ajena nueva se fuerza a aparecer como una propia (#253 ampliado: el
  conjunto de forzadas ahora también se alimenta de la relectura del canal).
- **Dos protecciones nuevas.** Un cambio ajeno no pisa lo que se está
  escribiendo: los borradores viven como estado local de los componentes y el
  fondo se actualiza sin interrumpirlos; al guardar, gana el último en guardar.
  Y si te quitan el acceso al proyecto que miras —o lo archivan o eliminan—, la
  aplicación te lleva al **Resumen**, sin error; el "peek" de las
  notificaciones (#179) se respeta.
- **La compuerta amplía el caso del canal**: `tarea` como representante de la
  familia de datos — el miembro del proyecto de prueba recibe el INSERT en
  vivo; el no miembro, suscrito sin filtro, cero eventos con contenido.
- Reconexión, pestaña dormida y degradación silenciosa funcionan para los
  datos igual que para la campana: son la misma relectura y la misma cañería.
  El modo Local sigue sin tiempo real, intacto.

## Cuatro correcciones: calendario, barra sostenida, miembros y notificaciones (#262, #263, #281, #283)

- **#262 — El selector de fecha ya no asigna al navegar meses.** La causa era
  estructural: con el calendario nativo (`showPicker`) un cambio de mes y una
  elección de día disparan el mismo `change` sin tecleo, indistinguibles. Se
  reemplazó por un **calendario propio** en `FechaEditable` — misma API, mismos
  cuatro puntos de uso (tabla, fila de creación, Mis Tareas, panel de detalle):
  navegar meses solo cambia la grilla, únicamente el clic en un día asigna y
  cierra, y clic fuera / Escape cierran sin tocar la fecha ni el historial. El
  popover es un portal que sigue a su celda al hacer scroll, **no roba el foco**
  (el guardado-por-foco-fuera de la fila de creación ya no se dispara) y el
  cierre por clic-fuera va en fase de captura (varias celdas cortan la
  propagación del mousedown). El panel de detalle aprendió que un clic en el
  calendario no es "clic fuera del panel". Verificado con Playwright: 29
  comprobaciones sobre los cuatro puntos, en claro y oscuro.
- **#263 — La barra escondida se sostiene mientras haya algo abierto.** El
  despliegue era puro `:hover` de CSS y ningún estado sabía que el panel de
  notificaciones o un menú ⋯ (proyecto Y frente) estaban abiertos: al sacar el
  mouse, la barra se contraía y el popover quedaba flotando. Ahora App marca
  `app--sidebar-sostenida` mientras el panel o un ⋯ estén abiertos (el Sidebar
  avisa con `onMenuAbierto`), y las mismas tres reglas del hover la mantienen
  desplegada — acotadas a escritorio con `min-width: 769px`; el modo fijo y el
  panel de mobile quedan intactos. La manija de ancho (#226) sigue funcionando
  con el panel abierto, y el panel se mueve con ella.
- **#281 — Un consultor no veía a todos los miembros de su proyecto.** La lista
  de responsables se arma desde `usuario_visible`, cuya tercera condición
  (`comparte_proyecto`) era la que fallaba. **La causa NO está en el repo**: se
  reprodujo el escenario completo en un Postgres 16 limpio con las migraciones
  1→21 en orden y la vista entrega a los cuatro miembros correctamente, para
  consultor y para cliente, sin exponer gente de proyectos no compartidos. La
  conclusión —la primera hipótesis del reporte— es que **la base desplegada
  divergió de las migraciones** (una función en versión anterior o algo
  aplicado fuera de orden; con `comparte_proyecto` divergente se reproduce
  exactamente el síntoma "solo el admin y yo"). La **migración 22** repone la
  definición canónica de la cadena completa y de la vista —no reescribe la
  regla— e **imprime antes las definiciones vivas** (RAISE NOTICE): la salida
  del SQL Editor al aplicarla queda como registro de cuál era la pieza
  divergente. La compuerta suma el caso que le faltaba y que habría atrapado
  esto: la **entrega** de la vista (cada miembro VE a su co-miembro), no solo
  el aislamiento.
- **#283 — Las notificaciones ya no sobreviven a perder el acceso.** La
  política de `notificacion` era solo "mías"; la **migración 23** la condiciona
  además al **acceso al proyecto de la tarea** (`tiene_acceso_proyecto(
  proyecto_de_tarea(tarea_id))` — el mismo criterio del resto de la app, con el
  helper SECURITY DEFINER porque dentro de una política un subquery corre con
  la RLS del que consulta). Al quitar a alguien de un proyecto, sus
  notificaciones de ahí dejan de entregarse y de contar en el contador — **no
  se borran**, como los accesos guardados de un desactivado — y vuelven con su
  leída/no leída intacto al reincorporarlo; la condición va también en el
  UPDATE para que "marcar todas como leídas" no pise el estado de las ocultas.
  El modo Local replica la regla (misma UX en el demo), el mensaje "Esta tarea
  ya no existe" queda solo para su caso legítimo (tarea realmente borrada,
  #246 sigue verde) y el canal de tiempo real es coherente solo: la RLS del
  suscriptor filtra también los eventos. Verificado en un Postgres local
  (políticas reales, ciclo completo) y con Playwright en modo Local; la
  compuerta recorre el ciclo con una notificación real.

## #281, el desenlace: la causa raíz era la política `acceso_select` (migración 24)

Aplicada la migración 22, el defecto persistió — y el respaldo `pg_dump`
previo permitió comparar la base desplegada contra las migraciones pieza por
pieza: **toda la cadena de funciones y la vista ya estaban canónicas**. La
pista definitiva fue el síntoma fino: el consultor veía "a sí mismo y a UN
admin" — justo el **dueño** del proyecto. El selector exige dos entregas: la
persona por `usuario_visible` (funcionaba) y su **fila de acceso** por
`acceso_proyecto` (no llegaba). En el respaldo, `acceso_select` vivía en una
versión vieja, ajena al registro de migraciones — `usuario_id =
usuario_actual_id() OR es_admin() OR es_dueno_proyecto(proyecto_id)` —, con la
que un INVITADO ve solo su propia fila. Como las políticas se reponen con
drop+create, ningún `create or replace` posterior la pisó jamás.

- **Migración 24** repone la versión de la migración 12 (`usuario_id =
  usuario_actual_id() or tiene_acceso_proyecto(proyecto_id)`), superconjunto
  de la vieja: nadie pierde visibilidad y los invitados recuperan la de sus
  co-miembros. Las otras tres políticas de la tabla estaban idénticas al repo.
  Verificado en el Postgres local: la política vieja reproduce exactamente el
  síntoma y la 24 lo cura, con el aislamiento intacto.
- **La compuerta suma la segunda mitad del caso #281**: el invitado del
  proyecto de prueba debe ver las filas de acceso de sus co-miembros — el
  hueco exacto por el que esta divergencia pasó inadvertida.
- La migración 22 queda como red de seguridad idempotente sobre la cadena de
  funciones, con su radiografía; el runbook anota la moraleja: ante sospecha
  de divergencia, comparar también las POLÍTICAS del dump, no solo funciones
  y vistas.

## Cinco para la salida en vivo (#274, #285, #279, #284, #282)

- **#274 — La aplicación siempre parte en Resumen.** Para todos los roles y en
  cada entrada — no se recuerda el último proyecto visitado (decisión tomada).
  Fueron dos líneas: el estado inicial de `pantalla` y el `onLogin`. Llegar
  desde una notificación sigue abriendo la tarea (incluido el "peek" de #179),
  la expulsión por pérdida de acceso sigue llevando a Resumen y la vista
  Tabla/Gantt se sigue recordando por proyecto.
- **#285 — El calendario marca el día de hoy y tiene botón "Hoy".** Hoy va con
  borde (anillo interior con `--primario`, sin correr el layout); el elegido
  sigue relleno; si coinciden, relleno con borde (el anillo pasa a
  `--sobre-primario` para leerse sobre el relleno, en claro y oscuro). Si el
  mes visible es otro, hoy no aparece — correcto, sin compensar. El botón
  "Hoy" devuelve la vista al mes actual y SOLO navega: la regla central de
  #262 (únicamente el clic en un día asigna) queda intacta y verificada.
- **#279 — Filtro "Próximo día hábil".** Quinta relativa, después de "Hoy": un
  solo día — el siguiente que no es sábado ni domingo (L-J: mañana; V/S/D: el
  lunes) —, recalculada con la fecha del día en cada uso. Filtra filas Y mueve
  el horizonte de la Gantt (#250) sin código extra: la opción vive en
  `rangoDeFecha` como las otras cuatro. "Hábil" es L-V y nada más (sin
  feriados, a propósito); un viernes la tarea del sábado NO entra — rango
  literal, como las demás. Las vistas guardadas viejas siguen funcionando y
  las nuevas guardan y restauran la opción.
- **#284 — En mobile, la campana como botón flotante.** Reemplaza al
  interruptor de tema junto al ☰, con el contador de no leídas (mismo criterio
  que la campana de la franja); tocarla abre Notificaciones a pantalla
  completa y cierra el menú lateral (#195). El interruptor de tema queda en el
  pie de la barra lateral también en el teléfono — de paso se corrigió que en
  mobile estaba OCULTO por arrastre de la clase del chevron de plegar
  (`.sidebar__plegar`), es decir, el menú no ofrecía el tema. Todo acotado por
  media query; en escritorio no cambia nada.
- **#282 — Diagnóstico del aviso "Tu sesión ha expirado" (informe en
  `docs/diagnostico-282-sesion-expirada.md`).** Caso A ("Salir" mostró el
  aviso una vez): la protección era una bandera de UN SOLO USO y un "Salir"
  puede producir más de una señal en la misma pestaña (SIGNED_OUT duplicado, o
  una acción en vuelo cuyo catch diagnostica 'expirada' sin pasar por la
  bandera). Se corrigió cerrando la carrera —la bandera pasó a CERROJO
  (`salidaEnCurso`) que solo se rearma al volver a entrar— sin tocar textos ni
  cuándo se expulsa. Verificado: 10 salidas con señales duplicadas en
  escritorio y 10 en mobile, cero avisos; la expiración real y la cuenta
  desactivada (#244) siguen avisando igual. Quedan como decisión de producto,
  documentadas en el informe: qué debería ver la SEGUNDA pestaña cuando se
  cierra sesión en la otra, y si el texto del caso B (volver al día siguiente,
  donde el mensaje es literalmente correcto) amerita una redacción más amable.

## #286 — Eliminar un usuario fallaba con «new row violates row-level security policy»

**La causa, reproducida contra la base.** Se levantó un Postgres 16 limpio con
las migraciones 1→24 en orden y **los mismos grants del `pg_dump` de
producción**, y el error salió idéntico. De ahí, aislando:

- Falla **con y sin `auth_id`**. La pista del reporte —los tres usuarios que
  fallaban nunca completaron el registro— era **coincidencia**: son cuentas de
  prueba recientes, y el defecto alcanzaba a cualquier usuario.
- Columna por columna: `nombre` pasa, `activo` pasa, **solo `eliminado` falla**.
- Con `usuario_select` relajada a `using (true)`, el MISMO update pasa.

**La regla de PostgreSQL detrás:** en un UPDATE, si quien ejecuta tiene
derechos de SELECT sobre la tabla, **las políticas de SELECT se aplican como
WITH CHECK sobre la fila NUEVA** — para impedir dejar una fila en un estado que
uno ya no podría ver. Y eso es exactamente lo que hace eliminar: la política
exige `not eliminado` (migración 19), así que marcar `eliminado = true` deja la
fila fuera de la política y Postgres rechaza. La política de UPDATE nunca
estuvo implicada: su `WITH CHECK` empieza por `es_admin()`, verdadero para el
actor (comprobado en la misma sesión). Es decir: **una política de SELECT
restrictiva puede bloquear escrituras legítimas**, no solo lecturas.

**La corrección (migración 25).** El borrado lógico pasa a la RPC
`eliminar_usuario`, SECURITY DEFINER — el MISMO patrón que
`crear_o_reactivar_usuario` (migración 16), su operación inversa, y por la
misma razón: tiene que tocar filas que la política y la vista ocultan. La
autorización se replica adentro (`es_admin()`, idéntica a la que ya exigía la
política), así que **no se amplía quién puede modificar `usuario`**; el UPDATE
directo sigue rechazando a un no-admin, verificado. El front llama a la RPC en
vez de hacer el UPDATE, y conserva la comprobación por la vista de #248.

**Lo que NO se hizo, a propósito:** relajar `usuario_select` para dejar ver los
eliminados habría "arreglado" el UPDATE rompiendo el invariante de #248 (la
tabla no expone más que la vista) y una decisión del producto. Grants intactos
—las mismas seis columnas, `email` fuera—. Tareas, comentarios, historial y
accesos del usuario se conservan: #258 (borrado definitivo) sigue fuera.

**La compuerta suma la cara positiva que le faltaba:** un admin elimina a un
usuario **sin `auth_id`**, desaparece de `usuario_visible`, no reaparece con
"ver desactivados", se recupera dando de alta el mismo correo (misma fila), y
un no-admin es rechazado por la RPC. Es el hueco exacto por el que este defecto
llegó a producción: se probaba a fondo quién NO puede tocar `usuario`, nunca
que un admin SÍ pudiera completar el borrado.

**Verificación:** ciclo completo contra el Postgres local con las políticas
reales (eliminar sin/con `auth_id`, invisible en la vista, no reaparece,
reactivación, rechazo a consultor y a cliente, UPDATE directo sigue bloqueado)
y 6 comprobaciones del contrato del front con un cliente de prueba (llama a la
RPC con el parámetro exacto, ya no hace el UPDATE, propaga el error del
servidor y conserva el aviso de #248). Regresión demo en verde.

## #289 — Las vistas guardadas viven en la base, no en el navegador

Vivían en `localStorage`, por usuario y por pantalla: entrar desde otro
computador empezaba sin ninguna vista. **Nunca fue una decisión de producto** —
la solicitud que las creó (#87) definía campos y comportamiento, no dónde se
guardan—, así que ahora siguen a la persona a cualquier máquina.

- **Migración 26 — tabla `vista_guardada`** (dueño, contexto, nombre, filtro,
  orden). El **contexto** sigue siendo el id del proyecto o `'mis-tareas'`: lo
  que antes vivía en la CLAVE de localStorage ahora son columnas. Es `text` y
  no FK a propósito, porque `'mis-tareas'` no es un proyecto. `filtro` y
  `orden` van como jsonb, la misma forma serializada que el front ya usaba.
- **Privada de verdad**: RLS con las cuatro políticas en
  `usuario_id = usuario_actual_id()`, sin `USING (true)` y **sin bypass de
  admin a propósito** — una vista es preferencia personal, no dato del
  proyecto. El dueño lo pone la BASE (`default usuario_actual_id()`), nunca el
  cliente, y el `with check` impide crear una a nombre de otro aunque el id
  venga forzado. `anon` sin privilegios. **No crea ninguna función**, así que
  no hay EXECUTE que revocar.
- **Viajan con el estado**, junto a proyectos, tareas y notificaciones — no se
  leen al abrir el desplegable. `FiltrosBar` dejó de tocar `localStorage`:
  recibe la lista ya filtrada y cuatro llamadas al repositorio (crear,
  actualizar, renombrar, eliminar). `memoryRepo` mantiene su equivalente, así
  que el modo sin base sigue igual.
- **El comportamiento visible no cambia**: guardar, aplicar, renombrar y
  borrar se ven y se hacen igual, con su confirmación; el asterisco de vista
  modificada y toda la regla de #215/#221 quedan intactos (verificado).
- **Tres decisiones del pedido, respetadas**: "en qué vista estabas" se queda
  en el navegador —entrar desde un computador nuevo abre limpio, con las
  vistas disponibles—; no hay importador de lo ya guardado (se vuelven a crear
  una vez); y el tema y el modo/ancho de la barra lateral siguen siendo de
  cada máquina.
- **Consecuencias aceptadas**: las vistas no viajan en tiempo real (aparecen
  al recargar), y las de un proyecto eliminado quedan en la base sin verse.
- **La compuerta suma el caso pedido**: otro usuario no ve, no modifica ni
  borra una vista ajena, y no puede crear una a nombre de otro.

**Verificado**: ciclo completo contra Postgres 16 local con las políticas
reales (dueño puesto por la base, aislamiento entre dos usuarios, el admin
tampoco ve, suplantación rechazada, renombrar/borrar lo propio, `anon`
bloqueado) y 20 comprobaciones Playwright del ciclo de interfaz — incluido
"otro computador" (perfil de navegador nuevo con el mismo estado), contextos
separados, cuenta ajena con el desplegable vacío y el asterisco de #215.
Regresión demo y la ronda #274/#285/#279/#284 (45 comprobaciones, con su ciclo
de guardar y restaurar una vista) en verde.

**Nota que queda anotada, sin actuar**: el pedido advierte que en Postgres las
funciones nacen ejecutables por `public` y que revocar solo a `anon` no basta.
Esta migración no crea funciones, así que no la roza; revisar las revocaciones
ya escritas en migraciones anteriores es trabajo aparte y **no se hizo aquí**.

## #291 — La base y la aplicación no coincidían en qué día es hoy

El navegador calcula "hoy" con la hora local (correcta). La base usaba
`current_date`, que sigue la zona del servidor — y ninguna migración la fija,
así que quedaba en el valor por defecto de Supabase: **UTC**. Chile va 4 horas
detrás en invierno y 3 en verano, de modo que **desde las 20:00 de Chile la
base ya creía que era el día siguiente**. En esa ventana, una tarea planificada
para MAÑANA le parecía comprometida y su movimiento se registraba como
replanificación falsa; además congelaba una fecha original que nunca existió y
bloqueaba desplanificar con "No puedes eliminar tareas que ya pasaron".

Importa más que un color: el historial de replanificaciones es lo que mide si
un proyecto se está moviendo. Un registro falso cada tarde ensucia justo esa
medición y no se nota — parece un dato real.

- **Migración 27 — `hoy_chile()`**: un único lugar que responde qué día es hoy,
  con la zona por **nombre** (`America/Santiago`), no un desfase fijo — un `-4`
  escrito a mano volvería a romperse en septiembre. Verificado que resuelve
  sola el cambio de hora (enero −3, julio −4).
- **Las tres funciones vigentes** (`registrar_replanificacion`,
  `normalizar_fechas_tarea` y `desplanificar_tarea`) se redefinen cambiando
  **únicamente** `current_date` por `hoy_chile()`. Las cuatro comparaciones que
  el reporte identificó viven ahí. *(El pedido nombra `bloquear_fecha_original`:
  así se llamaba en las migraciones 1 y 6; desde la 10 la lógica vigente vive
  en `normalizar_fechas_tarea`.)*
- **Descartado a propósito**: cambiar la zona horaria de la base entera. Es una
  línea y arregla las cuatro de golpe, pero es configuración del servidor y no
  un hecho del código: no viaja en las migraciones y un restablecimiento del
  proyecto la deja atrás sin que nadie se entere.
- **EXECUTE cerrado contra `public`** (#290), no solo contra `anon`, con grant
  explícito a `authenticated` y `service_role`. Hace falta porque
  `normalizar_fechas_tarea` NO es SECURITY DEFINER: corre con el rol que
  escribe la tarea. Verificado en el ACL resultante.
- **No se tocó nada del front**: `hoyISO()` y el navegador ya estaban bien; la
  desalineada era la base. Tampoco cambia la forma de guardar fechas (siguen
  siendo días sin hora) ni la regla de replanificación — ahora se aplica bien.

**Verificado contra Postgres 16 con las migraciones 1→27**, y con la suerte de
que la máquina de pruebas estaba **dentro de la ventana** (UTC ya en el día
siguiente, Chile todavía no): con `current_date` el caso reproduce **1
replanificación falsa**; con `hoy_chile()`, **cero**. Además: mover una tarea de
HOY sí registra (control positivo), desplanificar una de MAÑANA no da error,
desplanificar una de AYER sigue prohibido, y la fecha original se rehace en vez
de congelar un compromiso inexistente. Fuera de la ventana ambas fechas
coinciden, así que de día no cambia nada.

**Datos ya malos — medidos y asumidos.**
`docs/consulta-291-replanificaciones-falsas.sql` identifica los registros
falsos: aquellos en los que, **en hora de Chile**, la fecha anterior todavía era
futura cuando se escribieron. Es **solo lectura**. Se validó contra datos
sembrados (marca el registro del caso reportado e ignora uno legítimo del mismo
día). Corrida contra la base real el 31-jul-2026: **2 falsos sobre 16**.
**Decisión: no se corrige el histórico** — basta con que la regla funcione de
aquí en adelante. Queda anotado que esas 2 tareas arrastran además una fecha
original equivocada que **no se arregla sola** (`normalizar_fechas_tarea` solo
rehace la fecha original mientras la tarea no tenga replanificaciones, y el
registro falso cierra ese camino), así que van a mostrar un atraso mayor al
real mientras existan.

**La compuerta suma el caso de la ventana**: mover una tarea de mañana no
registra replanificación y su fecha original se rehace; mover una de hoy sí
registra; desplanificar una de mañana no da error. Corrida contra el proyecto
real el 31-jul-2026 con la migración 27 aplicada: **verde**.

## #293 — Reordenar tareas arrastrándolas con el mouse

El orden de las tareas solo se podía alterar creando (la nueva nace al final,
o en posición con el "+" de "agregar debajo"); mover una ya creada no existía,
y cambiarla de sub frente tampoco. Ahora se toma la tarea desde un **asa** —
aparece al pasar el mouse, dentro de la celda del nombre, pegada a su borde
izquierdo, igual en Tabla y en Gantt— y se suelta donde corresponda: entre sus
hermanas, en otro sub frente (incluso de otro frente, o uno vacío). Durante el
arrastre una línea marca dónde va a caer; soltar fuera de un destino válido no
hace nada. Solo escritorio; en Mis Tareas y en mobile el gesto no existe.

- **Dos permisos distintos, ninguno nuevo**: reordenar dentro del sub frente
  es de **cualquier miembro** (la misma decisión del orden de frentes y sub
  frentes, migración 12); mover a otro sub frente exige **`editarTareas`**
  con sus tres alcances, evaluado contra el responsable previo. Sin él, el
  otro sub frente no es destino válido en la pantalla — y la base lo rechaza
  igual si la petición llega directa.
- **Migración 28**: la política `tarea_update` pasa a ser alcanzable para
  todo miembro (espejo de `frente_update`; el trigger valida campo a campo,
  así que solo libera el `orden`), y `validar_permisos_tarea` suma el caso de
  `sub_frente_id` — el trigger no lo mencionaba, así que cualquier invitado
  con cualquier permiso de edición podía cambiarlo por vía directa. También
  exige que el destino sea del **mismo proyecto**.
- **Mover no cambia nada más**: ni fecha, ni responsable, ni estado, ni la
  marca de hecha. **No escribe en el historial de replanificaciones** (el
  historial mide compromisos movidos, no ubicaciones) y **no genera
  notificación** (son deliberadamente pocas y de alta señal).
- **Con orden o filtro activo** el arrastre es una edición más sobre la vista
  congelada (#121): la tarea queda donde se la soltó —la foto manda—, el
  orden nuevo se guarda y se enciende "Actualizar vista"; al tocarlo mandan
  los criterios, y el orden manual se ve al limpiarlos.
- **Capa de datos**: `moverTarea` renumera el sub frente destino completo
  (0..n) — los `orden` reales traen huecos y empates, "correr en +1" no deja
  la posición exacta—; la tarea movida se escribe primero, para que un
  rechazo de la base no deje a los hermanos renumerados a medias. El cambio
  viaja en vivo por el canal de `tarea` que ya existía (migración 21).

**Verificado**: contra Postgres 16 con las migraciones 1→28 (7/7: miembro con
permisos vacíos reordena, sin `editarTareas` no mueve, "asignadas" mueve lo
suyo y no lo ajeno, sin cruce de proyecto, admin exento, sin
historial/notificaciones) y e2e con Playwright en modo memoria (29/29: los
criterios de aceptación del pedido, incluidos foto congelada, cliente sin
permiso, mobile sin asa y el "+" de agregar debajo intacto).

**La compuerta suma `probarMoverTarea`** con esos mismos casos contra la API
real, rol por rol.

## #294 — La tarea sin fecha que se marca hecha queda con fecha

Una tarea sin fecha objetivo marcada como hecha quedaba contada de dos
maneras: la Gantt la dibujaba (y la sumaba en la carga) en el día del marcado
—dibuja por "fecha vigente", que para una hecha cae en su fecha real—, la
Tabla la mostraba con la Fecha Objetivo vacía, y el filtro "Con fecha" la
hacía desaparecer de la Gantt donde se la estaba viendo puesta en un día
concreto. Ahora **al marcarla se le graba como fecha objetivo el día del
marcado**, con la fecha original igual (no gana atraso): las dos vistas
muestran lo mismo y la tarea entra en "Con fecha".

- **La parte de fondo: desmarcar distingue dos casos.** Si la fecha la puso
  el propio marcado, desmarcar la quita y la tarea vuelve a quedar **sin
  fecha**; si la tarea ya tenía fecha, la **conserva** — sin la distinción,
  desmarcar borraría fechas que el usuario planificó. La memoria vive en la
  columna nueva `tarea.fecha_por_marcado` (migración 29), **interna**: el
  trigger la fuerza en todo UPDATE y el cliente no puede fabricarla (si
  pudiera, marcar+desmarcar serviría para borrar fechas sin permiso).
- **La regla vive en la base** (`normalizar_fechas_tarea`), así que vale
  desde cualquier lugar donde se marque —Tabla, Mis Tareas, panel de
  detalle— y **con solo `marcarHechas`**: la exención de `editarFechas` es
  segura porque el valor lo fuerza el trigger de fechas, que corre antes que
  el de permisos. El quite del desmarcado viaja EN el mismo UPDATE, así que
  el bloqueo "No puedes eliminar tareas que ya pasaron" (que siempre excluyó
  a las hechas) no lo alcanza. En modo Local, `memoryRepo` replica las dos
  reglas.
- **Sin rastro**: ni el marcado ni el desmarcado escriben en el historial de
  replanificaciones (el trigger de historial exige que la fecha anterior
  exista) ni generan notificación. Una tarea que YA tenía fecha no cambia en
  nada: conserva su fecha planificada al marcar y al desmarcar (la fecha de
  cierre sigue siendo la última fecha planificada).
- **Corrección de datos**: a las tareas ya hechas y sin fecha se les graba su
  día de marcado (`fecha_real`) como fecha objetivo, con la original igual y
  la marca puesta (desmarcarlas también las devuelve a sin fecha). Corre con
  los triggers de la tabla desactivados —operación única del dueño: cero
  historial, cero notificaciones garantizados por construcción— y NO toca a
  las que no tienen día de marcado guardado (no se inventa una fecha). El
  `RAISE NOTICE` informa cuántas se corrigieron y cuántas quedaron.

**Verificado contra Postgres 16 local** con las migraciones 1→29 aplicadas
sobre datos sembrados "de producción" (12/12): la corrección corrige lo que
promete y solo eso (2 corregidas, 1 sin día informada, la hecha normal
intacta), con solo `marcarHechas` la fecha aparece y desaparece, sin
`editarFechas` sigue sin poder ponerse fechas a mano, la marca interna no se
fabrica por API, una con fecha pasada la conserva al marcar y desmarcar, y
cero historial/notificaciones. **Y e2e con Playwright en memoria** (24/24):
los criterios de aceptación del pedido — incluidos los tres lugares de
marcado, el filtro "Con fecha" en ambas vistas, Atraso "—", la vencida que
vuelve a verse atrasada, y los clics de la Gantt intactos.

**La compuerta suma `probarHechaSinFecha`** con esos mismos casos contra la
API real.

## #295 — La compuerta ya no puede aprobar sin haber comprobado nada

El 06-ago-2026 la compuerta falló dos pruebas del canal de tiempo real y,
minutos después y sin cambiar nada, salió toda en verde. Al leer el programa
apareció un defecto que no depende de que ese episodio se repita: **las cinco
pruebas del canal usan la misma escucha, y cuando el canal quedaba mudo, tres
salían en VERDE** — las que comprueban que a un tercero, a un no miembro y al
admin *no* les llegue lo ajeno. Informaban "cero INSERT/UPDATE" cuando en
realidad no había llegado nada de nada. Si en ese momento hubiera existido una
filtración real, la compuerta la habría dejado pasar.

- **Ninguna prueba de ausencia aprueba por silencio.** Una prueba de "a este
  NO le llega" solo vale si en la MISMA corrida llegó el **control de vida**:
  el evento que sí debía recibir quien correspondía. Sin él, esas tres se
  marcan **NO CONCLUYENTES** y la compuerta **no pasa**. Una FUGA sigue siendo
  concluyente siempre: si llegó algo ajeno, llegó — y eso se reporta en rojo,
  no como no concluyente.
- **Tres estados, no dos**: PASS, FAIL y `? INCONCL`, separados en el resumen.
  "No se pudo comprobar" no es "hay una fuga" y mandan a investigar cosas
  distintas; la salida lo dice con todas sus letras y explica qué hacer.
- **La publicación se comprueba, no se supone.** El mensaje conjetural
  "¿migración 21 aplicada?" se reemplaza por el hecho: si el evento de control
  llegó, la tabla está publicada, y así lo informa. Lo mismo con "el canal
  conecta", que ahora dice qué escuchas no alcanzaron `SUBSCRIBED` en vez de
  sugerir una causa.
- **Se puede comprobar a voluntad**: `RLS_DEMO_SILENCIO=1` deja fuera al
  suscriptor legítimo y fuerza el caso. Es seguro por construcción — solo
  puede QUITAR escuchas, nunca ablandar una aserción—, así que con él
  encendido el resultado siempre es peor, nunca mejor.

**Sobre la causa del silencio: no se pudo reproducir, y no se inventó un
arreglo.** Lo que sí quedó descartado, por lectura y por los hechos de las
corridas: no es falta de tiempo (hay 10 s de espera activa y la aplicación
recibe en menos de 1 s), no es que la suscripción falle (las cinco llegaron a
`SUBSCRIBED` incluso en la corrida mala), no es la publicación ni las
migraciones 20/21 (las mismas tablas entregan bien a la aplicación y minutos
después la compuerta salió verde sin tocar nada), y no viene de #293 (sus ocho
pruebas pasaron siempre). Comparada con la aplicación
(`src/data/tiempoReal.ts`), la compuerta se diferencia en tres cosas: llama a
`realtime.setAuth()` a mano, abre un cliente nuevo por sesión con dos canales
cada uno, y **inserta milisegundos después de suscribirse** —la aplicación se
suscribe al arrancar, mucho antes de cualquier cambio—. Eso deja como
hipótesis no confirmada una carrera entre `SUBSCRIBED` y que el servidor
tenga lista la entrega de esa tabla; **no se tocó nada por esa sospecha**,
porque con el arreglo de arriba una causa sin identificar deja de ser
peligrosa: la próxima vez que ocurra, la compuerta lo dirá en vez de aprobar.

**Verificado** con `docs/demo-295-canal-mudo.mjs`, que ejercita el código real
de la compuerta con clientes de mentira que deciden qué entrega el canal:
canal normal → 5 en verde y sale 0; canal mudo → 2 fallas + 3 no concluyentes
y sale 1; canal con fuga → las tres de aislamiento en rojo (no como no
concluyentes) y sale 1. El mismo veredicto se obtiene con el interruptor
`RLS_DEMO_SILENCIO=1`. **No se tocó el producto**: ni migraciones ni `src/`.

## #290 — Cerrar el permiso de ejecución que quedó abierto a todos

Las migraciones 15 y 22 quisieron cerrar las funciones internas, pero
revocaron el permiso **`from anon, authenticated`** y nunca **`from public`**.
En PostgreSQL las funciones **nacen con `EXECUTE` concedido a `PUBLIC`**, y
quitarle el permiso a dos roles no toca lo que tienen por pertenecer a
`PUBLIC`. Resultado: durante un mes, **36 funciones del proyecto quedaron
ejecutables por cualquiera**, sin que nadie lo notara. Lo detectó la auditoría
#296 mirando el ACL real (`=X/postgres` al inicio de la lista de permisos).

- **El criterio fue deliberadamente conservador**: quitar el permiso universal
  y **dejar todo lo demás exactamente igual**. Por función, el resultado es su
  lista de permisos de antes *menos* la entrada universal — sin altas ni bajas
  adicionales. Verificado una por una: **41/41**.
- **Las dos que importaban** quedan cerradas a todo el mundo salvo los roles
  internos: `crear_notificacion` (es `security definer` y su cuerpo no
  comprueba quién la llama, así que permitía fabricarle notificaciones a otro
  con el autor que se quisiera) y `usuario_tiene_acceso` (permitía sondear
  quién trabaja en qué). Ambas tenían el permiso **solo** por `PUBLIC`.
- **No rompe nada, y se comprobó en vez de suponerlo.** Las funciones de
  trigger las ejecuta el motor; las que se llaman desde otra `security
  definer` corren con los privilegios del definidor; y los ayudantes que usan
  las políticas de RLS conservan su permiso explícito para el usuario con
  sesión — que viene de los ajustes por defecto de Supabase, no de ninguna
  migración, y es justamente lo que evita romper la RLS.
- **Las funciones de extensiones (pgcrypto) no se tocan**: no son del proyecto.
- **La migración se comprueba a sí misma**: si algo quedara abierto, falla en
  vez de dejar el trabajo a medias.

**Un hallazgo que conviene no perder.** Lo natural para blindar el futuro sería
`alter default privileges in schema public revoke execute on functions from
public`. **Esa línea no hace nada**: medido en PostgreSQL 16, el ACL guardado
para un esquema se *fusiona* con el valor por defecto del motor en vez de
reemplazarlo, así que la función nueva igual nace abierta. Es el mismo error
que estamos corrigiendo —un revoke que parece correcto y no surte efecto—, así
que se dejó fuera en lugar de escribir un blindaje de mentira. La única
variante que funciona es la global, que alcanza a más de lo que el pedido
autoriza, y queda como decisión aparte.

**Lo que sí impide la reincidencia** es el caso nuevo de la compuerta
(`probarExecutePublico`): lee la vista `permiso_ejecucion_abierto` —que lista
solo las infracciones, cero filas en una base sana— y **se pone en rojo por la
sola presencia** del permiso universal, sin depender de que nadie intente
explotarlo. Si la vista no existe, la corrida se declara **no concluyente**
(#295), no aprobada.

**Verificado contra Postgres 16 con las migraciones 1→30** (9/9), sobre un rig
corregido para reproducir los permisos por defecto de Supabase — sin esa
corrección la prueba habría dado un falso "todo bien". Se comprobó que siguen
funcionando: crear proyecto/frente/sub frente/tarea, **las notificaciones por
trigger al asignar y al comentar** (el criterio crítico: la función cerrada es
justo la que las crea), el historial de replanificaciones, el marcado de #294,
la lectura por RLS y las RPC de la aplicación; y que `crear_notificacion` y
`usuario_tiene_acceso` ya **no** se pueden invocar. La demostración de que el
caso de la compuerta **es capaz de fallar** está en el PR.

## #297 — Al crear un proyecto ya no se arrastra el frente que estabas mirando

Estando dentro de un proyecto con **un frente concreto** elegido en la barra
lateral, crear un proyecto nuevo entraba a él **sin reiniciar esa selección**.
Se entraba filtrando por un frente que pertenece a OTRO proyecto: la vista
principal no encontraba nada y mostraba "Este proyecto aún no tiene frentes."
incluso después de crear el primero. La barra lateral, que no filtra por
frente, sí lo mostraba — de ahí lo desconcertante del síntoma.

- **Una línea**: `createProyecto` suma `setFrenteSel('todos')`, igual que los
  otros tres caminos de entrada a un proyecto.
- **Revisión de todas las entradas**, como pedía la solicitud: solo tres
  lugares llevan a la pantalla de proyecto —elegir un proyecto, iniciar sesión
  y saltar a una tarea desde una notificación—, y los tres ya reiniciaban la
  selección. `createProyecto` era el único que quedaba fuera. No hay más.
- **No se tocó nada más**: ni el filtro por frente, ni la pantalla de vacío, ni
  la creación de frentes, ni la barra lateral. Sin migración.

**Verificado** en modo Local: elegir un frente concreto sigue funcionando, los
tres caminos de entrada siguen entrando con "todos", y el filtro sigue sin
arrastrarse entre proyectos (#221).

## #297 (reapertura) — Reproducido, medido, y un segundo defecto de orden

El síntoma seguía reportándose con el PR #70 en producción. Esta vez se
**reprodujo antes de concluir**, con la aplicación corriendo e instrumentada.

- **Qué valía el frente seleccionado:** el id del frente del proyecto
  **anterior** (`f-lev`, "Levantamiento"). Lo puso el clic del paso 1
  (`onSelectFrente`) y nadie lo tocó después. La vista principal filtra por ese
  valor, así que daba cero frentes siempre; la barra lateral no filtra por
  frente y por eso sí lo mostraba.
- **Por qué el arreglo anterior no bastó:** sí bastaba. El experimento pareado
  —mismo camino, misma latencia simulada, cambiando solo esa línea— reproduce
  el síntoma exacto sin ella y no lo reproduce con ella. Lo que no llegó al
  navegador fue el archivo nuevo: una pestaña abierta desde antes del
  despliegue sigue ejecutando el código anterior hasta que se recarga.
- **La observación de la barra lateral queda explicada:** en el estado del
  síntoma hay **cero** frentes marcados como activos. La marca depende de que
  la selección coincida con el frente, y la selección era de otro proyecto.
- **Segundo defecto, corregido:** `createProyecto` navegaba al proyecto nuevo
  **antes** de meterlo en el estado. En ese render intermedio el efecto de
  corrección de proyecto activo (#260) no lo encontraba entre los visibles y
  devolvía a Resumen. Solo se veía cuando la respuesta llegaba muy rápido —modo
  Local siempre—; con latencia de red los dos cambios caen en el mismo lote y
  no existe el render intermedio. Una línea: el proyecto entra al estado en el
  mismo lote que la navegación.
- **Los dos caminos de creación auditados:** el **+** de la barra lateral y
  Administración → Proyectos. Los dos pasan por `createProyecto`. No hay
  entrada alternativa que se saltee el reinicio.
- **Sin migración** y sin tocar el filtro por frente, la creación de frentes ni
  la barra lateral.

**Verificado** con `docs/prueba-297-frente-al-crear.mjs`: 17 comprobaciones en
verde, el camino completo de punta a punta **en Tabla y en Gantt**, más los
otros caminos de entrada, elegir un frente concreto y el filtro que no se
arrastra (#221). La prueba sabe fallar: quitando cualquiera de las dos
correcciones se pone en rojo.

Diagnóstico completo, propuesta incluida:
[`docs/diagnostico-297-frente-al-crear.md`](docs/diagnostico-297-frente-al-crear.md).
**Queda una decisión abierta** (propuesta, sin implementar): que la vista
principal ignore una selección de frente que no pertenece al proyecto que está
mostrando, para que el mensaje "aún no tiene frentes" no pueda volver a decir
algo falso por una vía nueva.

## #298 — La columna de acciones de la tabla del proyecto ya tiene título

En la vista Tabla de un proyecto, la columna de la derecha con los iconos de
acción no tenía encabezado; las tablas de administración de usuarios y de
proyectos sí la titulan **"Acciones"**. Ahora las tres dicen lo mismo.

- **Una palabra**: el `<th className="col-acc">` de `TableView.tsx` deja de ir
  vacío. Misma palabra y misma clase que las otras dos tablas, así que hereda
  su tipografía (monoespaciada, mayúsculas, peso) sin CSS nuevo.
- **Centrado, como las demás columnas de esa tabla.** El `.col-acc` ya pedía
  `text-align: center` desde siempre, pero nunca llegó a aplicarse: perdía por
  especificidad contra la regla genérica `table.tareas th, td`, el mismo
  tropiezo que el archivo ya documentaba para la columna "Hecha". Con el
  encabezado vacío no se notaba; con texto, sí. Se centra **solo el
  encabezado**: los iconos de la celda no se movieron ni un píxel.
- **Las tablas de administración quedaron intactas.** Llevan las DOS clases
  (`tareas usuarios-tabla`), así que una regla sin acotar las habría alcanzado.
  Ahí todas las cabeceras van a la izquierda y "Acciones" ya estaba alineada
  con sus vecinas, así que la regla lleva `:not(.usuarios-tabla)`.
- **La columna sigue apareciendo solo con permiso sobre las tareas.** Quien
  solo mira no ve la columna ni su título, igual que antes.
- **Ningún ancho cambió.** Medido en 1440×900 antes y después: las siete
  cabeceras conservan su ancho al décimo de píxel.
- **En mobile la columna sigue sin encabezado.** Ahí mide 26px y lleva solo el
  ⓘ: "Acciones" necesita 40px y se cortaba contra el borde de la tabla.
  Decisión del dueño, consultada: el título es de escritorio. Dos líneas de
  CSS dentro del bloque de mobile que ya existía; no se tocó el ancho, ni el
  icono, ni ninguna otra cabecera.
- **Sin migración.** El diff toca solo el cliente.

**Verificado** con `docs/prueba-298-columna-acciones.mjs`: 17 comprobaciones en
verde — el título en escritorio, el centrado medido contra el de sus columnas
vecinas, los iconos que no se movieron, las cabeceras de administración sin
tocar, la tipografía compartida con las dos tablas de administración, el
cliente sin permisos que sigue sin ver la columna, los anchos intactos y el
mobile sin encabezado ni desborde.

## #299 — Los enlaces de los comentarios se ven como enlaces

En el hilo de comentarios de una tarea, una dirección web se veía como texto
plano: había que seleccionarla y copiarla a mano. Ahora se pinta como enlace y
se abre en una pestaña nueva, para no sacar a nadie de la herramienta a mitad
de una tarea.

- **Un tercer tipo de trozo**, en el recorrido que ya existía. `partirComentario`
  (`lib/menciones.ts`) troceaba el texto en `texto` y `mencion`; ahora también
  en `enlace`, y `TaskPanel` lo pinta según el tipo. Las menciones no cambian y
  conviven con un enlace en el mismo comentario.
- **Qué se reconoce:** lo que empieza por `http://` o `https://`, y `www.`
  seguido de algo con otro punto (`www.andotek.cl`), al que se le antepone
  `https://` al abrirlo. Una palabra suelta con punto —`andotek.cl`, o el punto
  final de una frase— **no** se vuelve enlace.
- **Retroactivo por construcción:** el reconocimiento ocurre al pintar, no al
  guardar. Los comentarios ya escritos se ven con sus enlaces sin tocar un
  solo dato.
- **Seguridad (invariante 21 de `SEGURIDAD.md`).** El texto lo escriben también
  los clientes invitados: es contenido de terceros. Solo `http` y `https`
  llegan a ser enlace, y el protocolo se comprueba sobre la URL ya interpretada
  con `URL`, no sobre el texto crudo — `javascript:`, `data:` y `ftp:` se
  quedan como texto. Los trozos son DATOS, no marcado: se pintan como hijos de
  un nodo, nunca como HTML construido con lo que escribió alguien. Y se abren
  con `rel="noopener noreferrer"`, sin dar al destino referencia a la ventana
  de origen.
- **Bordes cuidados:** el punto final de la frase queda fuera del enlace, un
  paréntesis que sí es parte de la dirección se conserva, y `https://` pegado a
  otra palabra (`xhttps://…`) no dispara nada.
- **No se tocó** el cuadro de escribir comentarios, ni la edición, ni el
  historial, ni los permisos, ni nada fuera del hilo. **Sin migración**: el
  diff toca solo el cliente.

**Verificado** con `docs/prueba-299-enlaces-comentarios.mjs`: 24 comprobaciones
en verde, los once criterios del pedido. Incluye el clic real que abre la
pestaña en el destino correcto, el comentario preexistente que ahora se ve como
enlace sin haberlo tocado, el enlace largo que no rompe el ancho del panel, y
el caso de seguridad probado **también como cliente invitado**.

## #300 y #301 — Cambiar el perfil de un usuario, y qué significan archivar y eliminar

El dueño creó un usuario con el perfil equivocado y descubrió que no había
forma de corregirlo. El rodeo —eliminarlo y volver a crearlo— destapó lo de
fondo: **archivar y eliminar significaban casi lo mismo**. Volvía con el perfil
anterior y sin correo de invitación, porque conservaba su cuenta de acceso.

**La regla que queda: archivar PAUSA y se deshace; eliminar CORTA, y lo que
vuelve es alguien nuevo con el mismo correo.**

### #300 — Cambiar el perfil entre consultor y cliente

- **Un selector en la columna Perfil** de administración de usuarios. Solo un
  admin, nunca el propio, nunca sobre un administrador, y solo entre consultor
  y cliente. El perfil de administrador queda fuera en los dos sentidos.
- **La barrera está en la base, no en la pantalla:** la RPC
  `cambiar_rol_usuario` repite las cinco salvaguardas, y el trigger
  `trg_validar_cambio_rol` **rechaza cualquier UPDATE directo de `rol`** que
  llegue del cliente. Una petición que intente saltarse la pantalla no pasa.
- **A consultor:** conserva sus accesos a proyectos con los mismos permisos —el
  acceso no depende del perfil— y recibe los permisos por defecto de consultor.
  No se le suben los permisos de los proyectos ajenos donde es invitado.
- **A cliente:** pierde los poderes de consultor. **Si es dueño de algún
  proyecto se bloquea**, y el mensaje dice cuántos. El traspaso de proyectos no
  existe todavía (#302).
- **Las políticas de `acceso_proyecto` NO se tocaron.** Su `es_cliente(
  usuario_id)` vive en la rama del dueño-consultor, no en la del admin: un
  administrador ya podía retirar el acceso de un consultor, que es lo que pide
  el criterio 3. Y ese `es_cliente` es la regla que impide que un consultor
  meta consultores en sus proyectos (migración 12, deliberado). *Consecuencia
  asumida: el dueño de un proyecto no puede retirarle el acceso a un invitado
  que pasó a consultor; lo hace un administrador.*

### #301 — Archivar y eliminar dejan de significar lo mismo

| | Archivado | Eliminado |
|---|---|---|
| ¿Puede iniciar sesión? | No | No |
| ¿Su cuenta de acceso existe? | Sí, suspendida | **No, se revoca** |
| ¿Conserva accesos a proyectos? | Sí | **No, se sueltan** |
| ¿Conserva su perfil? | Sí | **No** |
| ¿Conserva sus tareas asignadas? | Sí, iniciales apagadas | Sí, iniciales apagadas |
| ¿Se puede revertir? | Sí, con su misma contraseña | No |

- **Eliminar revoca la cuenta de acceso.** Eso toca el sistema de
  autenticación, no la tabla de usuarios, así que vive donde corresponde: la
  **Edge Function nueva `eliminar-usuario`**, con el Admin API y `service_role`.
  Llama primero a la RPC con el JWT de quien pide —la autorización sigue siendo
  `es_admin()` dentro de la base— y después revoca. Si la revocación fallara, la
  persona ya no puede entrar igual (el login exige perfil activo) y se
  reintenta: el modo de fallo es seguro.
- **Eliminar suelta los accesos y vacía los permisos de consultor**, y suelta el
  vínculo `auth_id`. Eso último es lo que hace que un alta posterior del mismo
  correo **sí reciba invitación**: `invitar-usuario` rechaza a quien ya tiene
  cuenta, y ese era el síntoma reportado.
- **Dar de alta un correo eliminado es un alta nueva:** toma el perfil que se
  elige, sin proyectos ni permisos heredados. Reactivar un archivado, en
  cambio, lo conserva todo.
- **El bloqueo de inicio de sesión de un archivado YA existía** y no hizo falta
  tocarlo: `auth/supabaseAuth.ts` exige un perfil activo después de autenticar
  y cierra la sesión con el mensaje de #244. Un ELIMINADO, con su cuenta ya
  revocada, verá "Correo o contraseña incorrectos" — el texto de #252, elegido
  para no revelar qué correos existen.
- **No se tocó** el historial, los comentarios, ni la regla #229 de las
  iniciales apagadas. La fila del usuario se conserva justamente para
  sostenerlos. *Consecuencia aceptada: un correo eliminado que vuelve reutiliza
  esa fila, así que recupera sus tareas si se le devuelve el acceso.*

**Migración 31**, aditiva. **Requiere desplegar la Edge Function
`eliminar-usuario` ANTES de mergear el front**, porque la eliminación pasa a
llamarla.

**Verificado** con `docs/prueba-300-301-perfiles-y-ciclo-vida.mjs`: 43
comprobaciones en verde en modo Local, y las suites de #297, #298 y #299
siguen en verde. Lo que solo vive en la base —que un
consultor no pueda llamar la RPC, que un UPDATE directo de `rol` sea rechazado,
que no se pueda llegar ni salir de administrador, y que eliminar suelte los
accesos— entra a la compuerta `scripts/validar-rls.mjs` con dos casos nuevos.


## #303 — El perfil se cambia desde editar usuario (y el cierre de #300/#301)

Dos cosas de distinto tipo, en la misma entrega.

### El perfil se busca donde se busca

El desplegable vivía en la **columna Rol** de la lista. Funcionaba, pero nadie
lo encontraba: el dueño lo buscó en el formulario de editar usuario y concluyó
que la función no existía. Ahora está ahí, junto al nombre y las iniciales, y
**la columna vuelve a mostrar el chip fijo de siempre** — un solo lugar.

- **Todo se aplica al Guardar**, nada al tocarlo. **Cancelar descarta todo**,
  incluido el cambio de perfil.
- **El botón ordena los cambios**, porque no viajan por el mismo camino: el
  perfil tiene que pasar por `cambiar_rol_usuario` —donde viven las cinco
  salvaguardas— y el nombre es una modificación normal de la ficha. Va primero
  el perfil: **si la base lo rechaza, no se aplica ningún otro cambio**, se
  muestra el motivo y el formulario queda abierto con lo escrito. Nada a
  medias.
- Para eso, `run` pasó a informar **si el cambio se aplicó**. Quien solo
  dispara una acción puede ignorarlo; quien orquesta varias, no.
- **El campo aparece solo cuando el cambio es posible** (admin, sobre alguien
  que no es él mismo y que no es administrador). En el resto de los casos el
  perfil se muestra como **dato**, con la razón debajo.
- **No se tocó** ninguna de las cinco salvaguardas ni el trigger que rechaza
  cambiar el perfil por fuera de la función. **Sin migración.**

### El cierre de #300 y #301: la compuerta no pasaba

La corrida del 10-ago-2026 dio 118 en verde y **2 no concluyentes**, así que no
valía. Las dos eran las pruebas nuevas de este mismo trabajo:

- **La causa:** creaban su usuario de prueba con un `insert` directo sobre
  `usuario`, y `authenticated` no tiene ese privilegio de tabla. Ahora lo crean
  **por el camino que usa el producto** —la RPC `crear_o_reactivar_usuario`,
  como hace #286— y lo limpian con `eliminar_usuario`, coherente con que en
  este modelo no hay borrado físico de usuarios. El proyecto de prueba lleva el
  prefijo `__prueba_rls_` para que lo barra la limpieza del final.
- **De paso, una prueba que aprobaba por el motivo equivocado:** la de "no se
  puede degradar a un administrador" podía elegir como sujeto a quien corre la
  compuerta, y entonces el rechazo venía de la regla del perfil PROPIO. Ahora
  se busca otro administrador y, si no lo hay, se dice que no se pudo
  comprobar.
- **El mensaje final ya no atribuye una causa que no consta.** Decía que el
  canal de tiempo real no estaba entregando eventos, en una corrida donde el
  canal funcionó perfecto. Ahora describe qué no se pudo comprobar —cada línea
  lo dice— y **solo menciona el canal si alguna de las no concluyentes es del
  canal**.
- **Ninguna aserción se relajó.**

**Verificado** en modo Local: 43 comprobaciones en verde, incluidos los siete
criterios nuevos del formulario. **La compuerta no la pude correr yo** (necesita
credenciales de producción): queda para la corrida del dueño, tres veces
seguidas, como pide el criterio de cierre.

## #304 — Los correos de la plataforma ahora dicen dónde entrar

Los dos correos que envía el producto —la invitación y el de restablecer
contraseña— entregaban su enlace de un solo uso y nada más. Como esos enlaces
caducan y sirven una vez, **quien lo usó se quedaba sin ninguna referencia
escrita de dónde volver a entrar**, ni con qué correo.

- **Una frase al final de cada uno**, con la dirección de la herramienta como
  enlace y **a la vista, con `https://` incluido** — para que sirva también
  leída en papel o copiada a mano.
  - *Invitación:* después del aviso de caducidad.
  - *Restablecer:* justo antes del aviso de seguridad, que **sigue siendo el
    último párrafo**.
- **La dirección no se escribe fija:** sale del mismo `SITE_URL` con el que ya
  se arma el enlace de cada correo. Si el dominio cambia, los dos correos lo
  siguen solos. Escribirla a mano habría dejado el texto apuntando a una
  dirección muerta el día que cambie.
- **Tres retoques de redacción**, los que pidió el dueño: "define tu contraseña"
  → **"crea tu contraseña"**; "Elige una nueva" → **"Crea una nueva"**; "Si no
  fuiste tú" → **"Si no solicitaste el cambio"**.
- **No se tocó** el asunto, el remitente, los plazos de caducidad ni el resto de
  los párrafos. Tampoco se sumó quién invitó ni una descripción de la
  herramienta: se evaluó y quedó fuera para no alargar el correo.
- **Sin migración** y sin tocar la base: es texto.

*Por qué importa más en el de restablecer:* ese correo llega SIEMPRE a alguien
que quedó fuera — cambiar la contraseña con la sesión abierta, desde
Configuración, no manda ningún correo.

**Verificado** con `docs/prueba-304-correos.mjs`: 17 comprobaciones en verde.
La prueba no tiene copia del texto — **extrae la plantilla del propio
`index.ts` de cada función y la arma con valores de mentira**, así que si
alguien edita un correo, lo ve. Comprueba además que el dominio real no aparezca
escrito en el código y que, cambiando la configuración, el texto la siga.

**Despliegue:** las dos funciones viven solo en producción y no tienen versión
de prueba, así que **apenas se despliegan el texto nuevo sale para todos**.
Conviene avisar antes. Los criterios 1 a 5 del pedido —que el correo llegue y
que el enlace funcione de punta a punta— se comprueban con correos reales
después de desplegar; eso no se puede simular desde el repo.

## #311 — Un frente plegado ya no queda inalcanzable al entrar a ese frente

Plegar un frente en "todos los frentes" y después entrar a ese mismo frente
desde la barra lateral dejaba **la pantalla vacía y sin salida**: el título y
nada más, sin tareas, sin sub frentes y **sin flecha para desplegarlo**.

Eran dos comportamientos correctos por separado: el recuerdo de lo plegado es
**uno solo** y sobrevive al cambio de vista, y la flecha del frente **solo se
dibuja en la vista de todos** —plegar lo único que se está mirando no tiene
sentido—. Juntos, el frente seguía marcado como plegado y el control para
abrirlo ya no existía.

- **La regla que lo cierra: si el frente no se puede plegar, tampoco puede
  estar plegado.** El estado de plegado solo SE APLICA donde hay flecha para
  deshacerlo.
- **El recuerdo no se toca:** sigue siendo uno solo, momentáneo y no
  persistente. Al volver a "todos los frentes" el frente sigue plegado como
  estaba — entrar y salir de su vista no cambia cómo se ve en la vista
  completa.
- **Los sub frentes no cambian:** su flecha se dibuja en las dos vistas, así
  que nunca tuvieron el problema y siguen igual.
- Que el frente no tenga flecha en su propia vista **se mantiene**: es
  correcto.
- **Sin migración**, es pantalla.

**Verificado** con `docs/prueba-311-frente-plegado.mjs`: 14 comprobaciones en
verde, los cinco criterios — incluido llegar a una tarea desde una
**notificación real** con su frente plegado. La prueba sabe fallar: con el
código anterior, C1 reproduce el síntoma exacto (cero sub frentes, cero tareas,
sin flecha).
## #310 — Los menús de filtro ya no se salen de la pantalla en mobile

En un teléfono, los menús de la barra de filtros se salían por el borde derecho
y sus opciones quedaban fuera de alcance. **La protección ya estaba escrita en
el producto y solo se había aplicado a un lado:** los menús anclados por la
derecha —"Vistas"— calculaban su distancia al borde con un tope de 8; los
anclados por la izquierda —Fecha, Responsable, Estado, Proyecto y Ordenar—
copiaban el borde del botón sin comprobar nada.

- **A lo ancho, los dos anclajes.** Ninguno miraba el borde OPUESTO: los
  anclados por la izquierda se salían por la derecha, y el anclado por la
  derecha —"Vistas"— se salía por la izquierda en cuanto la pantalla se
  angostaba (medido: **-163.7 a 320px**). Ahora los dos respetan los dos
  bordes con el mismo margen de 8. Si no cabe donde le tocaría **se corre**;
  si aun así no cabe, **se angosta**. Con espacio de sobra el cálculo devuelve
  el borde del botón, así que **en escritorio quedan exactamente donde
  quedaban**.
- **El ancho del menú dependía de dónde se lo colocaba**, y para colocarlo bien
  hay que saber su ancho: medirlo después de colocarlo se muerde la cola. Se
  corta midiendo en un sitio que no le recorta el ancho —contra el borde
  izquierdo— y llevándolo después a su lugar. Las dos pasadas ocurren antes de
  pintar, así que no se ve ningún salto.
- **A lo alto:** el tope se mide **desde donde queda el menú hasta el borde
  inferior**, no como una fracción de la pantalla completa. El tope anterior
  —80% de la pantalla— no descontaba lo que el botón ya había bajado, así que
  con la barra de filtros en la mitad inferior el menú se pasaba por abajo. Sale
  del CSS y pasa a calcularse contra el espacio real.
- **Se mide el ancho real del menú**, no el mínimo: la primera colocación asume
  el mínimo del CSS y una segunda pasada —una sola, con bandera— recoloca ya con
  la medida buena.
- **No se tocó** el ancho mínimo de 244, ni el contenido de los menús, ni su
  comportamiento en escritorio.
- **Sin migración**, es pantalla.

**Verificado** con `docs/prueba-310-menus-filtro.mjs`: 68 comprobaciones en
verde. Mide la **caja real** de cada menú abierto contra la ventana, barriendo
**cinco anchos de teléfono** (320, 360, 390, 412 y 430), más 390×420 (barra en
la mitad inferior) y 1440×900, en la pantalla de proyecto y en Mis Tareas,
además del desplazamiento con un menú abierto. Comprueba la REGLA del alto y no
solo el caso favorable: el tope vale `ventana − menú − 8` (261) donde el cálculo
viejo habría dado 336.

*Nota de método:* la primera versión de esta prueba **dejó pasar el defecto del
borde izquierdo**. Medía un solo ancho —390, donde "Vistas" caía justo en
`izq=0`— y se conformaba con "que no se salga" en vez de exigir el margen. De
ahí las dos correcciones: el barrido de anchos, y exigir los 8 píxeles en los
cuatro bordes. Con esos dos cambios, la prueba falla con el código anterior en
los dos casos.

### #305 — Tres franjas sobre la grilla y una barra de cuatro controles

*Primera mitad de #305. La segunda —columnas de la Gantt, alto de la grilla y
scrolls— queda abierta.*

Sobre la grilla de la Gantt había **cinco franjas apiladas** y la grilla
empezaba a media pantalla. Dos problemas de fondo: **los contadores y la leyenda
decían lo mismo** —mismas cinco categorías, mismo orden, mismos colores, a dos
filas de distancia; lo único que la leyenda agregaba era la marca de "fecha
anterior"—, y **la fila de controles crecía y se partía**: diez elementos fijos,
tres que aparecían solos (limpiar filtros, limpiar orden, actualizar vista) y el
aviso de fin de semana como franja entera que aparecía o no según el proyecto,
moviendo todo lo de abajo.

**Ahora son tres franjas, siempre las mismas, en tabla y en Gantt.** La altura
sobre la grilla no cambia nunca: ni al filtrar, ni al ordenar, ni según el
proyecto.

- **Franja 1, título:** sin cambios salvo que **el chip de fecha pierde la
  etiqueta "Hoy:"** y muestra solo la fecha. En modo simulado se mantiene el
  aviso de que la fecha está trucada, que es donde esa palabra sí trabaja.
- **Franja 2, los contadores absorben la leyenda.** Los cinco de siempre con sus
  nombres completos; **en Gantt** se les suma una **sexta caja, "Fecha
  anterior", sin número** —no es un estado sino el rastro de dónde estaba la
  tarea— y **las muestras pasan a ser las marcas reales de la grilla**: el check
  verde, la equis, los cuadrados de ámbar, rojo y morado, y la de fecha anterior
  más chica que las otras. En tabla siguen siendo muestras de color. **La
  leyenda desaparece como fila propia.**
- **Franja 3, la barra de controles:** `Filtrar · Ordenar · Rango` a la
  izquierda, `Vistas` a la derecha. **Rango solo existe en Gantt**, así que en
  tabla la barra tiene tres controles.

**Filtrar** reemplaza a los tres botones sueltos —Fecha, Responsable y Estado en
un proyecto; Fecha, Proyecto y Estado en Mis Tareas—, que pasan a estar dentro,
a dos niveles. El botón muestra **el total de valores elegidos y una ×** que los
limpia todos. Dentro, lo aplicado se ve como **fichas: una por campo, no por
valor** —"Estado: 4" es una sola ficha, y su × borra los cuatro—; para sacar un
valor suelto se entra al campo y se destilda. Se conservan "Seleccionar todos" y
"Deseleccionar todos"; **se eliminan los "Limpiar filtro"** de dentro de cada
campo, porque ese trabajo lo hace la × de la ficha, que está a la vista al abrir
el panel. El menú de Fecha —el más profundo— conserva **todas** sus opciones y
sus exclusiones entre sí, incluido que "En horizonte visible" solo se activa
desde la Gantt, aparece apagado desde la tabla con su aviso, y no existe en Mis
Tareas.

**Ordenar** suma contador y **×** —que reemplaza al "Limpiar orden" suelto— y
conserva su menú íntegro: prioridades, flechas, y agregar un criterio sin borrar
los anteriores.

**Rango** es el antiguo horizonte. **No lleva contador ni ×:** sus opciones
siempre tienen valor, no hay nada que contar ni que quitar. Dos grupos con
título, **Días** y **Horizonte**. El tercer estado del grupo Horizonte **no se
elige, se impone**: con un filtro de fecha puesto, las dos opciones quedan
apagadas y aparece "Definido por el filtro de fecha"; "En horizonte visible" es
la excepción que lo deja elegible, porque **deriva** su rango del horizonte en
vez de definirlo. **El aviso de fin de semana deja de ser una franja:** cuando
hay tareas escondidas, Rango muestra **un círculo** junto al nombre, y el
detalle con el número vive al final del grupo Días.

> **El círculo significa una sola cosa: hay tareas ocultas.** No debe
> reutilizarse para ningún otro aviso, ni en Rango ni en otro control. Si se usa
> para dos cosas deja de decir "hay tareas escondidas" y pasa a decir "mira
> acá", que es mucho menos.

**Vistas** conserva todo lo que decía —"Vistas", "Vistas (3)", "Vistas ·
Atrasadas" y el asterisco de modificada— y suma una **×** que aparece solo con
vista activa: sale de ella y deja todo limpio, sin confirmación. **"Guardar
vista" se muda a dentro del menú** y deja de ser un botón permanente en la
barra; se conserva apagado, con su aviso, cuando no hay filtro ni orden que
guardar. Actualizar, renombrar y eliminar siguen donde estaban, con su
confirmación al borrar.

**"Actualizar vista"** se mantiene como botón visible y se **pega al extremo
derecho**. Es el único elemento que aparece y desaparece, y es deliberado: avisa
de algo que acaba de pasar. Convive con el asterisco de Vistas porque dicen
cosas distintas —el asterisco, que te alejaste de lo guardado; el botón, que la
foto quedó vieja por una edición— y puede aparecer sin ninguna vista guardada
activa.

Notas de implementación:

- **La barra no se envuelve.** `flex-wrap: nowrap` es la regla, no un adorno:
  antes la barra crecía hacia abajo y la altura sobre la grilla cambiaba. En
  pantalla angosta los nombres se acortan con puntos suspensivos, pero la barra
  sigue en una sola línea.
- **Alto de línea fijo en la pastilla.** El contador y el círculo aparecen y
  desaparecen; sin fijarlo, el más alto de los tres mandaba y la pastilla —y con
  ella la barra— crecía dos píxeles al filtrar. La × copia el alto de su
  pastilla (`align-self: stretch`, sin padding vertical) en vez de imponerlo.
- **Los menús se vuelven a medir al cambiar de nivel.** Ahora cambian de
  contenido sin cerrarse (Filtrar entra y sale de un campo, Rango cambia de
  aviso); un contenido nuevo tiene otro ancho, así que se repite la medición en
  dos pasadas de #310. Sin eso el segundo nivel se recolocaría con el ancho
  viejo y podría salirse de la pantalla.
- **El estado del horizonte subió de la grilla a la pantalla:** lo elige la
  barra y lo usa la Gantt. La cuenta de tareas escondidas va al revés — la
  calcula la grilla, que es la única que sabe qué filas quedaron.
- Se elimina el componente `Legend`, que ya no tiene dónde vivir.
- **Sin migración:** es pantalla.

**Verificado** con `docs/prueba-305-franjas-y-controles.mjs`: 103 comprobaciones
en verde, una por cada uno de los 17 criterios de aceptación. Mide las franjas
reales sobre la grilla, el tamaño de las marcas de los contadores, la altura de
la barra antes y después de filtrar, el recorrido completo de los cuatro menús,
y barre cinco anchos (320, 360, 390, 768 y 1024) comprobando que la barra queda
en **una sola línea** y que ningún control se sale. El círculo se comprueba
creando el terreno: se planifica una tarea en sábado con la semana completa a la
vista y se vuelve a días hábiles.

`docs/prueba-310-menus-filtro.mjs` se actualizó a la barra nueva y suma la
medición del **segundo nivel** de Filtrar: 65 comprobaciones en verde.

### #305b — Ajustes al encabezado y la barra de controles

Correcciones sobre #305, antes de fusionar. Todo de pantalla: **no toca la base
y no lleva migración**.

**Los menús no se veían parejos entre sí.** Al abrir uno tras otro, la caja
cambiaba de tamaño y las filas no calzaban. Tres causas:

- **Ordenar estaba desalineado respecto de todos los demás.** Sus filas usaban
  un relleno de 5 por 8 contra 8 por 10 del resto, y cada fila llevaba delante
  el círculo de prioridad de 18 de ancho, **que ocupaba su lugar aunque
  estuviera vacío**: ese era el hueco grande de la izquierda. Ahora las filas
  tienen **el mismo alto y la misma sangría** que las de los otros menús, y el
  círculo —que se conserva, es lo que numera el orden— pasó **después** del
  nombre y solo se dibuja cuando la fila tiene prioridad. Al ir después de un
  nombre elástico, activar un criterio no mueve nada de sitio.
  *Precisión sobre el diagnóstico del pedido:* el relleno no las hacía más
  bajas sino más altas, y **igualarlo a 8 por 10 las habría dejado en 42 contra
  32 de las demás**, porque acá el alto no lo pone el texto sino los botones de
  dirección. Se llegó a los 32 por el otro lado: botones de 24 y relleno
  vertical de 4, con el lateral en 10 como el del resto —que es lo que gobierna
  la sangría, que era el punto—.
- **Ordenar era el único sin título de sección.** Ahora tiene "Criterios".
- **Los menús no compartían ancho:** todos partían de un mínimo de 244 y crecían
  con su contenido, así que Rango quedaba bastante más ancho que la lista de
  campos. Ahora tienen **ancho fijo de 280**, que es lo que necesita el más
  ancho. **Vistas queda fuera de la regla**: se ancla a la derecha y sus nombres
  guardados pueden ser largos. El tope de #310 sigue mandando en pantalla
  angosta.

**Textos que no cabían o sobraban:**

- "Relativas (se recalculan)" se partía en dos líneas en el menú de Fecha. Queda
  **"Relativas"**.
- La nota del horizonte impuesto queda **"Horizonte definido por el filtro de
  fecha"**. La palabra "horizonte" se conserva a propósito: la nota va después
  de las dos opciones, no pegada al título del grupo, así que sin ella no se
  entiende de qué habla.
- El aviso de fin de semana **ya no termina en punto**, como ningún otro texto
  de menú.

**Los tres iconos de cada vista guardada están siempre visibles.** Estaban en
invisible hasta pasar el mouse: eso dejaba la fila despareja —el de actualizar,
cuando estaba apagado, sí se veía— y los volvía inalcanzables en pantalla
táctil, donde no hay mouse que pasar. El de actualizar, sin nada que guardar, se
ve en **el tono apagado estándar del producto** y no responde, conservando su
aviso. (Antes usaba un `.25` propio, que solo existía porque el icono partía
invisible.)

**El filtro de Estado sigue la misma regla que los contadores:** las marcas
reales de la grilla cuando se está en Gantt, los puntos de color cuando se está
en tabla. Con #305 los contadores habían pasado a las marcas y el filtro seguía
con los puntos, así que quedaron dos representaciones del mismo modelo — que es
justo lo que #305 vino a eliminar. Las marcas se achican dentro del menú para
que estas filas no queden más altas que las demás.

**"Actualizar vista" pasa a la izquierda de Vistas.** Estaba pegado al extremo
derecho, después de Vistas, así que al aparecer lo empujaba. Ahora **Vistas
queda fijo en el extremo derecho y no se mueve nunca**, y "Actualizar vista"
sigue siendo el único elemento que aparece y desaparece.

Lo que **no** se tocó, por decisión del dueño: "Seleccionar todos" tal como
está; las tres formas de marcar lo elegido (fondo con negrita para una sola
opción, casilla para varias, check para las vistas guardadas), porque
corresponden a tres tipos distintos de elección; el mecanismo de Ordenar; y todo
lo definido en #305.

**Verificado** en `docs/prueba-305-franjas-y-controles.mjs`, que pasa a cubrir
los dos pedidos: **130 comprobaciones en verde**, las 17 de #305 más las 10 de
#305b. Mide el ancho real de los tres menús de ancho fijo (280 los tres, y el
segundo nivel de Filtrar también), el alto y la sangría de las filas de Ordenar
contra las de Filtrar, la opacidad calculada de los tres iconos, el texto exacto
de las dos notas, y las posiciones de "Actualizar vista" y Vistas antes y
después de que la foto quede vieja.

*Nota de método:* dos aserciones de #305 dejaron de valer con estos ajustes y se
actualizaron, no se relajaron — la posición de "Actualizar vista" (C14) y el
texto de la nota del horizonte (C10). Y la búsqueda de una opción de Estado pasó
a ser por nombre exacto: con las marcas, el texto de la fila incluye el glifo
("✓Hecha"), así que buscarla por el texto completo dejó de encontrarla.

### #305c — Cierre de #305

Dos ajustes finales. Pantalla, sin migración.

- **El menú de Fecha tenía dos títulos seguidos.** Al entrar al campo desde
  Filtrar decía "FECHA" —el campo en el que estás— y justo debajo "RELATIVAS".
  **Se elimina "Relativas"**: las cinco opciones quedan directamente bajo el
  nombre del campo. "FECHA" se queda (es lo que dice dónde estás, y lo tienen
  todos los campos) y **"Rango fijo" también**: ese sí separa algo distinto, los
  dos calendarios de desde y hasta.
- **El ícono de actualizar se habilitaba en TODAS las vistas guardadas.** Al
  modificar la vista en la que estás, las cinco quedaban disponibles para ser
  sobrescritas con lo que tenías en pantalla. La condición miraba únicamente si
  había algún filtro u orden puesto, y esa es la misma para todas: **no miraba
  de qué vista se trataba**. Ahora se habilita **solo en la vista activa y solo
  cuando está modificada** — exactamente la condición que ya usa el asterisco,
  así que las dos señales pasan a decir lo mismo: esta vista tiene cambios sin
  guardar, y este botón los guarda. **"Guardar vista" no cambia**: sigue
  habilitándose con cualquier filtro u orden puesto, haya o no vista activa,
  porque crea una vista nueva en vez de sobrescribir ninguna.

### #324 — El encabezado de Mis Tareas se homologa al de los proyectos

**#305 abrió una regresión en Mis Tareas.** Eliminó la leyenda de la Gantt y le
pasó ese trabajo a la fila de contadores del encabezado. En la pantalla de
proyecto el reemplazo funciona; **en Mis Tareas no, porque nunca tuvo
contadores**: ahí se quitó la leyenda y no llegó nada en su lugar, y quedaron
marcas verdes, ámbar, rojas, moradas y rosadas en la grilla sin nada que las
explicara.

Los dos encabezados no compartían estructura: el de proyecto usaba la suya y Mis
Tareas la de administración —la misma que Usuarios y Proyectos—, con el título a
18 y la cuenta en una línea aparte. Ahora **es el mismo componente**, que es lo
que impide que vuelvan a separarse:

- **Lleva la fila de contadores**, idéntica: cinco cajas y, en Gantt, la sexta de
  "Fecha anterior" sin número, con las marcas de la grilla como muestras y los
  puntos de color en tabla. Se calculan **sobre las tareas a cargo del usuario
  cruzando todos sus proyectos**; a diferencia de la pantalla de proyecto, que
  los recibe ya calculados desde afuera, acá hay que calcularlos.
- **Se elimina el aviso de atrasadas en texto.** El contador rojo dice el mismo
  número, con color y en el mismo lugar que en un proyecto. Se pierde la frase
  "asignar nueva fecha"; el dueño lo evaluó y lo aceptó.
- **Lleva el chip con la fecha de hoy**, con el mismo aviso cuando es simulada.
- **El título pasa a la estructura del proyecto**, con la cuenta al lado en gris
  ("Mis Tareas · 13 tareas en 1 proyecto"). La línea de abajo desaparece.
- **NO lleva Miembros.** Es la única pieza que no se homologa: Mis Tareas cruza
  varios proyectos y no hay un grupo de miembros que mostrar. No es una omisión.

No cambia el selector Tabla/Gantt (oculto en móvil por la misma razón de
siempre), ni la barra de controles, ni el contenido de la tabla y la Gantt.
Absorbe el primer punto de #308; de #308 queda pendiente solo que su tabla no
trae la columna de acciones.

### #321 — La Gantt: alto de la grilla, doble scroll y columnas fijas

*Segunda mitad de #305. **Cierra también #323**, el bug de modo oscuro.*

**#305 ganó dos franjas de alto sobre la grilla y ese espacio no se estaba
usando.** La grilla seguía reservando su alto con un número escrito a mano, así
que al haber menos arriba simplemente sobraba más abajo.

- **El alto se calcula solo.** Estaba fijado a `100vh - 250px`, **medido contra
  la pantalla completa** cuando la grilla vive dentro de lo que sobra bajo el
  encabezado, que ya es más corto: la caja pedía más alto del que había. De ahí
  salían los dos síntomas que parecían distintos —espacio muerto abajo, o la
  última fila cortada, según cuánto hubiera arriba—. No se ajustó el número:
  cualquier valor a mano vuelve a desalinearse cada vez que cambie algo de
  arriba, que es exactamente lo que acababa de pasar. La grilla **ocupa lo que
  sobra dentro de su contenedor**, y así el problema no puede repetirse.
- **Un solo scroll.** Sale de lo anterior: si la grilla ocupa exactamente lo que
  sobra, nunca empuja la página hacia abajo y el scroll de la pantalla deja de
  existir por sí solo. Encabezado, contadores y barra de controles quedan
  siempre a la vista. **En tabla no se aplica**: una lista larga sí debe
  desplazar la pantalla.
- **El bloque del frente deja de ser negro — y con eso se cierra #323.** Era la
  superficie más oscura de la pantalla y competía con la grilla; pasa a un gris
  propio con el nombre en texto normal. Frente y sub frente usan ahora **dos
  tokens distintos**: en modo oscuro eran **el mismo valor exacto** (`#26262b`,
  uno vía `--estructura` y otro vía `--gris-sf`) — no es que se parecieran, eran
  idénticos. `--estructura` queda sin usos y se elimina.
- **Los nombres se cortan, no se parten.** "Planificació / n" era deliberado: el
  corte en cualquier letra evitaba que una palabra larga ensanchara la columna y
  desplazara los anclajes de las columnas congeladas. Ahora el texto **envuelve
  por palabras** y la que no cabe **se recorta con puntos suspensivos**, con el
  nombre completo al pasar el mouse. La protección se mantiene por otro camino:
  el recorte va en un bloque con mínimo cero, que aporta cero al ancho mínimo de
  la celda, así que **el ancho de la columna deja de depender de la palabra más
  larga**. Aplica a frente, sub frente y tarea. En la columna de tarea el nombre
  completo ya lo mostraba la tarjeta al pasar el mouse, que lo lleva de título:
  no se agregó un segundo globo encima.
- **El rótulo del proyecto se centra en lo visible.** En Mis Tareas se centraba
  sobre el bloque COMPLETO de filas de ese proyecto: si el bloque era más alto
  que la pantalla, el nombre quedaba fuera de vista y la franja de color se leía
  sin explicación. Pasa a usar **el mecanismo que ya tenían frente y sub
  frente** —centrado en la porción visible, acompañando el desplazamiento—, que
  estaba documentado y probado; era aplicarlo a la columna que había quedado
  fuera.

**Las columnas fijas siguen midiendo lo mismo:** 120 + 150 + 240 + 60 = 570. Con
días de 30 y cinco semanas de días hábiles la línea de tiempo necesita 750 y
sigue sin caber: la grilla se sigue desplazando de lado. Es una decisión
consciente del dueño, no un olvido. Tampoco se achicaron frente y sub frente, ni
se fundieron en una columna, ni se tocó la de tarea.

**Verificado** con `docs/prueba-321-gantt-y-encabezados.mjs`: **74
comprobaciones en verde**, los criterios de los tres pedidos (G = #321, M =
#324, C = #305c). Mide el hueco bajo la grilla y el scroll de pantalla en varios
tamaños (1200×700, 1600×1000, 1024×620), fuerza una pantalla baja para
comprobar que se llega al final sin mover ningún otro scroll y que la última
fila no queda cortada, calcula la **razón de contraste** entre frente y sub
frente en los dos temas (idénticos daría 1.00), renombra frente, sub frente y
tarea con palabras largas para comprobar el recorte y que las columnas no se
mueven, y sigue el rótulo del proyecto al desplazar comparándolo con el del
frente del mismo bloque.

*Nota de método:* la primera versión de la comprobación del rótulo exigía que
quedara **entero** dentro de la banda visible tras desplazar. Es imposible por
construcción: cuando la porción visible del bloque es más corta que el rótulo
—que es alto, va rotado—, el mecanismo lo apoya contra el borde del bloque sin
dejar que se salga de él. Es el mismo límite que ya tienen frente y sub frente,
solo que sus nombres miden 30 píxeles y no se nota. La comprobación pasó a ser
la regla real: cuando la porción visible alcanza, el rótulo queda centrado **en
lo mismo que el nombre del frente** (sus centros coinciden), y en todo caso
nunca se sale de su bloque de color.

Una aserción de #305b se actualizó, no se relajó: comprobaba que el título del
menú de Fecha dijera "Relativas", que #305c eliminó. Pasa a comprobar lo que de
#305b sobrevive —que el paréntesis "(se recalculan)" no volvió— y que ningún
título del menú ocupa dos líneas.

### #305d — Guardar vista, títulos de menú, rango de fechas y el globo del frente

Cuatro ajustes. Pantalla, sin migración.

**1. Guardar una vista no apagaba su ícono.** Con una vista activa, agregar un
criterio de orden encendía el ícono —correcto—, pero al tocar guardar **seguía
encendido**: parecía que no había pasado nada, aunque el cambio sí se guardaba.
Y al quitar el orden se apagaba **por la razón equivocada**: no porque la vista
estuviera al día, sino porque ya no quedaba nada puesto.

Es la parte de #305c que faltaba: se pidió habilitar el ícono solo en la vista
activa **y modificada**, y lo de "modificada" seguía resolviéndose con "hay algo
puesto" en vez de comparando. **Ahora el ícono usa exactamente la misma
condición que el asterisco** —está activa y difiere de lo guardado—, así que las
dos señales se mueven juntas: si hay asterisco hay ícono encendido, y si no hay
asterisco no lo hay, aunque haya filtro y orden puestos. **"Guardar vista" no
cambia**: sigue dependiendo de que haya filtro u orden, haya o no vista activa,
porque crea una vista nueva.

*Nota:* la corrección de #305c ya estaba en esta rama y resolvía la
reproducción; se comprobó paso a paso antes de tocar nada. Lo que agrega #305d
es la **prueba** que fija la regla —con un criterio de orden, que es el caso
donde la condición vieja se apagaba por la razón equivocada— y la deja
imposible de perder.

**2. Los títulos que repetían el botón.** "Campos" en el primer nivel de Filtrar
y "Criterios" en Ordenar decían lo que ya decía el botón que acabas de apretar.
**Los dos se eliminan.** Y en el segundo nivel, la vuelta y el nombre del campo
**se funden en una sola línea**: "‹ Fecha", "‹ Estado", "‹ Proyecto" — dice
dónde estás y cómo volver a la vez, en vez de gastar dos renglones. Se conservan
los títulos que separan grupos dentro de un mismo menú: "Aplicado" en Filtrar,
"Rango fijo" en Fecha, y "Días" y "Horizonte" en Rango.

*Esto deshace parte de #305b*, que le agregó un título a Ordenar porque era el
único sin uno. Queda parejo igual, por el otro lado: **ningún menú lleva título
que repita su botón.** Es un cambio deliberado del dueño, no un olvido.

**3. El rango de fechas no cabía en el menú.** Los dos campos de "Rango fijo" se
salían por el borde derecho y el segundo quedaba cortado. Las cuentas: el menú
mide 280 y sus bordes se comen 18, quedan 262; con 10 de relleno a cada lado y 6
entre elementos, para los dos campos y el guion quedaban 230, y cada campo pedía
cerca de 125 —letra de 12, 7 de relleno lateral, "dd/mm/aaaa" más el ícono del
calendario—: 250, **faltaban unos 20**. Los campos se achican hasta caber (letra
11, relleno 5) y se achican también el guion y el relleno de la fila, que
devuelven otros 10 de holgura. Medido: cada campo queda en 113 y los dos entran
dentro del ancho útil, **sin recortar su contenido** — que es el límite real:
por debajo de cierto punto el navegador se come el ícono del calendario y el
campo deja de abrirse con un clic. Ensanchar el menú no era opción: los 280 son
la decisión de #305b, la que hace que la caja no cambie de tamaño entre menús.

**4. El globo del nombre del frente era muy lento.** *Causa:* **no tenía globo
propio.** Lo que aparecía era el del navegador (el `title` que puso #321), que
solo sale cuando el texto está recortado y tarda alrededor de un segundo por
diseño del navegador. No estaba mal configurado: no existía. El nombre del
frente y el del sub frente pasan al **`data-tip` del producto**, el mismo globo
inmediato que ya usan los "+" de esas mismas celdas.

Detalles que muerden y quedaron resueltos:

- El globo **no puede colgar de `.fija-txt`**, que recorta con `overflow: hidden`
  para poner los puntos suspensivos y se lo comería; ni del `td`, que también
  contiene el "+" y mostraría **dos globos a la vez**. Va en un envoltorio
  propio, que además es el que lleva el `min-width: 0` que impide que una
  palabra larga ensanche la columna.
- Se abre **hacia la derecha**, como el rótulo del proyecto (#192): estas
  columnas están pegadas al borde izquierdo del scroll de la grilla y un globo
  centrado quedaría recortado por ahí. Con un salto de capa mínimo al pasar el
  mouse, para que la columna hermana —que es sticky y se pinta después— no lo
  tape, y por debajo del encabezado congelado (#193).
- **En la columna de tarea no se agrega nada:** su tarjeta ya lleva el título
  completo y aparece de inmediato, sin retardo. Un `data-tip` encima serían dos
  globos a la vez.

**Verificado** en `docs/prueba-321-gantt-y-encabezados.mjs`, que pasa a cubrir
los cuatro pedidos de la rama: **109 comprobaciones en verde** (G = #321,
M = #324, C = #305c, D = #305d). La sección D reproduce el camino exacto del
pedido con un criterio de orden, mide los dos campos de fecha contra el ancho
útil del menú y comprueba que ninguno recorta su contenido, y mide el globo a
los **120 ms** de pasar el mouse — si a esa altura ya está, no es el del
navegador, que tarda cerca de un segundo.

Dos aserciones anteriores se actualizaron, no se relajaron: la de #305b que
exigía un título en Ordenar (que este pedido elimina a propósito) y la de #321
que buscaba el nombre completo en el `title` (que ahora vive en el `data-tip`).

### #305e — Guardar una vista no apagaba su asterisco

Corrección de #305d, que dio este punto por resuelto y no lo estaba. Pantalla,
sin migración.

**El síntoma.** Con una vista activa, agregar un criterio de orden encendía el
asterisco y el ícono —correcto—, pero al tocar guardar **ninguno de los dos se
iba**, aunque el cambio sí se guardaba. Y al quitar el orden se apagaba, pero
**por la razón equivocada**: no porque la vista estuviera al día, sino porque ya
no quedaba nada que comparar.

**La causa.** #305c había corregido una causa distinta y sigue bien: la
condición del ícono es "esta vista está activa **y** está modificada". Lo que
estaba mal es **cómo se decidía "modificada"**: comparando la vista guardada y
la de pantalla con `JSON.stringify`, letra por letra. Eso solo da igual si las
propiedades vienen en el mismo orden — y el orden de las propiedades no es
información, es un accidente de cómo se armó el objeto.

**Ahora se compara por contenido.** Las **listas de valores del filtro**
—responsables, estados, proyectos— son **conjuntos**: los mismos valores en
distinta secuencia son el mismo filtro. El **orden** es una **secuencia**:
`[fecha, estado]` y `[estado, fecha]` son órdenes distintos y siguen contando
como diferentes. Las claves se normalizan en los dos casos. No se tocó nada más:
ni cómo se guarda, ni el tipo de la columna, ni que la vista en memoria se
reemplace con lo que devuelve la base —que es lo correcto, la base es la fuente
de verdad—, ni la condición del ícono, ni la de "Guardar vista".

**El defecto NO existía solo en producción.** El pedido lo atribuyó a la columna
`jsonb`, que reordena las claves al devolverlas, y dio por hecho que contra la
base de mentira no se reproduce. Hay un **segundo camino que no necesita base
real**: el orden en que se arma el filtro. Elegir Estado y después "Sin fecha"
produce `{estados, sinFecha}`; al revés produce `{sinFecha, estados}` — mismo
filtro, distinto texto. Medido en `main` antes del arreglo: guardar una vista y
rearmar el mismo filtro al revés dejaba el asterisco encendido. Eso permite que
la prueba automática sea un **control negativo de verdad**, sin tocar
producción.

Un tercer caso que el arreglo cierra de paso: **destildar y volver a tildar una
opción** la manda al final de su lista, y eso encendía el asterisco aunque el
filtro fuera idéntico.

**Verificado** con `docs/prueba-305e-vista-modificada.mjs`: **28 comprobaciones
en verde**. Cubre el camino literal del pedido (E1 a E4: guardar con el orden
puesto, con filtro por responsable, con los dos a la vez, y después de
recargar), los dos caminos que reordenan las propiedades —rearmar el filtro en
otro orden (E5) y las claves de la vista guardada reordenadas a mano, que es lo
que hace `jsonb` (E6)—, las listas como conjuntos (E7), el orden como secuencia
(E8), y que solo se encienda el ícono de la vista activa mientras "Guardar
vista" no cambia (E9).

*Qué comprueba cada bloque, para no confundirlos:* corrida contra `main` sin el
arreglo fallan **E5, E6 y E7**. **E1 a E4 pasan con y sin arreglo**, porque
contra el repo en memoria la vista guardada y la de pantalla son el mismo objeto
y el texto siempre coincide — ahí el defecto solo se ve contra la base real. Se
conservan porque son los criterios del pedido y fijan el comportamiento
correcto, pero los que muerden son los otros tres.

### #322 — "Sin fecha" convivía con una fecha relativa y no debía

Con **"Esta semana"** y **"Sin fecha"** puestos a la vez, la lista mostraba
tareas que no se esperaban. **El cálculo no estaba mal: hacía exactamente lo que
decía** — con las dos activas mostraba las tareas sin fecha *más* las de esta
semana. Es una suma. **Lo que estaba mal es que esa combinación pudiera
existir.**

En el campo Fecha todas las opciones se excluían entre sí menos esa pareja:
activar una relativa —o escribir un rango fijo— apagaba "Con fecha" pero **no**
"Sin fecha"; y activar "Sin fecha" apagaba "Con fecha" pero **no** la relativa.
Se llegaba desde los dos lados, y nadie decidió nunca qué debía significar la
mezcla.

Ahora **"Sin fecha" se excluye con todo el resto del campo**, igual que "Con
fecha" y "En horizonte visible": activarla apaga la relativa y el rango fijo, y
activar una relativa o escribir un rango la apaga a ella. **Las cinco opciones
del campo Fecha se excluyen entre sí sin excepciones**, que es como el menú ya
se comportaba en los otros cuatro casos.

Lo que **no** se tocó: el motor del filtro sigue sabiendo sumar las dos cosas,
porque **una vista guardada de antes de #322 puede traerlas juntas** y tiene que
seguir funcionando. Por lo mismo, el contador del campo y su ficha conservan la
suma y el "+": para las vistas nuevas siempre valen uno, pero si una vieja trae
dos, el número tiene que decir la verdad. Los filtros de responsable, proyecto y
estado no cambian: ahí sí se eligen varios a la vez.

### #320 — Se pueden agregar tareas en la tabla aunque esté filtrada

Con cualquier filtro puesto, la tabla del proyecto **escondía la fila de "+
Tarea"** de cada sub frente: no había forma de crear una tarea sin limpiar el
filtro primero. **No era un descuido: estaba hecho a propósito**, por un
problema real — una tarea recién creada puede no cumplir el filtro y desaparecer
en el mismo momento en que la creas.

**Pero la Gantt sí dejaba crear con filtro puesto**, y resolvía ese problema en
vez de esconder la acción: la tarea recién creada se muestra igual aunque el
filtro o la foto la dejen fuera, y se enciende "Actualizar vista". Resultado:
mismo proyecto, mismo filtro, **dos comportamientos opuestos según la vista**.

El remedio no hubo que inventarlo, y **ni siquiera hubo que traerlo**: ya vivía
en la tabla, para el caso de la foto congelada (#137/#253). Solo había que dejar
de esconder la fila. La tarea recién creada se queda a la vista, se enciende
"Actualizar vista", y al tocarlo desaparece si no cumple el filtro y se queda si
lo cumple.

Lo que **no** cambia, por decisión del dueño: los **sub frentes sin ninguna
coincidencia siguen ocultos** (no se muestran vacíos solo para poder crear ahí),
**"+ Sub Frente" sigue escondido** con filtro puesto, y el **bloque de
archivadas** también. Sin filtro, todo igual que antes; la Gantt, igual que
antes.

**Verificado** con `docs/prueba-322-320-fecha-y-crear-filtrado.mjs`: **48
comprobaciones en verde** (F = #322, T = #320). Recorre las cinco relativas
contra "Sin fecha" **desde los dos lados**, el rango fijo en los dos sentidos,
que "Con fecha" y "En horizonte visible" no cambiaron, que el contador y la
ficha nunca muestran más de una opción, y que responsable y estado siguen
aceptando varios valores. Para #320 cuenta las filas de "+ Tarea" contra los sub
frentes visibles, crea una tarea con el filtro puesto, comprueba **en el estado
guardado** que quedó en el sub frente correcto, y recorre los dos desenlaces de
"Actualizar vista".

*Control negativo:* corrida contra `main` antes del arreglo fallan **19**
comprobaciones. Entre ellas T1, medido: con un filtro puesto había **0 filas de
"+ Tarea" en 4 sub frentes visibles**.

*Dos supuestos míos que la prueba corrigió, y que vale la pena dejar escritos:*
una tarea recién creada nace sin fecha y sin marcar, así que **su categoría es
"pendiente"** — filtrar por "Pendiente" no sirve para comprobar que la forzada
se queda, porque sí cumple. Y **"Actualizar vista" se enciende igual aunque la
nueva cumpla el filtro**: con filtro puesto la vista está congelada y una tarea
recién creada nunca está en esa foto. Lo que distingue los dos casos no es si el
botón aparece, sino qué pasa al tocarlo.

### #306 — La tabla: jerarquía y espacio muerto, y el "+" de la Gantt

Dos problemas que se resuelven juntos, porque **el aire que se recupera es el
mismo que pasa a marcar los grupos**.

**1. El frente no se leía como el contenedor de sus sub frentes.** Medido: el
frente era texto de **15 en negrita, sin fondo**; el sub frente, texto de **13.5
en la misma negrita, con fondo y con borde**. **El hijo tenía más presencia
visual que el padre**, así que el frente se leía como un rótulo suelto sobre
unas cajas que no parecían suyas.

**2. Con los sub frentes cerrados, la pantalla era casi todo aire:** 26 de
margen entre sub frentes contra una barra de 33 de alto, 18 alrededor del título
de cada frente, y unos 60 por frente para la fila de "+ Sub Frente". Con seis
sub frentes cerrados llenaban la pantalla **sin mostrar una sola tarea** — y ese
es justo el estado en que uno abre la pantalla para orientarse.

**La pertenencia se marca con peso y proximidad, no con marcos ni sangría.** Es
como agrupan Asana y Notion:

- **El frente sube de peso**, claramente por encima del sub frente, y lleva al
  lado —en gris y chico— **cuántos sub frentes tiene**. Solo sub frentes: la
  cuenta de tareas ya aparece en varios lugares y repetirla no aporta.
- **El sub frente pierde la negrita.** Sigue siendo una caja con su fondo y su
  borde —eso no se toca—, pero deja de competir con su padre.
- **El aire se reordena:** entre sub frentes del mismo frente baja de **26 a
  8**, y la separación grande (**28**) queda solo entre un frente y el
  siguiente. **Ese contraste es lo que comunica la pertenencia:** lo que está
  junto es del mismo frente, lo que está separado es otro.
- **"+ Sub Frente" deja de ser una fila.** Con el frente ya poblado es una
  **línea de texto chica y gris** pegada debajo del último: sigue donde uno la
  busca, pero deja de pesar como un elemento de la lista. Con el frente
  **vacío** sigue siendo un **botón** —es el momento más importante y la única
  acción posible: alguien acaba de crear un frente y lo siguiente que tiene que
  hacer es agregarle un sub frente—, junto a la línea "Sin sub frentes en este
  frente", que se mantiene.

**Medido:** con los cinco sub frentes del proyecto de prueba cerrados, el
contenido de la tabla pasó de **600 a 452** de alto.

**El "+" de la Gantt descentraba los nombres.** Compartía la línea con el nombre
y **ocupaba su lugar aunque estuviera invisible** —18 de ancho más 6 de
separación—, así que el nombre estaba corrido 12 a la izquierda **siempre**, y
con el mouse encima el desorden se notaba más. Ahora **sale del flujo** y se
coloca a la derecha del nombre: el nombre queda centrado de verdad y **no se
mueve al aparecer el "+"**. Si el nombre no llega hasta ahí, el "+" cae sobre
espacio vacío y no tapa nada; si llega, el texto **se desvanece hacia el fondo
justo bajo el "+"** con un degradado corto, en vez de cortarse contra él. El
nombre completo sigue en el globo rápido de #305d. *Una sola posición y una sola
regla, sin casos especiales: la máscara está puesta mientras el "+" se ve, y
solo se nota donde hay texto debajo.* Efecto lateral medido y bienvenido: al no
reservar esos 24 píxeles, el nombre dispone de **103 en vez de 79**, así que
recorta menos.

**La franja gris de los controles medía distinto en cada vista.** Verificado: la
barra mide lo mismo en las dos —14 arriba, 8 abajo—; lo que cambiaba era el aire
del contenedor de después. Medido: **24 en la tabla contra 16 en la Gantt**.
Ahora las dos miden **16**.

**Verificado** con `docs/prueba-306-jerarquia-tabla.mjs`: **50 comprobaciones en
verde**. Mide los dos pesos y los dos aires, exige que el contraste entre las
distancias sea de más del doble, comprueba el alto con todo plegado contra el
valor de antes, recorre el frente vacío —botón, aviso, y el paso a línea al
crear el primero—, y en la Gantt mide que el "+" esté fuera del flujo, que el
nombre **no se mueva** entre con y sin mouse, y que el desvanecido esté puesto
solo mientras el "+" se ve.

*Control negativo:* corrida contra `main`, **12 comprobaciones fallan** y después
la prueba se detiene, porque el elemento que reemplaza a la fila de "+ Sub
Frente" todavía no existe.

*Dos pruebas anteriores se actualizaron, no se relajaron:* #297 y #311 leían el
nombre del frente como el `innerText` completo del título, que ahora incluye la
cuenta de sub frentes. Pasan a leer el primer nodo de texto, que es el nombre.

### #306b — Ajustes sobre #306: el aire, la línea que cerraba mal, y el "+" pegado al nombre

Tres correcciones sobre la misma rama, antes de fusionar.

**1. Demasiado aire entre el encabezado y los botones.** Medido: **26
seguidos** entre la fila de contadores y la barra de `Filtrar · Ordenar`, y no
venían de un solo lado — eran **12 debajo del encabezado más 14 arriba de la
barra**, sumándose. Pasaba igual en tabla y en Gantt. Bajan a **6 y 6: 13 en
total**, la mitad. El aire de **arriba** del encabezado no se toca. Los 6 de la
barra siguen siendo **padding y no margen**, que es lo que hace que la franja
pegajosa incluya ese aire y **tape con su fondo opaco** lo que pasa por debajo
al desplazar: con margen, el hueco sería transparente y el contenido se vería
pasar por ahí.

**2. La separación entre frentes se leía mucho mayor de lo que era.** La causa
no era el número: la línea de **"+ Sub Frente" caía justo en el medio**,
separada del último sub frente por los mismos 8 que separan a los sub frentes
entre sí. Se leía como **un elemento más de la lista** y sumaba su alto y su
aire a la separación. **El orden importó:** primero la línea se pega al último
sub frente —`margin-top: -4`, que la deja a **4** del sub frente contra los
**20** que la separan del frente siguiente—, y recién ahí se puede juzgar el
segundo cambio: la separación entre frentes baja de **28 a 20**.

*Sobre la reserva declarada en el pedido* —subir a 24 si los grupos se
fundían—: mirado el resultado con los sub frentes cerrados, **la agrupación se
sigue leyendo a 20** (20 contra 8 hacia adentro, más del doble), así que se
queda en 20. **Medido:** con todo plegado el contenido pasa de los **452** que
dejó #306 a **432**.

**3. El "+" de la Gantt se veía suelto contra el borde.** #306 lo había anclado
al borde derecho de la **columna**, así que quedaba lejos del nombre. Ahora se
pega **al borde derecho del nombre**, y solo se apoya en el borde de la columna
**cuando no cabe**. *Consecuencia aceptada por el dueño:* queda en un punto
distinto en cada fila.

**Esto no se puede hacer solo con CSS, y está medido.** El primer intento fue
`max-width: calc(100% - 26px)` sobre el nombre con el "+" en `left: 100%`. Al
medirlo: `conMas [286,363]` en el frente y `[406,513]` en el sub frente — **los
dos nombres tocaban el tope**, así que el "+" seguía en el borde en todas las
filas y el cambio habría sido **invisible**. El motivo: el ancho de la **caja**
del texto no es el ancho del **texto renderizado** — una caja de 103 con dos
palabras que envuelven tiene líneas mucho más cortas—, y CSS no tiene forma de
saber dónde acaba la línea más larga. Un `Range` sobre el contenido sí:
`getClientRects()` devuelve **un rectángulo por línea**. Un efecto toma el
máximo de esos bordes derechos y lo acota contra el borde de la celda; el
`Math.min` cubre los dos casos **sin ningún condicional**. **No corre al
desplazar:** dónde acaba el texto depende del contenido y del ancho de la
columna, no del scroll. El valor de CSS queda como respaldo para el instante
anterior al efecto: apoyado en el borde, que es el peor caso.

**Medido por fila:** "Diseño" y "Procesos Operacionales" quedan pegados al
nombre (+4); "Levantamiento", "Procesos Comerciales", "Procesos Financieros" y
"Arquitectura de datos" se apoyan a 8 del borde con el texto desvaneciéndose
bajo el "+". Todo lo demás de #306 sigue igual: el "+" fuera del flujo, el
nombre centrado y sin moverse al aparecer, y el degradado bajo él.

**Verificado** con `docs/prueba-306-jerarquia-tabla.mjs`, que pasa de 50 a **69
comprobaciones en verde**. Las nuevas miden el aire en las dos vistas y exigen
que sea el mismo, comprueban que la barra siga pegada arriba tras desplazar 300
y con fondo opaco, miden que la línea esté al menos **tres veces más cerca** del
último sub frente que del frente siguiente, que la separación entre frentes sea
menor que antes pero siga siendo **más del doble** del aire de adentro, y —celda
por celda, con el mismo `Range`— dónde acaba el texto contra dónde empieza el
"+".

*Dos umbrales de la prueba de #306 se relajaron a propósito:* exigían `>= 24` a
la distancia entre bloques, que ahora es 20. Lo que corresponde exigir ahí es
que **siga siendo la separación grande**, no un número concreto, así que pasan a
`>= 18` con el motivo escrito al lado.

### #306c — Los espaciados de la tabla no calzaban entre sí: ahora salen de un solo valor

**Cuatro espaciados, cada uno fijado en un momento distinto mirando solo su
lado, y ninguno calzaba con otro.** Medido antes:

| Dónde | Cuánto | De dónde salía |
|---|---|---|
| Arriba de la barra de botones | **12** | 6 del encabezado + 6 de la barra |
| Abajo de la barra, hasta el contenido | **24** | 8 de la barra + 16 del contenedor |
| Del título de un frente plegado a la línea de arriba | **28** | 8 del frente anterior + 20 entre bloques |
| Del título a su propia línea de abajo | **8** | el relleno de la franja |

De ahí los tres síntomas: la barra de botones **se veía descolgada** (cuatro
veces más aire abajo que arriba), el título de un frente plegado quedaba
**pegado a la línea de arriba** (28 de una, 8 de la otra), y el primer frente se
separaba de los botones **distinto** de como un frente se separa del anterior.

**Por eso ajustar uno descuadraba otro** — es exactamente lo que había pasado en
#306b, donde se bajó el aire de arriba de la barra y el conjunto quedó peor,
porque el de abajo siguió igual.

**Ahora hay un solo valor, `--aire-bloque: 16`, y los cuatro salen de él.**

- **La barra de botones queda centrada:** 16 arriba y 16 abajo. El de arriba va
  **partido en dos mitades** —8 en el encabezado y 8 en la barra— para que la
  línea del encabezado caiga justo en el medio del hueco y ningún lado se lo
  apropie. El de abajo lo pone **entero la barra**, y por eso los contenedores
  de tabla y Gantt dejaron de llevar relleno arriba: puesto en el contenedor, el
  aire quedaría **fuera** de la franja pegajosa y el hueco sería transparente,
  con las filas viéndose pasar por ahí al desplazar. Sigue siendo **padding y no
  margen** justamente por eso.
- **Del título de un frente a lo que venga antes: 16**, dé igual si lo anterior
  es la barra de botones —primer frente— o el frente anterior. **Los dos casos
  se ven iguales porque son el mismo número**, no porque se hayan ajustado dos
  números para que coincidan.
- **Con los frentes plegados, el centrado sale por construcción:** la franja del
  frente lleva 16 abajo hasta su línea, contra los 16 que trae arriba. El margen
  de abajo de la franja se fue a 0 — el aire que separa de la franja siguiente
  ya lo pone el de entre bloques, y sumarle este era lo que dejaba el título a
  28 de una línea y a 8 de la otra.

**Lo que NO entra en la regla es el aire de adentro de un grupo:** los **8**
entre sub frentes del mismo frente no se tocan. El contraste entre ese 8 y el 16
de afuera es justo lo que hace que los grupos se lean, y es lo que #306 vino a
conseguir.

**Medido después:** la barra pasó de 12/24 a **16/16** (17 arriba contando la
línea del encabezado), idéntico en tabla y en Gantt; el título de cada frente
plegado quedó a **22 de su línea de arriba y 22 de la de abajo**, y el primero
—medido desde los botones— a los mismos 22; los sub frentes siguen a **8**; y el
alto con todo plegado bajó de **432 a 412**.

**Verificado** con `docs/prueba-306-jerarquia-tabla.mjs`, que pasa de 69 a **86
comprobaciones en verde**. Lo que comprueban las nuevas **no son los números
sino las igualdades**: que arriba y abajo de la barra midan lo mismo, que sea
igual en las dos vistas, que el primer frente se separe de los botones igual que
un frente del anterior, que el título plegado quede a la misma distancia de sus
dos líneas, y que los cuatro espaciados salgan efectivamente del mismo valor.
*Un valor se puede cambiar; que calcen entre sí es la propiedad.* Se comprueba
además que el aire de abajo lo ponga la barra como relleno y que ahí, tras
desplazar, siga habiendo franja y no hueco.

*Tres umbrales anteriores se actualizaron, no se relajaron:* exigían `>= 18` a
la separación entre frentes, que ahora es 16, y un `>` donde el contraste con el
aire de adentro pasó a ser **exactamente el doble** (16 contra 8). Doblar es la
propiedad que se pide; pasarse no aporta nada. Y el umbral de #306b sobre el
aire de arriba de la barra sube de 14 a 20, porque #306c lo volvió a subir a 16
a propósito: 13 arriba contra 24 abajo era lo que dejaba la barra descolgada.

### #318 — La barra lateral: el frente cuelga de su proyecto, y se despliega

**La jerarquía estaba invertida, y no por descuido.** Medido sobre el borde de
la barra: el nombre del **proyecto** arrancaba a **48** (8 del contenedor de la
lista + 12 de la fila + 10 del botón + el cuadradito de color de 10 + 8 de
separación) y el del **frente** a **30** (8 + 12 + 10). El hijo quedaba **18 a
la izquierda de su padre**, y el frente no llevaba nada que lo ligara a su
proyecto.

*#225 lo había dejado así a propósito:* antes los frentes estaban prácticamente
alineados con el proyecto y consumían ancho, así que se corrieron para alinearse
con el cuadradito de color y ganar espacio para el nombre. **Priorizó el ancho, y
el efecto lateral fue esta inversión.** Este pedido paga parte de ese ancho de
vuelta, a conciencia.

**Ahora el grupo de frentes lleva 16 de sangría y una línea vertical a su
izquierda**, que empieza con el primero y termina con el último. La línea hace
dos trabajos: dice que el grupo cuelga del proyecto de arriba, y marca dónde
empieza y dónde termina. **Por qué la línea y no un punto de color por frente:**
el punto costaría unos 18 de ancho en **cada** fila; la línea cuesta **2 más un
aire chico**, una sola vez, y comunica mejor porque abarca el grupo entero en vez
de repetirse. Es el patrón de los sistemas de diseño de barras laterales:
sangría de 12 a 16 por nivel, con una línea que conecta el hijo con el padre.

**Y el frente se ve algo más chico y más tenue.** Medido, esto estaba peor de lo
que se creía: el frente era **13.5** contra los **13.3** del proyecto, o sea el
hijo era **más grande** que su padre. Ahora es 12.5 y de un gris más apagado; el
frente **elegido** recupera el blanco, para que la selección no dependa solo del
fondo de la fila.

**Costo aceptado y medido:** el nombre del frente pasa de **204 a 182** de ancho
útil, así que algunos nombres largos se cortan un poco antes. Se siguen cortando
con puntos suspensivos y con el nombre completo al pasar el mouse.

**Los frentes se despliegan, no aparecen.** Al abrir un proyecto bajan con una
transición corta, empujando lo que viene después; al cerrarlo, o al abrir otro,
se repliegan igual. *Lo que se corrigió no es que la lista se mueva —eso es
correcto y necesario— sino que el movimiento fuera **instantáneo**: el ojo no
veía nada moverse, solo encontraba la lista distinta.*

**Dos decisiones técnicas que valen la pena, porque el camino obvio no
funciona:**

- **La caja de frentes es una grilla de una fila que va de `0fr` a `1fr`.** Es
  la única forma de animar "de nada a lo que mida" sin medir el alto por JS: con
  `height: auto` no hay interpolación posible, y con un `max-height` inventado la
  velocidad depende de cuánto sobre del tope, así que un proyecto de un frente y
  uno de seis se moverían distinto — justo lo que el criterio 6 no quiere.
- **La ENTRADA es animación y la SALIDA transición.** Una transición necesita dos
  estados y al abrir la caja acaba de montarse, así que no hay desde dónde salir;
  una animación, en cambio, corre sola al aparecer. Al cerrar la caja ya existe y
  solo pierde su clase, y ahí la transición sí tiene de dónde salir.
- **Y el proyecto que se cierra se calcula EN EL RENDER, no en un efecto.** Esta
  fue la parte que costó, y está medida: con un `useEffect`, en el render del
  cierre la caja ya no estaba dibujada, se desmontaba, y el efecto la volvía a
  montar en 0 — **el repliegue daba 0 en las catorce muestras**, es decir el
  defecto seguía intacto. Ajustar estado durante el render comparando contra el
  valor anterior es el camino que React documenta para esto: se resuelve antes de
  pintar, así que la caja pasa de abierta a cerrada en el mismo commit.

**Medido después:** el repliegue va `58 53 43 31 21 14 5 2 1 0`, el despliegue
`5 15 27 37 49 53 56 57 58`, con seis frentes `174 128 93 63 41 15 7 3 1 0`, y al
pasar de un proyecto a otro el saliente baja de 174 a 3 mientras el entrante
aparece en 29.

### #307 — El panel de detalle: solo leer y comentar

El panel terminaba con un bloque de acciones —marcar hecha, replanificar,
archivar y restaurar— **después del historial y del hilo de comentarios
completo**. Con comentarios, había que bajar hasta el fondo para llegar a ellas.

**Se saca el bloque entero.** La razón ordena todo el pedido: *el panel se usa
para leer los datos de la tarea y anotar comentarios, nada más.* Marcar hecha y
replanificar ya se hacen desde la tabla y desde la Gantt, así que tenerlas acá
era un **tercer lugar para lo mismo**. El panel queda con el estado, el título,
la ubicación, el responsable, las fechas, el historial de replanificaciones y los
comentarios al final. **Debajo de los comentarios no queda nada.**

**Dos cosas se resolvieron solas al sacarlo:**

- **El estado dejó de decirse dos veces.** Estaba la etiqueta sobre el título y
  la casilla "Hecha" abajo. Queda solo la etiqueta.
- **Desapareció del panel el texto "La fecha de una tarea hecha no se edita.
  Desmárcala para corregirla."**, que acompañaba al control de replanificar. Ese
  texto **sigue existiendo como globo** sobre la fecha en la tabla y en Mis
  Tareas, que es donde vive el control; sale de un solo lugar del código
  (`MOTIVO_FECHA_HECHA`) y ahora aparece en dos en vez de tres.

**Consecuencia declarada:** archivar y restaurar existían **solo en la tabla** y
en este panel, así que **la Gantt queda sin forma de archivar** y hay que ir a la
tabla. **El dueño lo evaluó y decidió sacarlas igual.** Marcar hecha y
replanificar no tienen ese problema: existen en las dos vistas.

**Al no tener acciones, el panel tampoco necesita permisos.** El `can` se fue con
ellas, y con él los dos `useMemo` de App que existían solo para armarlo. La regla
de **#243** —los permisos son los del proyecto **de la tarea**, no los del
proyecto abierto— sigue viva donde todavía hay acciones que cruzan proyectos: las
filas de Mis Tareas, que arman su `makeCan` por tarea. Lo que NO se tocó, por
decisión del dueño: el ancho del panel, cómo están dispuestos los datos, y que no
atenúe lo que hay detrás.

**Verificado** #318 y #307 juntos con `docs/prueba-318-307-sidebar-y-panel.mjs`:
**46 comprobaciones en verde**. Mide las dos sangrías y exige que la relación se
haya dado vuelta, que la línea empiece y termine con el grupo y cueste 2 y no 18
por fila, y que el frente sea más chico y más apagado que su padre. Para la
transición **muestrea el alto de la caja cada 20ms** y exige que pase por alturas
intermedias: una aparición de golpe salta de 0 al total en una sola muestra.
Recorre el proyecto de seis frentes, el cambio de un proyecto a otro y el
proyecto sin frentes. Del panel comprueba que no quede nada bajo los comentarios
—ni casilla, ni control de fecha, ni archivar, ni restaurar en una archivada—,
que el estado se diga una sola vez, y que sigan funcionando el globo de la fecha
en la tabla, marcar hecha, replanificar, archivar desde la columna de acciones y
restaurar desde el bloque de archivadas, además de abrir el panel desde la Gantt
y desde Mis Tareas.

*Control negativo:* corrida contra `main`, **19 comprobaciones fallan** con los
síntomas exactos del reporte: el frente arranca a 30 contra los 48 del proyecto,
no hay línea, el frente mide 13.5 contra 13.3 —más grande que su padre—, las dos
transiciones dan 0 en todas las muestras, y el bloque de acciones está entero.

### #326 — El nombre de la tarea pesaba más que lo que lo contiene

**En la tabla, el hijo pesaba más que el padre.** Medido: el nombre de la tarea
iba en semi negrita (**600**) y el título del sub frente que la contiene en
**500** — perdió la negrita en #306 **a propósito**, para dejar de competir con
el nombre del frente. La tarea quedó fuera de aquel ajuste, así que se leía más
pesada que su propio contenedor. En la Gantt pasaba lo mismo: la columna
congelada de tarea también iba en 600.

**Ahora el nombre de la tarea va en 500, el MISMO peso que su sub frente**, en
la **tabla**, en la **Gantt** y en **Mis Tareas** en sus dos vistas — las tres
usan la misma celda y la misma vista de Gantt, así que las arrastra el mismo
cambio. Queda 500 contra 500 del sub frente y 700 del frente: la tarea deja de
pesar más que lo que la contiene, que era el problema, y **la jerarquía se lee
de arriba abajo**.

**Corrección sobre la primera versión, antes de fusionar.** El pedido pidió
"peso normal" y así se hizo: de 600 a **400**. Visto en pantalla, eso **bajaba
dos escalones de una vez** y se iba de largo — los nombres costaban de leer, en
la tabla y en la Gantt. *El objetivo era que la tarea dejara de pesar MÁS que su
contenedor, no que pesara menos*, y para eso alcanza con **igualarlos**: 500 y
500. El **tamaño** de la letra no se tocó en ninguna de las dos vistas; se
evaluó achicar el nombre en la Gantt y se descartó, porque ahí ya mide 12.5
contra los 13 de la tabla y lo reportado era legibilidad.

**Vale también mientras se edita.** El campo de edición lleva `font: inherit`,
así que hereda el peso de la celda: el texto **no cambia de grosor** al entrar ni
al salir de edición. Verificado: 500 fuera, 500 editando, 500 al salir.

**Lo que no depende de la celda no cambia.** El **visto verde** de una tarea
hecha (700) y la marca **↻ ×N** (700) declaran su propio peso, igual que las
filas de carga por persona al pie de la Gantt (600). Medido después del cambio:
siguen en 700.

**Y los dos accesos equivalentes dejan de leerse distinto.** Debajo del último
sub frente, la línea **"+ Sub Frente"** iba en peso normal; la acción
equivalente al pie de una lista de tareas, **"+ Tarea"**, es un botón fantasma en
600. Ahora la línea va en 600 también. *Cuando el frente está vacío, "+ Sub
Frente" ya era un botón fantasma en 600: ese caso no se toca.*

### #327 — BUG: los globos de la Gantt se cortaban contra los bordes de la grilla

La Gantt tiene **cuatro** globos de texto corto —el nombre completo del frente y
del sub frente (#305d), el rótulo del proyecto en Mis Tareas (#192),
"Información" y "Agregar tarea debajo", y el detalle del día— y los cuatro
estaban construidos igual: **colgando de la celda que los dispara**, con un
`::after`.

**Como colgaban de su celda quedaban dentro del recuadro con scroll de la
grilla, y ese recuadro los recorta.** Verificado en pantalla contra `main`: al
pasar el mouse por el ⓘ de la primera fila, el globo cae bajo el encabezado
congelado y **solo asoma una franja de su borde inferior**.

**Un globo que se abre hacia afuera dentro de un contenedor con `overflow` se
recorta sin importar el z-index.** Por eso el arreglo no es subirle la capa sino
**sacarlo del árbol**: los cuatro pasan a dibujarse en una capa aparte por
encima de la página, con `position: fixed`. *El producto ya resolvió esto dos
veces por ese mismo camino, y las dos están en el código con su comentario: el
nombre completo en administración de usuarios (#213) y la tarjeta flotante de la
tarea.*

**Un solo componente para los cuatro (`GloboTip`).** Escucha bajo el recuadro de
la grilla y dibuja el globo del elemento apuntado. **No cambia el marcado de
cada disparador:** se sigue leyendo el `data-tip` de siempre. Lo que cada uno
declara aparte es lo que lo distingue —su lado (`data-tip-lado="derecha"`) y su
retardo (`data-tip-espera`, que solo usan las celdas de la grilla)—, escrito
**junto al elemento que lo pide** y no en una lista de selectores dentro del
componente.

**Cada globo se sigue abriendo hacia donde se abría**, con el mismo aspecto y la
misma inmediatez: los de nombre hacia la derecha, los de botones y celdas hacia
arriba, y solo el de la celda con su retardo corto para que no aparezca al
cruzar el mouse por la grilla. **Solo se corre al lado contrario cuando no
cabe** contra un borde de la pantalla. Al desplazar la grilla el globo se
suelta: colgaba de coordenadas de pantalla y quedaría flotando lejos de lo que
lo disparó.

*Dos detalles que se unificaron al juntarlos:* el borde claro y la sombra que
#193 le había puesto solo al globo del rótulo del proyecto —para que no se
leyera como el nombre del frente al caer sobre esa columna oscura— ahora los
llevan los cuatro: fuera de la grilla, cualquiera puede caer sobre cualquier
fondo. Y con el globo fuera del recuadro se fueron los dos saltos de capa que
existían solo para que no lo tapara la columna hermana.

**El nombre de la tarea sigue sin globo propio:** ahí el nombre completo lo
muestra la tarjeta flotante, y #305d ya había dejado escrito que sumarle un
globo mostraría dos a la vez. Verificado: al pasar el mouse aparece **una sola**
tarjeta y **ningún** globo.

**Verificado** #326 y #327 juntos con `docs/prueba-326-327-pesos-y-globos.mjs`:
**38 comprobaciones en verde**. De #326 mide los tres pesos y exige que el de la
tarea sea **igual** al de su sub frente —no menor: la corrección se hizo
justamente porque "menor" se fue de largo—, que quede en el escalón del medio
entre producción y la primera versión, que el tamaño de la letra de la Gantt no
cambie, que el visto y el ↻ ×N conserven el suyo, y que el grosor no cambie al
entrar y salir de edición. De #327 comprueba **la
propiedad que garantiza que no se recorte** —que el globo cuelgue del `body` y
no del recuadro con scroll— y que quede entero dentro de la pantalla: en la
primera fila visible, en la última, contra el extremo derecho, con la ventana
angosta y en Mis Tareas. Además, que cada uno se abra hacia el lado que le
corresponde, que el retardo de la celda siga estando y el de los botones no, que
el globo desaparezca al salir y al desplazar, y que el nombre de la tarea siga
mostrando una sola tarjeta y ningún globo.

*Control negativo:* corrida contra `main`, **26 comprobaciones fallan**: el
nombre de la tarea mide 600 contra los 500 de su sub frente, "+ Sub Frente" va
en 400 contra los 600 de "+ Tarea", y no existe ningún globo fuera del recuadro
—los cuatro siguen colgando de su celda—.

*Dos pruebas anteriores se actualizaron, no se relajaron:* #306 y #321
comprobaban el globo del frente y del sub frente leyendo el `content` del
`::after` del disparador. Ahora el globo es un elemento propio en otra capa, así
que pasan a buscarlo ahí. Lo que se exige es lo mismo de antes —que aparezca de
inmediato, con el nombre completo y entero—, y en #321 "entero" pasa a medirse
contra la pantalla en vez de contra el borde del recuadro con scroll, que es
contra lo que ahora tiene que caber.

### #313 — El número de replanificaciones desempata dentro de cada estado

El orden por **Estado** no es alfabético: usa la gravedad del modelo, de menos a
más crítica (hecha → pendiente → pendiente replanificada → atrasada → atrasada
replanificada). **Dentro de un mismo estado no había desempate:** el sort es
estable, así que las empatadas quedaban en el orden en que venían. El número de
replanificaciones ya existía y ya se mostraba —es el ↻ ×N de la tabla— pero no
participaba del orden.

**Ahora desempata**, y **el sentido acompaña a la flecha del Estado.** No es
cosmético: estado y replanificaciones son **una sola escala de gravedad** —una
tarea replanificada es más crítica que una que no lo está, y cuantas más veces se
movió, más crítica es—, así que invertir la flecha invierte también el desempate.
Aplica a **todos** los estados, incluidas las hechas: marcar hecha quita la
condición de replanificada a efectos de color y contadores, pero *el rastro
queda* — una tarea cerrada puede tener tres replanificaciones y otra ninguna.

**Actúa al final de todo, no pegado a Estado.** Si alguien apila Estado con Fecha
Objetivo, la fecha tiene que seguir mandando: el desempate es el último recurso
antes de dejar las cosas como venían.

**No se agrega ningún campo al menú de Ordenar**, y esa restricción es la que
ordenó el diseño: el desempate no es un criterio que se elija, es la continuación
del criterio que lo trae.

### #319 — Ordenar por proyecto dejaba las tareas revueltas dentro del proyecto

En Mis Tareas, el criterio **Proyecto** comparaba únicamente el nombre del
proyecto. **Todas las tareas de un mismo proyecto empataban**, así que quedaban
en el orden en que venían armadas, con frentes y sub frentes intercalados. Y no
había forma de arreglarlo apilando criterios a mano: frente y sub frente no están
entre los campos ordenables.

**Ahora, dentro de cada proyecto, las tareas quedan agrupadas por frente y,
dentro de cada frente, por sub frente**, respetando el orden con el que están
armados —el mismo que se ve al entrar al proyecto—, **no el alfabético**.
Verificado con el caso que lo distingue: los frentes salen *Levantamiento ·
Diseño*, que es como están armados; alfabético sería al revés.

**El sentido acompaña a la flecha del Proyecto**, y lo que se apile después manda
**dentro del sub frente**. Tampoco se agregan campos al menú: *el caso real es
querer ver las tareas de cada proyecto en su orden natural, y eso no debería
exigir armar tres criterios.*

**Los dos cambios viven en un solo lugar.** Las reglas del menú se traducen antes
de comparar a la lista de comparaciones que de verdad se aplican
(`clavesDeOrden`): ahí Proyecto se despliega en tres y ahí se agrega el desempate
por replanificaciones al final. La tabla, la Gantt y Mis Tareas comparten esa
traducción, así que no pueden separarse.

### #329 — Los sub frentes desplegados quedaban pegados

La separación entre un sub frente y el siguiente era **8, siempre**, contraído o
desplegado. Ese valor lo fijó #306 al bajarlo de 26 a 8, para que los sub frentes
de un frente se leyeran como un grupo. **Contraído funciona.** Desplegado no:
entre la última fila de una tabla y el título del sub frente siguiente, 8 no
alcanza para separar dos piezas distintas.

**El desplegado pasa a separar 16** —`--aire-bloque`, el mismo valor único que
dejó #306c— y **el contraído sigue en 8**, que es lo que agrupa. Con uno
desplegado y el siguiente contraído manda el desplegado.

**Los 8 de más van como relleno y no como margen, y ahí está el detalle que
importa.** Los márgenes verticales de hermanos **colapsan** —toman el mayor, no
la suma— y el del último sub frente además **se escapa de su sección** y colapsa
con el `margin-top` que separa un frente del siguiente. *Medido: por eso la
separación entre frentes vale **16 y no 24**, que es lo que suponía el pedido.*
Subir este margen a 16 habría dejado la separación entre frentes **igual** a la
que hay entre dos sub frentes desplegados, y se habría perdido el contraste que
comunica la pertenencia — justo lo que el pedido pedía vigilar. El relleno vive
**dentro** de la caja, así que suma con el margen sin tocar ninguno de los dos
límites: la línea de "+ Sub Frente" sigue a 4 de su grupo (#306b) y la separación
entre frentes sigue valiendo lo que fijó #306c.

**Medido después:** con los sub frentes desplegados, **16** entre uno y otro
contra **49** hasta el frente siguiente; contraídos, **8** contra **41**. El
contraste se mantiene en los dos casos, así que no hizo falta tocar nada entre
frentes.

### #331 — Desde la barra lateral contraída no se podía ir a Mis Tareas ni a Resumen

Con la barra plegada, la franja de íconos tenía el botón de fijar, la campana de
notificaciones y un cuadrito de color por proyecto. **De las tres secciones fijas
de la barra desplegada —Notificaciones, Resumen y Mis Tareas— solo la campana
había llegado a la franja**, con #159.

**Ahora están las tres, en el mismo orden que arriba:** campana · Resumen · Mis
Tareas · proyectos. Llevan el nombre en globo al pasar el mouse, como la campana,
y **se marcan como activos** cuando se está en esa pantalla, como ya hacían los
cuadritos de proyecto.

**Los dos íconos son nuevos, y son los primeros del juego propio que no son de
una acción sobre una fila** — las otras diez lo son. Siguen la misma base: trazo,
`currentColor` y viewBox de 24, y se dibujan con el trazo de la campana, que es
su vecina en la franja.

- **Resumen:** tres barras verticales de distinta altura sobre una misma línea de
  base, la del medio la más alta.
- **Mis Tareas:** una lista de tres renglones con un visto **solo en el primero**.
  *El visto va solo ahí para que se lea como "cosas por hacer" y no como "todo
  terminado".*

La clase que daba forma al botón de la campana pasa a llamarse por lo que es
—`sidebar-mini__seccion`— porque ahora la comparten los tres.

### #332 — El responsable se veía descentrado en su columna

El selector de responsable es un botón que contiene el círculo con las iniciales
y, a su derecha, una flecha. La flecha está invisible en reposo **pero ocupaba su
lugar siempre**, así que al centrar el botón entero en la celda **el círculo
quedaba corrido a la izquierda** media flecha más su separación. Medido: **4**, en
la tabla y en la Gantt.

**La flecha sale del flujo**, el mismo recurso con el que #306 sacó el "+" de la
Gantt: el botón mide lo que mide el círculo, así que centrarlo lo centra de
verdad, y la flecha sigue apareciendo a su derecha al pasar el mouse **sin
moverlo**. Medido después: **1** de desvío —el redondeo del ancho impar de la
celda— en la tabla, en la Gantt y en Mis Tareas.

Sigue siendo **hija del botón**, así que un clic sobre ella sigue abriendo el
menú de responsables. En mobile la flecha no se dibuja y ahí ya estaba centrado.

**Verificado** los cinco con `docs/prueba-313-319-329-331-332.mjs`: **51
comprobaciones en verde**. De #313 no alcanza con comprobar que ascendente vaya
"en el sentido correcto" —el orden estable puede dejarlo bien por casualidad—,
así que se exige que la secuencia de ↻ dentro de cada estado **se dé vuelta** al
invertir la flecha, que es lo que no puede pasar por azar. De #319 se comprueba
que cada frente y cada sub frente aparezcan en **un solo tramo contiguo**, y que
el orden de los frentes sea el armado y **no** el alfabético. De #329 se miden
las separaciones como las ve el ojo —del final visible de un sub frente al título
del siguiente— y se exige que el contraste con la separación entre frentes se
mantenga. De #331, el orden de la franja, la navegación, el estado activo y que
los dos íconos midan, tracen y coloreen como la campana. De #332, el desvío del
círculo respecto del centro de su celda, con y sin mouse, en las cuatro vistas.

*Control negativo:* corrida contra `main`, **17 comprobaciones fallan**: el
desempate por ↻ no se invierte, los sub frentes salen intercalados *(Operacionales
· Comerciales · Financieros · Configuración · Arquitectura)*, la separación entre
sub frentes desplegados mide 8, la franja no tiene los dos botones, y el círculo
del responsable está a **4** del centro.

### #292 — Menú contextual con clic derecho sobre la tarea

**Las acciones sobre una tarea existían solo en la tabla**, en su columna de
acciones: Información, Archivar y Eliminar. **En la Gantt no había ninguna de las
tres** — ahí la fila tiene el ⓘ y el "+", y nada más—, así que **desde la Gantt
no se podía archivar ni eliminar una tarea**. Y renombrar no es un botón en
ninguna parte: es un gesto, el clic sobre el nombre.

**Ahora el clic derecho sobre una tarea abre un menú con sus acciones**, y la
columna de acciones se queda como está. **No se crea ninguna acción nueva ni
ningún permiso nuevo:** son las que ya existen, disponibles donde faltaban.

| Opción | Cuándo aparece |
|---|---|
| **Información** | **Siempre**, sin depender de permisos |
| **Renombrar** | Si puede editar esa tarea |
| **Archivar** | Si puede archivar o eliminar esa tarea |
| **Eliminar** | Si puede archivar o eliminar esa tarea |

**Qué opciones aparecen lo decide un solo lugar** (`opcionesDeTarea`), así que la
tabla y la Gantt no pueden separarse. Archivar y Eliminar piden **exactamente la
misma confirmación** que los botones de la columna, palabra por palabra: es la
misma acción, no una versión del menú. La prueba lo compara contra el texto que
muestra el botón, no contra una copia escrita a mano.

**Información no depende de ningún permiso, y eso cambia una cosa:** el menú
**siempre** se abre. Un usuario sin ningún permiso sobre tareas —al que la
columna de acciones ni siquiera se le muestra— ve el menú con **Información
sola**. Verificado con el cliente de demo, que tiene los permisos vacíos.

**Dónde se abre.** En la tabla, sobre **cualquier celda** de la fila. En la
Gantt, **solo sobre la celda del nombre**: sobre la grilla el clic derecho ya
significa marcar la tarea como lista y el izquierdo planifica, *y ese idioma no
se toca*. Sobre el frente, el sub frente y las filas de carga por persona no se
abre — el enganche va en la fila de la tarea, no en un selector genérico, porque
las filas de carga usan la misma celda congelada que el nombre.

**En el teléfono no existe.** Es un atajo de escritorio y no se agrega por
pulsación larga: ahí la columna de acciones sigue siendo el camino, tal como
está. El menú ni siquiera se abre bajo 768px, y una regla de CSS lo tapa como
cinturón de seguridad.

**El menú va en un portal, con `position: fixed`**, como la tarjeta flotante y
los globos de #327: nace dentro de una tabla con scroll y desde ahí cualquier
`overflow` lo recortaría. Se coloca donde está el cursor y **se corre solo si no
cabe** contra un borde; se cierra al elegir, al hacer clic fuera, con Escape y al
desplazar.

*Duplicar irá en este menú cuando se defina #273. **No entra ahora, ni siquiera
apagada:** una opción que no hace nada gasta la confianza del menú justo cuando
la persona lo está descubriendo.*

**En la tabla de Mis Tareas el menú va sin Renombrar.** Ahí el nombre **abre el
panel de detalle** y nunca fue editable —el gesto de renombrar no existe en esa
tabla—, así que ofrecerlo prometería algo que no pasaría. Su Gantt sí lo tiene,
porque ahí el nombre siempre se pudo editar. *Es la única diferencia entre las
tres vistas, y es la que ya existía.*

**Un defecto que encontró la prueba, y que valía por sí solo.** "Renombrar" abre
la edición con un **pulso**: un número que cambia y que la fila reconoce como
suyo. La primera versión dejaba ese pulso encendido, y una fila puede
**remontarse** por razones que no tienen nada que ver con renombrar — archivar
una tarea y restaurarla, por ejemplo—. La tarea restaurada volvía a la tabla
**con el nombre en modo edición sola**. El pulso ahora se **atiende una vez**: el
campo recuerda cuál ya trató, empezando por el que trae al montarse.

**El aspecto se corrigió antes de fusionar.** La primera versión funcionaba y
aparecía donde correspondía, pero **se veía pobre al lado del resto del
producto**. La vara es el **menú de Filtrar**, que ya existe y ya se ve bien —el
del responsable sirve igual: los dos ya coincidían entre sí—, y la forma de
igualarlo no fue copiar sus valores sino **compartir sus reglas**: fondo, borde,
esquina, sombra, relleno, tamaño y aire de cada opción, realce al pasar el mouse
y la animación corta de entrada salen ahora de las mismas declaraciones, así que
los dos menús **no pueden separarse** cuando alguno cambie. Lo único propio del
menú del clic derecho es dónde se ancla. *Medido: los ocho valores calculados de
la caja y los cinco de la opción coinciden exactamente.*

Además:

- **Cada opción lleva su ícono a la izquierda.** Los cuatro ya existían en el
  juego del producto y no hubo que crear ninguno — el de **información no se
  usaba en ninguna parte**—. Van al tamaño y con el trazo de su base común (16 y
  1.7) y toman el color del texto de su opción.
- **Una línea separa lo destructivo del resto:** arriba lo que abre o edita la
  tarea, abajo lo que la saca del plan. Se declara por el **cambio de bloque** y
  no como "una línea antes de Archivar", y esa diferencia importa: cuando el
  menú crezca —"Agregar tarea debajo", "Duplicar"— las nuevas entran arriba y la
  línea no se mueve de sitio. Tampoco aparece cuando no hay nada de un lado:
  verificado con **Información sola** (ninguna línea) y **sin Renombrar** (la
  línea sigue en su sitio, sin quedar suelta).
- **Eliminar se ve en el rojo de la paleta**, texto e ícono, por ser la única
  irreversible. **Archivar no:** se puede restaurar. El rojo es la variable del
  producto, que ya tiene su propio valor en modo oscuro — comprobado en los dos
  temas.

*Anotado y no corregido acá, como pidió el pedido:* la columna de acciones de la
tabla **no usa esos íconos**, dibuja los símbolos de texto ⓘ, ⤵ y 🗑. Es un
cambio aparte.

**Verificado** con `docs/prueba-292-menu-contextual.mjs`: **54 comprobaciones en
verde**. Recorre las cuatro opciones en la tabla y en la Gantt, que Información
abra el mismo panel que el ⓘ, que Renombrar deje el campo abierto con el nombre
puesto y que Enter guarde y Escape cancele, que Archivar y Eliminar pidan el
texto exacto del botón y hagan lo mismo, que el clic derecho sobre una marca
**siga marcando la tarea como lista sin abrir el menú**, que sobre una celda
vacía, el frente, el sub frente y las filas de carga no pase nada, que el menú se
vea entero abierto contra las cuatro esquinas, y que en mobile no aparezca y la
columna de acciones siga mostrando solo el ⓘ. De los permisos, los dos extremos:
un usuario sin ninguno ve **Información sola**, y uno con **solo** "marcar
hechas" —dado desde el modal de miembros dentro de la misma prueba— sigue viendo
Información sola, sin Archivar ni Eliminar.

*Dos controles negativos.* Contra `main`, **22 comprobaciones fallan**: no
existe ningún menú, así que ninguna de las opciones se puede elegir en ninguna de
las tres vistas. Y contra la **primera versión del menú** —la que se corrigió—,
**9 fallan**: la caja no comparte el aspecto de Filtrar (sin relleno, otra
sombra, sin animación), las opciones tampoco (otro relleno, sin esquina
redondeada, sin separación para el ícono), no hay ningún ícono, no hay línea
separadora, y Eliminar se ve del color del texto normal en los dos temas.

### #328 · #333 · #334 — El espacio de la fila de la Gantt, crear en su sitio con filtro puesto, y renombrar en Mis Tareas

#### #328 — El ⓘ sale de la fila de la Gantt, y "Agregar tarea debajo" entra al menú

La columna de tarea de la Gantt mide 240; el nombre disponía de **164**, y el
resto estaba reservado de forma permanente: 22 de aire para el asa de arrastre,
20 de márgenes y **44 para los dos botones y su separación** — botones que solo
aparecen al pasar el mouse.

**Y lo que eso costaba no eran letras: eran filas.** El nombre no se corta,
envuelve, así que cada nombre que no cabe sube el alto de su fila. En la Gantt la
altura es lo escaso: la grilla ocupa lo que sobra de pantalla y ahí se cuenta
cuántas tareas se ven de una vez.

**El ⓘ hacía lo mismo que el clic sobre el nombre** —abrir el panel—, y esa
función ya está en el menú del clic derecho, que llega a todos por igual: se va
de la fila. El **"+" se queda**, igual que hoy. *Medido sobre el mismo plan a
1440px: el nombre pasa de **164 a 184**, la grilla de **1048 a 1005px** con las
mismas 27 filas, y los nombres de más de una línea de **21 a 15**.* Quien no
puede crear tareas dispone de los **208 completos**: el envoltorio de acciones no
se dibuja si no hay nada dentro, así que tampoco paga su separación.

**El menú gana su quinta opción: "Agregar tarea debajo".** En la Gantt hace
exactamente lo mismo que el "+" de la fila —son dos caminos al mismo gesto—; en
la **tabla es una capacidad que no existía**, porque ahí solo se podía agregar al
final del sub frente con la línea "+ Tarea". Llega **sin agregar ningún botón a
la pantalla**. La fila de carga que se abre es la misma de siempre; lo que cambia
es que arranca abierta y **se cierra al guardar**: una inserción es para *esa*
posición, y encadenar debajo de ella diría otra cosa. La línea "+ Tarea" del
final sigue igual, y sí encadena.

*En Mis Tareas no aparece, en ninguna de sus dos vistas: ahí no se crean tareas.
Y la columna de acciones de la tabla no se toca — el ⓘ se queda.*

Insertar en el medio obliga a correr el orden de los hermanos posteriores, que es
editar tareas ajenas: por eso lo hace solo quien tiene control total, y el resto
crea al final. Esa regla vive ahora en **un solo lugar** (`lib/crear.ts`),
compartida por la tabla y la Gantt en vez de escrita dos veces.

#### #333 — Con un filtro puesto, lo que se crea aparecía fuera de su sitio

En la Gantt, el "+" de una fila crea un hermano justo debajo. **Con la vista
congelada eso dejaba de verse:** el elemento nuevo aparecía, pero no donde se lo
había creado.

**La causa:** con filtro y/u orden activo la vista queda congelada —una lista
fija de elementos en un orden fijo—, y **esa foto solo tiene posición para los
elementos que ya estaban cuando se tomó**. Al crear uno nuevo nadie lo ubicaba
dentro de ella, así que caía donde el render lo dejara: al final del bloque. El
arrastre sí lo resolvía —#293 dejó una forma de reubicar un elemento dentro de la
foto y la usa al soltar—; **al crear no se llamaba a nada equivalente**.

Ahora la tarea nueva **entra en la foto justo después de aquella sobre la que se
creó**, por ese mismo camino, y como el arrastre enciende "Actualizar vista". *El
orden guardado siempre fue el correcto: al recalcular la vista la tarea aparecía
en su lugar. Lo que faltaba era decírselo a la foto.*

**La foto se mueve solo si de verdad se insertó.** Quien no tiene control total
crea al final aunque haya pedido "debajo de esta"; mirando la intención en vez
del resultado, la foto la mostraba en el medio y el orden guardado la tenía al
final — el mismo desencuentro que este pedido viene a cerrar. Lo encontró la
prueba, en la corrida con permisos recortados.

**Los contenedores era otra cosa, y hubo que decirlo.** El pedido daba por hecho
que el frente y el sub frente nuevos aparecían fuera de sitio, como la tarea.
Medido: **no aparecían en ninguna parte**. Nacen vacíos, y con filtro puesto la
vista omite los contenedores sin coincidencias, así que el elemento nuevo no se
veía ni en su sitio ni fuera de él hasta quitar el filtro. Su *posición* nunca
estuvo mal —frentes y sub frentes se dibujan por su `orden` y no por la foto, que
es solo de tareas—: lo que faltaba era que se vieran. Se muestran por la misma
razón que la tarea recién creada, con "Actualizar vista" encendido.

*Alcance: la Gantt y la tabla. En la tabla el defecto no se podía provocar antes
—solo se creaba al final—, pero #328 le suma "Agregar tarea debajo" y con eso
empieza a insertar en el medio: entra cubierta desde el primer día.*

#### #334 — Renombrar desde el menú en la tabla de Mis Tareas

Dentro de Mis Tareas las dos vistas no se comportaban igual: en la Gantt el clic
sobre el nombre lo edita y el menú ofrece Renombrar; en la tabla el nombre es un
enlace que abre el panel de detalle, **nunca fue editable**, y por eso #292 dejó
Renombrar fuera de ese menú — ofrecerlo habría prometido algo que no ocurre.

Ahora **Renombrar aparece también ahí**, con la misma condición que en las demás
vistas: si la persona puede editar esa tarea. Al elegirlo el nombre queda en modo
edición **en su propia celda**; Enter guarda y Escape cancela, igual que en la
tabla de un proyecto. **El clic sobre el nombre no cambia: sigue abriendo el
panel.**

*Por qué así y no haciendo que el clic edite, como en la tabla de un proyecto: en
Mis Tareas el clic al panel es la puerta más directa al detalle en la única
pantalla donde no estás dentro de un proyecto, y cruzando proyectos es lo que más
se usa. Renombrar se gana sin perderla.* La edición es **la misma pieza**
(`InlineText`), no una copia: lo único que se agregó es poder dibujar otra cosa
en su estado de reposo. La Gantt de Mis Tareas no se toca.

#### Verificación

`docs/prueba-328-333-334.mjs` — **57 comprobaciones en verde**.

De #328: que la fila de la Gantt ya no tenga el ⓘ y sí el "+", los anchos medidos
de la celda (240 · 208 útiles · 24 reservados · 184 para el nombre), el alto
total de la grilla y cuántos nombres siguen ocupando más de una línea, que el
menú abra con las cinco opciones y una sola línea separadora, que Información
siga llevando al panel, que el clic sobre el nombre siga editando —o abriendo el
panel, sin permiso—, que el "+" y la opción del menú dejen la tarea en el mismo
lugar, que en la tabla la fila de carga se abra **justo debajo** y no encadene,
que "+ Tarea" siga dejando al final y sí encadene, que la columna de acciones
conserve sus tres botones, que Mis Tareas no ofrezca la opción en ninguna de sus
dos vistas, y que el asa de arrastre siga en su sitio.

De #333: los cuatro pasos del caso principal —crear entre la segunda y la
tercera con filtro puesto, "Actualizar vista" encendido, la posición intacta al
tocarlo y al quitar el filtro—, crear sobre la última visible, el sub frente y el
frente nuevos, crear dentro de un sub frente sin filas visibles, que sin filtro
ni orden todo siga igual, que el arrastre con la vista congelada no cambie, la
tabla con "Agregar tarea debajo" y filtro puesto, y el caso sin control total —
con el permiso de crear tareas dado desde el modal de miembros dentro de la misma
prueba—, donde la tarea queda al final con filtro y sin él.

De #334: que la opción aparezca, que abra la edición en la celda, que Enter
guarde y Escape cancele, que el nombre cambiado se vea igual en el proyecto de
esa tarea en sus dos vistas, que el clic sobre el nombre siga abriendo el panel y
no la edición, que sin permiso de editar la opción no aparezca, y que la línea
separadora siga quedando solo entre Renombrar y Archivar.

*Control negativo:* corrida contra `main`, **24 comprobaciones fallan** — entre
ellas la que muestra el defecto de #333 tal cual: creada entre la segunda y la
tercera con filtro puesto, la tarea sale **al final del bloque**.

**Dos pruebas anteriores cambian de contrato, y se actualizan en vez de
tolerarse.** La de #292 esperaba cuatro opciones y la línea entre Renombrar y
Archivar: ahora son cinco y la línea sigue **en el mismo sitio** —justo antes de
lo destructivo—, que es exactamente lo que se declaró al escribirla; y su caso de
la tabla de Mis Tareas pasa de "sin Renombrar" a "sin Agregar tarea debajo". La
de #327 comprobaba dónde vive el globo usando el ⓘ de la fila de la Gantt, que ya
no está: pasa a usar el "+", que tiene el mismo globo y sirve igual para lo que
se mide ahí —dónde se dibuja, no cuál de los dos lo dispara—.

### #273 — Duplicar tareas

**No se podía duplicar una tarea.** Para repetir una había que crearla de nuevo y
volver a escribir el título y el responsable a mano.

**El menú del clic derecho gana "Duplicar"**, en la tabla y en la Gantt. Va junto
a "Agregar tarea debajo" —las dos crean una tarea en esa misma posición— y lejos
de archivar y eliminar, que son lo contrario:

**Información · Renombrar · Agregar tarea debajo · Duplicar — Archivar · Eliminar**

*La línea separadora sigue sin moverse: se declaró por el cambio de bloque y no
como "antes de Archivar", justamente para que crecer no la corra de sitio.*

#### Duplicar es crear, no una acción aparte

Y por eso pasa por el **mismo camino** que "Agregar tarea debajo" (#328) en vez
de por uno propio: misma posición —justo debajo de la original, en su sub
frente—, mismo permiso —crear tareas, el del "+" de la Gantt—, misma foto
congelada (#333). No hay una segunda forma de crear una tarea que pueda
separarse de la primera.

De ahí salen dos cosas que no hubo que decidir aparte:

- **Sin control total la copia queda al final**, como cualquier otra creación de
  esa persona: insertar en el medio obliga a correr el orden de los hermanos, que
  es editar tareas ajenas.

**La copia aparece ya creada, con el mismo título que la original y sin ningún
campo abierto.** *Esta entrada se escribió con la copia naciendo en modo edición
para ajustar el nombre; el dueño lo cambió al verificarlo, y la corrección está
más abajo, en la entrada de #335 · #336 · #337 · #338. Lo demás de #273 quedó
como se describe acá.*

#### Qué se copia y qué no

| Se copia | No se copia |
|---|---|
| El título | **La fecha objetivo: la copia nace sin fecha** |
| El responsable | El historial de replanificaciones |
| El sub frente | Los comentarios |
| La descripción, si la tarea tiene | La marca de hecha y la de archivada |

**La copia nace limpia. No es una omisión, es la definición**, y por eso vive en
un solo lugar (`plantillaDe`, en `lib/crear.ts`) y no repartida por las dos
vistas: *el historial y los comentarios son registro de lo que pasó con la
original, no parte de qué es la tarea; y la fecha no se copia porque duplicar
suele significar "lo mismo, en otro momento", y planificarla es un clic — si se
copiara y ya estuviera vencida, **la copia nacería atrasada y ensuciaría los
contadores** por algo recién creado.*

*En **Mis Tareas** no aparece, en ninguna de sus dos vistas: ahí no se crean
tareas. Y sobre una tarea **archivada** no se plantea — las archivadas viven en
su propio bloque al pie del sub frente, como una lista de enlaces, y ese bloque
no tiene menú de clic derecho.*

**Un detalle que se cuidó a propósito.** La fila de carga guarda al perder el
foco, y salir con Escape desenfoca el campo. Con el campo vacío eso no se notaba
—no hay nada que crear—; con el título ya puesto, cancelar habría creado la copia
igual. El campo de la Gantt lleva ahora un cerrojo explícito para eso, y la
prueba lo comprueba en las dos vistas.

**Las cuatro llamadas del menú viajan juntas.** Con Duplicar serían siete
parámetros posicionales, tres de ellos `(() => void) | null` e indistinguibles
entre sí desde quien llama: pasan a un objeto con nombre (`AccionesMenu`).

#### Verificación

`docs/prueba-273-duplicar.mjs` — **37 comprobaciones en verde** *(la prueba se
actualizó con la corrección posterior: la copia aparece creada, sin campo)*.

Las seis opciones en su orden y una sola línea separadora; que la copia aparezca
con el mismo título y el mismo responsable, justo debajo, **sin ningún campo
abierto**, en la tabla y en la Gantt; que la copia no tenga fecha, ni color, ni
↻ ×N; que los contadores sumen una y la nueva caiga en
la categoría sin color; que duplicar una tarea hecha no deje la copia marcada.

De los comentarios y el historial se comprueban las dos caras —la copia sin
ninguno de los dos y la original con los suyos intactos—, leyendo el estado
guardado y también el panel, que es como lo mira una persona. La **descripción**
se comprueba inyectándola en el estado: el campo existe en la tarea y el panel lo
muestra, pero hoy no se escribe desde ninguna pantalla.

Y los permisos: sin el de crear tareas la opción **no aparece**; con él —pero sin
control total— **sí aparece**, y la copia queda al final. En Mis Tareas, tabla y
Gantt, no aparece. Con filtro puesto, la copia sale justo debajo de la original y
"Actualizar vista" queda encendido.

*Control negativo:* corrida contra `main`, **22 comprobaciones fallan** — no
existe la opción, así que no hay copia en ninguna vista, y la sección de
comentarios e historial se queda sin terreno donde correr.

**Dos pruebas anteriores cambian de contrato y se actualizan**, como en la tanda
anterior: la de #292 y la de #328 esperaban cinco opciones. Ahora son seis, y
**la línea separadora sigue en el mismo sitio** — es la segunda vez que el menú
crece sin moverla, que es exactamente para lo que se declaró por bloque.

Regresión en verde: #297, #298, #305/#305b, #305e, #306/#306b/#306c, #307, #310,
#311, #313, #318, #319, #320, #321, #322, #324, #326, #327, #328, #329, #331,
#332, #333, #334.

### #335 · #336 · #337 · #338, y tres correcciones sobre el menú de la tarea

*Cuatro cambios de pantalla y tres correcciones, independientes entre sí.
Ninguno toca la base ni lleva migración.*

#### Tres correcciones, levantadas al verificar en preview

**"Duplicar" pasa a decir "Duplicar tarea"** (#273), y **"Agregar tarea debajo"
pasa a decir "Agregar tarea abajo"** (#328) **en los dos sitios donde aparece**:
la opción del menú y la ayuda del "+" de la Gantt. Salen de dos lugares
distintos y decían lo mismo; tienen que seguir diciéndolo.

**Y la copia ya no nace en modo edición.** Al duplicar, la tarea nueva **aparece
ya creada**, con el mismo título que la original y **sin ningún campo abierto**.
*Esto revierte lo definido en #273, donde la copia nacía en edición para ajustar
el nombre sin inventar un "Copia de…". El dueño lo cambió al verificarlo.*
**Consecuencia declarada:** la copia queda con el mismo nombre que la original y
sin nada que la distinga en la lista; renombrarla es un paso aparte, desde el
clic sobre el nombre o desde el menú. *El resto de #273 no cambia: qué se copia
y qué no, que nace sin fecha, dónde queda y el permiso que exige.*

Con eso, duplicar deja de pasar por la fila de carga y crea directo — el mismo
camino que ya usaba al confirmar, extraído a una función que comparten las dos
vistas. Se fueron con ello el campo con texto inicial y su selección.

**Una duda que se midió antes de tocarla.** El campo de creación de la Gantt
guarda al perder el foco, y salir con Escape lo desenfoca: con un título escrito,
cancelar podía crear la tarea igual. Medido en la base: **no la creaba** —el
campo se desmonta antes de que su `onBlur` llegue a guardar—, así que no hacía
falta ningún cerrojo. La comprobación queda en la prueba para dejar constancia de
la garantía.

#### #335 — La fila bajo el mouse se resalta

**Nada indicaba sobre qué fila estaba el mouse**, ni en la tabla ni en la Gantt.
En la Gantt eso pesa más: la grilla es ancha, las filas son bajas y hay que
seguir una fila hacia la derecha por encima de decenas de columnas de día.

Dos señales a la vez: **un velo sobre toda la fila** —del doble del que el
producto ya usa al pasar el mouse por una opción de menú— y **una línea de
acento en el naranja de marca, a la izquierda**.

**El velo va POR ENCIMA del color de estado y nunca lo reemplaza.** Es una capa
de `background-image` sobre el `background-color` que la celda ya tiene, así que
una fila atrasada resaltada **se sigue leyendo roja**. Verde, ámbar, rojo y
morado son el corazón del producto. *Al triple, el rojo se va a gris rosado; por
eso el doble.*

El resaltado alcanza **la fila entera hasta el borde derecho de lo que se ve** —
en la Gantt, las columnas congeladas y todas las celdas de día—. La línea de
acento va en el borde izquierdo de la fila en la tabla, y en el de la celda del
nombre en la Gantt: las celdas de proyecto, frente y sub frente son combinadas
sobre todas sus tareas, así que la fila de una tarea empieza ahí. Queda un poco
más adentro que en la tabla y es el mismo lugar en todas las filas.

*No se resaltan las franjas de frente y sub frente ni las filas de carga por
persona: ahí no hay una fila que seguir. Y en el teléfono no aplica, porque no
hay mouse.*

#### #336 — "En horizonte visible" deja de sumar las tareas sin fecha

Mostraba las tareas con fecha dentro del horizonte **más todas las que no tienen
fecha**. No era un defecto: estaba escrito así en la regla y en la ayuda del
botón. Pero **era el único filtro de fecha que sumaba una categoría aparte** —
"Hoy", "Esta semana", "Próxima semana", "Este mes" y el rango fijo muestran solo
lo que cae en su rango.

Ahora **filtra solo por rango**. Y al dejar de ser la excepción, deja de
necesitar su propio caso en el motor del filtro: cae en el camino general, que ya
compara contra el rango y deja fuera lo que no tiene fecha salvo que se pida
"Sin fecha". *El motivo original era que las tareas sin planificar no quedaran
invisibles en la Gantt, pero "Sin fecha" ya existe como opción propia para
verlas, y desde #322 las opciones de fecha son excluyentes: si se quieren, se
piden.*

**Costo aceptado y declarado:** con este filtro puesto dejan de verse en la
grilla las tareas todavía sin planificar, que es donde uno las planifica. Se
recuperan quitando el filtro o cambiando a "Sin fecha". *Lo demás no cambia:
sigue derivando su rango del horizonte, sigue activándose solo desde la Gantt,
sigue filtrando también la tabla y sigue pudiendo apagarse desde las dos.*

#### #337 — Y existe también en Mis Tareas

Se excluía a propósito, con el motivo escrito en el código: *"cruza proyectos y
no tiene un horizonte único"*. **Eso dejó de ser cierto cuando Mis Tareas tuvo su
propia Gantt**, que tiene un horizonte —uno solo— con el mismo selector,
"Alrededor de hoy" y "Todas mis tareas".

Se comporta exactamente igual que en un proyecto: se activa solo desde la Gantt,
desde la tabla aparece apagada con su ayuda "Se activa desde la Gantt", filtra
las dos vistas, se desactiva desde cualquiera de ellas y es excluyente con las
demás opciones de fecha. Y respeta #336: deja fuera las tareas sin fecha.

*Con la condición fuera, `contexto` dejó de usarse en la barra de filtros y se
retiró: las vistas guardadas ya llegaban filtradas por su contexto desde quien
llama.*

#### #338 — En la Gantt de Mis Tareas, el clic en el nombre abre el detalle

Las dos vistas de Mis Tareas respondían distinto al mismo gesto: la tabla abría
el panel de detalle, la Gantt **editaba el nombre**. La Gantt lo había heredado
de compartir componente con la de un proyecto.

**Manda la tabla:** es la vista principal del módulo y la única que existe en
mobile. Y es el mismo criterio de #334 —en Mis Tareas el clic lleva al detalle y
renombrar se gana por el menú—; esto lo aplica a la otra vista. **No se pierde
nada:** Renombrar sigue en el menú y abre la edición en su celda. Es la **misma
pieza** (`InlineText`), con el enlace al panel dibujado en su estado de reposo —
el mismo mecanismo que #334 estrenó en la tabla. **En un proyecto no cambia
nada.**

#### Verificación

`docs/prueba-335-336-337-338.mjs` — **57 comprobaciones en verde**.

De **#335**: que el velo cubra todas las celdas de la fila y solo con el mouse
encima; que la línea naranja quede en el borde izquierdo de la fila en la tabla y
en el de la celda del nombre en la Gantt, **también en la primera fila de un
bloque**, que es la que lleva las celdas combinadas; que esas celdas combinadas y
las filas de carga **no** se resalten; que el velo mida el doble que el de una
opción de menú; que las cuatro categorías de color **conserven su fondo exacto**
al resaltarse; que solo una fila quede resaltada a la vez; que con la grilla
desplazada a lo ancho el resaltado acompañe; que en oscuro el velo **aclare** en
vez de oscurecer; y que en Mis Tareas, tabla y Gantt, se comporte igual.

De **#336**: que la tarea sin fecha desaparezca al activarlo y las de dentro del
horizonte se queden, que la ayuda ya no la mencione, que el selector de horizonte
siga disponible y el filtro lo siga, que la tabla muestre el mismo conjunto, y
que "Sin fecha" lo apague y las traiga de vuelta.

De **#337**: que la opción exista en Mis Tareas, deshabilitada desde la tabla con
su ayuda y activable desde la Gantt; que deje fuera las sin fecha; que siga al
horizonte de esa Gantt; que se pueda desactivar desde la tabla; que "Hoy" la
apague; y que una vista guardada con ella vuelva a cargarla.

De **#338**: que el clic abra el panel y no la edición, que la tarjeta flotante
siga apareciendo, que Renombrar siga en el menú con Enter y Escape, que la tabla
de Mis Tareas no cambie y que en un proyecto —tabla y Gantt— el clic siga
editando.

Y de las correcciones: los dos textos, el del menú y el del "+" de la Gantt; que
la copia aparezca creada sin ningún campo abierto, con el mismo título y justo
debajo; que su nombre se pueda editar con el clic como cualquier otra; y que lo
demás de duplicar siga igual.

*Control negativo:* corrida contra la base de la rama, **40 comprobaciones
fallan**.

**Cinco pruebas anteriores cambian de contrato y se actualizan.** Las de #292,
#328 y #273 llevaban los textos viejos del menú; la de #327 medía el globo del
"+" por su ayuda, que también cambió; y la de #305 comprobaba que "En horizonte
visible" **no** apareciera en Mis Tareas, que es justo lo que #337 revierte —
ahora comprueba que aparezca, y deshabilitada desde la tabla—. En la de #273,
además, los criterios 2 y 5 originales quedan revertidos por la corrección: el
nombre ya no llega en edición y no hay nada que cancelar con Escape.

Regresión en verde: #292, #297, #298, #305/#305b, #305e, #306/#306b/#306c,
#307, #310, #311, #313, #318, #319, #320, #321, #322, #324, #326, #327, #328,
#329, #331, #332, #333, #334.
