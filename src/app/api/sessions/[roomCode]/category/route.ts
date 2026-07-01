import { NextRequest, NextResponse } from 'next/server'
import { isValidCategory } from '@/lib/categories'
import {
  badRequest,
  getSupabase,
  hostOnly,
  invalidRoomCode,
  loadSession,
  parseRoomCode,
  sessionNotFound,
  verifyHostById,
} from '@/lib/api/sessionAuth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawCode } = await params
  const roomCode = parseRoomCode(rawCode)
  const body = await req.json()
  const { category, playerId } = body

  if (!roomCode) return invalidRoomCode()

  if (!category || !isValidCategory(category)) {
    return badRequest('Invalid category')
  }

  if (!playerId) {
    return badRequest('playerId required')
  }

  const supabase = getSupabase()
  const session = await loadSession(supabase, roomCode, 'id')

  if (!session) return sessionNotFound()

  const isHost = await verifyHostById(supabase, session.id, playerId)
  if (!isHost) return hostOnly('Only the host can change category')

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ category })
    .eq('id', session.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }

  return NextResponse.json({ category })
}
