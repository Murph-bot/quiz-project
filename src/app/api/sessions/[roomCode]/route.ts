import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = rawCode.toUpperCase()

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('session_id', session.id)

  if (playersError) {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
  }

  return NextResponse.json({ session, players })
}
