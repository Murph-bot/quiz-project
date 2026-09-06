import { NextRequest, NextResponse } from 'next/server'
import {
  badRequest,
  getSupabase,
  invalidCredentials,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
  verifyPlayerSecret,
} from '@/lib/api/sessionAuth'
import { closeRoundHandler } from '@/lib/game/closeRound'
import { broadcastToRoom } from '@/lib/realtime'
import type { Round, Session } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> },
) {
  const { roomCode: rawCode, roundId } = await params
  const roomCode = parseRoomCode(rawCode)

  if (!roomCode) return invalidRoomCode()

  const body = await req.json().catch(() => ({}))
  const { playerId, sessionSecret } = body

  if (!playerId || !sessionSecret) {
    return badRequest('playerId and sessionSecret required')
  }

  const supabase = getSupabase()

  const session = await loadSession(
    supabase,
    roomCode,
    'id, phase, bracket, category, host_id',
  )

  if (!session) return sessionNotFound()

  const verified = await verifyPlayerSecret(supabase, session.id, playerId, sessionSecret)
  if (!verified) return invalidCredentials()

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, status, question_id, tiebreak_players, round_number, started_at')
    .eq('id', roundId)
    .eq('session_id', session.id)
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  const res = await closeRoundHandler(supabase, session as Session, round as Round, roundId)

  // Fan out the authoritative close result to all subscribed clients.
  // Only a real close result carries correctAnswer — skip {wasAlreadyClosed} and errors.
  const closeBody = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null
  if (res.ok && closeBody && typeof closeBody.correctAnswer === 'number') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { wasAlreadyClosed: _wasAlreadyClosed, error: _error, ...payload } = closeBody
    await broadcastToRoom(roomCode, [{ event: 'round:closed', payload }])
  }

  return res
}
