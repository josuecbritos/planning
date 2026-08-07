// =====================================================================
// #296 — Parte A: ¿son ALCANZABLES las funciones internas desde afuera?
//
// "Intentarlo de verdad, no razonarlo" (pedido §2). Este script llama a la
// API REST de Supabase (la capa que ven los clientes reales) e INTENTA
// invocar las funciones internas por RPC, desde:
//   · una sesión de USUARIO NORMAL (el consultor A de pruebas), y
//   · una sesión SIN AUTENTICAR (solo la anon key).
//
// Reporta, por función, si la capa la EXPONE y si la EJECUTA o la rechaza.
// Distingue lo que el catálogo dice (tener permiso) de lo alcanzable de
// verdad (que la REST la publique) — son cosas distintas (pedido §2).
//
// ---------------------------------------------------------------------
// ESTO CORRE CONTRA PRODUCCIÓN, CON CLIENTES REALES ADENTRO.
//
// Por eso el script NO toca ningún dato existente:
//
//   1. CREA SU PROPIO TERRENO: un proyecto `__prueba_296_...` con su
//      frente, su sub frente y una tarea. No usa la primera tarea que
//      encuentre ni ningún proyecto real.
//   2. LA VÍCTIMA ES UN USUARIO DE PRUEBA que el script crea para esto
//      (`__prueba_296_destinatario_...@example.invalid`), nunca una
//      persona real. Importa de verdad: las notificaciones llegan EN VIVO,
//      así que un cliente real habría VISTO la notificación falsa en
//      pantalla, y borrarla después no deshace que la haya visto.
//   3. LA LIMPIEZA borra solo lo que la prueba creó, por su id, y elimina
//      el terreno de prueba al terminar — aunque algo falle en el medio.
//
//   Si el terreno de prueba NO se puede crear, el script NO CORRE.
//   Mejor no probar que probar sobre datos de clientes.
// ---------------------------------------------------------------------
//
// USO (mismas credenciales que la compuerta):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//   RLS_ADMIN_EMAIL=... RLS_ADMIN_PASS=... \
//   RLS_CONSULTOR_A_EMAIL=consultor.a@andotek.cl RLS_CONSULTOR_A_PASS=... \
//   node docs/prueba-296-alcance-rpc.mjs
//
// El admin es obligatorio: crea el terreno de prueba y hace la limpieza.
// El consultor A es el "atacante" (un usuario normal). Si falta, se prueba
// solo la vía anónima y se avisa.
// =====================================================================

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (!URL || !ANON) {
  console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY.')
  process.exit(2)
}

const anon = createClient(URL, ANON, { auth: { persistSession: false } })

async function sesion(email, pass) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: pass })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

/** Interpreta la respuesta de un `.rpc()`: ¿expuesta? ¿ejecutó o rechazó? */
function leer(nombre, quien, { data, error }) {
  if (!error) {
    console.log(`  ⚠ EJECUTÓ   [${quien}] ${nombre} — la REST la expone Y la corrió (data=${JSON.stringify(data) ?? 'void'})`)
    return 'ejecuto'
  }
  const code = error.code ?? ''
  // PGRST202 = función no encontrada en el schema cache: NO está expuesta.
  if (code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
    console.log(`  ✓ no expuesta [${quien}] ${nombre} — la REST no la publica (${code || 'not found'})`)
    return 'no-expuesta'
  }
  // 42501 = permiso denegado: expuesta pero el rol no puede.
  if (code === '42501' || /permission denied/i.test(error.message)) {
    console.log(`  ✓ rechazada  [${quien}] ${nombre} — expuesta, pero sin permiso de ejecución (${code})`)
    return 'rechazada'
  }
  // Cualquier otro error (p. ej. constraint) significa que ENTRÓ a la función.
  console.log(`  ⚠ ALCANZÓ    [${quien}] ${nombre} — la función corrió y falló ADENTRO (${code}): ${error.message}`)
  return 'alcanzo'
}

const adminEmail = process.env.RLS_ADMIN_EMAIL
const adminPass = process.env.RLS_ADMIN_PASS
if (!adminEmail || !adminPass) {
  console.error('RLS_ADMIN_* es obligatorio: crea el terreno de prueba y lo limpia al final.')
  process.exit(2)
}
const admin = await sesion(adminEmail, adminPass)

