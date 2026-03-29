import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode, roundId } = await params
  const body = await req.json()
  const { playerId, value } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
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

  const tiebreakPlayers = (round as import('@/types').Round).tiebreak_players ?? null
  if (Array.isArray(tiebreakPlayers) && !tiebreakPlayers.includes(playerId)) {
    return NextResponse.json({ error: 'Not a tiebreak participant' }, { status: 403 })
  }

  const roundOptions = (round as any).options as number[] | null
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

  return NextResponse.json({ ok: true })
}
