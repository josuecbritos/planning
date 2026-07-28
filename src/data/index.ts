import type { Repo } from './repo'
import { SupabaseRepo } from './supabaseRepo'
import { supabaseConfigured } from './client'

// Selecciona el backend: Supabase si esta configurado por env, si no memoria.
//
// #240: el repo de memoria se carga con `import()` DINAMICO. Arrastra el plan
// de ejemplo completo (`seed.ts`: usuarios y proyecto de demo, ~9 KB gzip junto
// con el repo), que solo hace falta en modo Local; con un import estatico
// viajaba a produccion aunque el backend fuera la base real. Ahora Vite lo deja
// en un chunk aparte que solo se descarga si no hay credenciales configuradas.
// Por eso la funcion es asincrona: se resuelve en `main.tsx`, antes de montar
// la aplicacion, asi el resto del codigo sigue recibiendo un repo ya listo.
export async function makeRepo(): Promise<Repo> {
  if (supabaseConfigured) return new SupabaseRepo()
  const { MemoryRepo } = await import('./memoryRepo')
  return new MemoryRepo()
}

export type { Repo } from './repo'
