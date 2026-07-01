import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { normalizeRoomCode } from '@/lib/roomCode'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode: rawCode } = await params
  const roomCode = normalizeRoomCode(rawCode)
  if (!roomCode) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data: session, error } = await supabase
    .from('sessions')
    .select('phase, bracket')
    .eq('room_code', roomCode)
    .single()
  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  return NextResponse.json({ phase: session.phase, bracket: session.bracket })
}
