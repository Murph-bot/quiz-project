import type { MutableRefObject } from 'react'
import { withNormalizedOptions } from '@/lib/questionOptions'
import type { BracketState } from '@/types'

export interface QuestionData {
  id: string
  text: string
  timeLimit: number
  category: string
  options?: number[]
}

export interface PendingTiebreak {
  roundId: string
  question: QuestionData
  startedAt: string
  playerIds: string[]
}

export interface NextRoundPayload {
  roundId?: string
  roundNumber?: number
  question?: QuestionData
  options?: number[]
  startedAt?: string
  resurrected?: { playerId: string; nickname: string } | null
  isSuddenDeath?: boolean
  bracketReady?: boolean
  bracket?: BracketState
  aliveCount?: number
}

export interface RoundTransitionSetters {
  setRoundId: (id: string) => void
  setRoundNumber: (n: number) => void
  setQuestion: (q: QuestionData) => void
  setStartedAt: (at: string) => void
  setRevealData: (data: null) => void
  setEliminated: (e: []) => void
  setIsGracePeriod: (v: boolean) => void
  setAnsweredPlayerIds: (ids: Set<string>) => void
  setGraceDeadlineMs: (ms: number) => void
  setPhase: (phase: 'answering' | 'waiting' | 'reveal' | 'spectating' | 'bracket' | 'match-result' | 'winner' | 'tiebreak-waiting') => void
  setResurrected: (r: { playerId: string; nickname: string } | null) => void
  setIsSuddenDeath: (v: boolean) => void
  setAliveCount: (fn: (prev: number) => number) => void
  setIsSpectating: (v: boolean) => void
  setShowResurrectionSelf: (v: boolean) => void
  setBracketData: (b: BracketState) => void
  setCurrentMatchPhase: (p: 'sf1' | 'sf2' | 'final') => void
  setPendingTiebreak: (tb: PendingTiebreak | null) => void
  setTiebreakDeadlineMs: (ms: number) => void
}

export interface RoundTransitionContext {
  playerId: string | null
  isSpectatingRef: MutableRefObject<boolean>
  bracketDataRef: MutableRefObject<BracketState | null>
  currentMatchPhaseRef: MutableRefObject<'sf1' | 'sf2' | 'final' | null>
  graceDeadlineFarFuture: number
  computeAmICompeting: (
    bd: BracketState | null,
    phase: 'sf1' | 'sf2' | 'final' | null,
    pid: string | null,
  ) => boolean
}

export function applyRoundStartedState(
  payload: NextRoundPayload,
  setters: RoundTransitionSetters,
  ctx: RoundTransitionContext,
): void {
  if (payload.resurrected?.playerId === ctx.playerId) {
    ctx.isSpectatingRef.current = false
    setters.setIsSpectating(false)
    setters.setShowResurrectionSelf(true)
    setTimeout(() => setters.setShowResurrectionSelf(false), 4000)
  }
  if (typeof payload.aliveCount === 'number') {
    const count = payload.aliveCount
    setters.setAliveCount(() => count)
  } else if (payload.resurrected) {
    setters.setAliveCount((prev) => prev + 1)
  }
  setters.setResurrected(payload.resurrected ?? null)
  if (payload.isSuddenDeath) setters.setIsSuddenDeath(true)
  if (payload.roundId) setters.setRoundId(payload.roundId)
  if (payload.roundNumber !== undefined) setters.setRoundNumber(payload.roundNumber)
  if (payload.question) {
    setters.setQuestion(
      withNormalizedOptions({ ...payload.question, options: payload.options }),
    )
  }
  if (payload.startedAt) setters.setStartedAt(payload.startedAt)
  setters.setRevealData(null)
  setters.setEliminated([])
  setters.setIsGracePeriod(false)
  setters.setAnsweredPlayerIds(new Set())
  setters.setGraceDeadlineMs(ctx.graceDeadlineFarFuture)

  const bd = ctx.bracketDataRef.current
  const mp = ctx.currentMatchPhaseRef.current
  setters.setPhase(
    bd && mp
      ? ctx.computeAmICompeting(bd, mp, ctx.playerId)
        ? 'answering'
        : 'spectating'
      : ctx.isSpectatingRef.current
        ? 'spectating'
        : 'answering',
  )
}

export function applyTiebreakStartedState(
  pending: PendingTiebreak,
  playerId: string | null,
  setters: Pick<
    RoundTransitionSetters,
    | 'setRoundId'
    | 'setQuestion'
    | 'setStartedAt'
    | 'setRevealData'
    | 'setEliminated'
    | 'setIsGracePeriod'
    | 'setAnsweredPlayerIds'
    | 'setGraceDeadlineMs'
    | 'setPendingTiebreak'
    | 'setTiebreakDeadlineMs'
    | 'setPhase'
  >,
  graceDeadlineFarFuture: number,
): void {
  const amITiebreaker = pending.playerIds.includes(playerId ?? '')
  setters.setRoundId(pending.roundId)
  setters.setQuestion(withNormalizedOptions(pending.question))
  setters.setStartedAt(pending.startedAt)
  setters.setRevealData(null)
  setters.setEliminated([])
  setters.setIsGracePeriod(false)
  setters.setAnsweredPlayerIds(new Set())
  setters.setGraceDeadlineMs(graceDeadlineFarFuture)
  setters.setPendingTiebreak(null)
  setters.setTiebreakDeadlineMs(
    new Date(pending.startedAt).getTime() + pending.question.timeLimit * 1000,
  )
  setters.setPhase(amITiebreaker ? 'answering' : 'tiebreak-waiting')
}
