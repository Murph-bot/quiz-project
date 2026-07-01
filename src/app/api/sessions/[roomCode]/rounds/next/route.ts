import { NextRequest, NextResponse } from 'next/server'
import { generateBracketForSession } from '@/lib/bracket'
import { generateOptions } from '@/lib/generateOptions'
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
import { pickUnusedQuestion } from '@/lib/questionPicker'
import type { BracketState } from '@/types'

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
  const session = await loadSession(
    supabase,
    roomCode,
    'id, category, host_id, phase, resurrection_interval',
  )

  if (!session) return sessionNotFound()

  const isHost = await verifyHostPlayer(supabase, session.id, playerId, sessionSecret)
  if (!isHost) return hostOnly('Only the host can advance')

  const { data: latestRound, error: roundError } = await supabase
    .from('rounds')
    .select('id, round_number, status')
    .eq('session_id', session.id)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (roundError) {
    return NextResponse.json({ error: 'No round found' }, { status: 404 })
  }

  let newRoundNumber = 1
  if (latestRound) {
    if (latestRound.status !== 'closed') {
      return NextResponse.json({ error: 'Current round still active' }, { status: 409 })
    }
    newRoundNumber = latestRound.round_number + 1
  }

  const question = await pickUnusedQuestion(supabase, session.id, session.category)
  if (!question) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }
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

  let resurrected: { playerId: string; nickname: string } | null = null
  const resurrectionInterval = session.resurrection_interval ?? 5

  if (
    resurrectionInterval > 0 &&
    newRoundNumber % resurrectionInterval === 0 &&
    session.phase === 'normal' &&
    !isSuddenDeath
  ) {
    const { data: eliminated } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('session_id', session.id)
      .eq('is_alive', false)

    const pool = eliminated ?? []
    if (pool.length > 0) {
      const chosen = pool[Math.floor(Math.random() * pool.length)]
      await supabase.from('players').update({ is_alive: true }).eq('id', chosen.id)
      resurrected = { playerId: chosen.id, nickname: chosen.nickname }
    }
  }

  let bracketReady = false
  let bracket: BracketState | null = null

  const { count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  if (session.phase === 'normal') {
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
    question: {
      id: question.id,
      text: question.text,
      timeLimit: question.time_limit,
      category: question.category,
    },
    startedAt: round.started_at,
    resurrected,
    isSuddenDeath,
    options,
    bracketReady,
    bracket,
    aliveCount: aliveCount ?? 0,
  })
}
