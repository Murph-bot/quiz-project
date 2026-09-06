import { NextResponse } from 'next/server'
import { tryNormalPhaseTransition } from '@/lib/game/phaseTransitions'
import type { createServerClient } from '@/lib/supabase-server'
import type { EliminatedPlayer, RankedAnswer, Session, WinnerInfo } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

interface CloseNormalParams {
  supabase: Supabase
  session: Session
  eliminated: EliminatedPlayer[]
  answers: RankedAnswer[]
  correctAnswer: number
  skippedElimination: boolean
  tiebreakNeeded: boolean
  tiebreakRoundId: string | null
  tiebreakQuestion: { id: string; text: string; timeLimit: number; category: string } | null
  tiebreakPlayerIds: string[] | null
  tiebreakStartedAt: string | null
}

export async function finalizeNormalClose(params: CloseNormalParams): Promise<NextResponse> {
  const {
    supabase,
    session,
    eliminated,
    answers,
    correctAnswer,
    skippedElimination,
    tiebreakNeeded,
    tiebreakRoundId,
    tiebreakQuestion,
    tiebreakPlayerIds,
    tiebreakStartedAt,
  } = params

  if (!skippedElimination && !tiebreakNeeded && eliminated.length > 0) {
    await supabase
      .from('players')
      .update({ is_alive: false })
      .in(
        'id',
        eliminated.map((e) => e.playerId),
      )
  }

  const { count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('is_alive', true)

  const winner: WinnerInfo | null = null
  let gameOver = false

  // Normal phase never ends with a lone survivor — that only happens in the bracket final.
  if (aliveCount === 0) {
    await supabase.from('sessions').update({ status: 'finished' }).eq('id', session.id)
    gameOver = true
  }

  const transition =
    !gameOver && !tiebreakNeeded
      ? await tryNormalPhaseTransition(supabase, session, aliveCount ?? 0)
      : {
          bracketReady: false,
          finalReady: false,
          bracket: null,
          newPhase: null,
        }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated: tiebreakNeeded ? [] : eliminated,
    aliveCount: aliveCount ?? 0,
    winner,
    gameOver,
    wasAlreadyClosed: false,
    bracketReady: transition.bracketReady,
    finalReady: transition.finalReady,
    sfComplete: false,
    bracket: transition.bracket,
    tiebreakNeeded,
    tiebreakRoundId,
    tiebreakQuestion,
    tiebreakPlayerIds,
    tiebreakStartedAt,
  })
}
