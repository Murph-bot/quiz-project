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

/** Clock-skew tolerance: a client whose clock runs slightly fast may fire its
 *  close a moment before the server-side deadline — don't reject those. */
const CLOSE_EARLY_TOLERANCE_MS = 2000

export async function closeRoundHandler(
  supabase: Supabase,
  session: Session,
  round: Round,
  roundId: string,
): Promise<NextResponse> {
  if (round.status === 'closed') {
    return NextResponse.json({ wasAlreadyClosed: true })
  }

  if (!round.question_id) {
    return NextResponse.json({ error: 'Round has no question' }, { status: 500 })
  }

  // Enforce the round deadline server-side: closing early is legitimate only
  // when every eligible player has already answered.
  const { data: roundQuestion } = await supabase
    .from('questions')
    .select('time_limit')
    .eq('id', round.question_id)
    .single()

  const deadlineMs =
    new Date(round.started_at).getTime() + (roundQuestion?.time_limit ?? 0) * 1000
  if (Date.now() < deadlineMs - CLOSE_EARLY_TOLERANCE_MS) {
    const tiebreakPlayers = Array.isArray(round.tiebreak_players)
      ? round.tiebreak_players
      : null
    const { count: answerCount } = await supabase
      .from('answers')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', roundId)

    let eligible = tiebreakPlayers?.length ?? 0
    if (!tiebreakPlayers || tiebreakPlayers.length === 0) {
      const { count } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id)
        .eq('is_alive', true)
      eligible = count ?? 0
    }

    if (eligible === 0 || (answerCount ?? 0) < eligible) {
      return NextResponse.json({ error: 'Round still in progress' }, { status: 409 })
    }
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
