// src/lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export function createServerClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  return createClient<Database>(url, key)
}
