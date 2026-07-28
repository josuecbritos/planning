# Planificador de Proyectos (Documento Funcional v3.1)

Herramienta de planificación de proyectos con gestión interna y visibilidad
controlada al cliente. Implementa las vistas **Tabla** (tipo Monday) y **Gantt**
(grilla tipo Excel) con la lógica de estados derivados y colores de la sección 6
del Documento Funcional, el **CRUD** completo sobre **Supabase** (Fase 1),
**tres roles (Admin / Consultor / Cliente) con principio dueño vs invitado y
acceso por proyecto** (Fase 2, Módulo 1), el **pulido de la Fase 3** (Mis
Tareas, panel lateral de detalle, archivo de canceladas e indicadores por
proyecto) y los módulos de escritorio posteriores: **Administración →
Proyectos**, **Usuarios** con alta por invitación y **notificaciones in-app**.

> **Documentación:** la **fuente de verdad del estado actual** es
> [`docs/PROYECTO.md`](docs/PROYECTO.md) (contexto, objetivos, roles,
> funcionalidades y arquitectura); este README cubre uso y desarrollo. El
> `docs/documento-funcional-v3.1.md` es **histórico** (modelo anterior de 2
> roles / 4 estados). Antes de tocar RLS, permisos, Edge Functions de auth o el
> despliegue, leer [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) (invariantes que no
> se deben romper).

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
En modo Local es un selector "entrar como…" con los usuarios del seed (2 admins,
1 consultor con proyecto propio y 1 cliente), para demostrar los roles sin backend.

## Ejecutar

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm run typecheck  # solo chequeo de tipos (tsc -b --noEmit)
npm run build      # typecheck + build de producción
npm run preview    # sirve el build
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
  específico se usa el filtro de fechas con rango fijo, que define el horizonte.
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
  además del Limpiar global. En la tabla filtran filas; en la Gantt, responsable y estado filtran
  tareas y **la fecha define el horizonte visible** — con la excepción de **Sin
  fecha**, que en la Gantt filtra (muestra solo las tareas sin fecha, como filas
  sin marca, planificables ahí mismo) sin tocar el horizonte, y de **Con fecha**
  (abajo). En la tabla, los
  filtros quedan **fijos arriba** al hacer scroll y los encabezados de columna se
  congelan justo debajo. Los desplegables de filtro se muestran **por encima del
  contenedor** (no se recortan aunque la tabla sea corta, p. ej. en Mis Tareas).
