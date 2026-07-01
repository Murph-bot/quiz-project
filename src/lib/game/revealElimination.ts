import { resolveNormalElimination } from '@/lib/elimination'
import { buildRankedAnswers } from '@/lib/game/closeTiebreak'
import type { EliminatedPlayer, RankedAnswer } from '@/types'

export function computeRevealElimination(
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>,
  correctAnswer: number,
  activeList: Array<{ id: string; nickname: string }>,
): { answers: RankedAnswer[]; eliminated: EliminatedPlayer[] } {
  const answers = buildRankedAnswers(rawAnswers, correctAnswer, activeList)
  const { eliminated } = resolveNormalElimination(answers)
  return { answers, eliminated }
}
