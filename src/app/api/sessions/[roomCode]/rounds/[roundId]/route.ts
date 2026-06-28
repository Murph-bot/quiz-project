import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode, roundId } = await params
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  const sessionSecret = searchParams.get('sessionSecret')

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId || !sessionSecret) {
    return NextResponse.json({ error: 'playerId and sessionSecret required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, winner_id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: verifiedPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .eq('session_secret', sessionSecret)
    .single()

  if (!verifiedPlayer) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 403 })
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

  if (round.status === 'active') {
    return NextResponse.json({ status: 'active' })
  }

  const { data: question } = await supabase
    .from('questions')
    .select('answer')
    .eq('id', round.question_id)
    .single()

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 500 })
  }

  const { data: rawAnswers } = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)

  const correctAnswer = question.answer
  const answers = ((rawAnswers ?? []) as unknown as Array<{
    player_id: string
    value: number
    players: { nickname: string } | null
  }>)
    .filter(a => a.players !== null)
    .map(a => ({
      playerId: a.player_id,
      nickname: a.players!.nickname,
      value: a.value,
      delta: Math.abs(a.value - correctAnswer),
      noAnswer: false,
    }))
    .sort((a, b) => a.delta - b.delta)

  let winner = null
  if (session.status === 'finished' && session.winner_id) {
    const { data: winnerPlayer } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('id', session.winner_id)
      .single()
    if (winnerPlayer) {
      winner = { playerId: winnerPlayer.id, nickname: winnerPlayer.nickname }
    }
  }

  return NextResponse.json({
    status: 'closed',
    correctAnswer,
    answers,
    eliminated: answers.filter(a => a.delta > 0).map(a => ({ playerId: a.playerId, nickname: a.nickname })),
    winner,
    gameOver: session.status === 'finished',
    wasAlreadyClosed: true,
  })
}
