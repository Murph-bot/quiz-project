import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { normalizeRoomCode } from '@/lib/roomCode'

const VALID_INTERVALS = [0, 3, 5, 7, 10]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = normalizeRoomCode(rawCode)
  const body = await req.json().catch(() => ({}))
  const { resurrectionInterval, playerId, sessionSecret } = body

  if (!roomCode) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!VALID_INTERVALS.includes(resurrectionInterval)) {
    return NextResponse.json({ error: 'Invalid resurrection interval' }, { status: 400 })
  }
  if (!playerId || !sessionSecret) {
    return NextResponse.json({ error: 'playerId and sessionSecret required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .eq('session_secret', sessionSecret)
    .single()

  if (playerError || !player || !player.is_host) {
    return NextResponse.json({ error: 'Only the host can change this setting' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ resurrection_interval: resurrectionInterval })
    .eq('id', session.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ resurrectionInterval })
}
