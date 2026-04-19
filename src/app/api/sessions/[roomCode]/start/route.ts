import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

function generateOptions(correct: number): number[] {
  if (correct === 0) return [0, 1, 5].sort(() => Math.random() - 0.5)
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
    .select('id, status, category, host_id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .eq('session_secret', sessionSecret)
    .single()

  if (playerError || !player || !player.is_host) {
    return NextResponse.json({ error: 'Only the host can start the game' }, { status: 403 })
  }

  const { count: playerCount, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  if (countError || (playerCount ?? 0) < 3) {
    return NextResponse.json({ error: 'Need at least 3 players to start' }, { status: 400 })
  }

  // Pick a random question from the selected category
  let questionQuery = supabase
    .from('questions')
    .select('id, text, answer, category, time_limit')
  if (session.category !== 'all') {
    questionQuery = questionQuery.ilike('category', session.category)
  }
  const { data: questions } = await questionQuery

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }

  const question = questions[Math.floor(Math.random() * questions.length)]

  const options = generateOptions(question.answer)

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ session_id: session.id, question_id: question.id, round_number: 1, options })
    .select('id, started_at')
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
  }

  const { error: updateError } = await supabase.from('sessions').update({ status: 'active' }).eq('id', session.id)
  if (updateError) {
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  return NextResponse.json({
    roundId: round.id,
    question: { id: question.id, text: question.text, timeLimit: question.time_limit, category: question.category },
    startedAt: round.started_at,
    options,
  })
}
