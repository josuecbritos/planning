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
          const borr = await c.from('proyecto').delete().eq('id', res.data.id).select()
          const puedeBorrar = (yo.permisos_proyecto ?? {}).archivarEliminarProyectos === true
          marca(
            puedeBorrar ? !bloqueado(borr) : bloqueado(borr),
            rotulo,
            puedeBorrar ? 'y puede eliminar su proyecto' : 'sin permiso, no elimina ni lo suyo',
          )
          if (bloqueado(borr)) {
            await admin.from('proyecto').delete().eq('id', res.data.id) // limpieza
          }
        }
      } else {
        marca(bloqueado(res), rotulo, 'consultor sin permiso no crea proyectos')
        if (!res.error) await admin.from('proyecto').delete().eq('id', res.data.id)
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
    await c.auth.signOut()
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
