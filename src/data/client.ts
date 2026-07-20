import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente Supabase. Se configura por variables de entorno de Vite:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Si faltan, la app cae al MemoryRepo (ver data/index.ts).

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getClient(): SupabaseClient {
  if (!url || !anonKey) throw new Error('Supabase no está configurado (revisa .env)')
  if (!client) client = createClient(url, anonKey)
  return client
}
