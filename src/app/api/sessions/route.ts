import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateRoomCode } from '@/lib/roomCode'
import { checkRateLimit, clientKey } from '@/lib/rateLimit'

const MAX_RETRIES = 5
const CREATE_LIMIT = 10
const CREATE_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientKey(req, 'session-create'), CREATE_LIMIT, CREATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many sessions created — try again later' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const nickname = (body.nickname ?? '').trim()

  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ error: 'Invalid nickname' }, { status: 400 })
  }

  const supabase = createServerClient()
  const playerId = crypto.randomUUID()
  const sessionSecret = crypto.randomUUID()

  // Retry on room code collision (unique constraint)
  let roomCode: string | null = null
  let sessionId: string | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateRoomCode()

    const { error: sessionError } = await supabase.from('sessions').insert({
      room_code: code,
      host_id: playerId,
    })

    if (sessionError) {
      // Unique constraint violation on room_code — retry with new code
      if (sessionError.code === '23505') continue
      const unreachable = /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(sessionError.message ?? '')
      return NextResponse.json(
        { error: unreachable ? 'Game server unavailable — database not reachable' : 'Failed to create session' },
        { status: unreachable ? 503 : 500 }
      )
    }

    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('id')
      .eq('room_code', code)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Failed to retrieve session' }, { status: 500 })
    }

    roomCode = code
    sessionId = session.id
    break
  }

  if (!roomCode || !sessionId) {
    return NextResponse.json({ error: 'Failed to generate unique room code' }, { status: 500 })
  }

  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    session_id: sessionId,
    nickname,
    is_host: true,
    session_secret: sessionSecret,
  })

  if (playerError) {
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  return NextResponse.json({ roomCode, playerId, sessionSecret }, { status: 201 })
}
