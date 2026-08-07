# #297 — Diagnóstico: el primer frente de un proyecto nuevo no aparecía

Reapertura de #297. El PR #70 estaba mergeado y el síntoma seguía reportándose
en producción. Este documento deja constancia de la reproducción, del valor real
que tenía la selección de frente, de por qué el arreglo anterior no bastó y de
un segundo defecto —de orden— que también quedó corregido.

**Método:** esta vez se reprodujo antes de concluir. Nada de lo que sigue es
lectura de código: todo está medido con la aplicación corriendo.

---

## 1. Reproducción

Se instrumentó `App.tsx` temporalmente para registrar, en cada render, el valor
de `{ pantalla, proyectoActivoId, frenteSel }`, y se recorrió el camino exacto
de la sección 1 del pedido con Playwright sobre `vite preview`.

Se corrió el **experimento pareado**: el mismo camino, la misma máquina, la
misma latencia simulada (300 ms en `createProyecto`, para imitar la ida y vuelta
a Supabase), cambiando **una sola línea**: la del PR #70.

| | Sin la línea del PR #70 | Con la línea del PR #70 |
|---|---|---|
| `frenteSel` tras crear el proyecto | `f-lev` | `todos` |
| ¿Se queda dentro del proyecto nuevo? | sí | sí |
| Tras crear el primer frente: ¿sigue el mensaje de vacío? | **sí** | no |
| Tras crear el primer frente: ¿está en la lateral? | sí | sí |
| Títulos en la vista principal | `[]` | `['Frente…']` |

La columna izquierda es, punto por punto, el síntoma de la sección 1 del pedido.
La derecha no lo tiene.

Secuencia registrada en la columna izquierda:

```
══ PASO 1: clic en un frente concreto ══
{"pantalla":"proyectos","proyectoActivoId":"p-arauco","frenteSel":"f-lev"}
══ PASO 2: crear proyecto nuevo ══
{"pantalla":"proyectos","proyectoActivoId":"df501300-…","frenteSel":"f-lev"}
══ PASO 3: crear el primer frente desde el botón del centro ══
{"pantalla":"proyectos","proyectoActivoId":"df501300-…","frenteSel":"f-lev"}
```

---

## 2. Qué valor tenía el frente seleccionado y de dónde venía

**Valor:** `f-lev` — el id del frente **"Levantamiento", del proyecto anterior**
("Plan PGP Arauco"). No es `todos` ni el id del frente recién creado.

**Origen:** lo puso `onSelectFrente` en el paso 1, cuando el dueño hizo clic en
ese frente en la barra lateral. De ahí en adelante nadie lo tocó: al crear el
proyecto, la selección viajó intacta al proyecto nuevo.

La vista principal filtra `frente.proyectoId === proyectoActivo && frente.id === frenteSel`.
Con `frenteSel = f-lev` y el proyecto nuevo activo, ese filtro da **cero frentes
siempre**, cree uno o cree veinte. De ahí el mensaje falso.

La barra lateral filtra solo por proyecto, sin mirar `frenteSel`. Por eso ella sí
mostraba el frente. Y el clic del paso 5 funcionaba porque ese clic es
justamente `onSelectFrente`, que pone `frenteSel` en el frente nuevo.

### El dato de observación de la sección 3 del pedido

El dueño vio "el frente nuevo marcado como activo en la barra lateral". **Medido:
en el estado del síntoma hay CERO filas marcadas como activas** (`.nav-frente-row--activo`
= 0). La marca depende de `frenteSel === frente.id`, y `frenteSel` valía el
frente de *otro* proyecto, que no está en la lista.

Es decir: de las dos ramas que el pedido planteaba, la comprobada es la segunda
—la observación fue del aspecto visual, no del estado—. La primera rama (que la
lateral y la vista principal lean valores distintos) queda **descartada con
medición**: ambas reciben `frenteSel` y el id del proyecto activo del mismo
render del mismo componente.

---

## 3. Por qué el arreglo del PR #70 no bastó

**En lenguaje simple:** el arreglo era el correcto y funciona. Lo que no bastó
fue el arreglo *como llegó al navegador*. El experimento pareado de arriba
muestra que, con esa línea puesta, el síntoma no ocurre — y sin ella ocurre
exactamente como se describió.

Una pestaña que quedó abierta desde antes del despliegue **sigue ejecutando el
código anterior** hasta que se recarga: Vercel publica el archivo nuevo, pero
la pestaña ya abierta no vuelve a pedirlo. Por eso se pudo probar "en producción
con el arreglo puesto" y ver el comportamiento de antes del arreglo.

**Comprobación de un minuto, del lado del dueño:** abrir la aplicación, forzar
la recarga (Ctrl+Shift+R, o Cmd+Shift+R en Mac) y repetir el camino de la
sección 1. Si el frente aparece de inmediato, era esto.

**Si tras la recarga forzada el síntoma sigue,** entonces hay una tercera vía
que no está en este código y hace falta: (a) una captura de la barra lateral y
la vista principal en el momento del síntoma, y (b) confirmación de por cuál de
los dos botones se creó el proyecto (el **+** de la barra lateral o
Administración → Proyectos).

### Los caminos de creación de proyecto

Se auditaron todos. Hay **exactamente dos**, y los dos pasan por
`actions.createProyecto`, así que los dos llevan el arreglo:

| Entrada | Archivo | Llamada |
|---|---|---|
| **+** de la barra lateral | `src/components/Sidebar.tsx` | `actions.createProyecto(d)` |
| Administración → Proyectos → Nuevo | `src/components/AdminProyectosView.tsx` | `actions.createProyecto(d)` |