- **"Con fecha"** (#223 — opción del filtro de Fecha, justo encima de "Sin
  fecha"): muestra **solo las tareas que tienen Fecha Objetivo**, cualquiera sea.
  Es **excluyente** dentro del campo: activarla apaga cualquier otra opción de
  fecha —incluida "Sin fecha"— y elegir otra la apaga a ella; nunca quedan dos
  encendidas. Sumarla a "Esta semana" anularía esa opción (todo lo de esta semana
  ya tiene fecha) y sumarla a "Sin fecha" equivaldría a no filtrar. Volver a
  tocarla la desactiva. **Filtra filas en las dos vistas** (en la Gantt también
  esconde las tareas sin fecha) pero **no define el horizonte**: el selector
  "Alrededor de hoy" / "Todo el proyecto" sigue disponible y no aparece el aviso
  "Horizonte definido por el filtro de fecha". Está en las vistas de proyecto y en
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
- `supabase/migrations/20260707000004_fix_rls_insert_proyecto.sql` — fix: el
  `INSERT … RETURNING` de proyecto violaba RLS porque la política de SELECT
  dependía de una función que consulta la propia tabla con el snapshot previo
  al insert; se reescriben las políticas con expresión directa.
- `supabase/migrations/20260707000005_comentarios.sql` — tabla `comentario`
  (hilo acumulable por tarea, append-only; leen todos los que ven la tarea).
  Migra el texto legado de `tarea.comentarios`. _(La 12 amplía el comentar a
  todos los miembros, no solo admins.)_
- `supabase/migrations/20260707000006_estados_y_fechas.sql` — fechas opcionales
  (la tarea nace sin fecha; la primera fija `fecha_original` sin historial) y
  anclaje de toda fecha al día hábil más cercano, ambos como triggers.
- `…_000007_estados_v2.sql` a `…_000011_desplanificar_deshace.sql` — modelo de
  estados v2 (replan solo si la fecha vencía; se **permiten** fines de semana,
  reemplaza el anclaje de la 6), permisos por cliente (jsonb + RLS), tabla de
  invitaciones (token 7 días), estándar de planificación por clics y RPC
  `desplanificar_tarea` (deshace la última replanificación).
- `supabase/migrations/20260707000012_roles_y_permisos.sql` — **reestructuración
  de roles**: rol `consultor` y fin del límite de 2 admins; dueño de proyecto
  (`creado_por`, con backfill al admin creador); `acceso_cliente_proyecto` →
  `acceso_proyecto` con `permisos` jsonb POR ACCESO (backfill desde
  `usuario.permisos`: los clientes demo conservan su configuración);
  `usuario.permisos_proyecto` para consultores; defaults por rol vía triggers;
  y **RLS reescrita completa** (dueño vs invitado). Corrige de paso el
  historial de replanificaciones para invitados (trigger security definer) y
  habilita comentar a todos los miembros. **Aplicar con el runbook de arriba.**
- `supabase/migrations/20260707000013_fix_replan_fecha_origen.sql` — fix §1
  post-validación: restaura la guardia `old.fecha_objetivo <= current_date` en
  `registrar_replanificacion` (perdida al pasarla a security definer en la 12).
  La replanificación se evalúa sobre la fecha de **origen**: mover una fecha
  futura es planificación (sin ↻), no replanificación.
- `supabase/migrations/20260707000014_seguridad_auth_y_historial.sql` y
  `…20260707000015_seguridad_exposicion_y_execute.sql` — **correcciones de
  seguridad post-auditoría**: enlace auth↔usuario atado a invitación usada
  (defensa C1), autor del historial derivado de la sesión (M1), `search_path`
  fijo (L1), `acceso_select` acotada + vista `usuario_visible` que enmascara
  email/permisos (M2), y `revoke execute` de funciones internas sin romper la
  RLS (L2/L3). **Aplicar con `docs/runbook-seguridad.md`.**
- `supabase/migrations/20260707000016_mejoras_desktop.sql` — proyecto
  activo/archivado con gate por permiso; `usuario.eliminado` + vista
  `usuario_visible` que lo filtra + RPC `crear_o_reactivar_usuario`; tabla
  `notificacion` + RLS por dueño + triggers que la generan (asignación /
  replanificación / comentario, nunca por acción propia).
- `supabase/migrations/20260707000017_delete_solo_archivado.sql` — endurece
  `proyecto_delete`: solo se elimina un proyecto **archivado** (la regla
  "archivar primero" pasa de la UI a la base).

> La lista **completa y ordenada** de migraciones (1→17), lista para pegar en el
> SQL Editor, está en [`DEPLOY.md`](DEPLOY.md) (Paso 2).

Para crear los usuarios en Supabase Auth: panel → Authentication → Add user (con el
mismo email que registraste en el Módulo de Usuarios).
**Importante (seguridad, migración 14):** el enlace auth↔usuario exige una
invitación **usada**; el flujo normal es invitar desde el Módulo de Usuarios y que
la persona active su cuenta por el enlace del correo. Para el **primer admin** de
una instalación nueva (sin invitación) hay que enlazar su `auth_id` manualmente
por SQL — el procedimiento exacto (bootstrap) está en [`DEPLOY.md`](DEPLOY.md)
Paso 3.

## Estructura

```
src/
  types.ts               Modelo de datos (sección 5)
  lib/
    dates.ts             Días hábiles y formato
    derive.ts            Estados derivados, colores y marcas (sección 6)
    password.ts          Política de contraseña, compartida por los dos flujos (#204)
    vistas.ts            Vista guardada activa y su persistencia (#215)
    errores.ts           Traducción de fallos de red a lenguaje humano (#210)
    menciones.ts         Menciones @ en comentarios: marcador por id (#208)
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
    vistaCongelada.ts    "Foto" de filas visibles + orden (P1)
    filtros.ts / orden.ts  Filtrado y orden multinivel
    permisos.ts          makeCan + dueño/invitado (espejo de la RLS)
  components/
    Sidebar, Header, TableView, GanttView, MisTareasView, ResumenView,
    TaskPanel, TaskDetail, FiltrosBar, FechaEditable, RespPicker,
    AdminProyectosView, ProyectoModal, MiembrosModal, UsersView,
    UsuarioModal, PermisosModal, PermisosProyectoModal, Notificaciones,
    LoginPage, DefinirPassword, ConfiguracionView, NombreTocable,
    CampoPassword, Modal, TextPromptModal, …
    Iconos.tsx           Iconos de acción como SVG de trazo (#203)
supabase/
  migrations/            18 migraciones (1→18). Lista ordenada en DEPLOY.md.
  functions/             Edge Functions (Deno): invitar-usuario, aceptar-invitacion,
                         recuperar-contrasena
  seed.sql               Datos de arranque (opcional)
scripts/
  validar-rls.mjs        Compuerta de RLS (rol por rol contra la API)
docs/
  PROYECTO.md            Fuente de verdad del estado actual
  SEGURIDAD.md           Invariantes de seguridad (leer antes de tocar RLS/auth)
  runbook-seguridad.md / auditoria-seguridad.md
  documento-funcional-v3.1.md  (histórico)
```

## Roadmap (sección 9)

- **Fase 1 — Uso interno:** ✅ base de datos + CRUD + las dos vistas. Sin login.
- **Fase 2 — Clientes:** ✅ login, roles admin/cliente, asignación de proyectos por
  cliente, RLS real (Módulo 1).
- **Fase 3 — Pulido:** ✅ Mis Tareas (Módulo 3), panel lateral de detalle, archivo de
  canceladas, indicadores por proyecto.

Con esto, el alcance de la Versión 1 del Documento Funcional v3.1 está completo.
Siguiente hito: **despliegue** — la guía paso a paso está en [DEPLOY.md](DEPLOY.md).

## Stack

Vite + React + TypeScript + Supabase (Postgres + Auth + RLS). Pensado para desplegar en
Vercel/Netlify (capa gratuita), con costo de operación cercano a cero.
