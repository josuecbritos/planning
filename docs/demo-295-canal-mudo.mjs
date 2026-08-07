// =====================================================================
// #295 — DEMOSTRACIÓN: una prueba de aislamiento no puede aprobar por
// silencio.
//
// QUÉ ES ESTO. No es parte de la compuerta ni corre en el despliegue: es la
// evidencia reproducible de que el arreglo hace lo que dice. Importa la
// compuerta REAL (`scripts/validar-rls.mjs`) y ejecuta su prueba del canal
// con clientes de mentira, lo único que permite decidir qué entrega el canal
// y qué no. La lógica del veredicto que se ejercita es la de producción, sin
// copiar ni reescribir nada.
//
// POR QUÉ HACE FALTA. La demostración con el proyecto real necesita
// credenciales (y ahí basta `RLS_DEMO_SILENCIO=1 node scripts/validar-rls.mjs`,
// que deja fuera al suscriptor legítimo). Esto permite comprobarlo sin tocar
// producción y deja el resultado en el repositorio.
//
// USO:
//   node docs/demo-295-canal-mudo.mjs normal    → 5 PASS, sale 0
//   node docs/demo-295-canal-mudo.mjs silencio  → 2 FAIL + 3 INCONCL, sale 1
//   node docs/demo-295-canal-mudo.mjs fuga      → detecta la fuga, sale 1
// =====================================================================

process.env.SUPABASE_URL ??= 'https://demo.invalid'
process.env.SUPABASE_ANON_KEY ??= 'demo'
process.env.RLS_CONSULTOR_A_EMAIL ??= 'b@demo.invalid'
process.env.RLS_CONSULTOR_A_PASS ??= 'x'
process.env.RLS_CLIENTE_EMAIL ??= 'c@demo.invalid'
process.env.RLS_CLIENTE_PASS ??= 'x'

const { probarCanalTiempoReal, resumen } = await import('../scripts/validar-rls.mjs')

const ESCENARIOS = {
  // El canal funciona y aísla: solo los legítimos reciben.
  normal: { B: ['INSERT'], 'B:tarea': ['INSERT'], C: [], admin: [], 'C:tarea': [] },
  // El canal queda MUDO: no llega nada, ni siquiera a quien correspondía.
  silencio: { B: [], 'B:tarea': [], C: [], admin: [], 'C:tarea': [] },
  // Hay entrega (controles vivos) Y ADEMÁS se filtra a terceros.
  fuga: { B: ['INSERT'], 'B:tarea': ['INSERT'], C: ['INSERT'], admin: ['INSERT'], 'C:tarea': ['INSERT'] },
}

const nombre = process.argv[2] ?? 'normal'
const entrega = ESCENARIOS[nombre]
if (!entrega) {
  console.error(`Escenario desconocido: ${nombre}. Usa: ${Object.keys(ESCENARIOS).join(' | ')}`)
  process.exit(2)
}
console.log(`\n═══ ESCENARIO: ${nombre} ═══`)

// ---- Clientes de mentira -------------------------------------------------
// Lo mínimo que la prueba del canal usa, y nada más.

/** Valor esperable con `await`, que además admite `.single()` / `.select()`. */
function respuesta(valor, extra = {}) {
  return { then: (r) => r(valor), ...extra }
}

/** Suscriptores vivos, por nombre de escucha (B, C, admin, B:tarea, C:tarea). */
const escuchas = new Map()

function clienteFalso(etiqueta) {
  const cli = {
    auth: {
      getUser: async () => ({ data: { user: { id: `auth-${etiqueta}` } } }),
      getSession: async () => ({ data: { session: { access_token: `token-${etiqueta}` } } }),
      signOut: async () => ({}),
    },
    realtime: { setAuth: async () => {} },
    from: (tabla) => {
      if (tabla === 'usuario_visible') {
        return { select: () => respuesta({ data: [{ id: `u-${etiqueta}`, auth_id: `auth-${etiqueta}` }] }) }
      }
      const fila = { data: { id: `${tabla}-1` }, error: null }
      return {
        insert: () =>
          respuesta({ error: null }, {
            select: () => respuesta(fila, { single: () => respuesta(fila) }),
          }),
        select: () => respuesta({ data: [], error: null }),
      }
    },
    channel: (topico) => {
      // El nombre de la escucha viaja en el tópico: `compuerta:<nombre>:<ts>`.
      const clave = topico.split(':').slice(1, -1).join(':')
      const canal = {
        on: (_evento, _cfg, handler) => {
          escuchas.set(clave, handler)
          return canal
        },
        subscribe: (cb) => {
          setTimeout(() => cb('SUBSCRIBED'), 0)
          return canal
        },
      }
      return canal
    },
    removeChannel: async () => {},
  }
  return cli
}

const admin = clienteFalso('admin')
// El admin también escucha; su canal se abre con este mismo cliente.
const sesionFalsa = async (email) => clienteFalso(email.startsWith('b') ? 'B' : 'C')

// El "trigger": cuando la prueba inserta la tarea, el canal entrega lo que
// diga el escenario. Se engancha al insert de `tarea` del admin.
const fromAdmin = admin.from.bind(admin)
admin.from = (tabla) => {
  const base = fromAdmin(tabla)
  if (tabla !== 'tarea') return base
  return {
    ...base,
    insert: () => {
      setTimeout(() => {
        for (const [clave, eventos] of Object.entries(entrega)) {
          const handler = escuchas.get(clave)
          if (!handler) continue
          for (const tipo of eventos) handler({ eventType: tipo })
        }
      }, 50)
      return respuesta({ error: null })
    },
  }
}

await probarCanalTiempoReal(admin, { sesion: sesionFalsa })
resumen() // sale 0 si todo se comprobó y está en orden; 1 si no