No hay una entrada alternativa que se saltee el reinicio de la selección.

---

## 4. Segundo defecto, distinto, encontrado y corregido

Al reproducir apareció un defecto de **orden**, el que en la ronda anterior se
había reportado como "defecto 2 de navegación": al crear un proyecto la
aplicación terminaba en Resumen en vez de entrar al proyecto nuevo.

Traza medida, antes de corregirlo:

```
{"pantalla":"proyectos","proyectoActivoId":"<nuevo>","nProyectosEnEstado":2,"estáEnEstado":false}
{"pantalla":"proyectos","proyectoActivoId":"<nuevo>","nProyectosEnEstado":3,"estáEnEstado":true}
{"pantalla":"resumen",  "proyectoActivoId":"p-arauco"}
```

`createProyecto` **navegaba al proyecto nuevo antes de meterlo en el estado**.
En ese render intermedio el efecto que corrige el proyecto activo (#260, "el
acceso quitado no rompe la pantalla") no encontraba el proyecto entre los
visibles —todavía no estaba—, lo leía como "ya no accesible" y devolvía a
Resumen.

Solo se veía cuando la respuesta llegaba muy rápido: en modo Local siempre, y en
producción no, porque con la latencia de red los dos cambios caen en el mismo
lote de React y el render intermedio no existe. **No es el síntoma reportado**
—el pedido dice explícitamente que sí se entra al proyecto nuevo—, pero impedía
demostrar el camino de la sección 1 en preview, que es el criterio 1 del pedido.

**Corrección:** una línea en `createProyecto` — el proyecto entra al estado en el
mismo lote que la navegación. `upsertProyecto` es idempotente, así que el parche
que `run` aplica después no cambia nada.

---

## 5. Propuesta (sin implementar): que la vista se proteja sola

El pedido pide informar si conviene que la vista principal se proteja frente a
una **selección imposible** — un `frenteSel` que apunta a un frente que no
pertenece al proyecto que se está mirando. Hoy, en ese estado, la vista muestra
un mensaje que dice algo falso: "Este proyecto aún no tiene frentes" cuando sí
los tiene.

**Vías conocidas hacia ese estado:**

1. Crear un proyecto sin reiniciar la selección — **cerrada** (PR #70).
2. El efecto de corrección de proyecto activo (`App.tsx`, "Selección inicial /
   corrección de proyecto activo"): cambia `proyectoActivoId` sin tocar
   `frenteSel`. Se dispara cuando el proyecto que se miraba deja de ser
   visible — se archiva, lo eliminan o quitan el acceso, propio o ajeno vía
   tiempo real. **Abierta.**

Con dos vías conocidas y una corrección que ya no alcanzó una vez, la
recomendación es **sí, y por la opción A**.

### Opción A — la vista ignora una selección que no le corresponde (recomendada)

En `TableView` y `GanttView`, tratar `frenteSel` como aplicable **solo si ese
frente pertenece al proyecto que se está mostrando**; si no, comportarse como
"todos".

```
// hoy
frenteSel === 'todos' || f.id === frenteSel
// propuesta
frenteSel === 'todos' || !selecciónAplicable || f.id === frenteSel
```

- **Costo:** ~6 líneas repartidas en dos archivos, más una comprobación
  compartida. Sin migración, sin tocar la barra lateral ni la creación de
  frentes. Riesgo bajo: cuando la selección **sí** corresponde al proyecto, el
  comportamiento es idéntico al de hoy.
- **Qué gana:** el mensaje falso deja de ser posible por construcción, venga la
  selección de donde venga. Cierra la vía 2 y cualquier vía futura sin tener que
  descubrirla primero.
- **Qué cuesta:** la vista deja de ser un espejo literal de `frenteSel`. Si
  alguna vez conviene que un frente de otro proyecto se muestre a propósito,
  esta protección lo impide (hoy no hay ningún caso así).
- **Cuidado:** hay que corregir la vista, no "arreglar" `frenteSel` desde un
  efecto. Un efecto que reinicie la selección al detectar el desajuste agrega un
  render de más y una regla implícita difícil de seguir.

### Opción B — cerrar la vía 2 en el origen

Que el efecto de corrección de proyecto activo reinicie `frenteSel` cuando
cambia de proyecto.

- **Costo:** ~3 líneas en un solo lugar.
- **Qué gana:** cierra la vía 2.
- **Qué cuesta:** no cierra las vías futuras. Es la misma clase de arreglo que
  el PR #70: correcto y puntual. Cada vía nueva pedirá su propio parche, y el
  mensaje falso seguirá siendo alcanzable hasta que se descubra.

### Opción C — no hacer nada

Cerrar la vía 2 cuando aparezca. Defendible si se prefiere no tocar el filtro:
las dos vías conocidas quedan cerradas y la prueba `docs/prueba-297-frente-al-crear.mjs`
avisa si la primera se reabre. El costo es que el mensaje falso sigue siendo
posible y es de los que hacen dudar del dato, no de la pantalla.

**Recomendación: A.** Es la única que hace el estado imposible en vez de
inalcanzable, cuesta poco y no cambia nada del comportamiento correcto. Queda
sin implementar, a la espera de la decisión.

---

## 6. Cómo volver a comprobarlo

```bash
npm run build
npx vite preview --port 4173 &
node docs/prueba-297-frente-al-crear.mjs
```

17 comprobaciones, todas en verde. Cubre los criterios 1, 4, 5 y 6 del pedido en
Tabla y en Gantt. La prueba tiene controles negativos documentados en su cabecera:
quitando cualquiera de las dos correcciones, falla.
