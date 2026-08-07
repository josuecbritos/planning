# Informe #296 — La base viva contra el repo, y si las funciones internas se alcanzan desde afuera

**Fecha:** 07-ago-2026 · **Tipo:** auditoría de solo lectura · **Autor del pedido:** Josué

---

## Conclusión (léase esto primero)

**¿#290 es un problema real hoy? Sí, en parte, y con una sola pieza que importa de verdad.** Está **confirmado con evidencia** que el `revoke ... from anon, authenticated` de las migraciones 15 y 22 **no cerró nada**: 22 funciones internas quedaron ejecutables por `PUBLIC` (es decir, por cualquier usuario, con o sin sesión). Pero de esas 22, **una sola es peligrosa: `crear_notificacion`** — se demostró que un usuario normal puede fabricarle una notificación falsa a otro, con el autor que quiera. Las otras 21 quedan neutralizadas por otras razones (fallan si se las llama fuera de un trigger, se auto-verifican por dentro, o solo revelan el propio contexto de quien llama). **Falta un solo dato para cerrar el caso: si `crear_notificacion` es alcanzable por la API REST** — eso se responde corriendo `docs/prueba-296-alcance-rpc.mjs` contra producción (instrucciones abajo).

**¿La base desplegada es lo que dice el repo? No se pudo comprobar desde aquí, y esa pregunta sigue ABIERTA.** El entorno de este trabajo no tiene acceso a la base de producción (el conector de Supabase apunta a otro proyecto). Lo que sí se hizo: reconstruir la base entera con las 29 migraciones en un Postgres limpio y confirmar que **el repo es internamente consistente** — no hay sorpresas en lo que las migraciones producen. **Pero eso NO detecta una divergencia de producción**, que es exactamente lo que fue #281 (una política viva que no estaba en ningún archivo). Para responder esa pregunta hay que correr `docs/consulta-296-auditoria-base.sql` contra la base real y comparar con la referencia de este informe (§ "Parte B" y anexo).

**Nada grave que exija detenerse:** la única pieza con impacto real (`crear_notificacion`) es justo lo que el pedido mandó a investigar, no una sorpresa nueva. Su peor caso es notificaciones falsas — molesto y ensucia el registro, pero no expone datos ajenos ni escala privilegios. Queda para que Josué decida cómo y cuándo se corrige.

---

## Parte A — ¿Se pueden llamar las funciones internas desde afuera?

### Lo que se confirmó con evidencia (sobre la base reconstruida, 1→29)

El pedido pide distinguir dos cosas que se confunden: **tener permiso concedido** (catálogo) y **ser alcanzable desde afuera** (REST). Esta sección responde la primera con certeza; la segunda necesita producción.

**El `revoke` de las migraciones 15 y 22 no surtió efecto, y se ve en el ACL.** En PostgreSQL una función nace con `EXECUTE` concedido a `PUBLIC` (todos los roles). Quitarle el permiso a `anon` y `authenticated` no toca lo que tienen por ser parte de `PUBLIC`. El ACL real de `crear_notificacion` en la base reconstruida es:

```
crear_notificacion  ACL = {=X/postgres, postgres=X/postgres}
```

Ese `=X` inicial (sin rol a la izquierda del `=`) **es `PUBLIC` con permiso de ejecución**. Comprobado además con la función del propio motor:

```
has_function_privilege('authenticated', 'crear_notificacion(...)', 'EXECUTE') = true
has_function_privilege('anon',          'crear_notificacion(...)', 'EXECUTE') = true
```

### Por qué solo UNA de las 22 importa

Se clasificó cada función `SECURITY DEFINER` que quedó abierta a `PUBLIC`, probándolas en la base:

