import type { Repo } from './repo'
import { MemoryRepo } from './memoryRepo'
import { SupabaseRepo } from './supabaseRepo'
import { supabaseConfigured } from './client'

// Selecciona el backend: Supabase si esta configurado por env, si no memoria.
export function makeRepo(): Repo {
  return supabaseConfigured ? new SupabaseRepo() : new MemoryRepo()
}

export type { Repo } from './repo'
