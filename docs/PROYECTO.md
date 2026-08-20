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

**"Hoy" es el día de Chile, para la aplicación y para la base (#291).** El
navegador siempre usó la hora local; la base usaba `current_date`, que en
Supabase es UTC, así que desde las 20:00 de Chile creía que era el día
siguiente: una tarea de MAÑANA le parecía comprometida y su movimiento quedaba
registrado como replanificación falsa —además de congelar una fecha original
que nunca existió y de impedir desplanificarla—. Desde la migración 27 las
cuatro comparaciones de la base pasan por `hoy_chile()`, un único lugar que usa
la zona por **nombre** (`America/Santiago`) y resuelve solo el cambio de hora.
Lo que se compara cambió; **cómo se guardan las fechas no**: siguen siendo días
sin hora, y la regla de que solo cuenta como replanificación mover una tarea
comprometida queda entera — ahora se aplica bien.

*Lo que quedó escrito antes de la corrección no se tocó:* medido el
31-jul-2026, el historial tenía **2 replanificaciones falsas sobre 16**, y se
decidió dejarlas. Consecuencia a tener presente: esas 2 tareas arrastran una
fecha original que nunca fue un compromiso y por eso muestran un **atraso mayor
al real**; no se corrige sola, porque la fecha original solo se rehace mientras
la tarea no tenga replanificaciones. Cuáles son se puede volver a consultar con
`docs/consulta-291-replanificaciones-falsas.sql`.

**Archivar PAUSA y se deshace; eliminar CORTA (#301).** Eran casi lo mismo:
eliminar solo marcaba la fila, así que la persona conservaba cuenta de acceso,
perfil y proyectos —y al dar de alta ese correo otra vez volvía con el perfil
anterior y sin invitación—. Ahora **archivar** conserva todo y se revierte (al
reactivar entra con su misma contraseña, su mismo perfil y sus mismos
proyectos), y **eliminar** revoca la cuenta de acceso, suelta los accesos a
proyectos y vacía el perfil: dar de alta ese correo otra vez es un **alta
nueva**, con el perfil que se elija, sin proyectos heredados y con su
invitación. La revocación de la cuenta la hace la Edge Function
`eliminar-usuario` (Admin API): tocar `auth.users` por SQL sería saltarse el
sistema de autenticación. Lo que NO cambia: las tareas asignadas se conservan
en los dos casos con las iniciales apagadas (#229), y el nombre en comentarios
e historial no se toca nunca — eso es registro, y por eso la fila del usuario
se conserva. *Consecuencia aceptada: un correo eliminado que vuelve reutiliza
esa fila y recupera sus tareas si se le devuelve el acceso al proyecto.*

**El perfil se corrige entre consultor y cliente (#300).** Un admin lo cambia
**desde el formulario de editar usuario** (#303), junto al nombre y las
iniciales — la columna Rol solo lo muestra. Todo se aplica al Guardar y
Cancelar descarta todo; como el perfil y el nombre no viajan por el mismo
camino, el guardado va primero por el perfil: si la base lo rechaza no se
aplica ningún otro cambio. El campo aparece solo cuando el cambio es posible;
si no, el perfil se muestra como dato — porque **nadie cambia el suyo** y el de
administrador **queda fuera en los dos sentidos** (no se promueve ni se degrada
desde ahí, para no poder quedarse sin ningún administrador). A consultor conserva sus accesos
con los mismos permisos y suma los de consultor por defecto; a cliente los
pierde, y **si es dueño de algún proyecto el cambio se bloquea** diciendo
cuántos — el traspaso de proyectos no existe todavía (#302). La restricción
vive en la base: la RPC `cambiar_rol_usuario` y un trigger que rechaza
cualquier UPDATE directo de `rol`.

**Eliminar un usuario es un borrado LÓGICO y va por RPC (#136/#286).** Eliminar
marca `activo = false` y `eliminado = true`: la persona desaparece de la
interfaz —eliminado es distinto de desactivado: no reaparece ni con "ver
desactivados"—. Desde #301 marca además `auth_id = null`, suelta los accesos y
vacía `permisos_proyecto`: dar de alta ese correo otra vez es un alta nueva,
no una recuperación (ver arriba).
Va por la RPC `eliminar_usuario` (admin, comprobado en la base) y no por un
UPDATE directo, porque PostgreSQL aplica las políticas de SELECT como WITH
CHECK sobre la fila nueva de un UPDATE: como la política exige `not
eliminado`, marcar la fila como eliminada se rechazaba a sí misma. Es el mismo
patrón que la operación inversa, `crear_o_reactivar_usuario`. El borrado
DEFINITIVO (#258) sigue sin definirse: tareas, comentarios, historial y
accesos de la persona se conservan (los accesos, desde #301, ya no).

**Los permisos son del proyecto de la tarea, no del que esté abierto (#243).**
Las acciones sobre una tarea se calculan con los permisos del proyecto **al que
pertenece esa tarea**, no con los del proyecto activo de la barra: si no,
alguien con control total en A vería botones que no le corresponden al abrir una
tarea de B — y al revés. La regla nació por el panel de detalle, que se abre
también desde Mis Tareas y desde una notificación; **desde #307 el panel ya no
tiene acciones ni permisos**, así que hoy quien la aplica es Mis Tareas, que
arma su `makeCan` por tarea.

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
muestra el error normal y **no se echa a nadie**. Un **cerrojo de salida**
(#282) evita que el "Salir" voluntario muestre el aviso de expiración: se
levanta al iniciar cualquier salida y solo se rearma al volver a entrar, así
las señales duplicadas del servicio o una acción en vuelo que falla durante el
logout no avisan de más. El diagnóstico completo —incluidos los casos que
quedaron como decisión de producto— está en
[`docs/diagnostico-282-sesion-expirada.md`](diagnostico-282-sesion-expirada.md).

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
  persiste y lo demás se descarta. **Las vistas viven en la base (#289)**,
  atadas al usuario y al contexto (cada proyecto por su lado, Mis Tareas por
  el suyo), y **siguen a la persona a cualquier computador**; cada quien ve
  solo las suyas, ni siquiera un admin ve las ajenas. Viajan con el resto del
  estado al abrir la aplicación, no se leen al abrir el desplegable. Lo que
  SIGUE siendo de cada máquina, a propósito: **en qué vista estabas** —entrar
  desde un computador nuevo abre limpio, con todas las vistas disponibles—,
  el tema y el modo/ancho de la barra lateral.
  **La jerarquía se marca con peso y proximidad, no con marcos ni sangría
  (#306).** El hijo tenía más presencia que el padre: el frente era texto de 15
  en negrita **sin fondo** y el sub frente texto de 13.5 en la **misma**
  negrita, con fondo y con borde, así que el frente se leía como un rótulo
  suelto sobre unas cajas que no parecían suyas. Ahora el **frente sube de
  peso** —más grande y por encima del sub frente— y lleva al lado, en gris y
  chico, **cuántos sub frentes tiene** (no cuántas tareas: esa cuenta ya
  aparece en varios lugares). El **sub frente pierde la negrita**; su caja, su
  fondo y su borde no se tocan. Y el **aire se reordena**: entre sub frentes
  del mismo frente baja de 26 a 8, y la separación grande (16) queda solo entre
  un frente y el siguiente. **Ese contraste es lo que comunica la
  pertenencia.** De paso se recupera pantalla: con los sub frentes cerrados el
  contenido pasó de **600 a 412** de alto, y ese es justo el estado en que uno
  abre la pantalla para orientarse. **"+ Sub Frente"** deja de ser una fila de
  unos 60 y pasa a ser una **línea chica y gris** pegada debajo del último —
  salvo cuando el frente **no tiene ninguno**, donde **sigue siendo un botón**:
  es el momento más importante y la única acción posible, y ahí tiene que
  pesar. La línea "Sin sub frentes en este frente" se mantiene junto a él. Esa
  línea va **pegada al último sub frente** (4 contra los 16 que la separan del
  frente siguiente): así cierra su grupo en vez de leerse como un elemento más
  de la lista, que era lo que hacía que la separación entre frentes se viera
  mucho mayor de lo que es. **Con el frente plegado, su título queda centrado
  entre la línea de arriba y la suya de abajo (#306c)**, y sale por
  construcción: el mismo 16 de un lado y del otro, no dos números ajustados
  para que coincidan.

  **El nombre de la tarea pesa lo mismo que lo que lo contiene (#326).** Iba en
  semi negrita (600) y su sub frente en 500 —perdió la negrita en #306, a
  propósito—, así que el hijo se leía **más pesado que su propio contenedor**.
  Queda en **500, el mismo peso que su sub frente**, en la tabla, en la Gantt y
  en Mis Tareas. *Igualarlos, y no dejarlo por debajo, es lo que resuelve el
  problema sin costar legibilidad: bajarlo a peso normal se probó y se fue un
  escalón de más — los nombres costaban de leer.* El **tamaño** de la letra no
  cambia en ninguna vista. El **visto verde** y la marca **↻ ×N** llevan peso
  propio y no cambian, y el campo de edición hereda el de la celda, así que el
  texto **no cambia de grosor** al entrar y salir de edición. De paso, **"+ Sub
  Frente" se iguala al peso de "+ Tarea"**: son la misma acción y una era línea
  normal mientras la otra era botón fantasma en 600.

  **Se pueden crear tareas con el filtro puesto (#320).** La fila de "+ Tarea"
  estaba escondida al filtrar, por un problema real —una tarea recién creada
  puede no cumplir el filtro y desaparecer en el mismo momento en que la
  creas—, pero la Gantt ya resolvía ese problema en vez de esconder la acción,
  así que el mismo proyecto con el mismo filtro se comportaba al revés según la
  vista. Ahora la tabla usa el mismo remedio, que ya vivía ahí para la foto
  congelada: la recién creada **se queda a la vista** aunque no cumpla el
  filtro, con "Actualizar vista" encendido; al tocarlo desaparece si no cumple y
  se queda si cumple. Lo que sigue escondido con filtro puesto, por decisión:
  **"+ Sub Frente"**, el **bloque de archivadas**, y los **sub frentes sin
  ninguna coincidencia**.
  La última columna, la de los iconos, se titula **"Acciones"** (#298), la misma
  palabra que en administración de usuarios y de proyectos, centrada como las
  demás cabeceras de esta tabla. Aparece solo si se
  tiene algún permiso sobre las tareas: quien solo mira no ve la columna ni su
  título. En mobile la columna mide 26px y lleva solo el ⓘ, así que ahí sigue
  sin encabezado.
- **Gantt** (grilla tipo Excel): planificación por clics, horizonte configurable,
  filas de carga por persona, rastro de replanificaciones. (Oculta en mobile.)

**La grilla ocupa lo que sobra, y es lo único que se desplaza (#321).** El alto
estaba fijado a mano —"la pantalla menos 250"— y medido contra la **pantalla
completa**, cuando la grilla vive dentro de lo que sobra bajo el encabezado, que
ya es más corto: de ahí salían los dos síntomas que parecían distintos, espacio
muerto abajo o última fila cortada, según cuánto hubiera arriba. Cualquier valor
escrito a mano vuelve a desalinearse cada vez que cambie algo de arriba —que es
lo que pasó con #305, que ganó dos franjas—, así que la grilla pasa a **ocupar
lo que sobra dentro de su contenedor**. De ahí sale solo lo demás: si nunca
empuja la página hacia abajo, **el scroll de la pantalla deja de existir** y
encabezado, contadores y barra de controles quedan siempre a la vista. En
**tabla no se aplica**: una lista larga sí debe desplazar la pantalla.

**El "+" de la grilla no descentra los nombres (#306).** Compartía la línea con
el nombre y ocupaba su lugar **aunque estuviera invisible** —18 de ancho más 6
de separación—, así que el nombre estaba corrido 12 a la izquierda siempre.
Ahora sale del flujo, así que el nombre queda centrado de verdad y **no se mueve
al aparecer el "+"**, y **se pega al borde derecho del nombre**; solo cuando el
nombre no deja sitio se apoya contra el borde de la columna, y ahí el texto **se
desvanece** bajo él en vez de cortarse. *Queda en un punto distinto en cada fila
según cuán largo sea cada nombre, que es el comportamiento que se prefiere.*
Pegarlo al nombre **no se puede hacer solo con CSS:** el ancho de la CAJA del
texto no es el del texto renderizado —una caja de 103 con dos palabras que
envuelven tiene líneas mucho más cortas— y CSS no sabe dónde acaba la línea más
larga. Lo resuelve un efecto con un `Range` sobre el contenido, que devuelve un
rectángulo por línea; el `Math.min` contra el borde de la celda cubre los dos
casos sin ningún condicional. No corre al desplazar: dónde acaba el texto no
depende del scroll.

**Los nombres se cortan, no se parten (#321).** En las columnas congeladas el
corte estaba forzado en cualquier letra —"Planificació / n"— para que ninguna
palabra larga las ensanchara y desplazara los anclajes de las columnas fijas.
Ahora el texto **envuelve por palabras** y la que no cabe se **recorta con
puntos suspensivos**, con el nombre completo al pasar el mouse — en el **globo
propio del producto, inmediato** (#305d), no en el del navegador, que solo
aparece con el texto recortado y tarda cerca de un segundo. En la columna de
tarea ese trabajo ya lo hace su tarjeta, que lleva el título completo y también
es inmediata: no se le encima un segundo globo. Que la columna
no se ensanche lo garantiza que el recorte va en un bloque con mínimo cero, que
aporta cero al ancho mínimo de la celda.

**Los globos de la Gantt no se recortan (#327).** Los cuatro que tiene la
grilla —el nombre completo del frente y del sub frente, el rótulo del proyecto
en Mis Tareas, "Información" y "Agregar tarea debajo", y el detalle del día—
colgaban de su celda, así que quedaban **dentro del recuadro con scroll** y ese
recuadro los recortaba: en la primera fila, el que se abre hacia arriba caía
bajo el encabezado congelado y solo asomaba una franja. **Un globo que se abre
hacia afuera dentro de un contenedor con `overflow` se recorta sin importar el
z-index**, así que el arreglo no es subirle la capa sino sacarlo del árbol: se
dibujan en una **capa aparte por encima de la página**, el mismo camino que ya
usaban la tarjeta flotante de la tarea y el nombre completo en administración de
usuarios (#213). Cada uno **se sigue abriendo hacia donde se abría** —los de
nombre hacia la derecha, los de botones y celdas hacia arriba— y conserva su
inmediatez o su retardo; solo **se corre al lado contrario cuando no cabe**
contra un borde de la pantalla. Al desplazar la grilla el globo se suelta, para
que no quede flotando lejos de lo que lo disparó. *Que un globo tape el nombre
de la fila de arriba mientras está visible se acepta como está.* Las columnas fijas **siguen midiendo lo
mismo**: 120 + 150 + 240 + 60 = 570, que con días de 30 sigue sin dejar caber la
línea de tiempo — decisión consciente, la grilla se sigue desplazando de lado.

**El bloque del frente ya no es negro (#321, cierra #323).** Era la superficie
más oscura de la pantalla y competía con la grilla; pasa a un gris propio con el
nombre en texto normal. Frente y sub frente usan ahora **dos tokens distintos**:
en modo oscuro eran el mismo valor exacto (`#26262b`), no es que se parecieran —
eran idénticos.

**Tres franjas sobre la grilla, siempre las mismas (#305).** En tabla y en
Gantt, y la altura sobre el contenido **no cambia nunca**: ni al filtrar, ni al
ordenar, ni según el proyecto. Antes eran cinco —título, filtros, leyenda, aviso
de fin de semana y selectores de horizonte—, y tres de ellas aparecían y
desaparecían solas.

1. **Título:** nombre, total de tareas, Miembros, la fecha y el conmutador
   Tabla/Gantt. El chip de fecha **muestra solo la fecha**; la palabra que queda
   es el aviso de fecha simulada, que es donde trabaja.
2. **Contadores, que absorbieron la leyenda.** Los cinco de siempre con sus
   nombres completos y, **en Gantt**, una sexta caja **"Fecha anterior" sin
   número** —no es un estado sino el rastro de dónde estaba la tarea— y las
   muestras pasan a ser **las marcas reales de la grilla** (check verde, equis,
   cuadrados de color, y la de fecha anterior más chica). En tabla siguen siendo
   muestras de color. La leyenda **ya no existe como fila**: decía lo mismo que
   los contadores a dos filas de distancia.
3. **Barra de controles:** `Filtrar · Ordenar · Rango` a la izquierda y
   `Vistas` fijo en el extremo derecho, con **"Actualizar vista" justo a su
   izquierda** — el único elemento que aparece y desaparece, a propósito: avisa
   de algo que acaba de pasar, y va ahí para que Vistas no se mueva al
   aparecer. **Rango solo existe en Gantt.**

**Un solo valor separa bloques: 16 (#306c).** La barra de controles queda
**centrada** —16 arriba y 16 abajo—, y de ese mismo 16 sale la separación entre
un frente y el siguiente, así que **el primer frente se separa de los botones
igual que un frente del anterior**. Antes había cuatro espaciados fijados cada
uno por su cuenta —12 arriba de la barra, 24 abajo, 28 del título de un frente
plegado a la línea de arriba y 8 a la de abajo— y ninguno calzaba con otro; por
eso ajustar uno descuadraba otro, que es lo que pasó en #306b. El aire de
**arriba** del encabezado no se toca, y el de arriba de la barra va **partido en
dos mitades** para que la línea del encabezado caiga justo en el medio. El de
abajo lo pone **entero la barra**, como **padding y no margen**: así la franja
pegajosa lo incluye y **tapa con su fondo opaco** lo que pasa por debajo al
desplazar — puesto en el contenedor, el hueco sería transparente. Lo que **no**
entra en la regla es el aire de **adentro** de un grupo (los 8 entre sub
frentes): ese contraste contra el 16 es justo lo que hace que los grupos se
lean.

Los cuatro menús **abren con la misma caja**, de ancho fijo, para que no cambie
de tamaño al pasar de un control a otro; Vistas queda fuera de esa regla porque
se ancla a la derecha y los nombres guardados pueden ser largos.

**Los cuatro controles.** Cada uno con ícono y nombre fijos:

**Ningún menú lleva título que repita su botón (#305d).** "Campos" en el primer
nivel de Filtrar y "Criterios" en Ordenar decían lo que ya decía el botón que
acabas de apretar, y en el segundo nivel la vuelta y el nombre del campo
gastaban dos renglones. Ahora la cabecera del segundo nivel es **una sola
línea, "‹ Fecha"**: dice dónde estás y cómo volver a la vez. Se conservan los
títulos que separan **grupos dentro de un mismo menú** —"Aplicado" en Filtrar,
"Rango fijo" en Fecha, "Días" y "Horizonte" en Rango—: esos sí trabajan.

- **Filtrar** reemplaza a los tres botones sueltos (Fecha, Responsable y Estado
  en un proyecto; Fecha, Proyecto y Estado en Mis Tareas), que ahora viven
  **dentro, a dos niveles**. El botón muestra el **total de valores** elegidos
  sumando todos los campos y una **×** que los limpia todos. Dentro, lo aplicado
  se ve como **fichas: una por campo, no por valor** —con cuatro estados
  elegidos hay una sola ficha, "Estado: 4", y su × borra los cuatro—; para sacar
  un valor suelto se entra al campo y se destilda. Se conservan "Seleccionar
  todos" y "Deseleccionar todos"; **desaparecen los "Limpiar filtro"** de dentro
  de cada campo, que es el trabajo que hace la × de la ficha. El campo Fecha
  conserva **todas** sus opciones, y desde #322 sus cinco opciones se excluyen
  entre sí **sin excepciones**. El campo
  **Estado sigue la misma regla que los contadores**: las marcas reales de la
  grilla cuando se está en Gantt, los puntos de color cuando se está en tabla —
  dos representaciones del mismo modelo a la vez es justo lo que se eliminó.
- **Ordenar** conserva su menú íntegro y suma contador y **×**, que reemplaza al
  "Limpiar orden" que estaba suelto en la barra.
- **Rango** es el antiguo horizonte de la Gantt. **No lleva contador ni ×:** sus
  opciones siempre tienen valor. Dos grupos con título: **Días** (hábiles o
  semana completa) y **Horizonte** (alrededor de hoy, o todo el proyecto — en
  Mis Tareas, "todas mis tareas"). El **tercer estado del grupo Horizonte no se
  elige, se impone**: con un filtro de fecha puesto las dos opciones quedan
  apagadas y aparece "Horizonte definido por el filtro de fecha"; "En horizonte
  visible"
  es la excepción que lo deja elegible, porque deriva su rango del horizonte en
  vez de definirlo. El aviso de tareas de fin de semana **dejó de ser una
  franja**: cuando hay tareas escondidas, Rango muestra **un círculo** junto al
  nombre y el detalle con el número vive al final del grupo Días.
  **El círculo significa una sola cosa: hay tareas ocultas.** No debe
  reutilizarse para ningún otro aviso, ni en Rango ni en otro control: si dice
  dos cosas deja de decir "hay tareas escondidas" y pasa a decir "mira acá".
- **Vistas** conserva todo lo que decía —"Vistas", "Vistas (3)", "Vistas ·
  Atrasadas" y el asterisco de modificada— y suma una **×** que aparece solo con
  una vista activa: sale de ella y deja todo limpio, **sin confirmación**.
  **"Guardar vista" se mudó adentro del menú** (apagado, con su aviso, cuando no
  hay nada que guardar) y ya no es un botón permanente de la barra. Los tres
  iconos de cada vista guardada —actualizar, renombrar, eliminar— están
  **siempre visibles**: estaban en invisible hasta pasar el mouse, lo que dejaba
  la fila despareja y los volvía inalcanzables en pantalla táctil. El de
  actualizar **se habilita solo en la vista activa y solo cuando está
  modificada** (#305c) —exactamente la condición del asterisco, así que las dos
  señales dicen lo mismo—; antes miraba únicamente si había algún filtro u orden
  puesto, que es la misma condición para todas, así que con cinco vistas
  guardadas las cinco quedaban disponibles para ser sobrescritas — y, ya dentro
  de una, seguía encendido después de guardar, porque el filtro y el orden
  seguían puestos. **El ícono y el asterisco usan exactamente la misma
  condición y se mueven juntos:** si hay asterisco hay ícono encendido, y si no
  hay asterisco no lo hay. **"Guardar vista" sí sigue mirando solo si hay algo
  puesto**: crea una vista nueva, no sobrescribe ninguna.

**"Modificada" se decide comparando CONTENIDO, no texto (#305e).** La
comparación se hacía con `JSON.stringify`, letra por letra, y eso solo da igual
si las propiedades vienen en el mismo orden — que no es información, sino un
accidente de cómo se armó el objeto. Dos caminos lo cambian sin que cambie nada
real: la columna `jsonb` donde vive el filtro, que **reordena las claves** al
devolverlas (y al guardar la vista en memoria se reemplaza con lo que devolvió
la base, que es lo correcto), y **el orden en que se arma el filtro** — elegir
Estado y después "Sin fecha" produce `{estados, sinFecha}`; al revés produce
`{sinFecha, estados}`. Por eso, tras guardar, el asterisco no se iba. Ahora:
las **listas de valores del filtro** (responsables, estados, proyectos) se
comparan como **conjuntos** —los mismos valores en distinta secuencia son el
mismo filtro, así que destildar y volver a tildar una opción no enciende
nada—, y el **orden** se compara como **secuencia**, porque `[fecha, estado]`
y `[estado, fecha]` son órdenes distintos. Es el único sitio donde se usa esa
comparación: no afecta a nada más.

*El asterisco de Vistas y "Actualizar vista" son señales distintas y conviven:*
el asterisco dice que te alejaste de lo guardado; el botón dice que la foto
quedó vieja por una edición, y puede aparecer sin ninguna vista guardada activa.

El estado del horizonte (modo y días hábiles) **vive en la pantalla**, no en la
grilla: lo elige la barra y lo usa la Gantt. La cuenta de tareas escondidas va
al revés —la calcula la grilla, que es la única que sabe qué filas quedaron, y
la muestra el control.

**Reordenar tareas arrastrándolas (#293).** En la Tabla y en la Gantt del
proyecto —solo escritorio— cada fila de tarea tiene un **asa** que aparece al
pasar el mouse, dentro de la celda del nombre, pegada a su borde izquierdo:
mismo lugar y mismo aspecto en las dos vistas. Se arrastra desde el asa, no
desde la fila (la fila está llena de controles, y en la Gantt el clic ya
significa planificar). Dos movimientos con el mismo gesto: **reordenar dentro
del sub frente** —lo puede hacer cualquier miembro del proyecto, la misma
decisión que el orden de frentes y sub frentes— y **mover a otro sub frente**
(incluso de otro frente, o uno vacío), que exige el permiso `editarTareas` con
su alcance de siempre; sin él, el otro sub frente no es destino válido y la
tarea vuelve a su lugar. Durante el arrastre una línea marca dónde va a caer.
Mover **no cambia nada más** de la tarea —ni fecha, ni responsable, ni
estado—, no escribe en el historial de replanificaciones y no genera
notificación: el historial mide compromisos movidos y las notificaciones son
de alta señal; un cambio de ubicación no es ninguna de las dos cosas. Con un
orden por criterios o un filtro activo, el arrastre es una edición más sobre
la **vista congelada**: la tarea queda donde se la soltó, el orden nuevo se
guarda y se enciende "Actualizar vista" (al tocarlo, los criterios vuelven a
mandar; el orden manual se ve al limpiarlos). En **Mis Tareas** y en mobile el
gesto no existe. Las reglas están cerradas **en la base** (migración 28), no
solo en la pantalla.

**El filtro de fecha filtra y además fija el horizonte (#250).** Son dos efectos
que van juntos, no uno u otro: deja **las tareas** que cumplen el criterio —con
la misma regla que la tabla, así que ambas vistas muestran exactamente lo
mismo— y ajusta **los días** visibles de la Gantt a ese rango; si el filtro deja
las de esta semana, la ventana es esa semana. El bug era que en la Gantt hacía
solo lo segundo, y por eso "Hoy" mostraba tareas de cualquier día y hasta las
que no tienen fecha. Las opciones que no son una ventana temporal —"Sin fecha",
"Con fecha"— filtran sin tocar el horizonte, y "En horizonte visible" va al
revés: deriva su rango del horizonte en vez de definirlo.

**Las cinco opciones del campo Fecha se excluyen entre sí (#322).** Faltaba una
pareja: "Sin fecha" y una fecha —relativa o rango fijo— podían convivir, y
entonces el filtro **sumaba**: las tareas sin fecha MÁS las del rango. El
cálculo no estaba mal, hacía lo que decía; lo que estaba mal es que esa
combinación pudiera existir, y se llegaba a ella desde los dos lados. Ahora
activar "Sin fecha" apaga la fecha y el rango, y activar una relativa o
escribir un rango apaga "Sin fecha" — como ya hacían "Con fecha" y "En
horizonte visible". *El motor del filtro no se tocó: sigue sabiendo sumar las
dos cosas, porque una vista guardada de antes de #322 puede traerlas juntas y
tiene que seguir funcionando.* Los filtros de responsable, proyecto y estado no
cambian: ahí sí se eligen varios a la vez. Las relativas son
cinco (#279): Hoy, **Próximo día hábil** —un solo día: el siguiente que no es
sábado ni domingo; de lunes a jueves es mañana, de viernes a domingo es el
lunes—, Esta semana, Próxima semana y Este mes. Se recalculan con la fecha del
día en cada uso y son excluyentes entre sí. "Hábil" es L-V y nada más: la
herramienta no conoce feriados a propósito, y un viernes la tarea del sábado
NO entra en el filtro — cada opción muestra su rango literal.
- **Mis Tareas:** las tareas donde el usuario es responsable, en todos sus
  proyectos, vencidas primero. **Su encabezado es el mismo componente que el de
  un proyecto (#324)** —título con la cuenta al lado en gris, chip de fecha,
  conmutador y fila de contadores—, y lo único que no lleva es **Miembros**:
  cruza varios proyectos y no hay un grupo de miembros que mostrar. Compartir el
  componente es lo que impide que vuelvan a separarse: cuando #305 quitó la
  leyenda de la Gantt y le pasó ese trabajo a los contadores, Mis Tareas se
  quedó sin nada que explicara las marcas, porque nunca los había tenido. Sus
  contadores se calculan sobre las tareas a cargo del usuario cruzando
  proyectos; la pantalla de proyecto los recibe ya calculados. El aviso de
  atrasadas en texto desapareció: la caja roja dice el mismo número, en color y
  en el mismo lugar.
  Tiene el mismo conmutador **Tabla / Gantt** que
  un proyecto (#190): la Gantt muestra la **carga propia repartida en el
  tiempo**, cruzando proyectos, con una columna extra y muy angosta a la
  izquierda —nombre del proyecto **rotado** sobre su color— que se repite en
  cada frente; si no cabe, se trunca y el nombre completo queda en el tooltip
  (el globo propio de la app, inmediato — no el `title` nativo, cuyo retardo lo
  fija el navegador, #192). Ese rótulo **se centra en la porción visible de su
  bloque y acompaña al desplazar** (#321), el mismo mecanismo que ya usaban
  frente y sub frente: antes se centraba sobre el bloque completo, así que en un
  proyecto más alto que la pantalla el nombre quedaba fuera de vista y la franja
  se leía como color sin explicación.
  Es de **lectura y replanificación**: mover fechas, marcar hechas y abrir el
  detalle, sin crear ni eliminar nada (una tarea creada ahí no sería del
  usuario hasta asignársela). Al pie, una sola fila con su total diario.
- **Resumen:** indicadores por proyecto (avance, total y desglose de las cinco
  categorías). **Es la pantalla de entrada (#274):** la aplicación SIEMPRE
  parte ahí, para todos los roles, también al volver a entrar — no se recuerda
  el último proyecto visitado (decisión tomada). Llegar desde una notificación
  sigue abriendo la tarea, la expulsión por pérdida de acceso sigue llevando a
  Resumen, y la vista Tabla/Gantt se sigue recordando por proyecto.
- **Entrar a un proyecto limpia la selección de frente** (#297). Los cuatro
  caminos —elegir un proyecto, iniciar sesión, saltar a una tarea desde una
  notificación y **crear un proyecto**— entran con "todos los frentes". Sin
  eso, la selección de un proyecto viajaba al siguiente y la vista principal
  filtraba por un frente que ese proyecto no tiene: mostraba "aún no tiene
  frentes" aunque los tuviera. Crear un proyecto además lo **incorpora al
  estado antes de navegar hacia él**: al revés, el efecto que corrige el
  proyecto activo no lo encontraba entre los visibles y devolvía a Resumen.

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

**El selector de fecha es un calendario propio (#262).** Antes era el nativo
del navegador (`showPicker`), y con él no había forma de distinguir "navegó de
mes" de "eligió un día": tocar la flecha de mes asignaba esa fecha, la guardaba
y cerraba — con historial de replanificación de por medio si la tarea ya tenía
compromiso. Con el calendario propio la regla es inequívoca: **navegar meses
solo cambia lo que se ve; únicamente el clic en un día concreto asigna y
cierra; clic fuera o Escape cierran sin tocar nada**. Es la misma pieza en los
cuatro puntos donde se edita fecha (fila de tabla, fila de creación, Mis Tareas
y panel de detalle), se monta como popover que sigue a su celda al hacer scroll
y no roba el foco (en la fila de creación, elegir día devuelve el foco al
título, como siempre).

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

**La tarea sin fecha que se marca hecha queda con fecha (#294).** Al marcarla,
se le graba como fecha objetivo **el día del marcado** (con la fecha original
igual: no gana atraso), así la Tabla, la Gantt y el filtro "Con fecha" cuentan
lo mismo — antes la Gantt la dibujaba en el día del marcado y la Tabla la
mostraba sin fecha. Vale desde cualquier lugar donde se marque (Tabla, Mis
Tareas, panel de detalle) y con solo el permiso de marcar hechas: el valor lo
pone la base, no el cliente. Al **desmarcar**, esa fecha se quita y la tarea
vuelve a quedar **sin fecha**; una tarea que ya tenía fecha, en cambio, la
conserva al marcar y al desmarcar (la fecha de cierre sigue siendo la última
fecha planificada, no el día del clic). La distinción vive en la base
(`fecha_por_marcado`, migración 29, marca interna que el cliente no puede
fabricar); ni el marcado ni el desmarcado escriben historial de
replanificaciones ni generan notificación. Los datos anteriores al cambio se
corrigieron con la misma regla (la fecha grabada es su día de marcado).

**La fecha de una tarea hecha no se edita (#245).** Vale en **todas** las
vistas donde se puede mover una fecha —tabla, Mis Tareas y Gantt; el panel de
detalle dejó de ofrecer el control en #307—: mover la fecha de algo ya cerrado
reescribiría el registro de cuándo se comprometió, que es justamente el
diferenciador del producto. La regla vive en un solo lugar
(`puedeEditarFecha`), así que no pueden volver a separarse. La fecha sigue **a
la vista**, como texto: lo que desaparece es el control, no el dato, y quien
podría editarla ve por qué ("La fecha de una tarea hecha no se edita.
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
hilo acompaña al registro de replanificaciones.

**El panel de detalle es solo para leer y comentar (#307).** Muestra el estado,
el título, la ubicación, el responsable, las fechas, la línea de tiempo de
replanificaciones y los comentarios — y **debajo de los comentarios no queda
nada**. Antes terminaba con un bloque de acciones —marcar hecha, replanificar,
archivar y restaurar— **después** del historial y del hilo completo, así que con
comentarios había que bajar hasta el fondo para llegar a ellas; y marcar hecha y
replanificar ya se hacen desde la tabla y desde la Gantt, así que tenerlas ahí
era un tercer lugar para lo mismo. Al sacarlo se resolvieron dos cosas solas: el
estado **dejó de decirse dos veces** (queda la etiqueta junto al título) y
desapareció del panel el texto de #245 sobre la fecha de una tarea hecha, que
sigue existiendo como **globo sobre la fecha** en la tabla y en Mis Tareas, que
es donde vive el control. **Consecuencia declarada y aceptada:** archivar y
restaurar existían solo en la tabla y en el panel, así que **desde la Gantt hay
que ir a la tabla para archivar**. Al no tener acciones, el panel tampoco
necesita permisos: no decide nada que dependa de quién mira.

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
cambia de alto.

**El frente se lee como hijo de su proyecto (#318).** #225 había alineado los
frentes con el **cuadradito de color** del proyecto para ganarle ancho al
nombre, y el efecto lateral fue **invertir la jerarquía**: medido sobre el borde
de la barra, el nombre del proyecto arrancaba a 48 y el del frente a 30, o sea
el hijo quedaba **18 a la izquierda de su padre**. Ahora el grupo de frentes
lleva **16 de sangría** y una **línea vertical** a su izquierda que lo abarca
entero, empezando con el primero y terminando con el último. La línea hace dos
trabajos —dice que el grupo cuelga del proyecto de arriba y marca dónde empieza
y dónde termina— y es más barata que un punto de color por frente: cuesta 2 más
un aire chico **una vez**, contra unos 18 en **cada** fila. El frente además se
ve **algo más chico y más tenue** que el nombre del proyecto (antes era más
grande que su padre), lo que refuerza la jerarquía sin costar ancho; el frente
elegido recupera el blanco. **Costo aceptado:** el nombre pasa de 204 a 182 de
ancho útil, así que algunos nombres largos se cortan un poco antes — se siguen
cortando con puntos suspensivos y con el completo en el tooltip. En un proyecto
**sin frentes** no aparece la línea: no hay grupo que abarcar.

**Los frentes se despliegan, no aparecen (#318).** Al abrir un proyecto sus
frentes bajan con una transición corta, empujando lo que viene después; al
cerrarlo, o al abrir otro, se repliegan igual. Lo que se corrigió no es que la
lista se mueva —eso es correcto— sino que el movimiento fuera **instantáneo**:
el ojo no veía nada moverse, solo encontraba la lista distinta. Los frentes
siguen existiendo **solo dentro del proyecto abierto**; el que acaba de cerrarse
se conserva dibujado apenas lo que dura el repliegue, porque un elemento que se
desmonta no transiciona.

Solo hay **un menú abierto a la vez**: abrir el de un
frente cierra el de un proyecto y viceversa. La barra mide 244px por defecto y
el usuario puede **ajustar su ancho arrastrando el borde derecho** (entre 244 y
400px, doble clic para restablecer; se recuerda por usuario, #226). Ni los
proyectos ni los frentes muestran contador de tareas (#188): la lista se navega
por color, nombre y jerarquía. Los contadores de **Administración** (usuarios y
proyectos activos) sí se conservan. El control de plegar la barra es un
**chevron doble**, no un pin: contrae, no ancla (#187). Con la barra contraída
se ve solo el del riel y, al desplegarse, solo el de la cabecera: nunca los dos
a la vez (#191). En modo escondido, **mientras el panel de notificaciones o un
menú ⋯ (de proyecto o de frente) estén abiertos, la barra se sostiene
desplegada** aunque el mouse salga de ella, y recién se contrae al cerrarse ese
panel o menú (#263): sin eso, el popover quedaba flotando en medio de la
pantalla, desconectado de la barra que lo abrió. Solo escritorio — la regla va
acotada por media query y el panel de mobile no cambia.

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
backends. La **entrega está condicionada al acceso al proyecto** de la tarea
(#283, mismo criterio que el resto de la app): al sacar a alguien de un
proyecto, sus notificaciones de ahí **dejan de llegarle y de contar en el
contador** — no se borran, igual que sus accesos guardados—, y si se lo vuelve
a agregar reaparecen con su leída/no leída intacto ("marcar todas como leídas"
tampoco toca las ocultas). En Supabase lo garantiza la RLS (migración 23); el
modo Local replica la regla.

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
registro de replanificaciones. **Las direcciones web se ven como enlaces y se
abren en pestaña nueva (#299):** lo que empieza por `http://`, `https://` o
`www.` seguido de otro punto. Una palabra suelta con punto —`andotek.cl`, o el
final de una frase— NO se vuelve enlace, para no convertir abreviaturas. El
reconocimiento ocurre **al pintar**, en el mismo recorrido que las menciones,
así que aplica igual a los comentarios ya escritos y no cambia ningún dato
guardado. El texto de un comentario es contenido de terceros: solo `http` y
`https` llegan a ser enlace, y se abren sin dar referencia a la ventana de
origen (invariante 21 de `SEGURIDAD.md`).

**Otros:** archivo de canceladas, tema claro/oscuro (sigue el sistema, con
override manual persistente por usuario), diseño responsive (mobile prioriza
Tabla y Mis Tareas; los modales altos, el panel de notificaciones y el menú ⋯
tienen tratamiento propio en pantalla angosta) e iconos de acción como SVG, no
como glifos del sistema. En mobile los dos botones flotantes son **el ☰ y la
campana de notificaciones con su contador (#284)** — el contador se ve sin
abrir el menú; tocarla abre Notificaciones a pantalla completa y cierra el
menú lateral. El interruptor de tema vive en el pie de la barra lateral,
también en el teléfono (el flotante de tema se retiró).

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
- **Edge Functions (Deno):** `invitar-usuario`, `aceptar-invitacion`,
  `recuperar-contrasena` (correo via Resend) y `eliminar-usuario` (#301, revoca
  la cuenta de acceso con el Admin API). Secretos solo server-side. CORS
  por lista de orígenes: si no hay ninguno configurado la función **rechaza** la
  petición en vez de abrirse a cualquiera. Los errores internos se registran en
  el servidor y al cliente le llega un mensaje genérico en español (#249). Se
  despliegan a mano desde el dashboard (no hay CLI en este proyecto).
  Los **dos correos que envía el producto** —la invitación y el de restablecer
  contraseña— cierran diciendo **dónde entrar** (#304): la dirección de la
  herramienta, como enlace y a la vista con `https://`. Sale del mismo
  `SITE_URL` con el que se arma cada enlace, así que sigue sola un cambio de
  dominio. Hacía falta porque esos enlaces caducan y sirven una vez: quien lo
  usaba se quedaba sin ninguna referencia escrita para volver.
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
| `diagnostico-297-frente-al-crear.md` | Reproducción medida del frente que no aparecía al crear un proyecto, y propuesta abierta sobre proteger la vista de una selección imposible. |
| `DEPLOY.md` | Despliegue (Supabase, Vercel, Resend, Edge Functions). |
