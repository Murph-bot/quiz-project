import { NextResponse } from 'next/server'
import { generateBracketForSession } from '@/lib/bracket'
import { createTiebreakRound } from '@/lib/questionPicker'
import type { createServerClient } from '@/lib/supabase-server'
import type { EliminatedPlayer, RankedAnswer, Round, Session, WinnerInfo } from '@/types'

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

export async function resolveTiebreakRound(params: CloseTiebreakParams): Promise<NextResponse | null> {
  const { supabase, session, round, roundId, correctAnswer, answers, activeList } = params
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

  if (tbPlayers.length === 2) {
    const p1 = participantAnswers[0]
    const p2 = participantAnswers[1]

    if (p1.delta === p2.delta) {
      const tbResult = await createTiebreakRound(supabase, session.id, session.category, tbPlayers)
      if (!tbResult.ok) {
        const msg =
          tbResult.error === 'no_questions'
            ? 'No questions available for tiebreak'
            : 'Failed to create tiebreak round'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
      return NextResponse.json({
        correctAnswer,
        answers,
        eliminated: [],
        winner: null,
        gameOver: false,
        wasAlreadyClosed: false,
        bracketReady: false,
        bracket: null,
        tiebreakNeeded: true,
        tiebreakRoundId: tbResult.roundId,
        tiebreakQuestion: tbResult.question,
        tiebreakPlayerIds: tbPlayers,
        tiebreakStartedAt: tbResult.startedAt,
        tiebreakOptions: tbResult.options,
      })
    }

    const loserId = p1.delta > p2.delta ? tbPlayers[0] : tbPlayers[1]
    await supabase.from('players').update({ is_alive: false }).in('id', [loserId])

    const { count: aliveAfterTB } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('is_alive', true)

    let bracketReadyTB = false
    let bracketTB = null

    if ((aliveAfterTB ?? 0) === 4) {
      bracketTB = await generateBracketForSession(supabase, session.id)
      if (!bracketTB) {
        return NextResponse.json({ error: 'Failed to generate bracket after tiebreak' }, { status: 500 })
      }
      const { error: bErr } = await supabase
        .from('sessions')
        .update({ phase: 'semifinal', bracket: bracketTB })
        .eq('id', session.id)
      if (!bErr) bracketReadyTB = true
      else bracketTB = null
    }

    const loserEntry = answers.find((a) => a.playerId === loserId)
    return NextResponse.json({
      correctAnswer,
      answers,
      eliminated: loserEntry ? [{ playerId: loserEntry.playerId, nickname: loserEntry.nickname }] : [],
      winner: null,
      gameOver: false,
      wasAlreadyClosed: false,
      bracketReady: bracketReadyTB,
      bracket: bracketTB,
      tiebreakNeeded: false,
      tiebreakRoundId: null,
      tiebreakQuestion: null,
      tiebreakPlayerIds: null,
      tiebreakStartedAt: null,
    })
  }

  const wrongParticipants = participantAnswers.filter((a) => a.delta > 0)

  if (wrongParticipants.length === tbPlayers.length) {
    const tbResult = await createTiebreakRound(supabase, session.id, session.category, tbPlayers)
    if (!tbResult.ok) {
      const msg =
        tbResult.error === 'no_questions'
          ? 'No questions available for replay'
          : 'Failed to create replay round'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    return NextResponse.json({
      correctAnswer,
      answers,
      eliminated: [],
      winner: null,
      gameOver: false,
      wasAlreadyClosed: false,
      bracketReady: false,
      bracket: null,
      tiebreakNeeded: true,
      tiebreakRoundId: tbResult.roundId,
      tiebreakQuestion: tbResult.question,
      tiebreakPlayerIds: tbPlayers,
      tiebreakStartedAt: tbResult.startedAt,
      tiebreakOptions: tbResult.options,
    })
  }

  const eliminatedFromReplay: EliminatedPlayer[] = wrongParticipants.map((a) => ({
    playerId: a.playerId,
    nickname: a.nickname,
  }))

  if (eliminatedFromReplay.length > 0) {
    await supabase
      .from('players')
      .update({ is_alive: false })
      .in(
        'id',
        eliminatedFromReplay.map((e) => e.playerId),
      )
  }

  const { count: aliveAfterReplay } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  let winnerAfterReplay: WinnerInfo | null = null
  let gameOverAfterReplay = false

  if (aliveAfterReplay === 1) {
    const { data: survivors } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('session_id', session.id)
      .eq('is_alive', true)
      .limit(1)

    const survivor = survivors?.[0]
    if (survivor) {
      winnerAfterReplay = { playerId: survivor.id, nickname: survivor.nickname }
      await supabase
        .from('sessions')
        .update({ status: 'finished', winner_id: survivor.id })
        .eq('id', session.id)
    }
    gameOverAfterReplay = true
  }

  let bracketReadyReplay = false
  let bracketReplay = null

  if (session.phase === 'normal' && (aliveAfterReplay ?? 0) === 4 && !gameOverAfterReplay) {
    bracketReplay = await generateBracketForSession(supabase, session.id)
    if (bracketReplay) {
      const { error: bracketUpdateError } = await supabase
        .from('sessions')
        .update({ phase: 'semifinal', bracket: bracketReplay })
        .eq('id', session.id)
      if (!bracketUpdateError) bracketReadyReplay = true
      else bracketReplay = null
    }
  }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated: eliminatedFromReplay,
    winner: winnerAfterReplay,
    gameOver: gameOverAfterReplay,
    wasAlreadyClosed: false,
    bracketReady: bracketReadyReplay,
    bracket: bracketReplay,
    tiebreakNeeded: false,
    tiebreakRoundId: null,
    tiebreakQuestion: null,
    tiebreakPlayerIds: null,
    tiebreakStartedAt: null,
  })
}

