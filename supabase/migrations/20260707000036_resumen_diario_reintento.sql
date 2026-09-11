-- =====================================================================
-- 36 · Que el resumen diario llegue aunque un intento falle (#358)
--
-- QUÉ PASÓ. El viernes 11-sep-2026 el resumen no salió, con 12 tareas
-- atrasadas y 3 venciendo ese día. A las 11:00 UTC —las 8:00 de Chile— la
-- función arrancó en 116 ms y falló a los 5,4 segundos con `Gateway Timeout`
-- al llamar a `resumen_diario_tomar_turno`. La base estaba sana en ese mismo
-- segundo: el trabajo del programador terminó en 180 ms, como todas las horas
-- del día. Falló la capa entre la función y la base, y la operación que se
-- estaba haciendo era insertar una fila.
--
-- POR QUÉ ESO COSTÓ EL DÍA ENTERO, y es lo que esta migración corrige:
--
--   · De las 24 llamadas del día, SOLO UNA hacía trabajo: la de las 8:00. Las
--     otras 23 salían en el acto porque "no es la hora". Una sola oportunidad,
--     y el tropiezo cayó justo ahí.
--   · Tomar el turno hacía DOS cosas a la vez: marcar que el día ya se hizo y
--     servir de candado. Como lo que falló fue esa misma inserción, no se
--     escribió ninguna fila: el registro quedó vacío y nadie se enteró.
--
-- Esta migración NO intenta evitar el fallo: es infraestructura ajena y va a
-- volver a ocurrir. Lo que cambia es que un tropiezo de segundos deje de
-- cerrar el día.
--
--   · La función deja de preguntar "¿son las 8:00?" y pasa a preguntar
--     "¿ya salió el de hoy?". Día hábil, pasada la hora de envío y el día
--     abierto: envía. El programador ya corre cada hora, así que si a las 8:00
--     falla, a las 9:00 sale. No hay que tocarlo.
--   · El registro del intento se escribe AL EMPEZAR, con su estado. Solo un
--     envío logrado CIERRA el día; un intento que falla lo deja abierto y
--     anota qué falló.
--   · Dos llamadas a la vez siguen sin poder enviar dos veces: el candado es
--     el `on conflict ... where` de abajo, que solo una puede ganar.
--
-- Y en la función de servidor, cada correo viaja con su clave de idempotencia
-- —`resumen-diario/<día>/<usuario>`—, que Resend guarda 24 horas: un reintento
-- no puede duplicar, ni siquiera en el caso peor de que el envío llegue y la
-- respuesta se pierda.
--
-- ADITIVA: agrega dos columnas a `resumen_diario_corrida` y redefine una
-- función. No borra datos ni toca ninguna otra tabla, política o permiso.
--
-- ANTES DE APLICAR: respaldo del dueño (`pg_dump`).
-- DESPUÉS DE APLICAR: redesplegar la función `resumen-diario` (usa
-- `resumen_diario_cerrar`, que antes no existía) y correr la compuerta
-- `scripts/validar-rls.mjs`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · El registro deja de ser "pasó / no pasó"
-- ---------------------------------------------------------------------
-- Dos pasos, con el mismo cuidado que la columna de #272: las filas que YA
-- existen son corridas terminadas y con envío, así que nacen `cerrado`; el
-- default pasa después a `en_curso`, que es como nace todo intento nuevo.
alter table resumen_diario_corrida add column if not exists estado text not null default 'cerrado';
alter table resumen_diario_corrida alter column estado set default 'en_curso';
alter table resumen_diario_corrida add column if not exists intentos integer not null default 1;

alter table resumen_diario_corrida drop constraint if exists resumen_diario_corrida_estado_check;
alter table resumen_diario_corrida add constraint resumen_diario_corrida_estado_check
  check (estado in ('en_curso', 'cerrado', 'fallido'));

comment on column resumen_diario_corrida.estado is
  '#358 · `en_curso` = alguien lo está intentando ahora. `cerrado` = el correo '
  'del día SALIÓ y no se vuelve a intentar. `fallido` = el intento no llegó a '
  'buen puerto y el día queda ABIERTO para el siguiente. Solo un envío logrado '
  'cierra el día.';
comment on column resumen_diario_corrida.intentos is
  '#358 · cuántas veces se intentó ese día. Más de uno significa que alguno '
  'falló — el motivo está en `detalle`.';

comment on table resumen_diario_corrida is
  '#272/#358 · Una fila por día en que el resumen diario intentó correr. El '
  'intento se anota al EMPEZAR; el día solo se cierra cuando el envío sale.';

-- ---------------------------------------------------------------------
-- 2 · El turno
-- ---------------------------------------------------------------------
/** ¿Hay que enviar el resumen AHORA, y me toca a mí hacerlo?
 *
 *  La pregunta cambió: ya no es "¿son las 8:00?" sino "¿ya salió el de hoy?".
 *  Con la anterior había UNA sola oportunidad al día y un tropiezo de segundos
 *  la gastaba entera.
 *
 *  LA HORA SE RESUELVE POR NOMBRE DE ZONA, nunca con un desfase fijo: el
 *  programador trabaja en UTC y Chile cambia de hora dos veces al año. Misma
 *  regla que `hoy_chile()` (#291).
 *
 *  Sábado y domingo no corre: el atraso se cuenta en días hábiles y el sábado
 *  repetiría lo del viernes. Y no se reintenta al día siguiente lo que no salió
 *  hoy: cada día tiene su propia fila y su propia pregunta.
 *
 *  EL CANDADO es el `where` del `on conflict`, y es lo que hace que dos
 *  llamadas simultáneas no puedan enviar dos veces: el `insert` toma el
 *  bloqueo de la fila, así que la segunda espera y después ve el estado que
 *  dejó la primera.
 *
 *    · no hay fila           → se inserta: turno tomado.
 *    · `cerrado`             → el `where` no se cumple: NADIE más envía hoy.
 *    · `fallido`             → se retoma: es justo el caso que #358 viene a
 *                              arreglar.
 *    · `en_curso` reciente   → hay otro trabajando: no se toma.
 *    · `en_curso` viejo      → el intento anterior murió sin cerrar ni anotar
 *                              (una función que revienta a medias). Sin esta
 *                              salida el día quedaría trabado para siempre.
 *                              Diez minutos: la función de servidor no puede
 *                              durar tanto ni de lejos.
 *
 *  `p_forzar` saltea el día y la hora —es para verificar desde el dashboard—
 *  pero NO saltea el estado: con el día cerrado no manda un segundo correo.
 *  Para repetir un envío a propósito hay que borrar la fila del día a mano. */
create or replace function resumen_diario_tomar_turno(p_forzar boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ahora  timestamp := now() at time zone 'America/Santiago';
  v_hoy    date := v_ahora::date;
  v_tomado boolean;
begin
  if not p_forzar then
    if extract(isodow from v_ahora) >= 6 then return false; end if;  -- sábado y domingo
    if extract(hour from v_ahora) < 8 then return false; end if;     -- antes de las 8:00 de Chile
  end if;

  insert into resumen_diario_corrida (fecha, estado, intentos, iniciada, terminada, forzada)
  values (v_hoy, 'en_curso', 1, now(), null, p_forzar)
  on conflict (fecha) do update
    set estado    = 'en_curso',
        intentos  = resumen_diario_corrida.intentos + 1,
        iniciada  = now(),
        terminada = null,
        forzada   = resumen_diario_corrida.forzada or p_forzar
  where resumen_diario_corrida.estado = 'fallido'
     or (resumen_diario_corrida.estado = 'en_curso'
         and resumen_diario_corrida.iniciada < now() - interval '10 minutes')
  returning true into v_tomado;

  return coalesce(v_tomado, false);
end $$;
revoke execute on function resumen_diario_tomar_turno(boolean) from public;
revoke execute on function resumen_diario_tomar_turno(boolean) from anon, authenticated;
grant execute on function resumen_diario_tomar_turno(boolean) to service_role;

-- ---------------------------------------------------------------------
-- 3 · Cerrar el intento
-- ---------------------------------------------------------------------
/** Anota cómo terminó el intento de hoy. SOLO un envío logrado cierra el día.
 *
 *  `p_fallidos = 0` → `cerrado`: el correo salió y nadie más envía hoy.
 *  `p_fallidos > 0` → `fallido`: el día queda ABIERTO y el intento siguiente
 *  vuelve a probar. Con la clave de idempotencia de Resend, a quien ya le
 *  llegó no le llega de nuevo, así que reintentar solo alcanza a los que
 *  faltaban.
 *
 *  CERO DESTINATARIOS TAMBIÉN CIERRA, y es deliberado: "no había nada que
 *  mandar" es una corrida completa, no un fallo. Si no cerrara, la pregunta se
 *  repetiría cada hora y el criterio de #272 —se mira una vez al día— dejaría
 *  de valer.
 *
 *  `detalle` ACUMULA: un día con tres intentos tiene que poder contar los
 *  tres, no solo el último. `enviados` y `fallidos` son los del intento que
 *  acaba de terminar; cuántas veces se intentó lo dice `intentos`. */
create or replace function resumen_diario_cerrar(
  p_enviados integer,
  p_fallidos integer,
  p_detalle  text default null
)
returns void language sql security definer set search_path = public as $$
  update resumen_diario_corrida
     set terminada = now(),
         enviados  = p_enviados,
         fallidos  = p_fallidos,
         estado    = case when p_fallidos = 0 then 'cerrado' else 'fallido' end,
         detalle   = left(
           coalesce(detalle || E'\n', '') ||
           to_char(now() at time zone 'America/Santiago', 'HH24:MI') || ' · intento ' ||
           intentos || ': ' ||
           case when p_fallidos = 0 then 'ok, ' || p_enviados || ' enviado(s)'
                else coalesce(p_detalle, 'sin detalle') end,
           8000)
   where fecha = (now() at time zone 'America/Santiago')::date;
$$;
revoke execute on function resumen_diario_cerrar(integer, integer, text) from public;
revoke execute on function resumen_diario_cerrar(integer, integer, text) from anon, authenticated;
grant execute on function resumen_diario_cerrar(integer, integer, text) to service_role;

-- ---------------------------------------------------------------------
-- 4 · Comprobación en la misma transacción (#290)
-- ---------------------------------------------------------------------
-- La trampa que reaparece con cada función nueva: `resumen_diario_cerrar` no
-- existía, así que nace con EXECUTE para PUBLIC y `revoke ... from anon` no se
-- lo quita.
do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas from permiso_ejecucion_abierto;
  if v_abiertas > 0 then
    raise exception '#358/#290 — quedaron % función(es) con el permiso universal', v_abiertas;
  end if;
  raise notice '#358 — comprobado: la función nueva nace cerrada.';
end $$;

-- Comprobación (para dejar constancia al aplicar): las corridas que ya existían
-- quedan cerradas, y el default pasa a `en_curso`.
--
--   select fecha, estado, intentos, enviados, fallidos from resumen_diario_corrida
--    order by fecha desc;
--   select column_default from information_schema.columns
--    where table_name = 'resumen_diario_corrida' and column_name = 'estado';  -- 'en_curso'
