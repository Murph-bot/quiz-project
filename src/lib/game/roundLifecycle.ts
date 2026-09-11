import type { MutableRefObject } from 'react'
import {
  getBracketFinalists,
  getFinalistNickname,
  inferMatchPhaseFromBracket,
  isBracketFinalist,
  isCompetingInMatch,
  type MatchPhase,
} from '@/lib/bracket'
import { normalizeCloseResponse } from '@/lib/game/closeClient'
import {
  applyRoundStartedState,
  applyTiebreakStartedState,
  type NextRoundPayload,
  type PendingTiebreak,
  type QuestionData,
  type RoundTransitionContext,
  type RoundTransitionSetters,
} from '@/lib/game/gameRoundTransitions'
import type {
  BracketState,
  EliminatedPlayer,
  RankedAnswer,
  WinnerInfo,
} from '@/types'

// Stable sentinel — must not use Date.now() (SSR/client hydration mismatch).
export const FAR_FUTURE_MS = 9_000_000_000_000
export const POST_TIMER_GRACE_MS = 8_000

export interface MatchResultData {
  winnerNickname: string
  matchLabel: string
  finalScore: string
  nextLabel: string
}

/** Authoritative close result — the API response body, also broadcast verbatim
 *  by the server as the `round:closed` payload. */
export interface CloseResultPayload {
  correctAnswer?: number
  answers?: RankedAnswer[]
  eliminated?: EliminatedPlayer[]
  aliveCount?: number
  winner?: WinnerInfo | null
  gameOver?: boolean
  wasAlreadyClosed?: boolean
  bracketReady?: boolean
  finalReady?: boolean
  sfComplete?: boolean
  bracket?: BracketState | null
  isTie?: boolean
  matchWinnerId?: string | null
  matchWinnerNickname?: string | null
  tiebreakNeeded?: boolean
  tiebreakRoundId?: string | null
  tiebreakQuestion?: QuestionData | null
  tiebreakPlayerIds?: string[] | null
  tiebreakStartedAt?: string | null
  error?: string
}

export interface RoundLifecycleSetters extends RoundTransitionSetters {
  setWinner: (w: WinnerInfo | null) => void
  setGameOver: (v: boolean) => void
  setMatchWins: (w: [number, number]) => void
  setMatchResultData: (d: MatchResultData | null) => void
  setQuestionsExhausted: (v: boolean) => void
}

export interface RoundLifecycleRefs {
  roundIdRef: MutableRefObject<string>
  roundClosedRef: MutableRefObject<boolean>
  pendingTiebreakRef: MutableRefObject<PendingTiebreak | null>
  pendingFinalIntroRef: MutableRefObject<BracketState | null>
  bracketDataRef: MutableRefObject<BracketState | null>
  currentMatchPhaseRef: MutableRefObject<MatchPhase | null>
  isSpectatingRef: MutableRefObject<boolean>
  gameOverRef: MutableRefObject<boolean>
}

export interface RoundLifecycleDeps {
  roomCode: string
  getPlayerId: () => string | null
  getSessionSecret: () => string | null
  getIsHost: () => boolean
  setters: RoundLifecycleSetters
  refs: RoundLifecycleRefs
}

/**
 * Shared round lifecycle: applies authoritative close results, advances the
 * game, and reconciles via GET fallbacks. Every client runs the same logic —
 * the server is the only broadcaster of game events.
 */