export async function maybeCreateAllWrongReplay(params: {
  supabase: Supabase
  session: Session
  isTiebreakRound: boolean
  eliminated: EliminatedPlayer[]
  activeList: Array<{ id: string; nickname: string }>
  correctAnswer: number
  answers: RankedAnswer[]
}): Promise<{
  skippedElimination: boolean
  tiebreakNeeded: boolean
  tiebreakRoundId: string | null
  tiebreakQuestion: { id: string; text: string; timeLimit: number; category: string } | null
  tiebreakPlayerIds: string[] | null
  tiebreakStartedAt: string | null
  tiebreakOptions: number[] | null
  errorResponse?: NextResponse
}> {
  const { supabase, session, isTiebreakRound, eliminated, activeList, correctAnswer, answers } = params

  if (isTiebreakRound || eliminated.length === 0 || eliminated.length !== activeList.length) {
    return {
      skippedElimination: false,
      tiebreakNeeded: false,
      tiebreakRoundId: null,
      tiebreakQuestion: null,
      tiebreakPlayerIds: null,
      tiebreakStartedAt: null,
      tiebreakOptions: null,
    }
  }

  const allAliveIds = activeList.map((p) => p.id)
  const tbResult = await createTiebreakRound(supabase, session.id, session.category, allAliveIds)

  if (!tbResult.ok) {
    return {
      skippedElimination: false,
      tiebreakNeeded: false,
      tiebreakRoundId: null,
      tiebreakQuestion: null,
      tiebreakPlayerIds: null,
      tiebreakStartedAt: null,
      tiebreakOptions: null,
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
    skippedElimination: true,
    tiebreakNeeded: true,
    tiebreakRoundId: tbResult.roundId,
    tiebreakStartedAt: tbResult.startedAt,
    tiebreakPlayerIds: allAliveIds,
    tiebreakQuestion: tbResult.question,
    tiebreakOptions: tbResult.options,
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
