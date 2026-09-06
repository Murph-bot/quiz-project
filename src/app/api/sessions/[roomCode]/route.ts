import { NextRequest, NextResponse } from 'next/server'
import {
  getSupabase,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
} from '@/lib/api/sessionAuth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)

  if (!roomCode) return invalidRoomCode()

  const supabase = getSupabase()
  const session = await loadSession(
    supabase,
    roomCode,
    'id, room_code, host_id, status, category, phase, bracket, winner_id, resurrection_interval, created_at',
  )

  if (!session) return sessionNotFound()

  // Never expose session_secret — it is each player's API credential.
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, nickname, is_host, is_alive, joined_at')
    .eq('session_id', session.id)

  if (playersError) {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
  }

  return NextResponse.json({ session, players })
}
