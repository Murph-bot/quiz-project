import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'
import type { RankedAnswer, EliminatedPlayer, WinnerInfo } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode, roundId } = await params

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
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
    .select('id, status, question_id')
    .eq('id', roundId)
    .eq('session_id', session.id)
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  // Idempotency: already closed
  if (round.status === 'closed') {
    return NextResponse.json({ wasAlreadyClosed: true })
  }

  const { error: updateError } = await supabase.from('rounds').update({ status: 'closed' }).eq('id', roundId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to close round' }, { status: 500 })
  }

  const { data: question, error: questionError } = await supabase
    .from('questions')
    .select('answer')
    .eq('id', round.question_id)
    .single()

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 500 })
  }

  const correctAnswer = question.answer

  const { data: rawAnswers } = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)

  const answeredPlayers = ((rawAnswers ?? []) as unknown as Array<{ player_id: string; value: number; players: { nickname: string } }>)
    .map(a => ({
      playerId: a.player_id,
      nickname: a.players.nickname,
      value: a.value as number | null,
      delta: Math.abs(a.value - correctAnswer),
      noAnswer: false,
    }))

  // Fetch all active players to find who didn't answer
  const { data: activePlayers } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('session_id', session.id)
    .eq('is_alive', true)

  const answeredIds = new Set(answeredPlayers.map(a => a.playerId))
  const noAnswerPlayers: RankedAnswer[] = ((activePlayers ?? []) as Array<{ id: string; nickname: string }>)
    .filter(p => !answeredIds.has(p.id))
    .map(p => ({
      playerId: p.id,
      nickname: p.nickname,
      value: null,
      delta: Number.MAX_SAFE_INTEGER,
      noAnswer: true,
    }))

  // Full ranked list: answered players sorted by delta, then no-answer players at the bottom
  const answers: RankedAnswer[] = [
    ...answeredPlayers.sort((a, b) => a.delta - b.delta),
    ...noAnswerPlayers,
  ]

  // Find max delta to determine who is eliminated
  const maxDelta = answers.length > 0 ? Math.max(...answers.map(a => a.delta)) : 0
  const eliminated: EliminatedPlayer[] = answers
    .filter(a => a.delta === maxDelta)
    .map(a => ({ playerId: a.playerId, nickname: a.nickname }))

  // Apply eliminations
  if (eliminated.length > 0) {
    await supabase
      .from('players')
      .update({ is_alive: false })
      .in('id', eliminated.map(e => e.playerId))
  }

  // Count remaining alive players
  const { count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  let winner: WinnerInfo | null = null
  let gameOver = false

  if (aliveCount === 1) {
    // Fetch the sole survivor
    const { data: survivors } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('session_id', session.id)
      .eq('is_alive', true)
      .limit(1)

    const survivor = survivors?.[0] as { id: string; nickname: string } | undefined
    if (survivor) {
      winner = { playerId: survivor.id, nickname: survivor.nickname }
      await supabase
        .from('sessions')
        .update({ status: 'finished', winner_id: survivor.id })
        .eq('id', session.id)
    }
    gameOver = true
  } else if (aliveCount === 0) {
    // All eliminated simultaneously — no winner
    await supabase
      .from('sessions')
      .update({ status: 'finished' })
      .eq('id', session.id)
    gameOver = true
  }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated,
    winner,
    gameOver,
    wasAlreadyClosed: false,
  })
}
