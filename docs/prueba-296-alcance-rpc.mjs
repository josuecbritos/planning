// =====================================================================
// #296 — Parte A: ¿son ALCANZABLES las funciones internas desde afuera?
//
// "Intentarlo de verdad, no razonarlo" (pedido §2). Este script llama a la
// API REST de Supabase (la capa que ven los clientes reales) e INTENTA
// invocar las funciones internas por RPC, desde:
//   · una sesión de USUARIO NORMAL (un cliente invitado de prueba), y
//   · una sesión SIN AUTENTICAR (solo la anon key).
//
// Reporta, por función, si la capa la EXPONE y si la EJECUTA o la rechaza.
// Distingue lo que el catálogo dice (tener permiso) de lo alcanzable de
// verdad (que la REST la publique) — son cosas distintas (pedido §2).
//
// LA ÚNICA ESCRITURA que puede ocurrir es la notificación falsa de la
// prueba de `crear_notificacion`. Si se crea, el script la BORRA con la
// sesión admin y lo dice. Nada más se escribe.
//
// USO (mismas credenciales que la compuerta):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//   RLS_ADMIN_EMAIL=... RLS_ADMIN_PASS=... \
//   RLS_CLIENTE_EMAIL=... RLS_CLIENTE_PASS=... \
//   node docs/prueba-296-alcance-rpc.mjs
//
// Necesita el admin (para preparar una tarea real y limpiar) y un cliente
// normal (el "atacante"). Si falta el cliente, se prueba solo anon.
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
  console.error('RLS_ADMIN_* es obligatorio (para preparar la tarea de prueba y limpiar).')
  process.exit(2)
}
const admin = await sesion(adminEmail, adminPass)

// Un cliente normal (el "atacante"). Opcional: sin él se prueba solo anon.
let atacante = null
if (process.env.RLS_CLIENTE_EMAIL && process.env.RLS_CLIENTE_PASS) {
  atacante = await sesion(process.env.RLS_CLIENTE_EMAIL, process.env.RLS_CLIENTE_PASS)
}

// -- Preparación mínima: una tarea real (id válido) y una víctima --------
// Se usa una tarea y un usuario que YA existen; no se crea nada nuevo salvo,
// eventualmente, la notificación falsa (que se borra). La víctima es
// cualquier usuario que NO sea el atacante.
const { data: tareas } = await admin.from('tarea').select('id').limit(1)
const { data: usuarios } = await admin.from('usuario_visible').select('id').limit(5)
const tareaId = tareas?.[0]?.id ?? null
const { data: yoAtacante } = atacante ? await atacante.auth.getUser() : { data: { user: null } }
const { data: filaAtacante } = atacante
  ? await atacante.from('usuario_visible').select('id').eq('auth_id', yoAtacante.user.id).maybeSingle()
  : { data: null }
const victima = (usuarios ?? []).map((u) => u.id).find((id) => id !== filaAtacante?.id) ?? null

console.log('\n═══ #296 Parte A — alcance de funciones internas por REST ═══')
console.log(`Contexto: tareaId=${tareaId ? 'ok' : 'NINGUNA (algunas pruebas se omiten)'} · víctima=${victima ? 'ok' : 'NINGUNA'} · atacante=${atacante ? 'sí' : 'no (solo anon)'}\n`)

// -- 1) crear_notificacion — el caso que importa -------------------------
console.log('1) crear_notificacion (destinatario = OTRO usuario, autor falsificado):')
let creoFalsa = false
async function probarCrearNotif(cli, quien) {
  if (!victima || !tareaId) {
    console.log(`  SKIP [${quien}] falta una tarea o una víctima para probar`)
    return
  }
  const r = await cli.rpc('crear_notificacion', {
    p_dest: victima,
    p_autor: filaAtacante?.id ?? victima,
    p_tipo: 'asignacion',
    p_tarea: tareaId,
    p_dato: {},
  })
  const veredicto = leer('crear_notificacion', quien, r)
  if (veredicto === 'ejecuto') creoFalsa = true
}
await probarCrearNotif(anon, 'anon')
if (atacante) await probarCrearNotif(atacante, 'usuario normal')

// ¿Apareció la notificación falsa? (lo comprueba el admin, que ve todo)
if (creoFalsa && victima) {
  const { data: falsas } = await admin
    .from('notificacion')
    .select('id')
    .eq('usuario_id', victima)
    .eq('tarea_id', tareaId)
  const n = falsas?.length ?? 0
  console.log(`  → la notificación falsa ${n ? 'SÍ aparece' : 'no aparece'} para la víctima (filas=${n})`)
  // Limpieza obligatoria (pedido §2): borrar lo que la prueba creó.
  if (n) {
    for (const f of falsas) await admin.from('notificacion').delete().eq('id', f.id)
    const { data: quedan } = await admin.from('notificacion').select('id').eq('usuario_id', victima).eq('tarea_id', tareaId)
    console.log(`  → LIMPIEZA: ${n} notificación(es) de prueba borradas (quedan ${quedan?.length ?? 0}).`)
  }
}

// -- 2) El resto de las funciones internas (muestra representativa) -------
// Se intenta invocar cada una; interesa si la REST las expone y si corren.
// Los argumentos son de relleno: si la función se ejecuta, el veredicto ya
// se ve; si rechaza por permiso o no está expuesta, también.
console.log('\n2) Otras funciones internas nombradas en las migraciones 15/22:')
const OTRAS = [
  ['es_admin', {}],
  ['usuario_actual_id', {}],
  ['rol_actual', {}],
  ['es_dueno_proyecto', { p_proyecto: '00000000-0000-0000-0000-000000000000' }],
  ['tiene_acceso_proyecto', { p_proyecto: '00000000-0000-0000-0000-000000000000' }],
  ['comparte_proyecto', { p_usuario: '00000000-0000-0000-0000-000000000000' }],
  ['permisos_en', { p_proyecto: '00000000-0000-0000-0000-000000000000' }],
  ['proyecto_de_subfrente', { p_subfrente: '00000000-0000-0000-0000-000000000000' }],
  ['validar_permisos_tarea', {}],       // trigger fn: debe fallar fuera de contexto
  ['registrar_replanificacion', {}],    // trigger fn: idem
  ['crear_o_reactivar_usuario', { p_nombre: 'x', p_iniciales: 'x', p_email: 'no@usar.invalid', p_rol: 'cliente' }], // debe exigir admin adentro
]
for (const [fn, args] of OTRAS) {
  const cli = atacante ?? anon
  const quien = atacante ? 'usuario normal' : 'anon'
  leer(fn, quien, await cli.rpc(fn, args))
}

console.log('\n═══ fin Parte A. Interpretar con el informe docs/informe-296-auditoria-seguridad.md ═══')
console.log('Recordatorio: "expuesta y ejecuta" es el caso peligroso; "no expuesta" o "rechazada"')
console.log('significa que el catálogo concede el permiso pero la REST no la deja alcanzar.')
