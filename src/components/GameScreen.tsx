'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCountdown } from '@/hooks/useCountdown'
import { useGameRoomEvents } from '@/hooks/useGameRoomEvents'
import { usePlayerSession } from '@/hooks/usePlayerSession'
import { useWakeLock } from '@/hooks/useWakeLock'
import { playSfx } from '@/lib/sfx'
import type {
  NextRoundPayload,
  PendingTiebreak,
  QuestionData,
} from '@/lib/game/gameRoundTransitions'
import {
  createRoundLifecycle,
  FAR_FUTURE_MS,
  POST_TIMER_GRACE_MS,
} from '@/lib/game/roundLifecycle'
import { QuestionPanel } from './QuestionPanel'
import { RevealPanel } from './RevealPanel'
import { SpectatorScreen } from './SpectatorScreen'
import { WinnerScreen } from './WinnerScreen'
import { BracketScreen } from './BracketScreen'
import { MatchScoreBar } from './MatchScoreBar'
import { MatchResultScreen } from './MatchResultScreen'
import { TiebreakWaitingScreen } from './TiebreakWaitingScreen'
import { Banner } from '@/components/ui/Banner'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  getBracketFinalists,
  getFinalistNickname,
  isBracketFinalist,
} from '@/lib/bracket'
import { shouldPollForMissedClose } from '@/lib/game/closeClient'
import type {
  RankedAnswer,
  EliminatedPlayer,
  WinnerInfo,
  BracketState,
  GamePhase,
} from '@/types'

interface RevealData {
  correctAnswer: number
  answers: RankedAnswer[]
}

interface Props {
  roomCode: string
  sessionHostId: string
  initialRoundId: string | null
  initialRoundNumber: number
  initialQuestion: QuestionData | null
  initialStartedAt: string | null
  initialRevealData: RevealData | null
  initialWinner: WinnerInfo | null
  initialAliveCount: number
  initialSessionPhase?: GamePhase
  initialBracket?: BracketState | null
}

type Phase = 'answering' | 'waiting' | 'reveal' | 'spectating' | 'bracket' | 'match-result' | 'winner' | 'tiebreak-waiting'