// El "atacante": un usuario normal (consultor A de pruebas). Opcional.
let atacante = null
let filaAtacante = null
if (process.env.RLS_CONSULTOR_A_EMAIL && process.env.RLS_CONSULTOR_A_PASS) {
  atacante = await sesion(process.env.RLS_CONSULTOR_A_EMAIL, process.env.RLS_CONSULTOR_A_PASS)
  const { data: yo } = await atacante.auth.getUser()
  const { data: fila } = await atacante
    .from('usuario_visible').select('id').eq('auth_id', yo.user.id).maybeSingle()
  filaAtacante = fila
} else {
  console.log('AVISO: sin RLS_CONSULTOR_A_* solo se prueba la vía anónima.\n')
}

// =====================================================================
// TERRENO DE PRUEBA PROPIO. Si algo de esto falla, el script no corre.
// =====================================================================
const sello = Date.now()
const NOMBRE_PROYECTO = `__prueba_296_${sello}`
const CORREO_VICTIMA = `__prueba_296_destinatario_${sello}@example.invalid`
const CORREO_RPC_USUARIOS = `__prueba_296_rpc_${sello}@example.invalid`

let proyectoId = null
let tareaId = null
let victimaId = null
/** Ids de las notificaciones que ESTA prueba llegue a crear. */
const notificacionesCreadas = new Set()

function abortar(paso, detalle) {
  console.error(`\n⛔ NO SE PUDO PREPARAR EL TERRENO DE PRUEBA (${paso}): ${detalle}`)
  console.error('   El script NO corre: no se prueba sobre datos de clientes.')
}

async function limpiar() {
  console.log('\n─── LIMPIEZA ───')
  // 1) Las notificaciones que creó la prueba, por SU id (nunca por
  //    usuario+tarea: eso barrería notificaciones legítimas ajenas).
  if (notificacionesCreadas.size) {
    const ids = [...notificacionesCreadas]
    const { error } = await admin.from('notificacion').delete().in('id', ids)
    console.log(`  notificaciones de la prueba: ${ids.length} · borradas: ${error ? 'ERROR — ' + error.message : 'sí'}`)
  } else {
    console.log('  notificaciones de la prueba: ninguna que borrar')
  }
  // 2) El proyecto de prueba. Desde la migración 17 hay que archivarlo
  //    antes de poder eliminarlo; la cascada se lleva frente, sub frente,
  //    tarea y cualquier notificación que colgara de ellos.
  if (proyectoId) {
    await admin.from('proyecto').update({ estado: 'archivado' }).eq('id', proyectoId)
    const { error } = await admin.from('proyecto').delete().eq('id', proyectoId)
    const { data: queda } = await admin.from('proyecto').select('id').eq('id', proyectoId).maybeSingle()
    console.log(`  proyecto de prueba: ${queda ? '⚠ QUEDÓ SIN BORRAR' : 'eliminado'}${error ? ' — ' + error.message : ''}`)
  }
  // 3) Los usuarios de prueba: borrado lógico (no hay hard delete, #136).
  for (const correo of [CORREO_VICTIMA, CORREO_RPC_USUARIOS]) {
    const { data: u } = await admin.from('usuario_visible').select('id').eq('email', correo).maybeSingle()
    if (u) {
      const { error } = await admin.rpc('eliminar_usuario', { p_usuario: u.id })
      console.log(`  usuario de prueba ${correo}: ${error ? 'ERROR — ' + error.message : 'eliminado'}`)
    }
  }
}