| Grupo | Funciones | ¿Peligrosa? | Por qué |
|---|---|---|---|
| **Sin ninguna guarda** | `crear_notificacion` | **SÍ** | `security definer` (bypasa RLS) y su cuerpo solo comprueba que el destinatario exista y no sea el autor. No mira quién llama. |
| Funciones de trigger | `validar_cambios_frente`, `validar_cambios_subfrente`, `aplicar_default_acceso`, `default_dueno_proyecto`, `vincular_usuario_auth`, `notif_asignacion`, `notif_comentario`, `validar_estado_proyecto` | No | Están declaradas `returns trigger`. PostgreSQL las rechaza fuera de un trigger: *"trigger functions can only be called as triggers"*. Comprobado. |
| Ayudantes de permiso | `es_admin`, `usuario_actual_id`, `rol_actual`, `es_dueno_proyecto`, `es_invitado_proyecto`, `tiene_acceso_proyecto`, `permiso_*`, `permisos_en`, `comparte_proyecto`, `proyecto_de_subfrente`, `es_cliente`, `invitado_puede_editar_algo_en`, `usuario_tiene_acceso`, `proyecto_de_tarea` | No | Responden **sobre quien llama** (su propio rol, si él es dueño de un proyecto que nombra). No revelan nada que el usuario no pudiera inferir de sí mismo. |
| Con su propia guarda | `crear_o_reactivar_usuario`, `eliminar_usuario` | No | `security definer`, pero **su cuerpo exige `es_admin()`** antes de hacer nada. Un no-admin recibe *"Sin permiso"*. Verificado leyendo el código. |

**Prueba directa de la única peligrosa.** Con una sesión de rol `authenticated` (un cliente normal), usando el identificador de otro usuario como destinatario:

```
crear_notificacion(víctima, autor_falsificado, 'asignacion', tarea_real, '{}')
→ notificación FALSA creada para la víctima: filas=1 (autor falsificado según el atacante)
```

La función ejecutó y la fila se insertó. **No hay guarda que lo impida a nivel de base.**

**Una que parecía peligrosa y NO lo es: `replanificar_tarea`.** A diferencia de las anteriores, **no es `security definer`** — corre con los privilegios de quien la llama, así que su `UPDATE` pasa por la RLS de `tarea`. Un usuario sin acceso que intenta replanificar una tarea ajena **no logra cambiarla** (la RLS bloquea el UPDATE; comprobado: la fecha quedó intacta). (En una primera prueba pareció un hueco, pero era un error de la prueba: el proyecto se había sembrado a nombre del propio atacante.)

### Lo que falta: la alcanzabilidad por REST

Que `crear_notificacion` tenga el permiso **no basta** para que sea un problema: la capa REST de Supabase (PostgREST) tiene que **publicarla** como endpoint `/rpc/crear_notificacion`. Eso depende de la configuración de producción y **no se puede comprobar desde aquí**. Se entrega el script `docs/prueba-296-alcance-rpc.mjs`, que lo intenta de verdad desde una sesión de usuario normal (el consultor A de pruebas) y una sin sesión, y reporta por función: *no expuesta* / *rechazada por permiso* / *ejecutó*.

**El script no toca ningún dato de clientes.** Corre contra producción, así que:

- **Crea su propio terreno**: un proyecto `__prueba_296_...` con su frente, sub frente y una tarea. No usa la primera tarea que encuentre ni ningún proyecto real.
- **La víctima es un usuario de prueba que él mismo crea** (`__prueba_296_destinatario_...@example.invalid`), nunca una persona real. Esto importa de verdad: **las notificaciones llegan en vivo**, así que un cliente real habría *visto* la notificación falsa en pantalla, y borrarla después no deshace que la haya visto.
- **La limpieza borra solo lo que la prueba creó, por su id** —nunca por usuario+tarea, que se llevaría notificaciones legítimas ajenas— y elimina el proyecto y los usuarios de prueba al terminar, **aunque algo falle en el medio**.
- **Si el terreno de prueba no se puede crear, el script no corre.** Mejor no probar que probar sobre datos de clientes.

- **Si el script dice "no expuesta"** para `crear_notificacion` → #290 es teórico: el permiso está mal, pero PostgREST no deja llegar a la función. Conviene cerrarlo igual (defensa en profundidad), sin urgencia.
- **Si dice "ejecutó"** → #290 es explotable en producción y conviene cerrarlo pronto.

---

## Parte B — La base viva contra el repo