export function GameScreen({
  roomCode,
  sessionHostId,
  initialRoundId,
  initialRoundNumber,
  initialQuestion,
  initialStartedAt,
  initialRevealData,
  initialWinner,
  initialAliveCount,
  initialSessionPhase = 'normal',
  initialBracket = null,
}: Props) {
  const router = useRouter()
  const { playerId, nickname, sessionSecret, ready } = usePlayerSession()
  const [currentHostId, setCurrentHostId] = useState(sessionHostId)
  const currentHostIdRef = useRef(sessionHostId)
  useEffect(() => { currentHostIdRef.current = currentHostId }, [currentHostId])
  const isHost = playerId !== null && playerId === currentHostId

  const [roundId, setRoundId] = useState(initialRoundId ?? '')
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber)
  const [question, setQuestion] = useState<QuestionData>(() =>
    initialQuestion ?? { id: 'pending', text: '', timeLimit: 30, category: '' },
  )
  const [startedAt, setStartedAt] = useState(initialStartedAt ?? new Date(0).toISOString())

  const getInitialPhase = (): Phase => {
    if (initialWinner !== null) return 'winner'
    if (initialRevealData) return 'reveal'
    if (initialSessionPhase === 'semifinal' && initialBracket) return 'bracket'
    if (initialSessionPhase === 'final' && initialBracket && initialRoundId) return 'answering'
    if (initialRoundId) return 'answering'
    if (initialBracket) return 'bracket'
    return 'answering'
  }

  const [phase, setPhase] = useState<Phase>(getInitialPhase)
  const [revealData, setRevealData] = useState<RevealData | null>(initialRevealData)
  const [eliminated, setEliminated] = useState<EliminatedPlayer[]>([])
  const [winner, setWinner] = useState<WinnerInfo | null>(initialWinner)
  const [gameOver, setGameOver] = useState(initialWinner !== null)
  const [resurrected, setResurrected] = useState<{ playerId: string; nickname: string } | null>(null)
  const [isSuddenDeath, setIsSuddenDeath] = useState(false)
  const [isGracePeriod, setIsGracePeriod] = useState(false)
  const [autoAdvanceIn, setAutoAdvanceIn] = useState(5)
  const [autoRedirectIn, setAutoRedirectIn] = useState(30)
  const [isSpectating, setIsSpectating] = useState(false)
  const [aliveCount, setAliveCount] = useState<number>(initialAliveCount)
  const [showResurrectionSelf, setShowResurrectionSelf] = useState(false)
  const [questionsExhausted, setQuestionsExhausted] = useState(false)

  // Grace period state
  const [, setAnsweredPlayerIds] = useState<Set<string>>(new Set())
  const [graceDeadlineMs, setGraceDeadlineMs] = useState<number>(FAR_FUTURE_MS)
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // roundId ref for stale closure guard in broadcast listeners
  const roundIdRef = useRef(roundId)
  useEffect(() => { roundIdRef.current = roundId }, [roundId])

  // phase ref so broadcast handlers can gate events on the current phase
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  // Bracket state
  const [bracketData, setBracketData] = useState<BracketState | null>(initialBracket)
  const [matchWins, setMatchWins] = useState<[number, number]>([0, 0])
  const [currentMatchPhase, setCurrentMatchPhase] = useState<'sf1' | 'sf2' | 'final' | null>(
    initialSessionPhase === 'semifinal' && initialBracket ? 'sf1' : initialSessionPhase === 'final' && initialBracket ? 'final' : null,
  )
  const [matchResultData, setMatchResultData] = useState<{
    winnerNickname: string
    matchLabel: string
    finalScore: string
    nextLabel: string
  } | null>(null)

  // Tiebreak state
  const [tiebreakDeadlineMs, setTiebreakDeadlineMs] = useState<number>(FAR_FUTURE_MS)
  const [pendingTiebreak, setPendingTiebreak] = useState<PendingTiebreak | null>(null)

  const pendingTiebreakRef = useRef<PendingTiebreak | null>(null)
  useEffect(() => { pendingTiebreakRef.current = pendingTiebreak }, [pendingTiebreak])

  const pendingFinalIntroRef = useRef<BracketState | null>(null)

  const isSpectatingRef = useRef(false)
  const gameOverRef = useRef(initialWinner !== null)
  const bracketDataRef = useRef<BracketState | null>(null)
  const currentMatchPhaseRef = useRef<'sf1' | 'sf2' | 'final' | null>(null)

  // Keep refs in sync with state
  useEffect(() => { bracketDataRef.current = bracketData }, [bracketData])
  useEffect(() => { currentMatchPhaseRef.current = currentMatchPhase }, [currentMatchPhase])

  const roundClosedRef = useRef(false)
  const allAnsweredConfirmedRef = useRef(false)
  const closeInFlightRef = useRef(false)
  // Reset when roundId changes so a new round can be closed
  useEffect(() => {
    roundClosedRef.current = false
    allAnsweredConfirmedRef.current = false
    closeInFlightRef.current = false
  }, [roundId])

  const lifecycle = createRoundLifecycle({
    roomCode,
    getPlayerId: () => playerId,
    getSessionSecret: () => sessionSecret,
    getIsHost: () => playerId !== null && playerId === currentHostIdRef.current,
    setters: {
      setRoundId,
      setRoundNumber,
      setQuestion,
      setStartedAt,
      setRevealData,
      setEliminated,
      setIsGracePeriod,
      setAnsweredPlayerIds,
      setGraceDeadlineMs,
      setPhase,
      setResurrected,
      setIsSuddenDeath,
      setAliveCount,
      setIsSpectating,
      setShowResurrectionSelf,
      setBracketData,
      setCurrentMatchPhase,
      setPendingTiebreak,
      setTiebreakDeadlineMs,
      setWinner,
      setGameOver,
      setMatchWins,
      setMatchResultData,
      setQuestionsExhausted,
    },
    refs: {
      roundIdRef,
      roundClosedRef,
      pendingTiebreakRef,
      pendingFinalIntroRef,
      bracketDataRef,
      currentMatchPhaseRef,
      isSpectatingRef,
      gameOverRef,
      closeInFlightRef,
    },
  })
  const {
    fetchRoundReveal,
    attemptClose,
    verifyRoundStarted,
    requestNextRound,
    advanceAfterReveal,
    syncBracketRefs,
  } = lifecycle

  useEffect(() => {
    if (!ready || !playerId) return
    fetch(`/api/sessions/${roomCode}/bracket`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.aliveCount === 'number') {
          setAliveCount(d.aliveCount)
        }
        if (d.phase === 'final' && d.bracket) {
          const bracket = d.bracket as BracketState
          if (!currentMatchPhaseRef.current) {
            syncBracketRefs(bracket, 'final')
          }
          if (isBracketFinalist(bracket, playerId)) {
            isSpectatingRef.current = false
            setIsSpectating(false)
          } else if (getBracketFinalists(bracket).length > 0) {
            isSpectatingRef.current = true
            setIsSpectating(true)
          }
        }
      })
      .catch((err) => console.error('[session] sync error:', err))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playerId, roomCode])

  useEffect(() => {
    if (!ready) return
    if (!playerId) {
      router.push('/')
    }
  }, [ready, playerId, router])

  // Countdown for current question — used to trigger close when expired
  const hasActiveRound = Boolean(roundId)
  const deadlineMs = hasActiveRound
    ? new Date(startedAt).getTime() + question.timeLimit * 1000
    : FAR_FUTURE_MS
  const { isExpired } = useCountdown(
    hasActiveRound &&
      (phase === 'answering' || phase === 'waiting' || phase === 'tiebreak-waiting')
      ? deadlineMs
      : FAR_FUTURE_MS
  )

  // Grace period countdown for banner
  const { secondsLeft: graceSecondsLeft } = useCountdown(isGracePeriod ? graceDeadlineMs : FAR_FUTURE_MS)

  // Timer expired → 8s grace period → close the round (any connected player)
  useEffect(() => {
    if (!isExpired || !roundId) return
    if (phase !== 'answering' && phase !== 'waiting' && phase !== 'tiebreak-waiting') return

    // Skip if already in grace period (new host takeover handled by separate effect)
    if (isGracePeriod) return

    const doClose = () => {
      setIsGracePeriod(false)
      setGraceDeadlineMs(FAR_FUTURE_MS)
      attemptClose()
    }

    // If the timer expired long before this effect ran (stale reconnect), skip grace
    if (Date.now() - deadlineMs > POST_TIMER_GRACE_MS) {
      doClose()
      return
    }

    // If the server confirmed everyone answered, close immediately (no grace)
    if (allAnsweredConfirmedRef.current) {
      doClose()
      return
    }

    // Start 8s grace period — each client derives this locally from the shared
    // round deadline, so no broadcast is needed.
    const deadline = Date.now() + POST_TIMER_GRACE_MS
    setIsGracePeriod(true)
    setGraceDeadlineMs(deadline)

    graceTimeoutRef.current = setTimeout(() => {
      graceTimeoutRef.current = null
      doClose()
    }, POST_TIMER_GRACE_MS)

    return () => {
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current)
        graceTimeoutRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired, phase, isGracePeriod, roomCode])

  // Grace recovery: if grace period is running but the timeout was cleared (React re-render)
  useEffect(() => {
    if (!isGracePeriod || graceTimeoutRef.current) return
    const remaining = graceDeadlineMs - Date.now()
    const closeRound = () => {
      setIsGracePeriod(false)
      setGraceDeadlineMs(FAR_FUTURE_MS)
      attemptClose()
    }
    if (remaining <= 0) { closeRound(); return }
    graceTimeoutRef.current = setTimeout(() => {
      graceTimeoutRef.current = null
      closeRound()
    }, remaining)
    return () => {
      if (graceTimeoutRef.current) { clearTimeout(graceTimeoutRef.current); graceTimeoutRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGracePeriod, graceDeadlineMs, roomCode])

  // Poll for closed round if realtime close broadcast was missed — not during active answering
  useEffect(() => {
    if (!roundId) return
    if (!shouldPollForMissedClose({
      phase,
      isExpired,
      roundClosed: roundClosedRef.current,
    })) return
    fetchRoundReveal()
    const interval = setInterval(fetchRoundReveal, 3000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired, phase, roomCode, playerId, sessionSecret])

  // Auto-advance after reveal — every client derives the next transition locally;
  // only the host asks the server to create the next round.
  useEffect(() => {
    if (phase !== 'reveal') return
    setAutoAdvanceIn(12)
    const tick = setInterval(() => setAutoAdvanceIn(s => Math.max(0, s - 1)), 1000)
    const advance = setTimeout(() => {
      advanceAfterReveal()
    }, 12000)
    return () => {
      clearInterval(tick)
      clearTimeout(advance)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roomCode])

  // Winner auto-redirect
  useEffect(() => {
    if (phase !== 'winner') return
    setAutoRedirectIn(30)
    const tick = setInterval(() => setAutoRedirectIn(s => Math.max(0, s - 1)), 1000)
    const redirect = setTimeout(() => router.push('/'), 30000)
    return () => {
      clearInterval(tick)
      clearTimeout(redirect)
    }
  }, [phase, router])

  // Keep the screen awake while a question is live or closing.
  useWakeLock(phase === 'answering' || phase === 'waiting')

  // Phase-change sound + haptic cues.
  useEffect(() => {
    if (phase === 'reveal') {
      const wasEliminated = playerId !== null && eliminated.some((e) => e.playerId === playerId)
      if (wasEliminated) {
        playSfx('eliminated')
        navigator.vibrate?.([80, 60, 80])
      } else {
        playSfx('survived')
      }
    } else if (phase === 'winner') {
      playSfx('victory')
    } else if (phase === 'answering') {
      playSfx('roundStart')
    }
    // eliminated/playerId are read at the moment the phase flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useGameRoomEvents({
    roomCode,
    playerId: playerId ?? '',
    sessionSecret,
    ready: ready && !!playerId,
    initialHostId: sessionHostId,
    roundIdRef,
    currentHostIdRef,
    isSpectatingRef,
    roundClosedRef,
    allAnsweredConfirmedRef,
    graceTimeoutRef,
    setCurrentHostId,
    attemptClose,
    onRoundClosed: () => {
      // Broadcast is a hint — re-fetch the authoritative close result.
      fetchRoundReveal()
    },
    onRoundStarted: (payload) => {
      verifyRoundStarted(payload as unknown as NextRoundPayload)
    },
    onRoundAnswered: (answeredId) => {
      setAnsweredPlayerIds((prev) => new Set([...prev, answeredId]))
    },
    onAllAnswered: () => {
      setIsGracePeriod(false)
      setGraceDeadlineMs(FAR_FUTURE_MS)
    },
    onGameExhausted: () => {
      // Broadcasts are hints — exhaustion can only legitimately follow a
      // failed advance attempt (awaiting reveal/next) or a game start with
      // zero questions in the category (no round yet). A forged event during
      // active play is ignored.
      const awaitingAdvance = phaseRef.current === 'reveal' || phaseRef.current === 'match-result'
      if (awaitingAdvance || !roundIdRef.current) {
        setQuestionsExhausted(true)
      }
    },
  })

  async function handleSubmit(value: number) {
    if (!playerId || isSpectatingRef.current) return
    const res = await fetch(`/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, sessionSecret, value }),
    })
    if (res.ok) {
      const data = await res.json()
      setPhase('waiting')
      // Track own answer locally — the server also broadcasts round:answered
      setAnsweredPlayerIds(prev => new Set([...prev, playerId]))

      // Server confirmed all alive players have answered — close immediately.
      // The server also broadcasts all:answered; attemptClose is idempotent.
      if (data.allAnswered) {
        allAnsweredConfirmedRef.current = true
        if (graceTimeoutRef.current) {
          clearTimeout(graceTimeoutRef.current)
          graceTimeoutRef.current = null
        }
        setIsGracePeriod(false)
        setGraceDeadlineMs(FAR_FUTURE_MS)
        attemptClose()
      }
    }
  }

  if (!ready) {
    return <LoadingState message="Loading game..." />
  }

  if (questionsExhausted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center phase-enter">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <div className="text-6xl">📭</div>
          <Card padding="md" className="text-center">
            <div className="text-lg font-black text-gray-900">No more questions!</div>
            <div className="text-sm text-gray-500 mt-1">
              The question bank has been exhausted. The game has ended.
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (phase === 'winner') {
    return <WinnerScreen winnerNickname={winner?.nickname ?? null} autoRedirectIn={autoRedirectIn} />
  }

  if (phase === 'bracket' && bracketData) {
    return (
      <BracketScreen
        bracket={bracketData}
        myPlayerId={playerId ?? ''}
        onReady={() => {
          if (!isHost || !playerId) return
          requestNextRound()
        }}
      />
    )
  }

  if (phase === 'match-result' && matchResultData) {
    return (
      <MatchResultScreen
        winnerNickname={matchResultData.winnerNickname}
        matchLabel={matchResultData.matchLabel}
        finalScore={matchResultData.finalScore}
        nextLabel={matchResultData.nextLabel}
        onContinue={() => {
          if (!isHost || !playerId) return
          setMatchResultData(null)
          requestNextRound()
        }}
      />
    )
  }

  if (phase === 'tiebreak-waiting') {
    return (
      <>
        {isGracePeriod && (
          <Banner variant="grace">
            <span>⏳ Grace period</span>
            <span className="font-black tabular-nums">{graceSecondsLeft}s</span>
          </Banner>
        )}
        <TiebreakWaitingScreen roundNumber={roundNumber} deadlineMs={tiebreakDeadlineMs} />
      </>
    )
  }

  if (phase === 'reveal' && revealData) {
    return (
      <RevealPanel
        roundNumber={roundNumber}
        correctAnswer={revealData.correctAnswer}
        answers={revealData.answers}
        eliminated={eliminated}
        gameOver={gameOver}
        winner={winner}
        autoAdvanceIn={autoAdvanceIn}
        spectatorBanner={isSpectating ? (nickname ?? undefined) : null}
        onSkipAhead={isHost ? advanceAfterReveal : undefined}
      />
    )
  }

  if (phase === 'spectating') {
    if (bracketData && currentMatchPhase) {
      const sfSpec = currentMatchPhase === 'sf1' ? bracketData.sf1
        : currentMatchPhase === 'sf2' ? bracketData.sf2 : null
      const matchLabelSpec = currentMatchPhase === 'final'
        ? 'Final · Best of 5'
        : currentMatchPhase === 'sf1'
        ? 'Semi-Final 1 · Best of 3'
        : 'Semi-Final 2 · Best of 3'
      const winsToWinSpec = currentMatchPhase === 'final' ? 3 : 2
      const p1Spec = sfSpec ? sfSpec.p1 : getFinalistNickname(bracketData, getBracketFinalists(bracketData)[0] ?? '')
      const p2Spec = sfSpec ? sfSpec.p2 : getFinalistNickname(bracketData, getBracketFinalists(bracketData)[1] ?? '')
      return (
        <>
          <MatchScoreBar p1={p1Spec} p2={p2Spec} wins={matchWins} matchLabel={matchLabelSpec} winsToWin={winsToWinSpec} />
          <QuestionPanel
            roundNumber={roundNumber}
            question={question}
            startedAt={startedAt}
            isWaiting={true}
            isGracePeriod={isGracePeriod}
            graceSecondsLeft={graceSecondsLeft}
            onSubmit={() => {}}
          />
        </>
      )
    }
    return (
      <SpectatorScreen
        roundNumber={roundNumber}
        question={question ? { text: question.text, timeLimit: question.timeLimit } : null}
        startedAt={startedAt}
        aliveCount={aliveCount}
        isGracePeriod={isGracePeriod}
        graceSecondsLeft={graceSecondsLeft}
      />
    )
  }

  // Show resurrection banner briefly at start of answering phase
  return (
    <>
      {isSuddenDeath && (
        <Banner variant="danger" className="top-4 pt-0">
          ⚡ Sudden Death — last player standing wins!
        </Banner>
      )}
      {resurrected && (
        <Banner variant="success" className="top-4 pt-0">
          🔄 {resurrected.nickname} has been resurrected!
        </Banner>
      )}
      {showResurrectionSelf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-3xl px-8 py-10 text-center shadow-2xl max-w-xs w-full">
            <div className="text-5xl mb-4">🎉</div>
            <div className="text-white text-2xl font-black mb-2">You&apos;re back!</div>
            <div className="text-white/80 text-sm">You&apos;ve been resurrected. Get back in the game!</div>
          </div>
        </div>
      )}
      {bracketData && currentMatchPhase && (() => {
        const sf = currentMatchPhase === 'sf1' ? bracketData.sf1
          : currentMatchPhase === 'sf2' ? bracketData.sf2 : null
        const matchLabel = currentMatchPhase === 'final'
          ? 'Final · Best of 5'
          : currentMatchPhase === 'sf1'
          ? 'Semi-Final 1 · Best of 3'
          : 'Semi-Final 2 · Best of 3'
        const winsToWin = currentMatchPhase === 'final' ? 3 : 2
        const p1 = sf ? sf.p1 : getFinalistNickname(bracketData, getBracketFinalists(bracketData)[0] ?? '')
        const p2 = sf ? sf.p2 : getFinalistNickname(bracketData, getBracketFinalists(bracketData)[1] ?? '')
        return <MatchScoreBar p1={p1} p2={p2} wins={matchWins} matchLabel={matchLabel} winsToWin={winsToWin} />
      })()}
      <QuestionPanel
        roundNumber={roundNumber}
        question={question}
        startedAt={startedAt}
        isWaiting={phase === 'waiting'}
        isGracePeriod={isGracePeriod}
        graceSecondsLeft={graceSecondsLeft}
        onSubmit={handleSubmit}
      />
    </>
  )
}
