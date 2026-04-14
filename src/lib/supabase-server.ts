// src/lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key
  )
}
