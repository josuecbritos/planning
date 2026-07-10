import type { AuthService } from './auth'
import type { Repo } from '../data/repo'
import { MemoryAuth } from './memoryAuth'
import { SupabaseAuth } from './supabaseAuth'
import { supabaseConfigured } from '../data/client'

export function makeAuth(repo: Repo): AuthService {
  return supabaseConfigured ? new SupabaseAuth() : new MemoryAuth(repo)
}

export type { AuthService } from './auth'
