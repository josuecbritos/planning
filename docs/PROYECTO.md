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

**Los permisos son del proyecto de la tarea, no del que esté abierto (#243).**
El panel de detalle se abre también desde Mis Tareas y desde una notificación,
que cruzan proyectos: sus acciones se calculan con los permisos del proyecto **al
que pertenece esa tarea**. Antes usaba los del proyecto activo de la barra, así
que alguien con control total en A veía botones que no le corresponden al abrir
una tarea de B — y al revés, quien tenía permisos en B no los veía.

**Mis Tareas es para todos los roles (#254).** El cliente es ejecutor del plan
—se le asignan tareas, se le dan permisos sobre las suyas y se le notifica—, así
que también necesita verlas juntas; con tres o cuatro proyectos, entrar uno por
uno y filtrar a mano no es una forma razonable de saber qué le toca. Es la MISMA
pantalla, no una variante recortada: ya filtra por responsable dentro de los
proyectos donde uno es miembro, así que cada quien ve lo suyo. No le da permisos
nuevos a nadie: lo que se puede hacer sobre cada tarea sigue saliendo del acceso
a ese proyecto.

**Si la sesión deja de valer, se vuelve al login diciendo por qué (#244).** Dos
casos, dos mensajes: sesión inválida ("Tu sesión ha expirado. Vuelve a
ingresar.") y cuenta dada de baja ("Tu cuenta fue desactivada. Para volver a
activarla ponte en contacto con tu administrador."). Se distinguen preguntando
por el **estado** —hay sesión, existe el usuario, su perfil sigue activo—, nunca
leyendo el texto del error. Si esa consulta falla no hay evidencia de nada: se
muestra el error normal y **no se echa a nadie**.

**Ningún mensaje del login sale del servicio de autenticación (#252).** Cuatro
textos fijos, en español: credenciales incorrectas, cuenta desactivada,
demasiados intentos y fallo de conexión; lo que no cae en ninguno sale como un
genérico. Se clasifica por el **código de la respuesta**, no por su texto —que
viene en inglés y cambia entre versiones—. El de credenciales dice "correo o
contraseña" **sin precisar cuál falló**: decir que el correo no existe
permitiría averiguar quién tiene cuenta probando direcciones. El de cuenta
desactivada es literalmente la misma constante que el de #244.

## 4. Funcionalidades

**Estructura de trabajo:** Proyecto → Frentes → Sub Frentes → Tareas. CRUD
completo con creación y edición **inline** (sin formularios).

**Vistas:**
- **Tabla** (estilo Monday): estado, responsable, fechas, atraso, comentarios;
  filtros y orden guardables como "vista" por proyecto. **La vista guardada
  persiste** (#215): se entra en ella desde el desplegable, se ve cuál es, se
  marca con un asterisco si tiene cambios sin guardar y sobrevive a recargar.
  Salir de la pantalla —y cambiar de proyecto lo es— descarta todo lo no
  guardado: la regla queda sin excepciones, lo que se guardó explícitamente
  persiste y lo demás se descarta.
- **Gantt** (grilla tipo Excel): planificación por clics, horizonte configurable,
  filas de carga por persona, rastro de replanificaciones. (Oculta en mobile.)

**El filtro de fecha filtra y además fija el horizonte (#250).** Son dos efectos
que van juntos, no uno u otro: deja **las tareas** que cumplen el criterio —con
la misma regla que la tabla, así que ambas vistas muestran exactamente lo
mismo— y ajusta **los días** visibles de la Gantt a ese rango; si el filtro deja
las de esta semana, la ventana es esa semana. El bug era que en la Gantt hacía
solo lo segundo, y por eso "Hoy" mostraba tareas de cualquier día y hasta las
que no tienen fecha. Las opciones que no son una ventana temporal —"Sin fecha",
"Con fecha"— filtran sin tocar el horizonte, y "En horizonte visible" va al
revés: deriva su rango del horizonte en vez de definirlo.
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

**Al crear una tarea, la tarea aparece (#253).** Con un orden (o un filtro)
aplicado, la vista congelada dejaba fuera a la recién creada: salía el aviso
"↻ Actualizar vista" y nada más, y eso se lee como que la tarea no se guardó.
Ahora se fuerza su aparición con el **mismo mecanismo** que ya usaba la llegada
desde una notificación, con el aviso encendido. La lista **no se reordena sola**
—ese es el punto de la vista congelada—: la nueva entra al final de su sub
frente y todo lo demás se queda donde está hasta tocar "Actualizar vista", que
entonces recalcula y la manda a su lugar. Encadenando con Enter, todas aparecen.

**La fila de creación (#256/#259).** La fecha se pone con el botón
**"Planificar"**, la misma pieza que en una tarea sin fecha: planificar tiene
peso en este producto —queda registrado y moverlo después genera una
replanificación con historial—, y un campo `dd/mm/aaaa` suelto invitaba a poner
una fecha de pasada. Y la fila **hereda mientras se encadena, pero parte en
blanco al reabrirse**: guardar con Enter y seguir escribiendo conserva
responsable y fecha (cargar varias tareas de la misma persona para el mismo día
es un caso real), mientras que cerrarla —clic fuera, Escape, cambiar de
pantalla— y volver a abrirla con "+ Tarea" empieza de cero. Antes esos valores
sobrevivían al cierre y se asignaban tareas a alguien sin querer.

**Modelo de estados (derivado, no editable a mano):** cada tarea cae en una de
cinco categorías excluyentes — Hecha (verde), Pendiente (sin color), Pendiente
replanificada (ámbar), Atrasada (rojo), Atrasada replanificada (morado). El
usuario solo marca "hecha"; el resto sale de la fecha y del historial.

**La fecha de una tarea hecha no se edita (#245).** Vale en las **cuatro**
vistas —tabla, Mis Tareas, Gantt y panel de detalle—: mover la fecha de algo ya
cerrado reescribiría el registro de cuándo se comprometió, que es justamente el
diferenciador del producto. La regla vive en un solo lugar
(`puedeEditarFecha`), así que las cuatro no pueden volver a separarse. La fecha
sigue **a la vista**, como texto: lo que desaparece es el control, no el dato, y
quien podría editarla ve por qué ("La fecha de una tarea hecha no se edita.
Desmárcala para corregirla."). El check **sigue siendo reversible**: el camino
para corregir es desmarcar, cambiar la fecha y volver a marcar.

**"Hoy" se recalcula solo (#247).** Antes se fijaba al abrir la aplicación, así
que una pestaña que cruzaba la medianoche seguía calculando categorías, atrasos,
la columna de HOY de la Gantt y la fecha de "marcar hecha" con el día anterior.
Con sesiones que no expiran, tener la aplicación abierta varios días es un caso
real. Se revisa cada minuto y **al volver a la pestaña** (foco o
`visibilitychange`, el caso frecuente), y solo cambia el estado si el día
efectivamente cambió: no provoca renders de más ni interrumpe lo que se esté
haciendo. En modo Local la fecha es simulada y fija a propósito.

**Responsable = miembro del proyecto (#228/#229):** los candidatos a responsable
de una tarea son el **dueño y los usuarios activos con acceso**, sin excepción
por rol; los admins no miembros ya no entran. La regla vive en un único
`miembrosDeProyecto` que usan la tabla, la Gantt, el panel de detalle, la
creación de tareas y el filtro de Responsable. Es coherente con el resto: la
membresía gobierna la visibilidad, así que asignar a un no miembro dejaba
trabajo que su responsable no veía por ningún lado. Una tarea con responsable en
la base **nunca se muestra vacía**: si esa persona ya no es candidata se ve
**apagada**, con el motivo en el tooltip, y una **marca neutra «?»** cuando el
cliente no dispone de su ficha. No cambia ningún dato existente ni la base.

**Replanificación con historial:** mover una fecha que ya venció cuenta como
replanificación (↻ ×N) y deja rastro; mover una fecha futura es planificación
(sin rastro). La fecha original se conserva. Es el diferenciador del producto.

**Colaboración:** comentarios acumulables por tarea; todos los miembros comentan
siempre. Se puede etiquetar con `@` a gente **con acceso al proyecto** (la
mención se guarda por id, así sobrevive a un cambio de nombre) y el **autor**
puede editar lo suyo, con marca visible de editado. **No se borra** ninguno: el
hilo acompaña al registro de replanificaciones. Panel lateral de detalle con la
línea de tiempo.

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
nombre (#178/#189) — la lista de frentes contiene **solo frentes**. Cada frente
tiene su propio **⋯** con dos opciones, **Renombrar frente** y **Eliminar
frente** (#222): antes eran dos iconos sueltos que aparecían al pasar el mouse y
le quitaban ancho al nombre, partiéndolo en dos líneas y haciendo crecer la
fila. En escritorio ese ⋯ **no ocupa ancho**: sale del flujo y se monta sobre el
extremo derecho de la fila, con el fondo de la fila y un degradado que desvanece
el texto bajo él (#225). En el teléfono, donde está siempre visible, conserva su
lugar. En los dos casos el nombre —en una sola línea, con el completo en el
tooltip— dispone del mismo ancho con y sin el mouse encima, y la fila nunca
cambia de alto. Los frentes se alinean con el **cuadradito de color** del
proyecto, no con su texto: la sangría anterior no comunicaba jerarquía (36 vs
38px) y sí consumía ancho. Solo hay **un menú abierto a la vez**: abrir el de un
frente cierra el de un proyecto y viceversa. La barra mide 244px por defecto y
el usuario puede **ajustar su ancho arrastrando el borde derecho** (entre 244 y
400px, doble clic para restablecer; se recuerda por usuario, #226). Ni los
proyectos ni los frentes muestran contador de tareas (#188): la lista se navega
por color, nombre y jerarquía. Los contadores de **Administración** (usuarios y
proyectos activos) sí se conservan. El control de plegar la barra es un
**chevron doble**, no un pin: contrae, no ancla (#187). Con la barra contraída
se ve solo el del riel y, al desplegarse, solo el de la cabecera: nunca los dos
a la vez (#191).

**Notificaciones in-app (#137):** cuatro eventos — te asignaron, replanificaron
o comentaron una tarea tuya, y (desde #208) alguien te **mencionó** en un
comentario; nunca por acciones propias. Una sola notificación por persona y
comentario: si al responsable lo mencionan, gana el texto de la mención. Entrada en la barra
con contador naranja si hay sin leer; el panel emergente muestra las últimas,
marca todo como leído **al cerrarlo** (#156, para no perder de vista lo nuevo
mientras se lee), y el clic navega a la tarea (la **resalta** y abre su detalle;
si un filtro la excluye, permanece visible hasta navegar o "Actualizar vista",
#157/#158). El realce **no usa el fondo de la fila** —chocaba con el color de
categoría (verde/ámbar/rojo/morado), justo las que llegan por notificación—:
atenúa el resto de las filas y dibuja un **contorno naranja** alrededor de la
tarea, legible sobre cualquier categoría y en ambos temas (#186). Con la barra
contraída, una **campana fija** con el contador abre el mismo panel (#159). Las
genera la base, no el cliente. Si la tarea ya no existe —la borraron desde otra
sesión— el clic avisa **"Esta tarea ya no existe."** y la notificación sale de
la lista, en vez de no hacer nada (#246); borrar una tarea, un sub frente, un
frente o un proyecto se lleva por delante sus notificaciones en los dos
backends.

**Tiempo real (#255 la campana, #260 los datos).** Las notificaciones llegan
sin recargar —el contador sube solo, el panel se actualiza— y, desde #260,
también **lo que anuncian**: la tarea asignada aparece con su frente y su sub
frente, el comentario entra al hilo abierto, la replanificación trae su entrada
de historial, y el proyecto al que te agregan aparece en la barra. El criterio
que define el alcance, dado por el dueño: todo lo que genera notificaciones
debe poder verse sin recargar. Por eso el texto de la notificación muestra el
nombre de la tarea y el clic lleva a ella sin recargar — y "Esta tarea ya no
existe" vuelve a significar exactamente eso. Sin destello ni aviso emergente, a
propósito: las notificaciones de este producto son pocas y de alta señal. Tres
principios rigen la implementación:

1. **El canal avisa; la verdad se relee de la base.** Los eventos perdidos no
   se recuperan, así que nunca son fuente de verdad: cada aviso —de cualquier
   tabla—, la reconexión y el despertar de la pestaña disparan la misma
   relectura completa, cuyo resultado reemplaza el estado. El eco desaparece
   por construcción, y la relectura única garantiza coherencia: la campana
   nunca anuncia una tarea que el navegador no tenga.
2. **Degradación silenciosa.** Si el canal no conecta, la aplicación funciona
   exactamente como antes —todo al recargar— sin ningún error visible.
3. **La cañería es una sola** (`data/tiempoReal.ts`): conexión, reconexión y
   semántica de los avisos viven ahí, y las tablas se suscriben. La entrega 2
   sumó las suyas a ese módulo, sin tocarlo.

**Cómo conviven los cambios ajenos con el trabajo en curso (#260):** pasan por
la **vista congelada**, igual que los propios — con filtro u orden aplicados
nada se reordena solo; se enciende "↻ Actualizar vista" y una tarea ajena
nueva se fuerza a aparecer como una propia (#253). **Un cambio ajeno no pisa
lo que se está escribiendo**: los borradores viven como estado local de sus
componentes y el fondo se actualiza sin interrumpirlos (al guardar, gana el
último en guardar). Y si te **quitan el acceso** al proyecto que miras —o lo
archivan o eliminan—, la aplicación te lleva al **Resumen**, sin error; el
"peek" desde una notificación se respeta.

El canal respeta la RLS del suscriptor (es el punto crítico: a nadie le llega
lo que no le corresponde — invariante 20 de `SEGURIDAD.md`; en las tablas de
datos la barrera es la membresía, sin filtro de servidor). `usuario` queda
fuera a sabiendas —un cambio de nombre se ve al recargar— y el modo Local
sigue sin tiempo real.

**Baja de usuarios (#136):** eliminar = desactivar + invisible (sin borrado
físico, para no huérfanar el historial). Dar de alta el mismo correo reactiva la
fila y recupera sus accesos.

**Miembros:** el dueño ve quién está asignado (no sus permisos) e invita/config.
según sus permisos.

**Alta por invitación:** el admin (o un consultor con permiso, para clientes de
sus proyectos) crea al usuario y **en el mismo acto se le envía** el correo con
el enlace (caduca a 7 días, un solo uso). La persona define su contraseña y
entra. Antes crear y enviar eran dos pasos y la interfaz prometía lo contrario
—el botón dice "+ Cliente" y la pantalla vacía, "Invita a alguien"—: se creaba
el usuario, se creía haber invitado y la persona nunca se enteraba (#257). El
sobre ✉ se conserva para **reenviar**, que sigue haciendo falta porque la
invitación caduca. Si la creación funciona pero el envío falla, el usuario queda
creado y se dice que la invitación no salió y que se reintenta con el sobre.

**Recuperar contraseña:** desde el login, con un enlace propio de 1 hora y un
solo uso que cierra todas las sesiones al usarse. Solo para usuarios activos con
cuenta ya creada; no es una vía para crear cuentas (el registro público sigue
apagado). Define la contraseña en la misma pantalla que la invitación.

**Cuenta propia:** cada usuario cambia su nombre, sus iniciales y su contraseña
desde el pie de la barra lateral. El correo, el rol y el estado los gestiona el
admin — la barrera no es la interfaz sino un trigger en la base.

**Comentarios:** hilo por tarea con menciones `@` acotadas a quienes tienen
acceso al proyecto (una sola notificación por persona y comentario). El autor
puede editar lo suyo, con marca de editado; nadie borra: el hilo acompaña al
registro de replanificaciones.

**Otros:** archivo de canceladas, tema claro/oscuro (sigue el sistema, con
override manual persistente por usuario), diseño responsive (mobile prioriza
Tabla y Mis Tareas; los modales altos, el panel de notificaciones y el menú ⋯
tienen tratamiento propio en pantalla angosta) e iconos de acción como SVG, no
como glifos del sistema.

**Regla de color del tema (#230–#232):** el color se declara siempre, nunca se
hereda por accidente del navegador. Los `<button>` no heredan el color del texto
—la regla base los pone en `inherit`— y todo campo de formulario fija su
`color` y su `background` de tema. Las zonas que son **oscuras en los dos
temas** —barra lateral, globos de tooltip, tarjeta flotante de la Gantt— usan
colores fijos **a propósito** y no deben "corregirse" a variables de tema; para
eso la barra lateral tiene su propia `--sidebar-acento`. Una variable
inexistente invalida la declaración completa: `var()` sin respaldo no cae al
valor por defecto del navegador, cae al inicial (un `border` así desaparece).

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
- **Edge Functions (Deno):** `invitar-usuario`, `aceptar-invitacion` y
  `recuperar-contrasena` (correo via Resend). Secretos solo server-side. CORS
  por lista de orígenes: si no hay ninguno configurado la función **rechaza** la
  petición en vez de abrirse a cualquiera. Los errores internos se registran en
  el servidor y al cliente le llega un mensaje genérico en español (#249). Se
  despliegan a mano desde el dashboard (no hay CLI en este proyecto).
- **Tiempo real:** Supabase Realtime sobre la publicación `supabase_realtime`
  (`notificacion` desde #255 y las siete tablas de datos desde #260; `usuario`
  queda fuera a sabiendas). Una sola cañería en el cliente
  (`data/tiempoReal.ts`); los eventos son avisos de releer, nunca datos, y la
  relectura es una sola y completa — la notificación y su tarea llegan juntas.
- **Despliegue:** Vercel (frontend estático + `vercel.json` con headers de
  seguridad). Migraciones en `supabase/migrations/`, aplicadas desde el dashboard.

## 6. Estado y roadmap

- **Estado:** desplegado, con roles/permisos y alta por correo; auditoría de
  seguridad cerrada y validada (compuerta 34/34). Listo para usuarios reales tras
  el runbook de seguridad. La auditoría de estado (#233) derivó en dos entregas
  de correcciones: las simples (#234–#242, #251) y las complejas (#243–#249),
  estas últimas con la **migración 19** —hay que aplicarla y volver a correr la
  compuerta— y el **redeploy manual de las tres Edge Functions**.
- **Pendientes no bloqueantes** (ver `SEGURIDAD.md` §6): features de plan Pro de
  Supabase (Leaked Password Protection, backups automáticos) y la actualización a
  Vite 8 (solo toolchain de desarrollo).

## 7. Mapa de documentos

| Documento | Para qué |
| --- | --- |
| `PROYECTO.md` (este) | Visión general y estado actual. |
| `documento-funcional-v3.1.md` | Especificación funcional detallada (incluye historia de decisiones). |
| `README.md` | Uso y desarrollo: qué es, cómo se levanta, cómo se despliega, estructura del código y migraciones. |
| `CHANGELOG.md` | Crónica de lo construido, solicitud por solicitud (#235: salió del README, que la había acumulado hasta las 600 líneas). |
| `SEGURIDAD.md` | Invariantes de seguridad — leer antes de tocar RLS/auth/deploy. |
| `auditoria-seguridad.md` | Informe de la auditoría (hallazgos por gravedad). |
| `runbook-seguridad.md` | Pasos para aplicar las correcciones de seguridad. |
| `diagnostico-mobile.md` | Estado de la vista mobile medido en 390×844, plan de mejoras y su resolución (#194–#203). |
| `DEPLOY.md` | Despliegue (Supabase, Vercel, Resend, Edge Functions). |
