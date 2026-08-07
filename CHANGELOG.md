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
registra; desplanificar una de mañana no da error.

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
