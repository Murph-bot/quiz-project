import { generateBracketForSession, generateFinalForSession } from '@/lib/bracket'
import type { createServerClient } from '@/lib/supabase-server'
import type { BracketState, GamePhase, Session } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

export interface PhaseTransitionResult {
  bracketReady: boolean
  finalReady: boolean
  bracket: BracketState | null
  newPhase: GamePhase | null
}

/** After normal-phase elimination, transition to semis (4 alive) or final (2 alive). */
export async function tryNormalPhaseTransition(
  supabase: Supabase,
  session: Session,
  aliveCount: number,
): Promise<PhaseTransitionResult> {
  const empty: PhaseTransitionResult = {
    bracketReady: false,
    finalReady: false,
    bracket: null,
    newPhase: null,
  }

  if (session.phase !== 'normal') return empty

  if (aliveCount === 4) {
    const bracket = await generateBracketForSession(supabase, session.id)
    if (!bracket) return empty

    const { error } = await supabase
      .from('sessions')
      .update({ phase: 'semifinal', bracket })
      .eq('id', session.id)

    if (error) return empty

    return { bracketReady: true, finalReady: false, bracket, newPhase: 'semifinal' }
  }

  if (aliveCount === 2) {
    const bracket = await generateFinalForSession(supabase, session.id)
    if (!bracket) return empty

    const { error } = await supabase
      .from('sessions')
      .update({ phase: 'final', bracket })
      .eq('id', session.id)

    if (error) return empty

    return { bracketReady: false, finalReady: true, bracket, newPhase: 'final' }
  }

  return empty
}
