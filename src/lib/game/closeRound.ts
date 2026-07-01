import { NextResponse } from 'next/server'
import { closeBracketRound } from '@/lib/game/closeBracket'
import {
  buildRankedAnswers,
  maybeCreateAllWrongReplay,
  resolveTiebreakRound,
} from '@/lib/game/closeTiebreak'
import { finalizeNormalClose } from '@/lib/game/closeNormal'
import type { createServerClient } from '@/lib/supabase-server'
import type { Round, Session } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

export async function closeRoundHandler(
  supabase: Supabase,
  session: Session,
  round: Round,
  roundId: string,
): Promise<NextResponse> {
  if (round.status === 'closed') {
    return NextResponse.json({ wasAlreadyClosed: true })
  }

  if (session.phase === 'semifinal' || session.phase === 'final') {
    return closeBracketRound({ supabase, session, roundId, round })
  }

  const { data: closedRound, error: updateError } = await supabase
    .from('rounds')
    .update({ status: 'closed' })
    .eq('id', roundId)
    .eq('status', 'active')
    .select('id')
    .single()

  if (updateError && updateError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to close round' }, { status: 500 })
  }
  if (!closedRound) {
    return NextResponse.json({ wasAlreadyClosed: true })
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

  const { data: activePlayers } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('session_id', session.id)
    .eq('is_alive', true)

  const activeList = (activePlayers ?? []) as Array<{ id: string; nickname: string }>
  const answers = buildRankedAnswers(
    (rawAnswers ?? []) as unknown as Array<{
      player_id: string
      value: number
      players: { nickname: string }
    }>,
    correctAnswer,
    activeList,
  )

  const eliminated = answers
    .filter((a) => a.delta > 0)
    .map((a) => ({ playerId: a.playerId, nickname: a.nickname }))

  const isTiebreakRound = Array.isArray(round.tiebreak_players)

  if (isTiebreakRound) {
    const tiebreakResponse = await resolveTiebreakRound({
      supabase,
      session,
      round,
      roundId,
      correctAnswer,
      answers,
      activeList,
    })
    if (tiebreakResponse) return tiebreakResponse
  }

  const replay = await maybeCreateAllWrongReplay({
    supabase,
    session,
    isTiebreakRound,
    eliminated,
    activeList,
    correctAnswer,
    answers,
  })

  if (replay.errorResponse) return replay.errorResponse

  return finalizeNormalClose({
    supabase,
    session,
    eliminated,
    answers,
    correctAnswer,
    skippedElimination: replay.skippedElimination,
    tiebreakNeeded: replay.tiebreakNeeded,
    tiebreakRoundId: replay.tiebreakRoundId,
    tiebreakQuestion: replay.tiebreakQuestion,
    tiebreakPlayerIds: replay.tiebreakPlayerIds,
    tiebreakStartedAt: replay.tiebreakStartedAt,
    tiebreakOptions: replay.tiebreakOptions,
  })
}
