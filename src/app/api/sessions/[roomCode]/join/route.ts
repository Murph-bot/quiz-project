import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { normalizeRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = normalizeRoomCode(rawCode)
  const body = await req.json()
  const nickname = (body.nickname ?? '').trim()

  if (!roomCode) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ error: 'Invalid nickname' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'lobby') {
    // Allow eliminated spectators to reconnect with their original playerId
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id, session_secret')
      .eq('session_id', session.id)
      .eq('nickname', nickname)
      .single()

    if (!existingPlayer) {
      return NextResponse.json({ error: 'Game already started' }, { status: 409 })
    }

    return NextResponse.json({ playerId: existingPlayer.id, sessionSecret: existingPlayer.session_secret, spectatorReconnect: true }, { status: 200 })
  }

  const playerId = crypto.randomUUID()
  const sessionSecret = crypto.randomUUID()

  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    session_id: session.id,
    nickname,
    is_host: false,
    session_secret: sessionSecret,
  })

  if (playerError) {
    if (playerError.code === '23505') {
      return NextResponse.json({ error: 'Nickname already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 })
  }

  return NextResponse.json({ playerId, sessionSecret }, { status: 201 })
}
