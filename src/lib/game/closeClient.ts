export type ClosePollPhase =
  | 'answering'
  | 'waiting'
  | 'reveal'
  | 'spectating'
  | 'bracket'
  | 'match-result'
  | 'winner'
  | 'tiebreak-waiting'

export function shouldPollForMissedClose(opts: {
  phase: ClosePollPhase
  isExpired: boolean
  roundClosed: boolean
}): boolean {
  if (!opts.isExpired || opts.roundClosed) return false
  return opts.phase === 'waiting' || opts.phase === 'tiebreak-waiting'
}

export function normalizeCloseResponse(
  status: number,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const errorText = typeof data.error === 'string' ? data.error : ''
  const alreadyClosed =
    data.wasAlreadyClosed === true ||
    status === 409 ||
    /already closed/i.test(errorText)

  if (!alreadyClosed) return data

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { error: _error, ...rest } = data
  return { ...rest, wasAlreadyClosed: true }
}

export const TIEBREAK_WAITING_REASSURANCE =
  "You're still in — a tiebreak is deciding who is farthest out."

export interface FollowUpTiebreakRound {
  id: string
  status: string
  started_at: string
  tiebreak_players?: string[] | null
  question?: {
    id: string
    text: string
    time_limit: number
    category: string
  } | null
}

export function pendingTiebreakFromFollowUpRound(round: FollowUpTiebreakRound | null): {
  tiebreakNeeded: true
  tiebreakRoundId: string
  tiebreakStartedAt: string
  tiebreakPlayerIds: string[]
  tiebreakQuestion: { id: string; text: string; timeLimit: number; category: string }
} | null {
  if (!round || round.status !== 'active') return null
  if (!Array.isArray(round.tiebreak_players) || round.tiebreak_players.length === 0) return null
  if (!round.question) return null
  return {
    tiebreakNeeded: true,
    tiebreakRoundId: round.id,
    tiebreakStartedAt: round.started_at,
    tiebreakPlayerIds: round.tiebreak_players,
    tiebreakQuestion: {
      id: round.question.id,
      text: round.question.text,
      timeLimit: round.question.time_limit,
      category: round.question.category,
    },
  }
}

