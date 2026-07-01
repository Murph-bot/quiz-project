import type { EliminatedPlayer, RankedAnswer } from '@/types'

export interface NormalEliminationResult {
  eliminated: EliminatedPlayer[]
  /** Players tied for farthest — need a head-to-head tiebreak round */
  tiedForWorstIds: string[]
}

/** In normal phase, only the farthest answer(s) from correct are at risk. */
export function resolveNormalElimination(answers: RankedAnswer[]): NormalEliminationResult {
  if (answers.length === 0) {
    return { eliminated: [], tiedForWorstIds: [] }
  }

  const maxDelta = Math.max(...answers.map((a) => a.delta))
  if (maxDelta === 0) {
    return { eliminated: [], tiedForWorstIds: [] }
  }

  const worst = answers.filter((a) => a.delta === maxDelta)

  if (worst.length === 1) {
    return {
      eliminated: [{ playerId: worst[0].playerId, nickname: worst[0].nickname }],
      tiedForWorstIds: [],
    }
  }

  return {
    eliminated: [],
    tiedForWorstIds: worst.map((a) => a.playerId),
  }
}

/** Everyone answered wrong with the exact same distance — replay, no elimination. */
export function isIdenticalWrongReplay(answers: RankedAnswer[], activeCount: number): boolean {
  if (answers.length !== activeCount || answers.length === 0) return false
  if (!answers.every((a) => a.delta > 0)) return false
  const firstDelta = answers[0].delta
  return answers.every((a) => a.delta === firstDelta)
}

/** Among a subset (tiebreak participants), eliminate only the farthest. */
export function resolveSubsetElimination(
  participantAnswers: Array<{ playerId: string; nickname: string; delta: number }>,
): { eliminated: EliminatedPlayer[]; tiedForWorstIds: string[] } {
  if (participantAnswers.length === 0) {
    return { eliminated: [], tiedForWorstIds: [] }
  }

  const maxDelta = Math.max(...participantAnswers.map((a) => a.delta))
  if (maxDelta === 0) {
    return { eliminated: [], tiedForWorstIds: [] }
  }

  const worst = participantAnswers.filter((a) => a.delta === maxDelta)

  if (worst.length === 1) {
    return {
      eliminated: [{ playerId: worst[0].playerId, nickname: worst[0].nickname }],
      tiedForWorstIds: [],
    }
  }

  return {
    eliminated: [],
    tiedForWorstIds: worst.map((a) => a.playerId),
  }
}
