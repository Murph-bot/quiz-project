import { NextRequest, NextResponse } from 'next/server'
import { generateOptions } from '@/lib/generateOptions'
import {
  badRequest,
  getSupabase,
  hostOnly,
  invalidCredentials,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
  verifyHostPlayer,
} from '@/lib/api/sessionAuth'
import { pickRandomQuestion } from '@/lib/questionPicker'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)
  const body = await req.json()
  const { playerId, sessionSecret } = body

  if (!roomCode) return invalidRoomCode()
  if (!playerId || !sessionSecret) {
    return badRequest('playerId and sessionSecret required')
  }

  const supabase = getSupabase()
  const session = await loadSession(supabase, roomCode, 'id, status, category, host_id')

  if (!session) return sessionNotFound()

  if (session.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  const isHost = await verifyHostPlayer(supabase, session.id, playerId, sessionSecret)
  if (!isHost) return hostOnly('Only the host can start the game')

  const { count: playerCount, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  if (countError || (playerCount ?? 0) < 3) {
    return badRequest('Need at least 3 players to start')
  }

  const question = await pickRandomQuestion(supabase, session.category)
  if (!question) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }

  const options = generateOptions(question.answer)

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ session_id: session.id, question_id: question.id, round_number: 1, options })
    .select('id, started_at')
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ status: 'active' })
    .eq('id', session.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  return NextResponse.json({
    roundId: round.id,
    question: {
      id: question.id,
      text: question.text,
      timeLimit: question.time_limit,
      category: question.category,
    },
    startedAt: round.started_at,
    options,
  })
}
