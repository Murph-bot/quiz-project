import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateRoomCode } from '@/lib/roomCode'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const nickname = (body.nickname ?? '').trim()

  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ error: 'Invalid nickname' }, { status: 400 })
  }

  const supabase = createServerClient()
  const roomCode = generateRoomCode()
  const playerId = crypto.randomUUID()

  const { error: sessionError } = await supabase.from('sessions').insert({
    room_code: roomCode,
    host_id: playerId,
  })

  if (sessionError) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('id')
    .eq('room_code', roomCode)
    .single()

  if (fetchError || !session) {
    return NextResponse.json({ error: 'Failed to retrieve session' }, { status: 500 })
  }

  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    session_id: session.id,
    nickname,
    is_host: true,
  })

  if (playerError) {
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  return NextResponse.json({ roomCode, playerId }, { status: 201 })
}
