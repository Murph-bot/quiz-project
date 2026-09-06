import { NextRequest, NextResponse } from 'next/server'
import { canonicalCategory } from '@/lib/categories'
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)
  const body = await req.json()
  const { category, playerId, sessionSecret } = body

  if (!roomCode) return invalidRoomCode()

  const canonical = typeof category === 'string' ? canonicalCategory(category) : null
  if (!canonical) {
    return badRequest('Invalid category')
  }

  if (!playerId || !sessionSecret) {
    return badRequest('playerId and sessionSecret required')
  }

  const supabase = getSupabase()
  const session = await loadSession(supabase, roomCode, 'id')

  if (!session) return sessionNotFound()

  const isHost = await verifyHostPlayer(supabase, session.id, playerId, sessionSecret)
  if (!isHost) return hostOnly('Only the host can change category')

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ category: canonical })
    .eq('id', session.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }

  return NextResponse.json({ category: canonical })
}