try {
  // -- Víctima: un usuario de prueba creado para esto. NUNCA una persona real.
  const { data: victima, error: errVictima } = await admin.rpc('crear_o_reactivar_usuario', {
    p_nombre: 'Prueba 296 destinatario',
    p_iniciales: 'P2',
    p_email: CORREO_VICTIMA,
    p_rol: 'cliente',
  })
  if (errVictima || !victima?.id) {
    abortar('usuario víctima de prueba', errVictima?.message ?? 'sin fila')
    await limpiar()
    process.exit(2)
  }
  victimaId = victima.id

  // -- Proyecto → frente → sub frente → tarea, todo del script.
  const { data: proy, error: errProy } = await admin
    .from('proyecto').insert({ nombre: NOMBRE_PROYECTO }).select().single()
  if (errProy) { abortar('proyecto', errProy.message); await limpiar(); process.exit(2) }
  proyectoId = proy.id

  const { data: fr, error: errFr } = await admin
    .from('frente').insert({ proyecto_id: proyectoId, nombre: 'p296', orden: 0 }).select().single()
  if (errFr) { abortar('frente', errFr.message); await limpiar(); process.exit(2) }

  const { data: sf, error: errSf } = await admin
    .from('sub_frente').insert({ frente_id: fr.id, nombre: 'p296', orden: 0 }).select().single()
  if (errSf) { abortar('sub frente', errSf.message); await limpiar(); process.exit(2) }

  const { data: tarea, error: errT } = await admin
    .from('tarea').insert({ sub_frente_id: sf.id, titulo: 'p296', orden: 0 }).select().single()
  if (errT) { abortar('tarea', errT.message); await limpiar(); process.exit(2) }
  tareaId = tarea.id

  console.log('\n═══ #296 Parte A — alcance de funciones internas por REST ═══')
  console.log(`Terreno de prueba propio: proyecto ${NOMBRE_PROYECTO} · tarea creada · víctima de prueba creada`)
  console.log(`Atacante: ${atacante ? (process.env.RLS_CONSULTOR_A_EMAIL + ' (usuario normal)') : 'ninguno (solo anon)'}`)
  console.log('Ningún dato de clientes se lee ni se toca.\n')

  // -- 1) crear_notificacion — el caso que importa -----------------------
  // Destinatario: la víctima DE PRUEBA. Autor: falsificado a gusto.
  console.log('1) crear_notificacion (destinatario = usuario de prueba, autor falsificado):')
  async function probarCrearNotif(cli, quien) {
    const antes = await admin.from('notificacion').select('id').eq('tarea_id', tareaId)
    const idsAntes = new Set((antes.data ?? []).map((n) => n.id))

    const r = await cli.rpc('crear_notificacion', {
      p_dest: victimaId,
      p_autor: filaAtacante?.id ?? victimaId,
      p_tipo: 'asignacion',
      p_tarea: tareaId,
      p_dato: {},
    })
    leer('crear_notificacion', quien, r)

    // ¿Apareció? Se comprueba contra la tarea de prueba, y se registran los
    // ids NUEVOS para poder borrar exactamente esos y nada más.
    const despues = await admin.from('notificacion').select('id').eq('tarea_id', tareaId)
    const nuevas = (despues.data ?? []).filter((n) => !idsAntes.has(n.id))
    for (const n of nuevas) notificacionesCreadas.add(n.id)
    console.log(`  → notificación falsa efectivamente creada: ${nuevas.length ? `SÍ (${nuevas.length})` : 'no'}`)
  }
  await probarCrearNotif(anon, 'anon')
  if (atacante) await probarCrearNotif(atacante, 'usuario normal')

  // -- 2) El resto de las funciones internas -----------------------------
  // Argumentos inofensivos: uuid inexistente para las de consulta, y un
  // correo de prueba para la RPC de usuarios (que debe exigir admin).
  console.log('\n2) Otras funciones internas nombradas en las migraciones 15/22:')
  const NADA = '00000000-0000-0000-0000-000000000000'
  const OTRAS = [
    ['es_admin', {}],
    ['usuario_actual_id', {}],
    ['rol_actual', {}],
    ['es_dueno_proyecto', { p_proyecto: NADA }],
    ['tiene_acceso_proyecto', { p_proyecto: NADA }],
    ['comparte_proyecto', { p_usuario: NADA }],
    ['permisos_en', { p_proyecto: NADA }],
    ['proyecto_de_subfrente', { p_subfrente: NADA }],
    ['validar_permisos_tarea', {}],    // trigger fn: debe fallar fuera de contexto
    ['registrar_replanificacion', {}], // trigger fn: idem
    // Debe exigir admin por dentro. Si igual creara el usuario, la limpieza
    // lo elimina (el correo es de prueba y está en la lista de limpieza).
    ['crear_o_reactivar_usuario', {
      p_nombre: 'Prueba 296 rpc', p_iniciales: 'P2', p_email: CORREO_RPC_USUARIOS, p_rol: 'cliente',
    }],
  ]
  for (const [fn, args] of OTRAS) {
    const cli = atacante ?? anon
    const quien = atacante ? 'usuario normal' : 'anon'
    leer(fn, quien, await cli.rpc(fn, args))
  }

  console.log('\n═══ fin Parte A. Interpretar con el informe docs/informe-296-auditoria-seguridad.md ═══')
  console.log('Recordatorio: "expuesta y ejecuta" es el caso peligroso; "no expuesta" o "rechazada"')
  console.log('significa que el catálogo concede el permiso pero la REST no la deja alcanzar.')
} finally {
  // Pase lo que pase —error, excepción o éxito—, no queda nada de la prueba.
  await limpiar()
}
