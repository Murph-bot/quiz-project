import { resolveNormalElimination, resolveSubsetElimination } from '@/lib/elimination'
import { buildRankedAnswers } from '@/lib/game/closeTiebreak'
import type { EliminatedPlayer, RankedAnswer } from '@/types'

/**
 * Rebuild a closed round's result for a client that missed the broadcast.
 * A tiebreak round only ever eliminates among its own participants, so pass
 * them in or the players who were not in it look farthest by default.
 */
export function computeRevealElimination(
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>,
  correctAnswer: number,
  activeList: Array<{ id: string; nickname: string }>,
  tiebreakPlayers?: string[] | null,
): { answers: RankedAnswer[]; eliminated: EliminatedPlayer[] } {
  const answers = buildRankedAnswers(rawAnswers, correctAnswer, activeList)

  if (tiebreakPlayers) {
    const participants = answers.filter((a) => tiebreakPlayers.includes(a.playerId))
    return { answers, eliminated: resolveSubsetElimination(participants).eliminated }
  }

  const { eliminated } = resolveNormalElimination(answers)
  return { answers, eliminated }
}
