import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerClient()
  const { error } = await supabase.from('sessions').select('id').limit(1)
  // The 09:00 cron uses this call to keep the project awake; a silent success
  // would hide a database that is down or paused.
  if (error) {
    console.error('[ping] database query failed:', error.message)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
