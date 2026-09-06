import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { broadcastToRoom } from '@/lib/realtime'
import { normalizeRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode: rawCode, roundId } = await params
  const roomCode = normalizeRoomCode(rawCode)
  const body = await req.json().catch(() => ({}))
  const { playerId, sessionSecret, value } = body

  if (!roomCode) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId || !sessionSecret) {
    return NextResponse.json({ error: 'playerId and sessionSecret required' }, { status: 400 })
  }
  if (value === undefined || value === null || typeof value !== 'number' || !Number.isInteger(value)) {
    return NextResponse.json({ error: 'value must be an integer' }, { status: 400 })
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

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, status, tiebreak_players, options')
    .eq('id', roundId)
    .eq('session_id', session.id)
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  if (round.status === 'closed') {
    return NextResponse.json({ error: 'Round already closed' }, { status: 409 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id, is_alive')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .eq('session_secret', sessionSecret)
    .single()

  if (!player) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 403 })
  }

  if (!player.is_alive) {
    return NextResponse.json({ error: 'Eliminated players cannot answer' }, { status: 403 })
  }

  const roundRow = round as import('@/types').Round & { options?: number[] | null }
  const tiebreakPlayers = roundRow.tiebreak_players ?? null
  if (Array.isArray(tiebreakPlayers) && !tiebreakPlayers.includes(playerId)) {
    return NextResponse.json({ error: 'Not a tiebreak participant' }, { status: 403 })
  }

  const roundOptions = roundRow.options ?? null
  if (Array.isArray(roundOptions) && !roundOptions.includes(value)) {
    return NextResponse.json({ error: 'Answer not one of the valid options' }, { status: 400 })
  }

  const { error: insertError } = await supabase
    .from('answers')
    .insert({ round_id: roundId, player_id: playerId, value })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Already answered' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 })
  }

  // Count how many eligible players have answered this round. If all have answered,
  // signal the host so it can close immediately without waiting for the timer.
  // For tiebreak rounds, only the tiebreak participants are eligible.
  const { count: answerCount } = await supabase
    .from('answers')
    .select('*', { count: 'exact', head: true })
    .eq('round_id', roundId)

  const tiebreakParticipants = Array.isArray(tiebreakPlayers) ? tiebreakPlayers : null
  let eligibleCount: number | null = null
  if (tiebreakParticipants) {
    eligibleCount = tiebreakParticipants.length
  } else {
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('is_alive', true)
    eligibleCount = count
  }

  const allAnswered =
    typeof answerCount === 'number' &&
    typeof eligibleCount === 'number' &&
    eligibleCount > 0 &&
    answerCount >= eligibleCount

  const events = [
    { event: 'round:answered', payload: { roundId, playerId } },
    ...(allAnswered ? [{ event: 'all:answered', payload: { roundId } }] : []),
  ]
  await broadcastToRoom(roomCode, events)

  return NextResponse.json({ ok: true, allAnswered })
}
