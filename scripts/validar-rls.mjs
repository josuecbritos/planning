// =====================================================================
// Compuerta de validación de RLS — roles y permisos
//
// Consulta la API de Supabase DIRECTO (sin pasar por la interfaz), rol por
// rol, y verifica que la RLS IMPIDE el acceso indebido — no solo que la UI
// lo oculta. Correr DESPUÉS de aplicar la migración 12 y ANTES de invitar
// usuarios reales.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//   RLS_ADMIN_EMAIL=... RLS_ADMIN_PASS=... \
//   RLS_CONSULTOR_A_EMAIL=... RLS_CONSULTOR_A_PASS=... \
//   RLS_CONSULTOR_B_EMAIL=... RLS_CONSULTOR_B_PASS=... \
//   RLS_CLIENTE_EMAIL=... RLS_CLIENTE_PASS=... \
//   node scripts/validar-rls.mjs
//
// El admin es obligatorio (es la línea base: ve todo). Los demás roles son
// opcionales: los que falten se omiten con aviso. Para probar el modelo
// completo, crear en Usuarios: un consultor A (con proyecto propio), un
// consultor B, y un cliente asignado a un proyecto — con contraseña ya
// definida (aceptar su invitación antes de correr esto).
//
// El script solo hace escrituras de PRUEBA que espera que la RLS rechace,
// más un ciclo crear/eliminar proyecto con el consultor A (se limpia solo).
// =====================================================================

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (!URL || !ANON) {
  console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY (o sus variantes VITE_).')
  process.exit(2)
}

const resultados = []
function marca(ok, rol, prueba, detalle = '') {
  resultados.push({ ok, rol, prueba, detalle })
  console.log(`${ok ? '  PASS' : '✗ FAIL'}  [${rol}] ${prueba}${detalle ? ` — ${detalle}` : ''}`)
}

/** true si la operación fue BLOQUEADA por RLS: error, o 0 filas afectadas. */
function bloqueado(res) {
  if (res.error) return true
  const d = res.data
  return d == null || (Array.isArray(d) && d.length === 0)
}

async function sesion(email, pass) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: pass })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

async function perfilDe(c) {
  // La tabla base `usuario` ya no permite SELECT directo desde el cliente
  // (seguridad §3): la lista se lee por la vista enmascarada usuario_visible.
  const { data } = await c.from('usuario_visible').select('*')
  const { data: yo } = await c.auth.getUser()
  return data?.find((u) => u.auth_id === yo.user.id)
}

/**
 * #202: barrido GARANTIZADO de los proyectos de prueba.
 *
 * Los `__prueba_rls_*` se colaban a producción porque la limpieza vivía en el
 * camino feliz y, desde la migración 17, un DELETE sobre un proyecto ACTIVO no
 * borra nada: la política exige `estado = 'archivado'` y el cliente de esta
 * compuerta es un admin normal (clave anónima), así que le aplica RLS. Como un
 * DELETE que no afecta filas no es un error, fallaba en silencio.
 *
 * Aquí se archivan primero y se borran después, y se corre SIEMPRE —también si
 * una prueba falla o revienta— desde un `finally`.
 */
/**
 * #248 — La tabla `usuario` no debe exponer nada que la vista `usuario_visible`
 * no exponga. La única diferencia posible entre ambas era el filtro de
 * eliminados; la migración 19 lo cierra en la política de SELECT.
 *
 * Se comparan por id, con las columnas que el grant permite. Si la tabla
 * devolviera un id que la vista no tiene, esa persona está viendo a alguien
 * eliminado y la compuerta debe caer.
 */
async function compararTablaContraVista(c, rotulo) {
  const { data: enTabla, error } = await c.from('usuario').select('id, nombre')
  if (error) {
    // Sin grant de SELECT no hay nada que comparar: la tabla no expone nada,
    // que es aún más restrictivo que lo pedido.
    marca(true, rotulo, 'la tabla usuario no expone más que la vista', `sin lectura directa (${error.code})`)
    return
  }
  const { data: enVista } = await c.from('usuario_visible').select('id')
  const idsVista = new Set((enVista ?? []).map((u) => u.id))
  const soloEnTabla = (enTabla ?? []).filter((u) => !idsVista.has(u.id))
  marca(
    soloEnTabla.length === 0,
    rotulo,
    'la tabla usuario no expone más que la vista (eliminados incluidos)',
    soloEnTabla.length
      ? `FUGA: ${soloEnTabla.length} fila(s) legibles en la tabla y ocultas en la vista`
      : `${enTabla?.length ?? 0} filas, idénticas a la vista`,
  )
}

