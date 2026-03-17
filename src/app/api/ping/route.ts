import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerClient()
  await supabase.from('sessions').select('id').limit(1)
  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
