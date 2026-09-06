import { NextRequest, NextResponse } from 'next/server'
import {
  badRequest,
  getSupabase,
  invalidCredentials,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
} from '@/lib/api/sessionAuth'
import { broadcastToRoom } from '@/lib/realtime'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)
  const body = await req.json()
  const { playerId, requesterId, sessionSecret } = body

  if (!roomCode) return invalidRoomCode()
  if (!playerId || !requesterId || !sessionSecret) {
    return badRequest('playerId, requesterId, and sessionSecret required')
  }

  const supabase = getSupabase()
  const session = await loadSession(supabase, roomCode, 'id, host_id')

  if (!session) return sessionNotFound()

  // Verify sessionSecret matches the requester
  const { data: verifiedRequester } = await supabase
    .from('players')
    .select('id')
    .eq('id', requesterId)
    .eq('session_secret', sessionSecret)
    .single()

  if (!verifiedRequester) return invalidCredentials()

  const isTransfer = session.host_id === requesterId && playerId !== requesterId
  const isSelfClaim = playerId === requesterId && session.host_id !== playerId

  if (!isTransfer && !isSelfClaim) {
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

  await broadcastToRoom(roomCode, [{ event: 'host:changed', payload: { hostId: playerId } }])

  return NextResponse.json({ hostId: playerId })
}
