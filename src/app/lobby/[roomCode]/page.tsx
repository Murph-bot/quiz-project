import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'
import LobbyScreen from '@/components/LobbyScreen'

interface Props {
  params: Promise<{ roomCode: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { roomCode: rawCode } = await params
  const roomCode = rawCode.toUpperCase()

  if (!isValidRoomCode(roomCode)) {
    notFound()
  }

  const supabase = createServerClient()

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (error || !session) {
    notFound()
  }

  // Game already started — send players to the game view (e.g. refresh or missed realtime event).
  if (session.status === 'active' || session.status === 'finished') {
    redirect(`/game/${roomCode}`)
  }

  return <LobbyScreen roomCode={roomCode} initialSession={session} />
}
