import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'
import type { RankedAnswer, EliminatedPlayer, WinnerInfo } from '@/types'

function generateOptions(correct: number): number[] {
  const nearbyPct = 0.15 + Math.random() * 0.15
  const nearbySign = Math.random() < 0.5 ? 1 : -1
  let nearby = Math.round(correct * (1 + nearbySign * nearbyPct))
  if (nearby === correct) nearby = correct + nearbySign * Math.max(1, Math.round(correct * 0.15))
  if (nearby <= 0) nearby = correct + Math.max(1, Math.round(correct * 0.15))

  const outlierPct = 0.5 + Math.random()
  const outlierSign = Math.random() < 0.5 ? 1 : -1
  let outlier = Math.round(correct * (1 + outlierSign * outlierPct))
  if (outlier <= 0 || outlier === correct || outlier === nearby) {
    outlier = Math.round(correct * 3)
  }

  return [correct, nearby, outlier].sort(() => Math.random() - 0.5)
}

const MAX_ROUNDS = 50

async function generateBracketForSession(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string
): Promise<import('@/types').BracketState | null> {
  const { data: alivePlayers } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('session_id', sessionId)
    .eq('is_alive', true)

  const aliveList = (alivePlayers ?? []) as Array<{ id: string; nickname: string }>
  if (aliveList.length !== 4) return null

  const { data: roundsWithAnswers } = await supabase
    .from('rounds')
    .select('question_id, answers(player_id, value), questions(answer)')
    .eq('session_id', sessionId)
    .eq('status', 'closed')
    .is('tiebreak_players', null)

  const totalDelta: Record<string, number> = {}
  for (const p of aliveList) totalDelta[p.id] = 0

  for (const r of (roundsWithAnswers ?? []) as any[]) {
    const correct = r.questions?.answer ?? 0
    const answeredIds = new Set((r.answers ?? []).map((a: any) => a.player_id as string))
    for (const ans of r.answers ?? []) {
      totalDelta[ans.player_id] = (totalDelta[ans.player_id] ?? 0) + Math.abs(ans.value - correct)
    }
    for (const p of aliveList) {
      if (!answeredIds.has(p.id)) {
        totalDelta[p.id] = (totalDelta[p.id] ?? 0) + 999999
      }
    }
  }

  const ranked = [...aliveList].sort((a, b) => (totalDelta[a.id] ?? 0) - (totalDelta[b.id] ?? 0))
  return {
    sf1: { p1id: ranked[0].id, p1: ranked[0].nickname, p2id: ranked[3].id, p2: ranked[3].nickname, wins: [0, 0] },
    sf2: { p1id: ranked[1].id, p1: ranked[1].nickname, p2id: ranked[2].id, p2: ranked[2].nickname, wins: [0, 0] },
    currentSF: 1,
    finalists: [],
  }
}

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
  if (category !== 'all') questionQuery = questionQuery.eq('category', category)
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
  const { playerId } = body

  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
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

  const activeList = (activePlayers ?? []) as Array<{ id: string; nickname: string }>

  // If exactly 4 players are alive before elimination, skip elimination and go straight to bracket
  let skippedElimination = false
  if ((session as any).phase === 'normal' && activeList.length === 4) {
    skippedElimination = true
  }

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

  // --- SUDDEN DEATH ALL-TIE ---
  // If ALL remaining players tie for worst in sudden death, replay the round for everyone
  // rather than eliminating all players (which would produce no winner).
  const isSuddenDeathRound = !isTiebreakRound && ((round as any).round_number as number) > MAX_ROUNDS

  if (isSuddenDeathRound && !tiebreakNeeded && eliminated.length > 0 && eliminated.length === activeList.length) {
    // Everyone answered wrong — create a replay round for all alive players
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
  // --- END SUDDEN DEATH ALL-TIE ---

  // --- TIEBREAK ROUND RESOLUTION ---
  if (isTiebreakRound) {
    const tbPlayers = (round as any).tiebreak_players as string[]
    const p1 = answers.find(a => a.playerId === tbPlayers[0])
    const p2 = answers.find(a => a.playerId === tbPlayers[1])
    const p1delta = p1?.delta ?? Number.MAX_SAFE_INTEGER
    const p2delta = p2?.delta ?? Number.MAX_SAFE_INTEGER

    if (p1delta === p2delta) {
      // Still tied — create another tiebreak round
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

    // Resolved — eliminate the loser
    const loserId = p1delta > p2delta ? tbPlayers[0] : tbPlayers[1]
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
