// src/lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Use service role key server-side so RLS doesn't block API routes.
    // SUPABASE_SERVICE_ROLE_KEY must be added to .env.local (never expose to browser).
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
