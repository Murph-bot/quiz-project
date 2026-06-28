import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'
import { generateOptions } from '@/lib/generateOptions'
import { generateBracketForSession } from '@/lib/bracket'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const { playerId, sessionSecret } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId || !sessionSecret) {
    return NextResponse.json({ error: 'playerId and sessionSecret required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, category, host_id, phase, resurrection_interval')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .eq('session_secret', sessionSecret)
    .single()

  if (playerError || !player || !player.is_host) {
    return NextResponse.json({ error: 'Only the host can advance' }, { status: 403 })
  }

  // Get latest round
  const { data: latestRound, error: roundError } = await supabase
    .from('rounds')
    .select('id, round_number, status')
    .eq('session_id', session.id)
    .order('round_number', { ascending: false })
    .limit(1)
    .single()

  if (roundError || !latestRound) {
    return NextResponse.json({ error: 'No round found' }, { status: 404 })
  }

  if (latestRound.status !== 'closed') {
    return NextResponse.json({ error: 'Current round still active' }, { status: 409 })
  }

  // Get used question IDs
  const { data: usedRounds } = await supabase
    .from('rounds')
    .select('question_id')
    .eq('session_id', session.id)

  const usedIds = usedRounds?.map((r: { question_id: string }) => r.question_id) ?? []

  // Pick next question (filter in JS — ~300 questions is fine)
  let questionQuery = supabase.from('questions').select('id, text, answer, category, time_limit')
  if (session.category !== 'all') {
    questionQuery = questionQuery.ilike('category', session.category)
  }
  const { data: allQuestions } = await questionQuery
  const available = (allQuestions ?? []).filter((q: { id: string }) => !usedIds.includes(q.id))

  if (available.length === 0) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }

  const question = available[Math.floor(Math.random() * available.length)]

  const newRoundNumber = latestRound.round_number + 1

  const options = generateOptions(question.answer)

  const { data: round, error: newRoundError } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      question_id: question.id,
      round_number: newRoundNumber,
      options,
    })
    .select('id, started_at')
    .single()

  if (newRoundError || !round) {
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
  }

  const MAX_ROUNDS = 50
  const isSuddenDeath = newRoundNumber > MAX_ROUNDS

  // Resurrection logic: every 5th round, resurrect one eliminated player (normal phase only)
  let resurrected: { playerId: string; nickname: string } | null = null

  const resurrectionInterval = (session as any).resurrection_interval ?? 5
  if (resurrectionInterval > 0 && newRoundNumber % resurrectionInterval === 0 && (session as any).phase === 'normal' && !isSuddenDeath) {
    const { data: eliminated } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('session_id', session.id)
      .eq('is_alive', false)

    const pool = (eliminated ?? []) as Array<{ id: string; nickname: string }>
    if (pool.length > 0) {
      const chosen = pool[Math.floor(Math.random() * pool.length)]
      await supabase
        .from('players')
        .update({ is_alive: true })
        .eq('id', chosen.id)
      resurrected = { playerId: chosen.id, nickname: chosen.nickname }
    }
  }

  // If resurrection (or any prior state) leaves exactly 4 alive, enter bracket mode
  let bracketReady = false
  let bracket: import('@/types').BracketState | null = null

  if ((session as any).phase === 'normal') {
    const { count: aliveCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('is_alive', true)

    if ((aliveCount ?? 0) === 4) {
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
  }

  return NextResponse.json({
    roundId: round.id,
    roundNumber: newRoundNumber,
    question: { id: question.id, text: question.text, timeLimit: question.time_limit, category: question.category },
    startedAt: round.started_at,
    resurrected,
    isSuddenDeath,
    options,
    bracketReady,
    bracket,
  })
}
