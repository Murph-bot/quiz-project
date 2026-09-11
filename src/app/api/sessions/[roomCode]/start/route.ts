import { NextRequest, NextResponse } from 'next/server'
import { generateBracketForSession } from '@/lib/bracket'
import {
  badRequest,
  getSupabase,
  hostOnly,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
  verifyHostPlayer,
} from '@/lib/api/sessionAuth'
import { pickRandomQuestion } from '@/lib/questionPicker'
import { broadcastToRoom } from '@/lib/realtime'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)
  const body = await req.json().catch(() => ({}))
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

  const skipInitialRound = playerCount === 4

  let roundId: string | null = null
  let startedAt: string | null = null
  let questionPayload: {
    id: string
    text: string
    timeLimit: number
    category: string
    unit: string | null
    hint: string | null
  } | null = null

  if (!skipInitialRound) {
    const question = await pickRandomQuestion(supabase, session.category)
    if (!question) {
      return NextResponse.json({ error: 'No questions available' }, { status: 409 })
    }

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({ session_id: session.id, question_id: question.id, round_number: 1 })
      .select('id, started_at')
      .single()

    if (roundError || !round) {
      return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
    }

    roundId = round.id
    startedAt = round.started_at
    questionPayload = {
      id: question.id,
      text: question.text,
      timeLimit: question.time_limit,
      category: question.category,
      unit: question.unit ?? null,
      hint: question.hint ?? null,
    }
  }

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ status: 'active' })
    .eq('id', session.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  let bracketReady = false
  let bracket = null

  if (skipInitialRound) {
    const generatedBracket = await generateBracketForSession(supabase, session.id)
    if (generatedBracket) {
      const { error: bracketError } = await supabase
        .from('sessions')
        .update({ phase: 'semifinal', bracket: generatedBracket })
        .eq('id', session.id)
      if (!bracketError) {
        bracketReady = true
        bracket = generatedBracket
      }
    }
  }

  const events: { event: string; payload: Record<string, unknown> }[] = [
    { event: 'game:started', payload: {} },
  ]
  if (bracketReady && bracket) {
    events.push({ event: 'round:started', payload: { bracketReady, bracket } })
  }
  await broadcastToRoom(roomCode, events)

  return NextResponse.json({
    roundId,
    question: questionPayload,
    startedAt,
    bracketReady,
    bracket,
  })
}
