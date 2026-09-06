import { NextResponse } from 'next/server'
import { tryNormalPhaseTransition } from '@/lib/game/phaseTransitions'
import { createTiebreakRound } from '@/lib/questionPicker'
import { isIdenticalWrongReplay, resolveSubsetElimination } from '@/lib/elimination'
import type { createServerClient } from '@/lib/supabase-server'
import type { RankedAnswer, Round, Session } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

interface CloseTiebreakParams {
  supabase: Supabase
  session: Session
  round: Round
  roundId: string
  correctAnswer: number
  answers: RankedAnswer[]
  activeList: Array<{ id: string; nickname: string }>
}

function tiebreakResponse(
  correctAnswer: number,
  answers: RankedAnswer[],
  tbResult: Awaited<ReturnType<typeof createTiebreakRound>> & { ok: true },
  playerIds: string[],
) {
  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated: [],
    winner: null,
    gameOver: false,
    wasAlreadyClosed: false,
    bracketReady: false,
    finalReady: false,
    sfComplete: false,
    bracket: null,
    tiebreakNeeded: true,
    tiebreakRoundId: tbResult.roundId,
    tiebreakQuestion: tbResult.question,
    tiebreakPlayerIds: playerIds,
    tiebreakStartedAt: tbResult.startedAt,
  })
}

export async function resolveTiebreakRound(params: CloseTiebreakParams): Promise<NextResponse | null> {
  const { supabase, session, round, correctAnswer, answers } = params
  const tbPlayers = round.tiebreak_players ?? []
  if (!Array.isArray(tbPlayers) || tbPlayers.length === 0) return null

  const participantAnswers = tbPlayers.map((id) => {
    const entry = answers.find((a) => a.playerId === id)
    return {
      playerId: id,
      nickname: entry?.nickname ?? '',
      delta: entry?.delta ?? Number.MAX_SAFE_INTEGER,
      noAnswer: entry?.noAnswer ?? true,
    }
  })

  const participantRanked: RankedAnswer[] = participantAnswers.map((a) => ({
    playerId: a.playerId,
    nickname: a.nickname,
    value: answers.find((x) => x.playerId === a.playerId)?.value ?? null,
    delta: a.delta,
    noAnswer: a.noAnswer,
  }))

  if (isIdenticalWrongReplay(participantRanked, tbPlayers.length)) {
    const tbResult = await createTiebreakRound(supabase, session.id, session.category, tbPlayers)
    if (!tbResult.ok) {
      const msg =
        tbResult.error === 'no_questions'
          ? 'No questions available for replay'
          : 'Failed to create replay round'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    return tiebreakResponse(correctAnswer, answers, tbResult, tbPlayers)
  }

  const { eliminated, tiedForWorstIds } = resolveSubsetElimination(participantAnswers)

  if (tiedForWorstIds.length > 1) {
    const tbResult = await createTiebreakRound(supabase, session.id, session.category, tiedForWorstIds)
    if (!tbResult.ok) {
      const msg =
        tbResult.error === 'no_questions'
          ? 'No questions available for tiebreak'
          : 'Failed to create tiebreak round'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    return tiebreakResponse(correctAnswer, answers, tbResult, tiedForWorstIds)
  }

  if (eliminated.length === 0) {
    return null
  }

  await supabase
    .from('players')
    .update({ is_alive: false })
    .in(
      'id',
      eliminated.map((e) => e.playerId),
    )

  const { count: aliveAfterTB } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  const transition = await tryNormalPhaseTransition(supabase, session, aliveAfterTB ?? 0)

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated,
    aliveCount: aliveAfterTB ?? 0,
    winner: null,
    gameOver: false,
    wasAlreadyClosed: false,
    bracketReady: transition.bracketReady,
    finalReady: transition.finalReady,
    sfComplete: false,
    bracket: transition.bracket,
    tiebreakNeeded: false,
    tiebreakRoundId: null,
    tiebreakQuestion: null,
    tiebreakPlayerIds: null,
    tiebreakStartedAt: null,
  })
}

export async function maybeCreateIdenticalWrongReplay(params: {
  supabase: Supabase
  session: Session
  activeList: Array<{ id: string; nickname: string }>
  correctAnswer: number
  answers: RankedAnswer[]
}): Promise<{
  tiebreakNeeded: boolean
  tiebreakRoundId: string | null
  tiebreakQuestion: { id: string; text: string; timeLimit: number; category: string } | null
  tiebreakPlayerIds: string[] | null
  tiebreakStartedAt: string | null
  errorResponse?: NextResponse
}> {
  const { supabase, session, activeList } = params
  const allAliveIds = activeList.map((p) => p.id)
  const tbResult = await createTiebreakRound(supabase, session.id, session.category, allAliveIds)

  if (!tbResult.ok) {
    return {
      tiebreakNeeded: false,
      tiebreakRoundId: null,
      tiebreakQuestion: null,
      tiebreakPlayerIds: null,
      tiebreakStartedAt: null,
      errorResponse: NextResponse.json(
        {
          error:
            tbResult.error === 'no_questions'
              ? 'No questions available for replay'
              : 'Failed to create replay round',
        },
        { status: 500 },
      ),
    }
  }

  return {
    tiebreakNeeded: true,
    tiebreakRoundId: tbResult.roundId,
    tiebreakStartedAt: tbResult.startedAt,
    tiebreakPlayerIds: allAliveIds,
    tiebreakQuestion: tbResult.question,
  }
}

export async function maybeCreateWorstTiebreak(params: {
  supabase: Supabase
  session: Session
  tiedPlayerIds: string[]
  correctAnswer: number
  answers: RankedAnswer[]
}): Promise<{
  tiebreakRoundId: string | null
  tiebreakQuestion: { id: string; text: string; timeLimit: number; category: string } | null
  tiebreakPlayerIds: string[] | null
  tiebreakStartedAt: string | null
  errorResponse?: NextResponse
}> {
  const { supabase, session, tiedPlayerIds } = params
  const tbResult = await createTiebreakRound(supabase, session.id, session.category, tiedPlayerIds)

  if (!tbResult.ok) {
    return {
      tiebreakRoundId: null,
      tiebreakQuestion: null,
      tiebreakPlayerIds: null,
      tiebreakStartedAt: null,
      errorResponse: NextResponse.json(
        {
          error:
            tbResult.error === 'no_questions'
              ? 'No questions available for tiebreak'
              : 'Failed to create tiebreak round',
        },
        { status: 500 },
      ),
    }
  }

  return {
    tiebreakRoundId: tbResult.roundId,
    tiebreakStartedAt: tbResult.startedAt,
    tiebreakPlayerIds: tiedPlayerIds,
    tiebreakQuestion: tbResult.question,
  }
}

export function buildRankedAnswers(
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>,
  correctAnswer: number,
  activeList: Array<{ id: string; nickname: string }>,
): RankedAnswer[] {
  const answeredPlayers = rawAnswers.map((a) => ({
    playerId: a.player_id,
    nickname: a.players.nickname,
    value: a.value as number | null,
    delta: Math.abs(a.value - correctAnswer),
    noAnswer: false,
  }))

  const answeredIds = new Set(answeredPlayers.map((a) => a.playerId))
  const noAnswerPlayers: RankedAnswer[] = activeList
    .filter((p) => !answeredIds.has(p.id))
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      value: null,
      delta: Number.MAX_SAFE_INTEGER,
      noAnswer: true,
    }))

  return [...answeredPlayers.sort((a, b) => a.delta - b.delta), ...noAnswerPlayers]
}
