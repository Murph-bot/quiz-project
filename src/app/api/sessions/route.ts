import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateRoomCode } from '@/lib/roomCode'

const MAX_RETRIES = 5

export async function POST(req: NextRequest) {
  const body = await req.json()
  const nickname = (body.nickname ?? '').trim()

  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ error: 'Invalid nickname' }, { status: 400 })
  }

  const supabase = createServerClient()
  const playerId = crypto.randomUUID()

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
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
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
  })

  if (playerError) {
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  return NextResponse.json({ roomCode, playerId }, { status: 201 })
}