export function createRoundLifecycle(deps: RoundLifecycleDeps) {
  const { roomCode, refs, setters } = deps

  function transitionContext(): RoundTransitionContext {
    return {
      playerId: deps.getPlayerId(),
      isSpectatingRef: refs.isSpectatingRef,
      bracketDataRef: refs.bracketDataRef,
      currentMatchPhaseRef: refs.currentMatchPhaseRef,
      graceDeadlineFarFuture: FAR_FUTURE_MS,
      computeAmICompeting: isCompetingInMatch,
    }
  }

  function syncBracketRefs(bracket: BracketState, phase: MatchPhase) {
    refs.bracketDataRef.current = bracket
    refs.currentMatchPhaseRef.current = phase
    setters.setBracketData(bracket)
    setters.setCurrentMatchPhase(phase)
  }

  function fetchAliveCountFromServer() {
    fetch(`/api/sessions/${roomCode}/bracket`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.aliveCount === 'number') {
          setters.setAliveCount(() => d.aliveCount)
        }
      })
      .catch((err) => console.error('[aliveCount] fetch error:', err))
  }

  function applyFinalReadyState(bracket: BracketState, aliveCount?: number) {
    refs.pendingFinalIntroRef.current = bracket
    syncBracketRefs(bracket, 'final')
    setters.setAliveCount(() => (typeof aliveCount === 'number' ? aliveCount : 2))
    if (isBracketFinalist(bracket, deps.getPlayerId())) {
      refs.isSpectatingRef.current = false
      setters.setIsSpectating(false)
    }
  }

  function applyAliveCountFromPayload(data: {
    aliveCount?: number
    eliminated?: EliminatedPlayer[]
  }) {
    if (typeof data.aliveCount === 'number') {
      setters.setAliveCount(() => data.aliveCount as number)
    } else if (data.eliminated?.length) {
      fetchAliveCountFromServer()
    }
  }

  function applyEliminationSpectatorState(
    eliminated: EliminatedPlayer[] | undefined,
    bracket?: BracketState | null,
    finalReady?: boolean,
  ) {
    const playerId = deps.getPlayerId()
    const amFinalist = Boolean(finalReady && bracket && isBracketFinalist(bracket, playerId))

    if (amFinalist) {
      refs.isSpectatingRef.current = false
      setters.setIsSpectating(false)
      return
    }

    if (eliminated?.some((e) => e.playerId === playerId)) {
      refs.isSpectatingRef.current = true
      setters.setIsSpectating(true)
    }
  }

  function showFinalIntro(bracket: BracketState) {
    setters.setBracketData(bracket)
    setters.setCurrentMatchPhase('final')
    setters.setMatchWins([0, 0])
    if (isBracketFinalist(bracket, deps.getPlayerId())) {
      refs.isSpectatingRef.current = false
      setters.setIsSpectating(false)
    }
    setters.setAliveCount(() => 2)
    const finalist1 = getFinalistNickname(bracket, getBracketFinalists(bracket)[0] ?? '')
    const finalist2 = getFinalistNickname(bracket, getBracketFinalists(bracket)[1] ?? '')
    setters.setMatchResultData({
      winnerNickname: '',
      matchLabel: 'The Final',
      finalScore: `${finalist1} vs ${finalist2}`,
      nextLabel: 'First to 3 nearest answers wins!',
    })
    setters.setPhase('match-result')
  }

  /** Apply an authoritative close result — from the close API response, the
   *  `round:closed` broadcast, or the round GET fallback. Idempotent per round. */
  function applyCloseResult(data: CloseResultPayload) {
    if (data.error) {
      console.error('[close] API error:', data.error)
      fetchRoundReveal()
      return
    }
    if (data.wasAlreadyClosed && !data.tiebreakNeeded) {
      if (refs.roundClosedRef.current) return
      fetchRoundReveal()
      return
    }

    // --- TIEBREAK NEEDED (also recover if a late closer already showed reveal) ---
    if (data.tiebreakNeeded && data.tiebreakRoundId && data.tiebreakQuestion && data.tiebreakStartedAt) {
      if (refs.pendingTiebreakRef.current?.roundId === data.tiebreakRoundId) return
      const alreadyRevealing = refs.roundClosedRef.current
      refs.roundClosedRef.current = true
      setters.setEliminated([])
      setters.setRevealData({
        correctAnswer: data.correctAnswer ?? 0,
        answers: data.answers ?? [],
      })
      setters.setPhase('reveal')

      const tbQuestion: QuestionData = {
        id: data.tiebreakQuestion.id,
        text: data.tiebreakQuestion.text,
        timeLimit: data.tiebreakQuestion.timeLimit,
        category: data.tiebreakQuestion.category,
        unit: data.tiebreakQuestion.unit ?? null,
        hint: data.tiebreakQuestion.hint ?? null,
      }
      const deadline =
        new Date(data.tiebreakStartedAt).getTime() + data.tiebreakQuestion.timeLimit * 1000
      setters.setTiebreakDeadlineMs(deadline)
      const pending: PendingTiebreak = {
        roundId: data.tiebreakRoundId,
        question: tbQuestion,
        startedAt: data.tiebreakStartedAt,
        playerIds: data.tiebreakPlayerIds ?? [],
      }
      refs.pendingTiebreakRef.current = pending
      setters.setPendingTiebreak(pending)

      if (alreadyRevealing) {
        setTimeout(() => advanceAfterReveal(), 0)
      }
      return
    }

    if (refs.roundClosedRef.current) return
    refs.roundClosedRef.current = true

    // --- BRACKET MODE: bracket just generated → show semifinal intro ---
    if (data.bracketReady && data.bracket) {
      setters.setBracketData(data.bracket)
      setters.setCurrentMatchPhase('sf1')
      setters.setPhase('bracket')
      return
    }

    // --- BRACKET MODE: tie — replay with new question ---
    if (data.isTie) {
      setters.setRevealData({
        correctAnswer: data.correctAnswer ?? 0,
        answers: data.answers ?? [],
      })
      setters.setPhase('reveal')
      // auto-advance effect calls requestNextRound after the reveal timer
      return
    }

    // --- BRACKET MODE: game over (Final winner) ---
    if (data.gameOver && data.winner) {
      setters.setGameOver(true)
      refs.gameOverRef.current = true
      setters.setWinner(data.winner ?? null)
      setters.setRevealData({
        correctAnswer: data.correctAnswer ?? 0,
        answers: data.answers ?? [],
      })
      setters.setPhase('reveal')
      return
    }

    // --- BRACKET MODE: SF match complete (winner advances) ---
    if (data.sfComplete && data.bracket) {
      const currentBracketSF = refs.bracketDataRef.current?.currentSF
      const sfLabel = currentBracketSF === 1 ? 'Semi-Final 1' : 'Semi-Final 2'
      const sfKey = currentBracketSF === 1 ? 'sf1' : 'sf2'
      const sfWins = data.bracket[sfKey]?.wins ?? [0, 0]
      const finalScore = `${sfWins[0]} – ${sfWins[1]}`
      const nextLabel = data.finalReady ? 'The Final is next!' : 'Semi-Final 2 up next'
      const nextMatchPhase = data.finalReady ? 'final' : 'sf2'

      setters.setBracketData(data.bracket)
      setters.setMatchWins([0, 0])
      setters.setCurrentMatchPhase(nextMatchPhase)
      setters.setMatchResultData({
        winnerNickname: data.matchWinnerNickname ?? '',
        matchLabel: sfLabel,
        finalScore,
        nextLabel,
      })
      setters.setPhase('match-result')
      return
    }

    // --- BRACKET MODE: match continues (no winner yet) ---
    if (
      data.bracket &&
      !data.finalReady &&
      !data.bracketReady &&
      !data.sfComplete &&
      !data.isTie &&
      !(data.gameOver && data.winner)
    ) {
      // The server bracket is truth — always realign the match phase so a
      // missed sfComplete broadcast self-heals on the next close.
      const inferred = inferMatchPhaseFromBracket(data.bracket)
      if (inferred && inferred !== refs.currentMatchPhaseRef.current) {
        syncBracketRefs(data.bracket, inferred)
      }

      if (refs.currentMatchPhaseRef.current) {
        const sfKey =
          data.bracket.currentSF === 1 ? 'sf1' : data.bracket.currentSF === 2 ? 'sf2' : null
        const newWins: [number, number] = sfKey
          ? data.bracket[sfKey].wins
          : [data.bracket.finalWins?.[0] ?? 0, data.bracket.finalWins?.[1] ?? 0]
        setters.setMatchWins(newWins)
        setters.setBracketData(data.bracket)
        setters.setRevealData({
          correctAnswer: data.correctAnswer ?? 0,
          answers: data.answers ?? [],
        })
        setters.setPhase('reveal')
        return
      }
    }

    // --- NORMAL MODE ---
    setters.setEliminated(data.eliminated ?? [])
    setters.setRevealData({
      correctAnswer: data.correctAnswer ?? 0,
      answers: data.answers ?? [],
    })
    setters.setPhase('reveal')

    if (data.finalReady && data.bracket && !data.sfComplete) {
      applyFinalReadyState(data.bracket, data.aliveCount)
    }

    if (data.gameOver) {
      setters.setGameOver(true)
      refs.gameOverRef.current = true
      setters.setWinner(data.winner ?? null)
    }

    applyAliveCountFromPayload(data)
    applyEliminationSpectatorState(data.eliminated, data.bracket, data.finalReady)
  }

  function fetchRoundReveal() {
    const playerId = deps.getPlayerId()
    const sessionSecret = deps.getSessionSecret()
    if (!playerId || !sessionSecret || !refs.roundIdRef.current) return
    const params = new URLSearchParams({ playerId, sessionSecret })
    fetch(`/api/sessions/${roomCode}/rounds/${refs.roundIdRef.current}?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.status !== 'closed') return
        applyCloseResult({ ...data, wasAlreadyClosed: false })
      })
      .catch((err) => console.error('[reveal] fetch error:', err))
  }

  function attemptClose() {
    const playerId = deps.getPlayerId()
    const sessionSecret = deps.getSessionSecret()
    if (!playerId || !sessionSecret || refs.roundClosedRef.current || !refs.roundIdRef.current) {
      return
    }
    fetch(`/api/sessions/${roomCode}/rounds/${refs.roundIdRef.current}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, sessionSecret }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        applyCloseResult(normalizeCloseResponse(r.status, data) as CloseResultPayload)
      })
      .catch((err) => console.error('[close] network error:', err))
  }

  /** Apply a `round:started` payload — a new question round or a bracket intro. */
  function applyRoundPayload(data: NextRoundPayload) {
    if (data.bracketReady && data.bracket) {
      setters.setBracketData(data.bracket)
      setters.setCurrentMatchPhase('sf1')
      setters.setPhase('bracket')
      return
    }
    applyRoundStartedState(data, setters, transitionContext())
  }

  /**
   * Broadcasts are hints, not truth — a `round:started` payload is only
   * applied after the server confirms the state it claims (bracket phase via
   * the session, or an active round by id). Forged payloads are ignored.
   */
  function verifyRoundStarted(payload: NextRoundPayload) {
    const playerId = deps.getPlayerId()
    const sessionSecret = deps.getSessionSecret()
    if (!playerId || !sessionSecret) return

    if (payload.bracketReady) {
      fetch(`/api/sessions/${roomCode}`)
        .then((r) => r.json())
        .then((d) => {
          const phase = d?.session?.phase
          const bracket = d?.session?.bracket as BracketState | null | undefined
          // Only the server's bracket is applied — the broadcast payload is a hint.
          if ((phase === 'semifinal' || phase === 'final') && bracket) {
            applyRoundPayload({ ...payload, bracketReady: true, bracket })
          }
        })
        .catch((err) => console.error('[round:started] verify failed:', err))
      return
    }

    if (!payload.roundId) return
    const params = new URLSearchParams({ playerId, sessionSecret })
    fetch(`/api/sessions/${roomCode}/rounds/${payload.roundId}?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'active') applyRoundPayload(payload)
      })
      .catch((err) => console.error('[round:started] verify failed:', err))
  }

  /** Host-only: ask the server to create the next round. The server
   *  broadcasts `round:started` to every client on success. */
  function requestNextRound() {
    const playerId = deps.getPlayerId()
    const sessionSecret = deps.getSessionSecret()
    if (!deps.getIsHost() || !playerId) return
    fetch(`/api/sessions/${roomCode}/rounds/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, sessionSecret }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.roundId && !data.bracketReady) {
          if (data.error === 'Current round still active') {
            fetchRoundReveal()
            return
          }
          if (data.error === 'No questions available') {
            setters.setQuestionsExhausted(true)
          }
          return
        }
        applyRoundPayload(data)
      })
      .catch((err) => console.error('[next] fetch error:', err))
  }

  /**
   * Reveal timer finished. Every client derives pending transitions locally
   * (tiebreak, final intro, winner) — only the host then asks the server for
   * the next round.
   */
  function advanceAfterReveal() {
    const playerId = deps.getPlayerId()
    if (!playerId) return

    if (refs.gameOverRef.current) {
      setters.setPhase('winner')
      return
    }

    const pending = refs.pendingTiebreakRef.current
    if (pending) {
      refs.pendingTiebreakRef.current = null
      applyTiebreakStartedState(pending, playerId, setters, FAR_FUTURE_MS)
      return
    }

    const pendingFinal = refs.pendingFinalIntroRef.current
    if (pendingFinal) {
      refs.pendingFinalIntroRef.current = null
      showFinalIntro(pendingFinal)
      return
    }

    fetch(`/api/sessions/${roomCode}/bracket`)
      .then((r) => r.json())
      .then((sessionState) => {
        if (sessionState.phase === 'final' && sessionState.bracket) {
          showFinalIntro(sessionState.bracket as BracketState)
          return
        }
        if (sessionState.phase === 'semifinal' && sessionState.bracket) {
          setters.setBracketData(sessionState.bracket as BracketState)
          setters.setCurrentMatchPhase('sf1')
          setters.setPhase('bracket')
          return
        }
        if (!deps.getIsHost()) return
        requestNextRound()
      })
      .catch((err) => console.error('[advance] session phase check failed:', err))
  }

  return {
    applyCloseResult,
    fetchRoundReveal,
    attemptClose,
    applyRoundPayload,
    verifyRoundStarted,
    requestNextRound,
    advanceAfterReveal,
    syncBracketRefs,
  }
}
