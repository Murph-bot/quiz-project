import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { GameScreen } from '@/components/GameScreen'
import { normalizeOptions } from '@/lib/questionOptions'
import type { WinnerInfo } from '@/types'

interface Props {
  params: Promise<{ roomCode: string }>
}

export default async function GamePage({ params }: Props) {
  const { roomCode } = await params
  const supabase = createServerClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, status, host_id, winner_id')
    .eq('room_code', roomCode)
    .single()

  if (!session) return notFound()
  if (session.status === 'lobby') redirect(`/lobby/${roomCode}`)

  // Get current (latest) round
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, status, started_at, question_id, options')
    .eq('session_id', session.id)
    .order('round_number', { ascending: false })
    .limit(1)
    .single()

  if (!round) return notFound()

  const { data: question } = await supabase
    .from('questions')
    .select('id, text, answer, category, time_limit')
    .eq('id', round.question_id)
    .single()

  if (!question) return notFound()

  // If round is already closed, fetch reveal data so reconnecting players land on reveal screen
  let revealData = null
  if (round.status === 'closed') {
    const { data: rawAnswers } = await supabase
      .from('answers')
      .select('player_id, value, players(nickname)')
      .eq('round_id', round.id)

    revealData = {
      correctAnswer: question.answer,
      answers: ((rawAnswers ?? []) as unknown as Array<{ player_id: string; value: number; players: { nickname: string } | null }>)
        .filter(a => a.players !== null)
        .map(a => ({
          playerId: a.player_id,
          nickname: a.players!.nickname,
          value: a.value,
          delta: Math.abs(a.value - question.answer),
          noAnswer: false,
        }))
        .sort((a, b) => a.delta - b.delta),
    }
  }

  // Count alive players for spectator display
  const { count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  // If finished, resolve winner info (if any) and show WinnerScreen instead of redirecting
  let initialWinner: WinnerInfo | null = null
  if (session.status === 'finished' && session.winner_id) {
    const { data: winnerPlayer } = await supabase
      .from('players')
      .select('id, nickname')
      .eq('id', session.winner_id)
      .single()
    if (winnerPlayer) {
      initialWinner = { playerId: winnerPlayer.id, nickname: winnerPlayer.nickname }
    }
  }

  return (
    <div className="min-h-dvh">
      <GameScreen
        roomCode={roomCode}
        sessionHostId={session.host_id}
        initialRoundId={round.id}
        initialRoundNumber={round.round_number}
        initialQuestion={{
          id: question.id,
          text: question.text,
          timeLimit: question.time_limit,
          category: question.category,
          options: normalizeOptions(round.options),
        }}
        initialStartedAt={round.started_at}
        initialRevealData={revealData}
        initialWinner={initialWinner}
        initialAliveCount={aliveCount ?? 0}
      />
    </div>
  )
}
