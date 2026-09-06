import { NextRequest, NextResponse } from 'next/server'
import { pendingTiebreakFromFollowUpRound } from '@/lib/game/closeClient'
import { computeRevealElimination } from '@/lib/game/revealElimination'
import { normalizeOptions } from '@/lib/questionOptions'
import { createServerClient } from '@/lib/supabase-server'
import { normalizeRoomCode } from '@/lib/roomCode'
import type { BracketState } from '@/types'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode: rawCode, roundId } = await params
  const roomCode = normalizeRoomCode(rawCode)
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  const sessionSecret = searchParams.get('sessionSecret')

  if (!roomCode) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId || !sessionSecret) {
    return NextResponse.json({ error: 'playerId and sessionSecret required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, winner_id, phase, bracket')
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

  if (!round.question_id) {
    return NextResponse.json({ error: 'Round has no question' }, { status: 500 })
  }

  const { data: question } = await supabase
    .from('questions')
    .select('answer')
    .eq('id', round.question_id)
    .single()

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 500 })
  }

  const { data: rawAnswersData } = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)
  const rawAnswers = (rawAnswersData ?? []) as unknown as Array<{
    player_id: string
    value: number
    players: { nickname: string } | null
  }>

  const { data: sessionPlayers } = await supabase
    .from('players')
    .select('id, nickname, is_alive')
    .eq('session_id', session.id)

  const answeredIds = new Set(rawAnswers.map((a) => a.player_id))
  const activeList = ((sessionPlayers ?? []) as Array<{ id: string; nickname: string; is_alive: boolean }>)
    .filter((p) => answeredIds.has(p.id) || p.is_alive)
    .map((p) => ({ id: p.id, nickname: p.nickname }))

  const correctAnswer = question.answer
  const { answers, eliminated } = computeRevealElimination(
    rawAnswers.map((a) => ({ ...a, players: a.players ?? { nickname: 'Unknown' } })),
    correctAnswer,
    activeList,
  )

  const { count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

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

  const bracket = (session.bracket as BracketState | null) ?? null
  const bracketReady = session.phase === 'semifinal' && bracket !== null
  const finalReady = session.phase === 'final' && bracket !== null

  const { data: followUp } = await supabase
    .from('rounds')
    .select('id, status, started_at, tiebreak_players, options, question_id')
    .eq('session_id', session.id)
    .eq('status', 'active')
    .not('tiebreak_players', 'is', null)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let pendingTiebreak = null
  if (followUp?.question_id) {
    const { data: tbQuestion } = await supabase
      .from('questions')
      .select('id, text, time_limit, category')
      .eq('id', followUp.question_id)
      .single()
    pendingTiebreak = pendingTiebreakFromFollowUpRound({
      id: followUp.id,
      status: followUp.status,
      started_at: followUp.started_at,
      tiebreak_players: followUp.tiebreak_players,
      options: normalizeOptions(followUp.options) ?? null,
      question: tbQuestion,
    })
  }

  return NextResponse.json({
    status: 'closed',
    correctAnswer,
    answers,
    eliminated,
    aliveCount: aliveCount ?? 0,
    winner,
    gameOver: session.status === 'finished',
    wasAlreadyClosed: true,
    bracketReady,
    finalReady,
    sfComplete: false,
    bracket,
    ...(pendingTiebreak ?? {}),
  })
}
