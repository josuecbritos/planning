# #282 — Diagnóstico: el aviso "Tu sesión ha expirado. Vuelve a ingresar."

Pedido: reproducir y explicar los dos casos observados; corregir SOLO si la
corrección no obliga a elegir entre alternativas; lo demás queda aquí, como
decisión pendiente de Josué.

## Cómo funciona el aviso (contexto)

El aviso de #244 se dispara por dos caminos:

1. **La señal del servicio**: Supabase emite `SIGNED_OUT` cuando la sesión
   deja de existir (contraseña cambiada en otro dispositivo, refresco
   fallido, cierre en otra pestaña). App la escucha (`alPerderSesion`) y sale
   al login con el motivo `expirada`.
2. **Una acción que falla**: si guardar/leer falla, el catch llama a
   `diagnosticar()`; si ya no hay sesión válida devuelve `expirada` (o
   `desactivada` si la cuenta fue dada de baja) y App sale al login.

Para que el "Salir" voluntario no dispare el aviso existía una bandera
(`salidaVoluntaria`) que el primer `SIGNED_OUT` **consumía** (la volvía a
apagar).

## Caso A — "Salir" mostró el aviso (una vez, no reproducible)

**Causa: la protección era de un solo uso, pero un "Salir" puede producir MÁS
de una señal en la misma pestaña.** Dos ventanas concretas:

- **`SIGNED_OUT` duplicado.** El servicio puede emitir el evento más de una
  vez para un mismo `signOut` (evento propio + limpieza de almacenamiento).
  La primera señal consumía la bandera; la segunda la encontraba apagada y
  mostraba el aviso sobre la pantalla de login.
- **Una acción en vuelo al momento de salir.** Ejemplo real: cerrar el panel
  de notificaciones dispara "marcar leídas"; si el "Salir" llega antes de que
  esa petición termine, la petición falla porque la sesión se revocó, su
  catch llama a `diagnosticar()` —que sin sesión responde `expirada`— y ese
  camino **nunca pasó por la bandera**.

Que se haya visto una sola vez encaja: ambas ventanas son carreras de
milisegundos.

**Corrección aplicada (permitida por la regla: es cerrar la carrera, sin
elegir nada).** La bandera pasó de "un solo uso" a **cerrojo**
(`salidaEnCurso`): se levanta al iniciar cualquier salida —voluntaria o
expulsión— y solo se rearma al volver a INICIAR SESIÓN. Mientras está
levantado, toda señal posterior (evento duplicado, catch tardío) se ignora:
ya se salió y no hay nada que avisar. No cambia ningún texto ni cuándo se
expulsa a alguien; solo impide avisar dos veces por la misma salida.

**Verificado** con el build real y una costura de prueba que dispara la señal
como lo haría Supabase: 10 "Salir" seguidos con señal duplicada en escritorio
y 10 en mobile → cero avisos; una expiración REAL sigue avisando antes y
después (los mensajes de #244 intactos), y el cerrojo se rearma al entrar.

**Queda SIN corregir (decisión de producto):** la **segunda pestaña**. Si la
aplicación está abierta en dos pestañas y se usa "Salir" en una, la otra
recibe `SIGNED_OUT` con su propio cerrojo abajo y muestra "Tu sesión ha
expirado". Técnicamente su sesión sí terminó, pero el texto no describe lo
que pasó (fue una salida voluntaria en otra pestaña). Decidir qué debería ver
esa pestaña es elegir un mensaje → va aquí, no en el código. *Nota: es
posible que la única vez observada del caso A haya sido exactamente esto.*

## Caso B — incógnito, volviendo al día siguiente

**Causa:** la ventana quedó abierta con una sesión guardada; al volver un día
después, el servicio intenta refrescar el token y el refresco falla (en
incógnito el almacenamiento particionado no conserva/renueva la sesión entre
esos plazos) → `SIGNED_OUT` involuntario → aviso.

**El mensaje es literalmente correcto: la sesión sí expiró.** Lo que queda
abierto es si es el mensaje ADECUADO para alguien que "simplemente vuelve" —
un texto más neutro ("por seguridad, vuelve a ingresar") sería un mensaje
nuevo, y el pedido prohíbe inventarlos → decisión de Josué. Sin cambios.

**Sobre la pista del pedido** (`diagnosticar()` devuelve `expirada` cuando no
hay NINGUNA sesión): revisado. Quien entra por primera vez en un navegador
limpio NO pasa por ahí (sin sesión no hay acciones que fallen ni señales que
escuchar: ve el login sin aviso). Ese camino era el vehículo de la segunda
ventana del caso A —ya cerrado por el cerrojo— y no produce avisos falsos por
sí solo. Cambiar qué debería devolver "sin sesión" tocaría los textos y
cuándo se expulsa → se deja como está.

## Resumen

| Qué | Estado |
|---|---|
| Caso A misma pestaña (señal duplicada / acción en vuelo) | **Corregido** — cerrojo `salidaEnCurso` |
| Caso A segunda pestaña | **Sin corregir** — elegir el mensaje es decisión de producto |
| Caso B (volver al día siguiente) | **Sin corregir** — el mensaje es correcto; si se quiere uno más amable, es un texto nuevo |
| Mensajes de #244 (expiración real, cuenta desactivada) | **Intactos** — verificado |
