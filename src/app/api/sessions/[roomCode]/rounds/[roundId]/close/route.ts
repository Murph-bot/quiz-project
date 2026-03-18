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
    .select('id, phase, bracket')
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

  // --- BRACKET PHASE LOGIC ---
  if ((session as any).phase === 'semifinal' || (session as any).phase === 'final') {
    const bracket = (session as any).bracket as any
    const isFinal = (session as any).phase === 'final'
    const winsToWin = isFinal ? 3 : 2

    // Identify the two competing players
    let p1id: string, p2id: string
    if (isFinal) {
      p1id = bracket.finalists[0]
      p2id = bracket.finalists[1]
    } else {
      const sf = bracket.currentSF === 1 ? bracket.sf1 : bracket.sf2
      p1id = sf.p1id
      p2id = sf.p2id
    }

    // Get their answers for this round
    const { data: rawAnswers } = await supabase
      .from('answers')
      .select('player_id, value, players(nickname)')
      .eq('round_id', roundId)
      .in('player_id', [p1id, p2id])

    const { data: question } = await supabase
      .from('questions')
      .select('answer')
      .eq('id', round.question_id)
      .single()

    const correctAnswer = question?.answer ?? 0

    type AnswerRow = { player_id: string; value: number; players: { nickname: string } }
    const answerMap = Object.fromEntries(
      ((rawAnswers ?? []) as unknown as AnswerRow[]).map(a => [
        a.player_id,
        { value: a.value, delta: Math.abs(a.value - correctAnswer), nickname: a.players.nickname },
      ])
    )

    const p1ans = answerMap[p1id]
    const p2ans = answerMap[p2id]

    // Build ranked answers for reveal (all players see it)
    const allAnswersResult = await supabase
      .from('answers')
      .select('player_id, value, players(nickname)')
      .eq('round_id', roundId)

    const answers = ((allAnswersResult.data ?? []) as unknown as AnswerRow[])
      .map(a => ({
        playerId: a.player_id,
        nickname: a.players.nickname,
        value: a.value as number | null,
        delta: Math.abs(a.value - correctAnswer),
        noAnswer: false,
      }))
      .sort((a, b) => a.delta - b.delta)

    // Mark round as closed
    await supabase.from('rounds').update({ status: 'closed' }).eq('id', roundId)

    // Handle missing answer (treat as infinite delta)
    const p1delta = p1ans?.delta ?? Number.MAX_SAFE_INTEGER
    const p2delta = p2ans?.delta ?? Number.MAX_SAFE_INTEGER

    // Tie — replay
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
        bracket: bracket,
      })
    }

    // Award win
    const p1won = p1delta < p2delta
    const sfKey = isFinal ? null : (bracket.currentSF === 1 ? 'sf1' : 'sf2')
    if (!isFinal && sfKey) {
      if (p1won) bracket[sfKey].wins[0]++
      else bracket[sfKey].wins[1]++
    } else {
      // final
      if (p1won) bracket.finalWins = [(bracket.finalWins?.[0] ?? 0) + 1, bracket.finalWins?.[1] ?? 0]
      else bracket.finalWins = [bracket.finalWins?.[0] ?? 0, (bracket.finalWins?.[1] ?? 0) + 1]
    }

    const p1wins = isFinal ? bracket.finalWins[0] : bracket[sfKey!].wins[0]
    const p2wins = isFinal ? bracket.finalWins[1] : bracket[sfKey!].wins[1]
    const matchWinnerId = p1wins >= winsToWin ? p1id : p2wins >= winsToWin ? p2id : null

    // Resolve match winner nickname properly
    const winnerNickname = matchWinnerId === p1id
      ? (p1ans?.nickname ?? '')
      : (p2ans?.nickname ?? '')

    let sfComplete = false
    let finalReady = false
    let gameOver = false
    let gameWinner = null

    if (matchWinnerId) {
      if (isFinal) {
        // Game over
        gameOver = true
        gameWinner = { playerId: matchWinnerId, nickname: winnerNickname }
        await supabase.from('sessions').update({ status: 'finished', winner_id: matchWinnerId, bracket }).eq('id', session.id)
      } else {
        sfComplete = true
        bracket.finalists.push(matchWinnerId)
        if (bracket.finalists.length === 2) {
          // Both SFs done — start final
          bracket.currentSF = null
          await supabase.from('sessions').update({ phase: 'final', bracket }).eq('id', session.id)
          finalReady = true
        } else {
          // Advance to SF2
          bracket.currentSF = 2
          await supabase.from('sessions').update({ bracket }).eq('id', session.id)
        }
      }
    } else {
      // Match continues — save updated wins
      await supabase.from('sessions').update({ bracket }).eq('id', session.id)
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
      bracket,
      matchWinnerId,
      matchWinnerNickname: winnerNickname,
      bracketReady: false,
    })
  }
  // --- END BRACKET PHASE LOGIC ---

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

  let bracketReady = false
  let bracket: import('@/types').BracketState | null = null

  // Transition to bracket mode when exactly 4 players remain (normal phase only)
  if ((session as any).phase === 'normal' && (aliveCount ?? 0) === 4 && !gameOver) {
    // Fetch alive players first so we can penalize unanswered rounds
    const { data: alivePlayers } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('session_id', session.id)
      .eq('is_alive', true)

    const aliveList = (alivePlayers ?? []) as Array<{ id: string; nickname: string }>

    // Race guard: between the count query and this query, a player could have been eliminated
    if (aliveList.length !== 4) {
      // Skip bracket generation — state changed between queries
    } else {
      // Rank the 4 survivors by total delta across all closed rounds (lower = better)
      // Players who did not answer a round receive a large penalty for that round
      const { data: roundsWithAnswers } = await supabase
        .from('rounds')
        .select('question_id, answers(player_id, value), questions(answer)')
        .eq('session_id', session.id)
        .eq('status', 'closed')

      const totalDelta: Record<string, number> = {}
      for (const p of aliveList) totalDelta[p.id] = 0

      for (const r of (roundsWithAnswers ?? []) as any[]) {
        const correct = r.questions?.answer ?? 0
        const answeredIds = new Set((r.answers ?? []).map((a: any) => a.player_id as string))
        for (const ans of r.answers ?? []) {
          totalDelta[ans.player_id] = (totalDelta[ans.player_id] ?? 0) + Math.abs(ans.value - correct)
        }
        // Penalize players who did not answer this round
        for (const p of aliveList) {
          if (!answeredIds.has(p.id)) {
            totalDelta[p.id] = (totalDelta[p.id] ?? 0) + 999999
          }
        }
      }

      const ranked = [...aliveList].sort((a, b) => (totalDelta[a.id] ?? 0) - (totalDelta[b.id] ?? 0))
      // ranked[0] = best (#1), ranked[3] = worst (#4)

      bracket = {
        sf1: { p1id: ranked[0].id, p1: ranked[0].nickname, p2id: ranked[3].id, p2: ranked[3].nickname, wins: [0, 0] },
        sf2: { p1id: ranked[1].id, p1: ranked[1].nickname, p2id: ranked[2].id, p2: ranked[2].nickname, wins: [0, 0] },
        currentSF: 1,
        finalists: [],
      }

      const { error: bracketUpdateError } = await supabase
        .from('sessions')
        .update({ phase: 'semifinal', bracket })
        .eq('id', session.id)

      if (!bracketUpdateError) {
        bracketReady = true
      } else {
        bracket = null // don't send stale bracket if DB write failed
      }
    }
  }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated,
    winner,
    gameOver,
    wasAlreadyClosed: false,
    bracketReady,
    bracket,
  })
}
