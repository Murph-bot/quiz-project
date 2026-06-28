import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'
import { generateOptions } from '@/lib/generateOptions'
import { generateBracketForSession } from '@/lib/bracket'
import type { RankedAnswer, EliminatedPlayer, WinnerInfo } from '@/types'

type TiebreakRoundResult =
  | { ok: true; roundId: string; startedAt: string; question: { id: string; text: string; timeLimit: number; category: string }; options: number[] }
  | { ok: false; error: 'no_questions' | 'insert_failed' }

async function createTiebreakRound(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  category: string,
  tiebreakPlayerIds: string[]
): Promise<TiebreakRoundResult> {
  const { data: usedRows } = await supabase
    .from('rounds')
    .select('question_id')
    .eq('session_id', sessionId)
  const usedIds = (usedRows ?? []).map((r: any) => r.question_id as string)

  let questionQuery = supabase.from('questions').select('id, text, answer, category, time_limit')
  if (category !== 'all') questionQuery = questionQuery.ilike('category', category)
  const { data: questionRows } = await questionQuery
  const available = ((questionRows ?? []) as any[]).filter((q: any) => !usedIds.includes(q.id))

  if (available.length === 0) return { ok: false, error: 'no_questions' }

  const tbQuestion = available[Math.floor(Math.random() * available.length)]

  const { data: latestRoundRows } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('session_id', sessionId)
    .order('round_number', { ascending: false })
    .limit(1)
  const latestRoundNumber = ((latestRoundRows ?? [])[0] as any)?.round_number ?? 0

  const options = generateOptions(tbQuestion.answer)

  const { data: newRound, error } = await supabase
    .from('rounds')
    .insert({
      session_id: sessionId,
      question_id: tbQuestion.id,
      round_number: latestRoundNumber + 1,
      tiebreak_players: tiebreakPlayerIds,
      options,
    })
    .select('id, started_at')
    .single()

  if (error || !newRound) return { ok: false, error: 'insert_failed' }

  const nr = newRound as { id: string; started_at: string }
  return {
    ok: true,
    roundId: nr.id,
    startedAt: nr.started_at,
    question: {
      id: tbQuestion.id,
      text: tbQuestion.text,
      timeLimit: tbQuestion.time_limit,
      category: tbQuestion.category,
    },
    options,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode, roundId } = await params

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { playerId, sessionSecret } = body

  if (!playerId || !sessionSecret) {
    return NextResponse.json({ error: 'playerId and sessionSecret required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, phase, bracket, category, host_id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Verify sessionSecret matches the player
  const { data: verifiedPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('session_secret', sessionSecret)
    .single()

  if (!verifiedPlayer) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 403 })
  }

  if ((session as any).host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can close a round' }, { status: 403 })
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, status, question_id, tiebreak_players, round_number')
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

    const { data: question, error: bracketQuestionError } = await supabase
      .from('questions')
      .select('answer')
      .eq('id', round.question_id)
      .single()

    if (bracketQuestionError || !question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 500 })
    }

    const correctAnswer = question.answer

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

    // Atomic close for bracket phase
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
        const { error: finishErr } = await supabase.from('sessions').update({ status: 'finished', winner_id: matchWinnerId, bracket }).eq('id', session.id)
        if (finishErr) return NextResponse.json({ error: 'Failed to finish session' }, { status: 500 })
      } else {
        sfComplete = true
        bracket.finalists.push(matchWinnerId)
        if (bracket.finalists.length === 2) {
          // Both SFs done — start final
          bracket.currentSF = null
          const { error: finalErr } = await supabase.from('sessions').update({ phase: 'final', bracket }).eq('id', session.id)
          if (finalErr) return NextResponse.json({ error: 'Failed to start final' }, { status: 500 })
          finalReady = true
        } else {
          // Advance to SF2
          bracket.currentSF = 2
          const { error: sf2Err } = await supabase.from('sessions').update({ bracket }).eq('id', session.id)
          if (sf2Err) return NextResponse.json({ error: 'Failed to advance bracket' }, { status: 500 })
        }
      }
    } else {
      // Match continues — save updated wins
      const { error: winsErr } = await supabase.from('sessions').update({ bracket }).eq('id', session.id)
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
      bracket,
      matchWinnerId,
      matchWinnerNickname: winnerNickname,
      bracketReady: false,
    })
  }
  // --- END BRACKET PHASE LOGIC ---

  // Atomic close: only succeeds if the round is still active.
  // If another concurrent request already closed it, data will be null → return wasAlreadyClosed.
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

  const activeList = (activePlayers ?? []) as Array<{ id: string; nickname: string }>

  let skippedElimination = false

  const answeredIds = new Set(answeredPlayers.map(a => a.playerId))
  const noAnswerPlayers: RankedAnswer[] = activeList
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

  // Binary elimination: all players who answered wrong (delta > 0) are eliminated
  const eliminated: EliminatedPlayer[] = answers
    .filter(a => a.delta > 0)
    .map(a => ({ playerId: a.playerId, nickname: a.nickname }))

  const isTiebreakRound = Array.isArray((round as any).tiebreak_players)

  let tiebreakNeeded = false
  let tiebreakRoundId: string | null = null
  let tiebreakQuestion: { id: string; text: string; timeLimit: number; category: string } | null = null
  let tiebreakPlayerIds: string[] | null = null
  let tiebreakStartedAt: string | null = null
  let tiebreakOptions: number[] | null = null

  // --- ALL-WRONG REPLAY ---
  // If ALL remaining players would be eliminated, replay the round for everyone
  // rather than eliminating all players (which would produce no winner).
  if (!isTiebreakRound && !tiebreakNeeded && eliminated.length > 0 && eliminated.length === activeList.length) {
    const allAliveIds = activeList.map(p => p.id)
    const tbResult = await createTiebreakRound(supabase, session.id, (session as any).category ?? 'all', allAliveIds)

    if (!tbResult.ok) {
      return NextResponse.json(
        { error: tbResult.error === 'no_questions' ? 'No questions available for replay' : 'Failed to create replay round' },
        { status: 500 }
      )
    }

    skippedElimination = true
    tiebreakNeeded = true
    tiebreakRoundId = tbResult.roundId
    tiebreakStartedAt = tbResult.startedAt
    tiebreakPlayerIds = allAliveIds
    tiebreakQuestion = tbResult.question
    tiebreakOptions = tbResult.options
  }
  // --- END ALL-WRONG REPLAY ---

  // --- TIEBREAK ROUND RESOLUTION ---
  if (isTiebreakRound) {
    const tbPlayers = (round as any).tiebreak_players as string[]
    const participantAnswers = tbPlayers.map(id => {
      const entry = answers.find(a => a.playerId === id)
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
        const tbResult = await createTiebreakRound(supabase, session.id, (session as any).category ?? 'all', tbPlayers)
        if (!tbResult.ok) {
          const msg = tbResult.error === 'no_questions'
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
      let bracketTB: import('@/types').BracketState | null = null

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

      const loserEntry = answers.find(a => a.playerId === loserId)
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

    // N-player replay round: binary elimination among all participants
    const wrongParticipants = participantAnswers.filter(a => a.delta > 0)

    if (wrongParticipants.length === tbPlayers.length) {
      const tbResult = await createTiebreakRound(supabase, session.id, (session as any).category ?? 'all', tbPlayers)
      if (!tbResult.ok) {
        const msg = tbResult.error === 'no_questions'
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

    const eliminatedFromReplay = wrongParticipants.map(a => ({
      playerId: a.playerId,
      nickname: a.nickname,
    }))

    if (eliminatedFromReplay.length > 0) {
      await supabase
        .from('players')
        .update({ is_alive: false })
        .in('id', eliminatedFromReplay.map(e => e.playerId))
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

      const survivor = survivors?.[0] as { id: string; nickname: string } | undefined
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
    let bracketReplay: import('@/types').BracketState | null = null

    if ((session as any).phase === 'normal' && (aliveAfterReplay ?? 0) === 4 && !gameOverAfterReplay) {
      bracketReplay = await generateBracketForSession(supabase, session.id)
      if (bracketReplay) {
        const { error: bracketUpdateError } = await supabase
          .from('sessions')
          .update({ phase: 'semifinal', bracket: bracketReplay })
          .eq('id', session.id)
        if (!bracketUpdateError) {
          bracketReadyReplay = true
        } else {
          bracketReplay = null
        }
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
  // --- END TIEBREAK ROUND RESOLUTION ---

  // Apply eliminations (skip if we're entering bracket mode or need tiebreak)
  if (!skippedElimination && !tiebreakNeeded && eliminated.length > 0) {
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
    const generatedBracket = await generateBracketForSession(supabase, session.id)
    if (generatedBracket) {
      const { error: bracketUpdateError } = await supabase
        .from('sessions')
        .update({ phase: 'semifinal', bracket: generatedBracket })
        .eq('id', session.id)
      if (!bracketUpdateError) {
        bracketReady = true
        bracket = generatedBracket
      }
    }
  }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated: tiebreakNeeded ? [] : eliminated,
    winner,
    gameOver,
    wasAlreadyClosed: false,
    bracketReady,
    bracket,
    tiebreakNeeded,
    tiebreakRoundId,
    tiebreakQuestion,
    tiebreakPlayerIds,
    tiebreakStartedAt,
    tiebreakOptions,
  })
}
