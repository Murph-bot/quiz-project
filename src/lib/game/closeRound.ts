import { NextResponse } from 'next/server'
import { closeBracketRound } from '@/lib/game/closeBracket'
import {
  buildRankedAnswers,
  maybeCreateIdenticalWrongReplay,
  maybeCreateWorstTiebreak,
  resolveTiebreakRound,
} from '@/lib/game/closeTiebreak'
import { finalizeNormalClose } from '@/lib/game/closeNormal'
import { isIdenticalWrongReplay, resolveNormalElimination } from '@/lib/elimination'
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
    return NextResponse.json({ error: 'Failed to resolve tiebreak round' }, { status: 500 })
  }

  if (!isTiebreakRound && isIdenticalWrongReplay(answers, activeList.length)) {
    const replay = await maybeCreateIdenticalWrongReplay({
      supabase,
      session,
      activeList,
      correctAnswer,
      answers,
    })
    if (replay.errorResponse) return replay.errorResponse
    if (replay.tiebreakNeeded) {
      return finalizeNormalClose({
        supabase,
        session,
        eliminated: [],
        answers,
        correctAnswer,
        skippedElimination: true,
        tiebreakNeeded: true,
        tiebreakRoundId: replay.tiebreakRoundId,
        tiebreakQuestion: replay.tiebreakQuestion,
        tiebreakPlayerIds: replay.tiebreakPlayerIds,
        tiebreakStartedAt: replay.tiebreakStartedAt,
        tiebreakOptions: replay.tiebreakOptions,
      })
    }
  }

  const { eliminated, tiedForWorstIds } = resolveNormalElimination(answers)

  if (!isTiebreakRound && tiedForWorstIds.length > 1) {
    const tiebreak = await maybeCreateWorstTiebreak({
      supabase,
      session,
      tiedPlayerIds: tiedForWorstIds,
      correctAnswer,
      answers,
    })
    if (tiebreak.errorResponse) return tiebreak.errorResponse
    return finalizeNormalClose({
      supabase,
      session,
      eliminated: [],
      answers,
      correctAnswer,
      skippedElimination: true,
      tiebreakNeeded: true,
      tiebreakRoundId: tiebreak.tiebreakRoundId,
      tiebreakQuestion: tiebreak.tiebreakQuestion,
      tiebreakPlayerIds: tiebreak.tiebreakPlayerIds,
      tiebreakStartedAt: tiebreak.tiebreakStartedAt,
      tiebreakOptions: tiebreak.tiebreakOptions,
    })
  }

  return finalizeNormalClose({
    supabase,
    session,
    eliminated,
    answers,
    correctAnswer,
    skippedElimination: false,
    tiebreakNeeded: false,
    tiebreakRoundId: null,
    tiebreakQuestion: null,
    tiebreakPlayerIds: null,
    tiebreakStartedAt: null,
    tiebreakOptions: null,
  })
}
