import type {
  AppState,
  Frente,
  ISODate,
  Proyecto,
  Replanificacion,
  SubFrente,
  Tarea,
  Usuario,
} from '../types'

// "Hoy" simulado (seccion 8): fijo a mitad del plan para que convivan tareas
// hechas, hechas tarde, vencidas y futuras. En la app real seria new Date().
export const HOY: ISODate = '2024-10-30'

// Datos semilla representativos del Plan PGP Arauco: 2 frentes, 5 sub frentes,
// responsables DV/JB/FS/IC. (El Excel real tiene 93 tareas; aqui una muestra
// que ejercita todos los estados y colores de la seccion 6.)

// Regla 5.1: exactamente 2 Admins. Los responsables solo pueden ser esos 2
// (5.5). Se incluye un Cliente de demo con acceso al proyecto (5.7).
export const usuarios: Usuario[] = [
  { id: 'u-dv', nombre: 'Daniela Vera', iniciales: 'DV', email: 'dv@consultora.cl', rol: 'admin', activo: true },
  { id: 'u-jb', nombre: 'Josue Britos', iniciales: 'JB', email: 'jb@consultora.cl', rol: 'admin', activo: true },
  { id: 'u-cliente', nombre: 'Cliente Arauco', iniciales: 'CA', email: 'contacto@arauco.cl', rol: 'cliente', activo: true },
]

// Las iniciales FS/IC del plan original se reparten entre los 2 admins.
const respId: Record<string, string> = {
  DV: 'u-dv', JB: 'u-jb', FS: 'u-dv', IC: 'u-jb',
}

export const proyecto: Proyecto = {
  id: 'p-arauco',
  nombre: 'Plan PGP Arauco',
  descripcion: 'Implementacion del Plan de Gestion de Procesos — cliente Arauco.',
  color: '#2e7d32',
  estado: 'activo',
}

// -- Frentes y Sub Frentes --

const frentes: Frente[] = [
  { id: 'f-lev', proyectoId: proyecto.id, nombre: 'Levantamiento', orden: 1 },
  { id: 'f-dis', proyectoId: proyecto.id, nombre: 'Diseño', orden: 2 },
]

const subFrentes: SubFrente[] = [
  { id: 'sf-com', frenteId: 'f-lev', nombre: 'Procesos Comerciales', orden: 1 },
  { id: 'sf-fin', frenteId: 'f-lev', nombre: 'Procesos Financieros', orden: 2 },
  { id: 'sf-ope', frenteId: 'f-lev', nombre: 'Procesos Operacionales', orden: 3 },
  { id: 'sf-arq', frenteId: 'f-dis', nombre: 'Arquitectura de datos', orden: 1 },
  { id: 'sf-par', frenteId: 'f-dis', nombre: 'Configuracion y parametrizacion', orden: 2 },
]

// -- Autoria compacta de tareas --
// `replan`: secuencia de nuevas fechas objetivo (genera historial). La ultima
// es la vigente. `real`: fecha real de termino (marca la tarea como hecha).

interface Seed {
  titulo: string
  resp: keyof typeof respId
  original: ISODate
  replan?: ISODate[]
  real?: ISODate
}

