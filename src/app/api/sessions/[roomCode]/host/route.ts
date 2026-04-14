import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const { playerId, requesterId } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId || !requesterId) {
    return NextResponse.json({ error: 'playerId and requesterId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, host_id')
    .eq('room_code', roomCode)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (session.host_id !== requesterId) {
    return NextResponse.json({ error: 'Only the current host can transfer host' }, { status: 403 })
  }

  // Verify new host is a player in this session
  const { data: newHostPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .single()

  if (!newHostPlayer) return NextResponse.json({ error: 'Player not in session' }, { status: 403 })

  // Update session host and player flags
  await supabase.from('sessions').update({ host_id: playerId }).eq('id', session.id)
  await supabase.from('players').update({ is_host: false }).eq('session_id', session.id)
  await supabase.from('players').update({ is_host: true }).eq('id', playerId)

  return NextResponse.json({ hostId: playerId })
}
