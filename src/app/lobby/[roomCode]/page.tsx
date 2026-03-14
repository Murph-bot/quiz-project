import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import LobbyScreen from '@/components/LobbyScreen'

interface Props {
  params: Promise<{ roomCode: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { roomCode } = await params

  const supabase = createServerClient()

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (error || !session || session.status === 'finished') {
    notFound()
  }

  return <LobbyScreen roomCode={roomCode} initialSession={session} />
}