const seeds: Record<string, Seed[]> = {
  'sf-com': [
    { titulo: 'Entrevista area ventas', resp: 'DV', original: '2024-10-02', real: '2024-10-02' },
    { titulo: 'Mapeo de flujos comerciales actuales', resp: 'DV', original: '2024-10-08', real: '2024-10-10' }, // hecha tarde
    { titulo: 'Revision de politica de precios', resp: 'IC', original: '2024-10-15', replan: ['2024-10-22'], real: '2024-10-24' }, // replan + tarde
    { titulo: 'Validacion de canales de venta', resp: 'DV', original: '2024-10-25', replan: ['2024-11-05'] }, // ambar (replan, abierta futura)
    { titulo: 'Documento de requerimientos comerciales', resp: 'IC', original: '2024-10-28' }, // vencida sin historial -> rojo
    { titulo: 'Taller de priorizacion con sponsor', resp: 'DV', original: '2024-11-06' }, // pendiente futura, sin color
  ],
  'sf-fin': [
    { titulo: 'Revision de reportes contables', resp: 'FS', original: '2024-10-03', real: '2024-10-03' },
    { titulo: 'Levantamiento de centros de costo', resp: 'FS', original: '2024-10-11', replan: ['2024-10-18'], real: '2024-10-18' }, // replan, hecha a tiempo
    { titulo: 'Analisis de cuentas por cobrar', resp: 'JB', original: '2024-10-21', replan: ['2024-10-29'] }, // vencida + historial -> rojo con rastro
    { titulo: 'Conciliacion bancaria — muestra', resp: 'FS', original: '2024-10-31' }, // pendiente futura (manana)
    { titulo: 'Modelo de flujo de caja', resp: 'JB', original: '2024-11-08' },
  ],
  'sf-ope': [
    { titulo: 'Observacion en planta', resp: 'JB', original: '2024-10-07', real: '2024-10-07' },
    { titulo: 'Mapa de proceso productivo', resp: 'JB', original: '2024-10-14', real: '2024-10-16' },
    { titulo: 'Inventario de equipos criticos', resp: 'FS', original: '2024-10-18', replan: ['2024-10-25', '2024-11-01'] }, // 2 replan, abierta futura -> ambar, dos rastros
    { titulo: 'Analisis de tiempos de ciclo', resp: 'IC', original: '2024-10-24' }, // vencida -> rojo
    { titulo: 'Definicion de indicadores operacionales', resp: 'JB', original: '2024-11-04' },
    { titulo: 'Validacion de layout propuesto', resp: 'FS', original: '2024-11-12' },
  ],
  'sf-arq': [
    { titulo: 'Modelo conceptual de datos', resp: 'JB', original: '2024-10-22', real: '2024-10-22' },
    { titulo: 'Diseño de entidades maestras', resp: 'JB', original: '2024-10-28', replan: ['2024-11-04'] }, // ambar
    { titulo: 'Definicion de reglas de integridad', resp: 'IC', original: '2024-10-23' }, // vencida -> rojo
    { titulo: 'Diccionario de datos v1', resp: 'JB', original: '2024-11-07' },
    { titulo: 'Estrategia de migracion', resp: 'FS', original: '2024-11-15' },
  ],
  'sf-par': [
    { titulo: 'Parametros generales del sistema', resp: 'IC', original: '2024-10-29', replan: ['2024-11-06'] }, // ambar
    { titulo: 'Configuracion de perfiles y accesos', resp: 'DV', original: '2024-11-11' },
    { titulo: 'Plan de pruebas de configuracion', resp: 'IC', original: '2024-11-18' },
    { titulo: 'Ambiente de QA disponible', resp: 'FS', original: '2024-11-22' },
  ],
}

// -- Expansion a entidades --

function build(): { tareas: Tarea[]; historial: Replanificacion[] } {
  const tareas: Tarea[] = []
  const historial: Replanificacion[] = []
  let tIdx = 0
  let hIdx = 0

  for (const [subFrenteId, lista] of Object.entries(seeds)) {
    lista.forEach((s, orden) => {
      const tareaId = `t-${++tIdx}`
      const fechaObjetivo = s.replan && s.replan.length ? s.replan[s.replan.length - 1] : s.original

      tareas.push({
        id: tareaId,
        subFrenteId,
        titulo: s.titulo,
        responsableId: respId[s.resp],
        fechaOriginal: s.original,
        fechaObjetivo,
        hecha: !!s.real,
        fechaReal: s.real,
        orden,
      })

      // Historial: cadena original -> replan[0] -> replan[1] -> ...
      if (s.replan && s.replan.length) {
        let anterior = s.original
        s.replan.forEach((nueva, i) => {
          historial.push({
            id: `h-${++hIdx}`,
            tareaId,
            fechaAnterior: anterior,
            fechaNueva: nueva,
            numeroCambio: i + 1,
            cambiadoPor: respId[s.resp],
            timestamp: `${anterior}T10:00:00Z`,
          })
          anterior = nueva
        })
      }
    })
  }

  return { tareas, historial }
}

const { tareas, historial } = build()

export const initialState: AppState = {
  usuarios,
  proyectos: [proyecto],
  frentes,
  subFrentes,
  tareas,
  historial,
  // El cliente de demo tiene acceso al proyecto (5.7).
  accesos: [
    { usuarioId: 'u-cliente', proyectoId: proyecto.id, fechaAsignacion: '2024-10-01T00:00:00Z' },
  ],
  // Un hilo de ejemplo para exhibir los comentarios acumulables (N5).
  comentarios: [
    {
      id: 'c-1',
      tareaId: 't-9', // Analisis de cuentas por cobrar
      autorId: 'u-jb',
      texto: 'Falta la informacion de tesoreria; pedida al contacto del cliente.',
      timestamp: '2024-10-22T14:30:00Z',
    },
    {
      id: 'c-2',
      tareaId: 't-9',
      autorId: 'u-dv',
      texto: 'Llego parte de la informacion; se replanifica al 29 para cerrar con datos completos.',
      timestamp: '2024-10-25T09:15:00Z',
    },
  ],
}