// #255/#260 — El canal de tiempo real no reparte de más. Realtime evalúa la
// RLS del SUSCRIPTOR para INSERT/UPDATE, y acá se comprueba con oyentes
// simultáneos sobre dos tablas de un mismo hecho real:
//
// `notificacion` (entrega 1) — RLS por destinatario:
//   · B (el destinatario), suscrito con su filtro → DEBE recibirla.
//   · C (otro usuario), suscrito SIN filtro, como lo haría un cliente
//     malicioso → NO debe recibir ningún INSERT/UPDATE.
//   · El admin, también sin filtro → tampoco: la política de notificacion no
//     tiene bypass de admin, y el canal debe respetarlo igual que la lectura.
// Los DELETE quedan fuera de la aserción: Realtime no les aplica RLS (la fila
// ya no existe) y por diseño viajan solo con la clave primaria — ver la
// migración 20. Se registran aparte, como dato.
// `tarea` (entrega 2) — RLS por MEMBRESÍA, sin filtro de servidor. Se prueba
// como representante de la familia de datos (frente, sub_frente, proyecto,
// acceso_proyecto, comentario, replanificacion comparten los mismos predicados
// de membresía, ya validados por esta compuerta en lectura):
//   · B, hecho MIEMBRO del proyecto de prueba → DEBE recibir el INSERT.
//   · C, no miembro, suscrito sin filtro → cero INSERT/UPDATE.
//   (El admin ve todas las tareas por RLS, así que su canal de tarea SÍ
//   recibiría — no es fuga; no se asierta.)
// Todo se genera DE VERDAD: el admin crea un proyecto de prueba
// (__prueba_rls_rt_*, el barrido de limpieza lo recoge), agrega a B como
// miembro y asigna una tarea a B; los triggers hacen el resto.
async function probarCanalTiempoReal(admin) {
  const rotulo = 'canal'
  const emailB = process.env.RLS_CONSULTOR_A_EMAIL
  const passB = process.env.RLS_CONSULTOR_A_PASS
  const emailC = process.env.RLS_CLIENTE_EMAIL ?? process.env.RLS_CONSULTOR_B_EMAIL
  const passC = process.env.RLS_CLIENTE_PASS ?? process.env.RLS_CONSULTOR_B_PASS
  if (!emailB || !passB || !emailC || !passC) {
    console.log('  SKIP  [canal] hacen falta RLS_CONSULTOR_A_* y (RLS_CLIENTE_* o RLS_CONSULTOR_B_*)')
    return
  }

  const b = await sesion(emailB, passB)
  const cAjeno = await sesion(emailC, passC)
  const yoB = await perfilDe(b)
  const yoC = await perfilDe(cAjeno)
  if (!yoB || !yoC) {
    marca(false, rotulo, 'sesiones del canal legibles')
    return
  }

  // El token del suscriptor es lo que Realtime usa para evaluar la RLS.
  for (const cli of [b, cAjeno, admin]) {
    const { data } = await cli.auth.getSession()
    if (data.session) await cli.realtime.setAuth(data.session.access_token)
  }

  const eventos = { B: [], C: [], admin: [], 'B:tarea': [], 'C:tarea': [] }
  const canales = []
  function escuchar(cliente, nombre, filtro, tabla = 'notificacion') {
    return new Promise((resolver) => {
      const canal = cliente
        .channel(`compuerta:${nombre}:${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
          (ev) => eventos[nombre].push(ev.eventType),
        )
        .subscribe((estado) => {
          if (estado === 'SUBSCRIBED') resolver(true)
          if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') resolver(false)
        })
      canales.push({ cliente, canal })
      setTimeout(() => resolver(false), 10_000)
    })
  }

  try {
    const suscritos = await Promise.all([
      escuchar(b, 'B', `usuario_id=eq.${yoB.id}`),
      escuchar(cAjeno, 'C'),   // sin filtro: simula un cliente modificado
      escuchar(admin, 'admin'), // sin filtro: ni el admin recibe lo ajeno
      // #260: la familia de datos, sin filtro — la barrera es la RLS por
      // membresía. B será miembro del proyecto de prueba; C no.
      escuchar(b, 'B:tarea', null, 'tarea'),
      escuchar(cAjeno, 'C:tarea', null, 'tarea'),
    ])
    if (!suscritos.every(Boolean)) {
      marca(false, rotulo, 'el canal conecta', '¿Realtime activo y migración 20 aplicada?')
      return
    }

    // Generar una notificación real para B: el admin le asigna una tarea.
    const { data: proy, error: errProy } = await admin
      .from('proyecto')
      .insert({ nombre: `__prueba_rls_rt_${Date.now()}` })
      .select()
      .single()
    if (errProy) {
      marca(false, rotulo, 'preparación (proyecto de prueba)', errProy.message)
      return
    }
    // #260: B entra como MIEMBRO (con eso la RLS le muestra la tarea y el
    // canal debe entregársela); C queda fuera.
    const { error: errAcc } = await admin
      .from('acceso_proyecto')
      .insert({ usuario_id: yoB.id, proyecto_id: proy.id })
    if (errAcc) {
      marca(false, rotulo, 'preparación (membresía de B)', errAcc.message)
      return
    }
    const { data: fr } = await admin
      .from('frente').insert({ proyecto_id: proy.id, nombre: 'rt', orden: 0 }).select().single()
    const { data: sf } = await admin
      .from('sub_frente').insert({ frente_id: fr.id, nombre: 'rt', orden: 0 }).select().single()
    const { error: errT } = await admin
      .from('tarea')
      .insert({ sub_frente_id: sf.id, titulo: 'rt', responsable_id: yoB.id, orden: 0 })
    if (errT) {
      marca(false, rotulo, 'preparación (tarea que notifica)', errT.message)
      return
    }

    // Espera activa: los eventos tardan típicamente < 1 s; techo de 10 s.
    const limite = Date.now() + 10_000
    while (
      Date.now() < limite &&
      !(eventos.B.includes('INSERT') && eventos['B:tarea'].includes('INSERT'))
    ) {
      await new Promise((r) => setTimeout(r, 250))
    }
    // Margen extra: si una fuga viniera en camino, que alcance a llegar.
    await new Promise((r) => setTimeout(r, 1_500))

    const conContenido = (lista) => lista.filter((t) => t === 'INSERT' || t === 'UPDATE')
    marca(
      eventos.B.includes('INSERT'),
      rotulo,
      'el destinatario SÍ recibe su notificación en vivo',
      `eventos de B: ${eventos.B.join(',') || 'ninguno'}`,
    )
    marca(
      conContenido(eventos.C).length === 0,
      rotulo,
      'otro usuario (sin filtro) NO recibe la notificación ajena',
      conContenido(eventos.C).length ? `FUGA: ${eventos.C.join(',')}` : 'cero INSERT/UPDATE',
    )
    marca(
      conContenido(eventos.admin).length === 0,
      rotulo,
      'ni el admin recibe por el canal notificaciones que no son suyas',
      conContenido(eventos.admin).length ? `FUGA: ${eventos.admin.join(',')}` : 'cero INSERT/UPDATE',
    )
    // #260 — la familia de datos, con `tarea` de representante.
    marca(
      eventos['B:tarea'].includes('INSERT'),
      rotulo,
      'el MIEMBRO sí recibe la tarea nueva en vivo (#260)',
      `eventos de B/tarea: ${eventos['B:tarea'].join(',') || 'ninguno'} — ¿migración 21 aplicada?`,
    )
    marca(
      conContenido(eventos['C:tarea']).length === 0,
      rotulo,
      'el NO miembro no recibe tareas de un proyecto ajeno (#260)',
      conContenido(eventos['C:tarea']).length ? `FUGA: ${eventos['C:tarea'].join(',')}` : 'cero INSERT/UPDATE',
    )
  } finally {
    // Cerrar ANTES de la limpieza: el borrado en cascada emite DELETEs (solo
    // clave primaria) que ensuciarían el conteo sin aportar nada.
    for (const { cliente, canal } of canales) {
      try { await cliente.removeChannel(canal) } catch { /* nada */ }
    }
    await b.auth.signOut()
    await cAjeno.auth.signOut()
  }
}

// #281/#283 — Membresía y entrega de notificaciones, con datos REALES.
//
// #281 dejó a la vista un hueco de la compuerta: para `usuario_visible` solo
// se comprobaba el AISLAMIENTO (que nadie vea de más), nunca la ENTREGA (que
// un consultor vea a los demás miembros de su proyecto). Una base desplegada
// con la cadena `comparte_proyecto` divergente pasaba la compuerta entera.
// Aquí se cierra: el admin arma un proyecto de prueba con dos cuentas como
// miembros y se asierta que cada una VE a la otra por la vista.
//
// #283 — la política de `notificacion` (migración 23) condiciona la entrega
// al acceso al proyecto de la tarea. Con una notificación real (asignación
// por trigger) se comprueba el ciclo completo: se entrega con acceso, se
// oculta al quitarlo, "marcar leída" no la alcanza mientras está oculta, y
// al devolver el acceso reaparece con su estado de leída intacto.
async function probarMiembrosYNotificaciones(admin) {
  const rotulo = 'miembros'
  const emailA = process.env.RLS_CONSULTOR_A_EMAIL
  const passA = process.env.RLS_CONSULTOR_A_PASS
  const emailC = process.env.RLS_CLIENTE_EMAIL ?? process.env.RLS_CONSULTOR_B_EMAIL
  const passC = process.env.RLS_CLIENTE_PASS ?? process.env.RLS_CONSULTOR_B_PASS
  if (!emailA || !passA || !emailC || !passC) {
    console.log('  SKIP  [miembros] hacen falta RLS_CONSULTOR_A_* y (RLS_CLIENTE_* o RLS_CONSULTOR_B_*)')
    return
  }
  const a = await sesion(emailA, passA)
  const cOtro = await sesion(emailC, passC)
  try {
    const yoA = await perfilDe(a)
    const yoC = await perfilDe(cOtro)
    if (!yoA || !yoC) {
      marca(false, rotulo, 'sesiones de la prueba legibles')
      return
    }

    const { data: proy, error: errProy } = await admin
      .from('proyecto')
      .insert({ nombre: `__prueba_rls_281_${Date.now()}` })
      .select()
      .single()
    if (errProy) {
      marca(false, rotulo, 'preparación (proyecto de prueba)', errProy.message)
      return
    }
    const { error: errAcc } = await admin.from('acceso_proyecto').insert([
      { usuario_id: yoA.id, proyecto_id: proy.id },
      { usuario_id: yoC.id, proyecto_id: proy.id },
    ])
    if (errAcc) {
      marca(false, rotulo, 'preparación (membresías)', errAcc.message)
      return
    }

    // ---- #281: la ENTREGA de la vista (el caso que faltaba) ----
    const { data: vistaA } = await a.from('usuario_visible').select('id')
    marca(
      (vistaA ?? []).some((u) => u.id === yoC.id),
      rotulo,
      '#281 el consultor VE a los demás miembros de su proyecto en usuario_visible',
      (vistaA ?? []).some((u) => u.id === yoC.id) ? `${vistaA.length} visibles` : 'NO le llega su co-miembro',
    )
    const { data: vistaC } = await cOtro.from('usuario_visible').select('id')
    marca(
      (vistaC ?? []).some((u) => u.id === yoA.id),
      rotulo,
      '#281 y el otro miembro también lo ve a él',
      (vistaC ?? []).some((u) => u.id === yoA.id) ? `${vistaC.length} visibles` : 'NO le llega su co-miembro',
    )
    // La lista de candidatos exige DOS entregas: la persona por la vista (recién
    // probado) y su FILA DE ACCESO por acceso_proyecto. La causa real de #281
    // fue esta segunda: una política acceso_select vieja en la base desplegada
    // dejaba que un INVITADO viera solo su propia fila (migración 24 la repone).
    // Acá A es invitado del proyecto de prueba (lo creó el admin): exactamente
    // el caso que la divergencia rompía.
    const { data: accesosDePrueba } = await a
      .from('acceso_proyecto')
      .select('usuario_id')
      .eq('proyecto_id', proy.id)
    marca(
      (accesosDePrueba ?? []).some((x) => x.usuario_id === yoC.id),
      rotulo,
      '#281 el INVITADO ve las filas de acceso de sus co-miembros (migración 24)',
      (accesosDePrueba ?? []).length
        ? `${accesosDePrueba.length} accesos visibles`
        : 'NO le llega ningún acceso del proyecto',
    )

    // ---- #283: entrega de notificaciones condicionada al acceso ----
    const { data: fr } = await admin
      .from('frente').insert({ proyecto_id: proy.id, nombre: 'm', orden: 0 }).select().single()
    const { data: sf } = await admin
      .from('sub_frente').insert({ frente_id: fr.id, nombre: 'm', orden: 0 }).select().single()
    const { data: tarea, error: errT } = await admin
      .from('tarea')
      .insert({ sub_frente_id: sf.id, titulo: 'm', responsable_id: yoA.id, orden: 0 })
      .select()
      .single()
    if (errT) {
      marca(false, rotulo, 'preparación (tarea que notifica)', errT.message)
      return
    }
    // El trigger crea la notificación en la misma transacción del INSERT; el
    // pequeño reintento es solo por elasticidad de la API.
    let notif = null
    const limite = Date.now() + 5_000
    while (Date.now() < limite && !notif) {
      const { data } = await a.from('notificacion').select('id, leida').eq('tarea_id', tarea.id)
      notif = data?.[0] ?? null
      if (!notif) await new Promise((r) => setTimeout(r, 250))
    }
    marca(
      !!notif && notif.leida === false,
      rotulo,
      '#283 con acceso al proyecto, la notificación SÍ se entrega (sin leer)',
      notif ? '' : 'no llegó la notificación de asignación',
    )

    await admin.from('acceso_proyecto').delete().eq('usuario_id', yoA.id).eq('proyecto_id', proy.id)
    const { data: ocultas } = await a.from('notificacion').select('id').eq('tarea_id', tarea.id)
    marca(
      (ocultas ?? []).length === 0,
      rotulo,
      '#283 al perder el acceso, la notificación DEJA de entregarse',
      (ocultas ?? []).length ? 'FUGA: sigue llegando' : '',
    )
    marca(
      bloqueado(await a.from('notificacion').update({ leida: true }).eq('tarea_id', tarea.id).select('id')),
      rotulo,
      '#283 "marcar leída" no alcanza a una notificación oculta',
    )

    await admin.from('acceso_proyecto').insert({ usuario_id: yoA.id, proyecto_id: proy.id })
    const { data: devueltas } = await a.from('notificacion').select('id, leida').eq('tarea_id', tarea.id)
    marca(
      (devueltas ?? []).length === 1 && devueltas[0].leida === false,
      rotulo,
      '#283 al devolver el acceso reaparece con su estado (sin leer) intacto',
      (devueltas ?? []).length ? `leida=${devueltas[0]?.leida}` : 'no reapareció',
    )
    // La limpieza del proyecto (y la cascada que se lleva la notificación) la
    // hace el barrido garantizado del final.
  } finally {
    await a.auth.signOut()
    await cOtro.auth.signOut()
  }
}

async function limpiarProyectosDePrueba(admin) {
  if (!admin) return
  const { data: previos } = await admin.from('proyecto').select('id').like('nombre', '__prueba_rls_%')
  if (!previos?.length) return
  for (const p of previos) {
    await admin.from('proyecto').update({ estado: 'archivado' }).eq('id', p.id)
    await admin.from('proyecto').delete().eq('id', p.id)
  }
  const { data: quedan } = await admin.from('proyecto').select('id, nombre').like('nombre', '__prueba_rls_%')
  const n = previos.length - (quedan?.length ?? 0)
  console.log(`\nLimpieza: ${n} proyecto(s) de prueba eliminados.`)
  if (quedan?.length) {
    console.log(`⚠ QUEDAN ${quedan.length} sin borrar: ${quedan.map((x) => x.nombre).join(', ')}`)
  }
}

async function main() {
  // ---------- línea base: admin ve todo ----------
  const adminEmail = process.env.RLS_ADMIN_EMAIL
  const adminPass = process.env.RLS_ADMIN_PASS
  if (!adminEmail || !adminPass) {
    console.error('RLS_ADMIN_EMAIL / RLS_ADMIN_PASS son obligatorios (línea base).')
    process.exit(2)
  }
  const admin = await sesion(adminEmail, adminPass)
  const yoAdmin = await perfilDe(admin)
  if (!yoAdmin || yoAdmin.rol !== 'admin') {
    console.error('La cuenta RLS_ADMIN no es un admin activo.')
    process.exit(2)
  }
  // #202: todo el cuerpo de pruebas va en try/finally para que el barrido de
  // proyectos de prueba corra SIEMPRE, aunque una prueba falle o reviente.
  try {
  const { data: todosProyectos } = await admin.from('proyecto').select('id, nombre, creado_por')
  // La tabla base `usuario` ya no permite SELECT directo (ni al admin, que es
  // rol `authenticated`); se lee por la vista enmascarada (seguridad §3).
  const { data: todosUsuarios } = await admin.from('usuario_visible').select('id, rol, email')
  const { data: todosAccesos } = await admin.from('acceso_proyecto').select('*')
  marca((todosProyectos?.length ?? 0) > 0, 'admin', 've todos los proyectos', `${todosProyectos?.length} proyectos`)
  marca((todosUsuarios?.length ?? 0) > 0, 'admin', 've todos los usuarios', `${todosUsuarios?.length} usuarios`)

  // #248 — La TABLA `usuario` no puede devolver ninguna fila que la VISTA
  // oculte. La tabla conserva un grant de seis columnas no sensibles (lo
  // necesitan los RETURNING y pintar responsables), así que se puede consultar
  // directo; lo que la migración 19 cierra es que por ahí salieran los
  // ELIMINADOS, que la vista sí filtra. La comprobación es una diferencia de
  // conjuntos: cualquier id que esté en la tabla y no en la vista es una fuga.
  // Se corre para CADA rol, admin incluido — la vista oculta los eliminados a
  // todos, y la política ahora también.
  await compararTablaContraVista(admin, 'admin')

  // ---------- pruebas por rol no-admin ----------
  const casos = [
    ['consultor A', process.env.RLS_CONSULTOR_A_EMAIL, process.env.RLS_CONSULTOR_A_PASS],
    ['consultor B', process.env.RLS_CONSULTOR_B_EMAIL, process.env.RLS_CONSULTOR_B_PASS],
    ['cliente', process.env.RLS_CLIENTE_EMAIL, process.env.RLS_CLIENTE_PASS],
  ]

  for (const [rotulo, email, pass] of casos) {
    if (!email || !pass) {
      console.log(`  SKIP  [${rotulo}] sin credenciales (RLS_${rotulo.toUpperCase().replace(/ /g, '_')}_...)`)
      continue
    }
    const c = await sesion(email, pass)
    const yo = await perfilDe(c)
    if (!yo) {
      marca(false, rotulo, 'perfil legible con su propia sesión')
      continue
    }

    // 1) Visibilidad: TODO proyecto visible debe ser suyo o asignado.
    const { data: visibles } = await c.from('proyecto').select('id, nombre, creado_por')
    const misAccesos = new Set(
      (todosAccesos ?? []).filter((a) => a.usuario_id === yo.id).map((a) => a.proyecto_id),
    )
    const indebidos = (visibles ?? []).filter(
      (p) => p.creado_por !== yo.id && !misAccesos.has(p.id),
    )
    marca(
      indebidos.length === 0,
      rotulo,
      'solo ve proyectos propios o asignados',
      indebidos.length ? `VE INDEBIDAMENTE: ${indebidos.map((p) => p.nombre).join(', ')}` : `${visibles?.length ?? 0} visibles`,
    )

    // 1b) #248: tampoco por la tabla base se cuela un usuario eliminado.
    await compararTablaContraVista(c, rotulo)

    // 2) Sondas contra un proyecto OCULTO (si existe alguno).
    const oculto = (todosProyectos ?? []).find(
      (p) => p.creado_por !== yo.id && !misAccesos.has(p.id),
    )
    if (oculto) {
      marca(bloqueado(await c.from('proyecto').select('*').eq('id', oculto.id)), rotulo, 'no lee un proyecto ajeno por id')
      marca(
        bloqueado(await c.from('proyecto').update({ nombre: 'HACKED' }).eq('id', oculto.id).select()),
        rotulo, 'no edita un proyecto ajeno',
      )
      marca(
        bloqueado(await c.from('frente').insert({ proyecto_id: oculto.id, nombre: 'HACK', orden: 999 }).select()),
        rotulo, 'no inserta frentes en un proyecto ajeno',
      )
      const { data: frentesOcultos } = await admin.from('frente').select('id').eq('proyecto_id', oculto.id).limit(1)
      if (frentesOcultos?.length) {
        marca(
          bloqueado(await c.from('frente').select('*').eq('id', frentesOcultos[0].id)),
          rotulo, 'no lee frentes de un proyecto ajeno',
        )
      }
      // Escalada: autoasignarse un acceso al proyecto oculto.
      marca(
        bloqueado(await c.from('acceso_proyecto').insert({ usuario_id: yo.id, proyecto_id: oculto.id }).select()),
        rotulo, 'no puede autoasignarse un proyecto ajeno',
      )
    } else {
      console.log(`  SKIP  [${rotulo}] sin proyecto oculto que sondear (ve todos legítimamente)`)
    }

    // 3) Escalada de permisos: editar su propio acceso o su propio usuario.
    const unAcceso = (todosAccesos ?? []).find((a) => a.usuario_id === yo.id)
    if (unAcceso && yo.rol === 'cliente') {
      marca(
        bloqueado(
          await c
            .from('acceso_proyecto')
            .update({ permisos: { archivarEliminar: 'todas' } })
            .eq('usuario_id', yo.id)
            .eq('proyecto_id', unAcceso.proyecto_id)
            .select(),
        ),
        rotulo, 'no puede subirse sus propios permisos',
      )
    }
    marca(
      bloqueado(await c.from('usuario').update({ rol: 'admin' }).eq('id', yo.id).select()),
      rotulo, 'no puede cambiarse el rol',
    )
    marca(
      bloqueado(await c.from('usuario').update({ nombre: 'HACKED' }).eq('id', yoAdmin.id).select()),
      rotulo, 'no edita a otros usuarios',
    )

    // 4) Reglas por rol.
    if (yo.rol === 'cliente') {
      marca(
        bloqueado(await c.from('proyecto').insert({ nombre: 'PROYECTO HACK' }).select()),
        rotulo, 'cliente no crea proyectos',
      )
    }
    if (yo.rol === 'consultor') {
      const puedeCrear = (yo.permisos_proyecto ?? {}).crearProyectos === true
      const res = await c.from('proyecto').insert({ nombre: `__prueba_rls_${Date.now()}` }).select().single()
      if (puedeCrear) {
        marca(!res.error, rotulo, 'consultor con permiso crea proyecto propio', res.error?.message ?? '')
        if (!res.error) {
          const id = res.data.id
          const puedeBorrar = (yo.permisos_proyecto ?? {}).archivarEliminarProyectos === true
          // Migración 17: un proyecto ACTIVO no se elimina, ni con permiso; hay
          // que archivarlo primero (la regla "archivar antes de borrar" vive en
          // la base, no solo en la UI).
          const borrActivo = await c.from('proyecto').delete().eq('id', id).select()
          marca(bloqueado(borrActivo), rotulo, 'no elimina un proyecto activo (debe archivarse primero)')
          if (puedeBorrar) {
            // Con permiso: archiva su propio proyecto y recién entonces lo elimina.
            const arch = await c.from('proyecto').update({ estado: 'archivado' }).eq('id', id).select()
            marca(!bloqueado(arch), rotulo, 'archiva su propio proyecto', arch.error?.message ?? '')
            const borrArch = await c.from('proyecto').delete().eq('id', id).select()
            marca(!bloqueado(borrArch), rotulo, 'y elimina su proyecto ya archivado', borrArch.error?.message ?? '')
          } else {
            marca(bloqueado(borrActivo), rotulo, 'sin permiso, no elimina ni lo suyo')
          }
          // La limpieza no se hace aquí: desde la migración 17 un DELETE sobre
          // un proyecto ACTIVO no borra nada (y no da error), así que se hacía
          // en silencio a medias. La hace el barrido garantizado del final.
        }
      } else {
        marca(bloqueado(res), rotulo, 'consultor sin permiso no crea proyectos')
        // Igual que arriba: lo limpia el barrido garantizado del final.
      }
      // Un consultor no asigna consultores (solo el admin, punto 6).
      const otroConsultor = (todosUsuarios ?? []).find((u) => u.rol === 'consultor' && u.id !== yo.id)
      const mio = (todosProyectos ?? []).find((p) => p.creado_por === yo.id)
      if (otroConsultor && mio) {
        marca(
          bloqueado(
            await c.from('acceso_proyecto').insert({ usuario_id: otroConsultor.id, proyecto_id: mio.id }).select(),
          ),
          rotulo, 'no puede invitar consultores a su proyecto (solo admin)',
        )
        await admin.from('acceso_proyecto').delete().eq('usuario_id', otroConsultor.id).eq('proyecto_id', mio.id)
      }
    }

    // 5) #137 Notificaciones: cada quien ve SOLO las suyas (nunca USING(true))
    //    y nadie puede fabricarlas (las generan triggers; sin policy de insert).
    const { data: misNotifs } = await c.from('notificacion').select('usuario_id')
    const notifsAjenas = (misNotifs ?? []).filter((n) => n.usuario_id !== yo.id)
    marca(
      notifsAjenas.length === 0,
      rotulo,
      'solo ve sus propias notificaciones',
      notifsAjenas.length ? `VE ${notifsAjenas.length} ajenas` : `${misNotifs?.length ?? 0} propias`,
    )
    const { data: unaTareaVisible } = await c.from('tarea').select('id').limit(1)
    if (unaTareaVisible?.length) {
      marca(
        bloqueado(
          await c
            .from('notificacion')
            .insert({ usuario_id: yo.id, tipo: 'asignacion', tarea_id: unaTareaVisible[0].id })
            .select(),
        ),
        rotulo, 'no puede insertar notificaciones (las generan triggers)',
      )
    }

    // 6) #207 Perfil propio: se puede cambiar el nombre, y SOLO eso. La
    //    política abrió el update a la propia fila; lo que impide la escalada
    //    de privilegio es el trigger validar_autoedicion_usuario.
    const nombreOriginal = yo.nombre
    const cambioNombre = await c
      .from('usuario')
      .update({ nombre: `${nombreOriginal} ` })
      .eq('id', yo.id)
      .select('id')
    marca(!bloqueado(cambioNombre), rotulo, 'puede cambiar su propio nombre', cambioNombre.error?.message ?? '')
    await c.from('usuario').update({ nombre: nombreOriginal }).eq('id', yo.id)

    if (rotulo !== 'admin') {
      marca(
        bloqueado(await c.from('usuario').update({ rol: 'admin' }).eq('id', yo.id).select('id')),
        rotulo, 'NO puede ascenderse a admin',
      )
      // Se prueba con el correo y con la baja: `activo` no sirve como prueba
      // porque el trigger solo se queja de lo que CAMBIA, y ya está en true.
      marca(
        bloqueado(await c.from('usuario').update({ email: `robo+${Date.now()}@x.cl` }).eq('id', yo.id).select('id')),
        rotulo, 'NO puede cambiarse el correo',
      )
      marca(
        bloqueado(await c.from('usuario').update({ activo: false }).eq('id', yo.id).select('id')),
        rotulo, 'NO puede cambiarse el estado',
      )
      const ajeno = (todosUsuarios ?? []).find((u) => u.id !== yo.id)
      if (ajeno) {
        marca(
          bloqueado(await c.from('usuario').update({ nombre: 'Hackeado' }).eq('id', ajeno.id).select('id')),
          rotulo, 'NO puede editar la ficha de otro',
        )
      }
    }

    // 7) #209 Comentarios: el autor edita lo suyo; nadie edita lo ajeno (ni el
    //    admin) y NADIE borra. Se comprueba contra la base, no contra la UI.
    const { data: mioCom } = await c
      .from('comentario')
      .select('id, texto')
      .eq('autor_id', yo.id)
      .limit(1)
    if (mioCom?.length) {
      const edicion = await c
        .from('comentario')
        .update({ texto: mioCom[0].texto })
        .eq('id', mioCom[0].id)
        .select('id')
      marca(!bloqueado(edicion), rotulo, 'edita su propio comentario', edicion.error?.message ?? '')
    }
    const { data: ajenoCom } = await c
      .from('comentario')
      .select('id')
      .neq('autor_id', yo.id)
      .not('autor_id', 'is', null)
      .limit(1)
    if (ajenoCom?.length) {
      marca(
        bloqueado(await c.from('comentario').update({ texto: 'Editado por otro' }).eq('id', ajenoCom[0].id).select('id')),
        rotulo, 'NO puede editar el comentario de otro (tampoco el admin)',
      )
      marca(
        bloqueado(await c.from('comentario').delete().eq('id', ajenoCom[0].id).select('id')),
        rotulo, 'NO puede borrar comentarios (el hilo es un registro)',
      )
    }

    // 8) #205 Los tokens de recuperación no se leen NI se escriben desde el
    //    cliente: la tabla tiene RLS y cero políticas; solo la Edge Function
    //    (service_role) la toca.
    marca(
      bloqueado(await c.from('recuperacion').select('token').limit(1)),
      rotulo, 'no puede leer tokens de recuperación',
    )

    await c.auth.signOut()
  }

  // ---------- #281/#283: membresía visible y entrega de notificaciones ----------
  await probarMiembrosYNotificaciones(admin)

  // ---------- #255: el canal de tiempo real ----------
  await probarCanalTiempoReal(admin)

  } finally {
    await limpiarProyectosDePrueba(admin)
  }

  // ---------- resumen ----------
  const fallas = resultados.filter((r) => !r.ok)
  console.log('\n────────────────────────────────────────')
  console.log(`Pruebas: ${resultados.length} · OK: ${resultados.length - fallas.length} · FALLAS: ${fallas.length}`)
  if (fallas.length) {
    console.log('\n⛔ LA COMPUERTA NO PASA. No invitar usuarios reales hasta corregir:')
    for (const f of fallas) console.log(`   - [${f.rol}] ${f.prueba}${f.detalle ? ` — ${f.detalle}` : ''}`)
    process.exit(1)
  }
  console.log('✅ Compuerta superada: la RLS impide el acceso indebido rol por rol.')
}

main().catch((e) => {
  console.error('Error inesperado:', e.message)
  process.exit(2)
})
