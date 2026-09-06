import { NextRequest, NextResponse } from 'next/server'
import {
  badRequest,
  getSupabase,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
} from '@/lib/api/sessionAuth'
import { checkRateLimit, clientKey } from '@/lib/rateLimit'

const JOIN_LIMIT = 30
const JOIN_WINDOW_MS = 60 * 60 * 1000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)

  if (!roomCode) return invalidRoomCode()

  if (!checkRateLimit(clientKey(req, `join:${roomCode}`), JOIN_LIMIT, JOIN_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many join attempts — try again later' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const nickname = (body.nickname ?? '').trim()

  if (!nickname || nickname.length > 20) {
    return badRequest('Invalid nickname')
  }

  const supabase = getSupabase()
  const session = await loadSession(supabase, roomCode, 'id, status')

  if (!session) return sessionNotFound()

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