**Esta parte no se pudo ejecutar contra la base real desde este entorno.** Lo que se entrega es la herramienta para hacerlo (`docs/consulta-296-auditoria-base.sql`, solo lectura) y la **referencia esperada** contra la que comparar, sacada de la base reconstruida con las 29 migraciones. La comparación la hace Josué corriendo el SQL en el editor de Supabase y contrastando con lo de abajo. Cualquier fila que aparezca en producción y **no** esté acá es una divergencia como #281 — y puede ser más permisiva, que es lo grave.

**Lo que sí quedó verificado del lado del repo** (base reconstruida 1→29, sin drift posible):

- **RLS activa en las 12 tablas.** Ninguna tabla con datos quedó sin RLS. `recuperacion` tiene RLS activa y **cero políticas** a propósito (solo la toca la Edge Function con `service_role`; #205).
- **Ninguna política incondicional** (`using = true`). Todas filtran por pertenencia o autoría.
- **36 políticas**, repartidas así (referencia para el bloque B.1 del SQL):

  | Tabla | Políticas |
  |---|---|
  | acceso_proyecto | select, insert, update, delete |
  | comentario | select, insert, update |
  | frente | select, insert, update, delete |
  | invitacion | select |
  | notificacion | select, update |
  | proyecto | select, insert, update, delete |
  | replanificacion | select, write (ALL) |
  | sub_frente | select, insert, update, delete |
  | tarea | select, insert, update, delete |
  | usuario | select, insert, update, delete |
  | vista_guardada | select, insert, update, delete |

- **14 triggers** (referencia para B.4): `acceso_proyecto`→default_acceso; `comentario`→notif_comentario, validar_edicion_comentario; `frente`→validar_frente; `proyecto`→default_dueno, validar_estado_proyecto; `sub_frente`→validar_subfrente; `tarea`→normalizar_fechas, notif_asignacion, registrar_replanificacion, validar_permisos_tarea; `usuario`→default_consultor, sincronizar_iniciales, validar_autoedicion_usuario.
- **Una sola vista, `usuario_visible`, en modo DEFINER** (`security_invoker = false`) — **correcto y a propósito** (invariante 3, documentado en la migración 19): la vista lleva su propio filtro de filas y enmascara `email`/`permisos`, y corre como definer para poder leer la tabla `usuario`, que está bloqueada para `authenticated`. Si el SQL muestra `usuario_visible` en modo *invoker*, o **otra** vista en modo definer, eso sí es divergencia.
- **8 tablas publicadas en tiempo real** (referencia para B.7): `tarea`, `frente`, `sub_frente`, `proyecto`, `acceso_proyecto`, `comentario`, `replanificacion`, `notificacion`. Ni una más, ni una menos. `usuario` **no** está publicada, a propósito. (Este mismo hecho lo comprueba ahora también la compuerta, tras #295: si el evento de control llega, la tabla está publicada.)

---

## Hallazgos, ordenados por gravedad

### 1. `crear_notificacion` se puede invocar sin ser quien dice ser (#290) — CONFIRMADO a nivel de base; falta confirmar REST

- **Qué se encontró:** la función `crear_notificacion` quedó ejecutable por `PUBLIC` (el `revoke` de la migración 16 apuntó a `anon, authenticated`, no a `PUBLIC`), y su cuerpo no comprueba quién la llama. Es `security definer`, así que salta la RLS.
- **Qué permite hoy que no debería:** que un usuario cualquiera le cree notificaciones falsas a otro, poniendo como autor a quien quiera. No expone datos ajenos ni da acceso a nada; ensucia el registro de notificaciones y permite suplantar al remitente.
- **Si es alcanzable:** a nivel de **base de datos, sí** — demostrado (una sesión `authenticated` insertó la notificación falsa). Falta comprobar si la **capa REST** la publica; lo dice `docs/prueba-296-alcance-rpc.mjs` corrido contra producción.
- **Qué haría falta para corregirlo (sin hacerlo):** una migración nueva y aditiva que haga `revoke execute on function crear_notificacion(...) from public` (cerrar contra `public`, no contra `anon`), y — como cinturón y tirantes — agregarle al cuerpo una comprobación de que quien llama es el autor o un rol de servicio. Es el patrón que ya se aplicó bien en las migraciones 27, 28 y 29 para otras funciones.

### 2. El patrón de `revoke` equivocado se repite en ~21 funciones más — sin impacto práctico, pero conviene sanear

- **Qué se encontró:** el mismo error (`revoke from anon, authenticated` en vez de `from public`) deja abiertas a `PUBLIC` todas las funciones internas `security definer` salvo las cinco que se cerraron bien en las migraciones 27/28/29 (`hoy_chile`, `normalizar_fechas_tarea`, `registrar_replanificacion`, `validar_permisos_tarea`, `desplanificar_tarea`).
- **Qué permite hoy que no debería:** en la práctica, **nada** — las de trigger fallan fuera de contexto, las de permiso solo hablan del propio usuario, y las de gestión de usuarios se auto-verifican (ver la tabla de la Parte A). Es higiene, no un hueco.
- **Si es alcanzable:** el permiso está, pero ninguna de estas hace daño aunque se la llame.
- **Qué haría falta para corregirlo (sin hacerlo):** en la misma migración del hallazgo 1, cerrar todas contra `public` de una vez, dejando el grant explícito solo a quien de verdad la necesita (como hizo la 27 con `hoy_chile`). Prioridad baja.

### 3. Divergencia base-viva-vs-repo: PENDIENTE de comprobar contra producción

- **Qué se encontró:** desde este entorno no hay acceso a la base real, así que la pregunta que motivó el pedido —¿hay algo vivo en producción que no está en el repo?— **no está respondida**. La base reconstruida no tiene sorpresas, pero eso no detecta drift.
- **Qué permite / impide:** desconocido hasta correr el SQL. Si existiera una política de más y más permisiva (como #281), habría alguien viendo algo que las migraciones creen prohibido.
- **Si es alcanzable:** no aplica (es una comprobación, no un hueco).
- **Qué haría falta para responderlo (sin corregir nada):** correr `docs/consulta-296-auditoria-base.sql` en el SQL Editor de Supabase y comparar cada bloque con la referencia de la Parte B. Es solo lectura.

---

## Qué correr en producción para cerrar lo que quedó abierto

Ambos son de solo lectura salvo la notificación de prueba, que el script borra.

1. **Parte B — divergencia:** pegar `docs/consulta-296-auditoria-base.sql` en el SQL Editor de Supabase. Comparar sus bloques con la referencia de este informe. Reportar cualquier fila de más, de menos o distinta.
2. **Parte A — alcance REST:** correr, con las mismas credenciales de la compuerta:
   ```bash
   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
   RLS_ADMIN_EMAIL=... RLS_ADMIN_PASS=... \
   RLS_CONSULTOR_A_EMAIL=consultor.a@andotek.cl RLS_CONSULTOR_A_PASS=... \
   node docs/prueba-296-alcance-rpc.mjs
   ```
   El admin es obligatorio: crea el terreno de prueba y lo limpia. El consultor A es el "atacante" (un usuario normal); si falta, se prueba solo la vía anónima.

   Leer el veredicto de `crear_notificacion`: *ejecutó* (explotable, cerrar pronto) vs *no expuesta*/*rechazada* (teórico, cerrar sin urgencia). Al final, el bloque `─── LIMPIEZA ───` declara qué borró: debe decir que el proyecto de prueba quedó **eliminado** y, si hubo notificación falsa, cuántas borró. Si algo dijera `⚠ QUEDÓ SIN BORRAR`, avisar.

Con esos dos resultados, Josué tiene todo para decidir qué se corrige y en qué orden. **Este informe no corrige nada**, como pedía el encargo.

---

## Nota de método

Lo verificable con certeza (el ACL de las funciones, el impacto de cada una, la consistencia del repo) se comprobó ejecutándolo en un PostgreSQL 16 con las 29 migraciones aplicadas — no razonándolo. Lo que depende de la configuración de producción (alcance por REST) o del estado vivo (divergencia) no se pudo tocar desde aquí y se entrega como scripts de solo lectura para correr con las credenciales reales. No se escribió nada en ningún esquema; las escrituras de prueba fueron sobre la base local desechable, y la única que tocaría producción (la notificación falsa del script de Parte A) queda a cargo de ese script, que la borra.

---

# Cierre — qué pasó después (07-ago-2026)

*Sección agregada al cerrar el trabajo. El informe de arriba queda tal como se
escribió: es el registro de lo que se sabía en ese momento. Esto es lo que las
corridas contra producción y el pedido #290 respondieron después.*

## Las dos preguntas del dueño quedaron respondidas

**¿La base desplegada es lo que dice el repo? SÍ.** Era la pregunta que arriba
quedó abierta porque este entorno no alcanza producción. Josué corrió
`docs/consulta-296-auditoria-base.sql` en el SQL Editor y el resultado fue
**limpio**: las reglas de acceso de la base coinciden exactamente con el repo,
las doce tablas tienen RLS activa, ninguna política concede acceso sin
condición, y los triggers, la vista y las columnas calzan uno a uno. **No hay
una segunda #281 escondida.** La referencia contra la que se comparó es la de
la sección "Parte B" de este informe.

**¿#290 era un problema real? SÍ, y ya está cerrado.** Se resolvió con la
**migración 30** (`20260707000030_execute_publico.sql`), aplicada y verificada
en producción el mismo día. Retiró el permiso universal de **36 funciones**,
dejando intacto todo permiso explícito. Comprobado en la base real:

```
abiertas_a_todos      = 0
crear_notificacion    = {postgres=X/postgres, service_role=X/postgres}
usuario_tiene_acceso  = {postgres=X/postgres, service_role=X/postgres}
es_admin              = {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

Las dos peligrosas quedaron solo para los roles internos; los ayudantes que usan
las políticas de RLS conservaron su `authenticated`, que es lo que evitaba
romperlas.

## Lo que este informe no vio, y conviene decirlo

**Se me pasó `usuario_tiene_acceso`.** Es `security definer` y responde si OTRO
usuario tiene acceso a OTRO proyecto sin comprobar quién pregunta — no expone
contenido, pero permite sondear quién trabaja en qué. Su permiso también venía
solo de `PUBLIC`. Apareció al revisar la salida real de la auditoría, no en
este informe. Quedó cerrada junto con `crear_notificacion` en la migración 30.

La lección para la próxima auditoría: la clasificación de arriba ("~13
ayudantes de permiso, inofensivos porque solo hablan del propio usuario") era
correcta en general pero **se aplicó demasiado rápido a una función que sí
recibe el usuario a consultar como parámetro**. Conviene mirar las firmas una
por una en vez de agrupar por familia.

## Lo que se decidió NO averiguar

**Si `crear_notificacion` era alcanzable por la API REST quedó sin comprobar, a
propósito.** El pedido #290 lo resolvió así: el resultado solo habría cambiado
la urgencia, no la decisión de cerrarla. Por eso `docs/prueba-296-alcance-rpc.mjs`
no llegó a correrse contra producción. **Se conserva en el repo** porque sigue
siendo útil: responde la misma pregunta para cualquier función futura, y ya trae
el resguardo de crear su propio terreno de prueba sin tocar datos de clientes.

## Qué quedó vigilando esto de aquí en adelante

La compuerta trae desde #290 el caso `probarExecutePublico`, que lee la vista
`permiso_ejecucion_abierto` y **se pone en rojo por la sola presencia** del
permiso universal en cualquier función — sin depender de que nadie intente
explotarlo. Es lo que impide que este agujero, que estuvo abierto un mes sin que
nadie lo notara, vuelva a pasar inadvertido.

**Queda una decisión abierta, menor:** si conviene agregar
`alter default privileges revoke execute on functions from public` (la variante
global, la única que funciona) para que las funciones nuevas nazcan cerradas. Se
recomendó **no** hacerlo: alcanza a cualquier esquema —incluidas extensiones
futuras— y el beneficio ya lo da la compuerta. Detalle en el PR de #290.
