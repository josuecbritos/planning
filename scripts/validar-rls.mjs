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
