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
  const session = await loadSession(supabase, roomCode, '*')

  if (!session) return sessionNotFound()

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('session_id', session.id)

  if (playersError) {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
  }

  return NextResponse.json({ session, players })
}
