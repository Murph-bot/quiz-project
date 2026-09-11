import { NextRequest, NextResponse } from 'next/server'
import {
  badRequest,
  getSupabase,
  hostOnly,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
  verifyHostPlayer,
} from '@/lib/api/sessionAuth'
import { broadcastToRoom } from '@/lib/realtime'

/** Host removes a player from the lobby. Lobby-only — mid-game kicks are not
 *  supported (bracket/tiebreak edge cases); absent players self-eliminate via
 *  no-answer anyway. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; playerId: string }> }
) {
  const { roomCode: rawCode, playerId: targetId } = await params
  const roomCode = parseRoomCode(rawCode)
  const body = await req.json().catch(() => ({}))
  const { playerId: requesterId, sessionSecret } = body

  if (!roomCode) return invalidRoomCode()
  if (!requesterId || !sessionSecret || !targetId) {
    return badRequest('playerId and sessionSecret required')
  }

  const supabase = getSupabase()
  const session = await loadSession(supabase, roomCode, 'id, status, host_id')
  if (!session) return sessionNotFound()

  if (session.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }
  if (targetId === session.host_id) {
    return badRequest('Cannot kick the host')
  }
  if (!(await verifyHostPlayer(supabase, session.id, requesterId, sessionSecret))) {
    return hostOnly()
  }

  const { data: deleted } = await supabase
    .from('players')
    .delete()
    .eq('id', targetId)
    .eq('session_id', session.id)
    .select('id')

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  await broadcastToRoom(roomCode, [{ event: 'player:kicked', payload: { playerId: targetId } }])
  return NextResponse.json({ kicked: targetId })
}
