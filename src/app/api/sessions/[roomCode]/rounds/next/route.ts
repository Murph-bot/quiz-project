import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const { playerId } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, category, host_id')
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
    questionQuery = questionQuery.eq('category', session.category)
  }
  const { data: allQuestions } = await questionQuery
  const available = (allQuestions ?? []).filter((q: { id: string }) => !usedIds.includes(q.id))

  if (available.length === 0) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }

  const question = available[Math.floor(Math.random() * available.length)]

  const newRoundNumber = latestRound.round_number + 1

  const { data: round, error: newRoundError } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      question_id: question.id,
      round_number: newRoundNumber,
    })
    .select('id, started_at')
    .single()

  if (newRoundError || !round) {
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
  }

  const MAX_ROUNDS = 50
  const isSuddenDeath = newRoundNumber > MAX_ROUNDS

  // Resurrection logic: every 5th round, resurrect one eliminated player
  let resurrected: { playerId: string; nickname: string } | null = null

  if (newRoundNumber % 5 === 0) {
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

  return NextResponse.json({
    roundId: round.id,
    roundNumber: newRoundNumber,
    question: { id: question.id, text: question.text, timeLimit: question.time_limit, category: question.category },
    startedAt: round.started_at,
    resurrected,
    isSuddenDeath,
  })
}
