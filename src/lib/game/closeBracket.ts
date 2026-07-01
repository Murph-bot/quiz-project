import { NextResponse } from 'next/server'
import type { createServerClient } from '@/lib/supabase-server'
import type { BracketState, RankedAnswer, Session } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

type AnswerRow = { player_id: string; value: number; players: { nickname: string } }

interface CloseBracketParams {
  supabase: Supabase
  session: Session
  roundId: string
  round: { question_id: string }
}

export async function closeBracketRound({
  supabase,
  session,
  roundId,
  round,
}: CloseBracketParams): Promise<NextResponse> {
  const bracket = session.bracket as BracketState
  const isFinal = session.phase === 'final'
  const winsToWin = isFinal ? 3 : 2

  let p1id: string
  let p2id: string
  if (isFinal) {
    p1id = bracket.finalists[0]
    p2id = bracket.finalists[1]
  } else {
    const sf = bracket.currentSF === 1 ? bracket.sf1 : bracket.sf2
    p1id = sf.p1id
    p2id = sf.p2id
  }

  const { data: rawAnswers } = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)
    .in('player_id', [p1id, p2id])

  const { data: question, error: bracketQuestionError } = await supabase
    .from('questions')
    .select('answer')
    .eq('id', round.question_id)
    .single()

  if (bracketQuestionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 500 })
  }

  const correctAnswer = question.answer

  const answerMap = Object.fromEntries(
    ((rawAnswers ?? []) as unknown as AnswerRow[]).map((a) => [
      a.player_id,
      { value: a.value, delta: Math.abs(a.value - correctAnswer), nickname: a.players.nickname },
    ]),
  )

  const p1ans = answerMap[p1id]
  const p2ans = answerMap[p2id]

  const allAnswersResult = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)

  const answers: RankedAnswer[] = ((allAnswersResult.data ?? []) as unknown as AnswerRow[])
    .map((a) => ({
      playerId: a.player_id,
      nickname: a.players.nickname,
      value: a.value as number | null,
      delta: Math.abs(a.value - correctAnswer),
      noAnswer: false,
    }))
    .sort((a, b) => a.delta - b.delta)

  const { data: bracketClosedRound, error: bracketUpdateError } = await supabase
    .from('rounds')
    .update({ status: 'closed' })
    .eq('id', roundId)
    .eq('status', 'active')
    .select('id')
    .single()

  if (bracketUpdateError && bracketUpdateError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to close round' }, { status: 500 })
  }
  if (!bracketClosedRound) {
    return NextResponse.json({ wasAlreadyClosed: true })
  }

  const p1delta = p1ans?.delta ?? Number.MAX_SAFE_INTEGER
  const p2delta = p2ans?.delta ?? Number.MAX_SAFE_INTEGER

  if (p1delta === p2delta) {
    return NextResponse.json({
      correctAnswer,
      answers,
      eliminated: [],
      winner: null,
      gameOver: false,
      wasAlreadyClosed: false,
      isTie: true,
      sfComplete: false,
      finalReady: false,
      matchWinnerId: null,
      matchWinnerNickname: null,
      bracketReady: false,
      bracket,
    })
  }

  const p1won = p1delta < p2delta
  const sfKey = isFinal ? null : bracket.currentSF === 1 ? 'sf1' : 'sf2'
  const mutableBracket = { ...bracket, sf1: { ...bracket.sf1 }, sf2: { ...bracket.sf2 } }

  if (!isFinal && sfKey) {
    if (p1won) mutableBracket[sfKey].wins[0]++
    else mutableBracket[sfKey].wins[1]++
  } else {
    if (p1won) {
      mutableBracket.finalWins = [(mutableBracket.finalWins?.[0] ?? 0) + 1, mutableBracket.finalWins?.[1] ?? 0]
    } else {
      mutableBracket.finalWins = [mutableBracket.finalWins?.[0] ?? 0, (mutableBracket.finalWins?.[1] ?? 0) + 1]
    }
  }

  const p1wins = isFinal ? mutableBracket.finalWins![0] : mutableBracket[sfKey!].wins[0]
  const p2wins = isFinal ? mutableBracket.finalWins![1] : mutableBracket[sfKey!].wins[1]
  const matchWinnerId = p1wins >= winsToWin ? p1id : p2wins >= winsToWin ? p2id : null

  const winnerNickname =
    matchWinnerId === p1id ? (p1ans?.nickname ?? '') : (p2ans?.nickname ?? '')

  let sfComplete = false
  let finalReady = false
  let gameOver = false
  let gameWinner = null

  if (matchWinnerId) {
    if (isFinal) {
      gameOver = true
      gameWinner = { playerId: matchWinnerId, nickname: winnerNickname }
      const { error: finishErr } = await supabase
        .from('sessions')
        .update({ status: 'finished', winner_id: matchWinnerId, bracket: mutableBracket })
        .eq('id', session.id)
      if (finishErr) return NextResponse.json({ error: 'Failed to finish session' }, { status: 500 })
    } else {
      sfComplete = true
      mutableBracket.finalists = [...mutableBracket.finalists, matchWinnerId]
      if (mutableBracket.finalists.length === 2) {
        mutableBracket.currentSF = null
        const { error: finalErr } = await supabase
          .from('sessions')
          .update({ phase: 'final', bracket: mutableBracket })
          .eq('id', session.id)
        if (finalErr) return NextResponse.json({ error: 'Failed to start final' }, { status: 500 })
        finalReady = true
      } else {
        mutableBracket.currentSF = 2
        const { error: sf2Err } = await supabase
          .from('sessions')
          .update({ bracket: mutableBracket })
          .eq('id', session.id)
        if (sf2Err) return NextResponse.json({ error: 'Failed to advance bracket' }, { status: 500 })
      }
    }
  } else {
    const { error: winsErr } = await supabase
      .from('sessions')
      .update({ bracket: mutableBracket })
      .eq('id', session.id)
    if (winsErr) return NextResponse.json({ error: 'Failed to save bracket' }, { status: 500 })
  }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated: [],
    winner: gameWinner,
    gameOver,
    wasAlreadyClosed: false,
    isTie: false,
    sfComplete,
    finalReady,
    bracket: mutableBracket,
    matchWinnerId,
    matchWinnerNickname: winnerNickname,
    bracketReady: false,
  })
}
