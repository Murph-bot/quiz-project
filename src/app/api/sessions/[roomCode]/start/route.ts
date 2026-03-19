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
    .single()

  if (playerError || !player || !player.is_host) {
    return NextResponse.json({ error: 'Only the host can start the game' }, { status: 403 })
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

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ session_id: session.id, question_id: question.id, round_number: 1 })
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
  })
}
