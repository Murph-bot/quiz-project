import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? ''
  // Accept CRON_SECRET (Vercel-managed, sent automatically by cron jobs)
  // or CLEANUP_SECRET (for manual invocation)
  const cronSecret = process.env.CRON_SECRET
  const cleanupSecret = process.env.CLEANUP_SECRET
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (cleanupSecret && auth === `Bearer ${cleanupSecret}`) return true
  return false
}

async function runCleanup(): Promise<NextResponse> {
  const supabase = createServerClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Delete ALL sessions older than 24h regardless of status:
  // - 'finished' games
  // - 'lobby' sessions that were abandoned before the game started
  // - 'active' sessions from crashed games
  // FK ON DELETE CASCADE handles players, rounds, and answers automatically.
  const { data, error } = await supabase
    .from('sessions')
    .delete()
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    console.error('[cleanup] Delete failed:', error.message)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }

  const deleted = data?.length ?? 0
  console.log(`[cleanup] Deleted ${deleted} session(s) older than 24h`)
  return NextResponse.json({ deleted })
}

// GET — called by Vercel cron (sends Authorization: Bearer <CRON_SECRET>)
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCleanup()
}

// POST — for manual invocation (Authorization: Bearer <CLEANUP_SECRET>)
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCleanup()
}
