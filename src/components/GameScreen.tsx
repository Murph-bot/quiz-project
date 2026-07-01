'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/hooks/useCountdown'
import { useGameRoomEvents } from '@/hooks/useGameRoomEvents'
import { usePlayerSession } from '@/hooks/usePlayerSession'
import { withNormalizedOptions } from '@/lib/questionOptions'
import {
  applyRoundStartedState,
  applyTiebreakStartedState,
  type NextRoundPayload,
  type PendingTiebreak,
  type QuestionData,
} from '@/lib/game/gameRoundTransitions'
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
import type { RankedAnswer, EliminatedPlayer, WinnerInfo, BracketState, GamePhase } from '@/types'

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

// Stable sentinel — must not use Date.now() (SSR/client hydration mismatch).
const FAR_FUTURE_MS = 9_000_000_000_000

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
    initialQuestion
      ? (withNormalizedOptions(initialQuestion) as QuestionData)
      : { id: 'pending', text: '', timeLimit: 30, category: '' },
  )
  const [startedAt, setStartedAt] = useState(initialStartedAt ?? new Date(0).toISOString())

  const getInitialPhase = (): Phase => {
    if (initialWinner !== null) return 'winner'
    if (initialRevealData) return 'reveal'
    if (initialSessionPhase === 'semifinal' && initialBracket) return 'bracket'
    if (initialSessionPhase === 'final' && initialBracket) return 'answering'
    if (initialRoundId) return 'answering'
    return 'bracket'
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
  const [answeredPlayerIds, setAnsweredPlayerIds] = useState<Set<string>>(new Set())

  const [graceDeadlineMs, setGraceDeadlineMs] = useState<number>(FAR_FUTURE_MS)

  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // roundId ref for stale closure guard in broadcast listeners
  const roundIdRef = useRef(roundId)
  useEffect(() => { roundIdRef.current = roundId }, [roundId])

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
  const [pendingTiebreak, setPendingTiebreak] = useState<{
    roundId: string
    question: QuestionData
    startedAt: string
    playerIds: string[]
  } | null>(null)

  const pendingTiebreakRef = useRef<{
    roundId: string
    question: QuestionData
    startedAt: string
    playerIds: string[]
  } | null>(null)

  useEffect(() => { pendingTiebreakRef.current = pendingTiebreak }, [pendingTiebreak])

  const pendingFinalIntroRef = useRef<BracketState | null>(null)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isSpectatingRef = useRef(false)
  const gameOverRef = useRef(initialWinner !== null)
  const bracketDataRef = useRef<BracketState | null>(null)
  const currentMatchPhaseRef = useRef<'sf1' | 'sf2' | 'final' | null>(null)

  // Keep refs in sync with state
  useEffect(() => { bracketDataRef.current = bracketData }, [bracketData])
  useEffect(() => { currentMatchPhaseRef.current = currentMatchPhase }, [currentMatchPhase])

  function getRoundTransitionSetters() {
    return {
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
    }
  }

  function getRoundTransitionContext() {
    return {
      playerId,
      isSpectatingRef,
      bracketDataRef,
      currentMatchPhaseRef,
      graceDeadlineFarFuture: FAR_FUTURE_MS,
      computeAmICompeting,
    }
  }

  function applyNextRoundResponse(data: NextRoundPayload) {
    if (data.bracketReady && data.bracket) {
      setBracketData(data.bracket)
      setCurrentMatchPhase('sf1')
      setPhase('bracket')
      channelRef.current?.send({
        type: 'broadcast',
        event: 'bracket:ready',
        payload: { bracket: data.bracket },
      })
      return
    }

    applyRoundStartedState(data, getRoundTransitionSetters(), getRoundTransitionContext())
    channelRef.current?.send({
      type: 'broadcast',
      event: 'round:started',
      payload: {
        roundId: data.roundId,
        roundNumber: data.roundNumber,
        question: { ...data.question, options: data.options },
        startedAt: data.startedAt,
        resurrected: data.resurrected ?? null,
        isSuddenDeath: data.isSuddenDeath ?? false,
        aliveCount: data.aliveCount,
      },
    })
  }

  // Helper: am I competing in the current bracket match?
  function computeAmICompeting(bd: BracketState | null, phase: 'sf1' | 'sf2' | 'final' | null, pid: string | null): boolean {
    if (!bd || !phase || !pid) return true
    if (phase === 'sf1') return bd.sf1.p1id === pid || bd.sf1.p2id === pid
    if (phase === 'sf2') return bd.sf2.p1id === pid || bd.sf2.p2id === pid
    return bd.finalists.includes(pid)
  }

  // Helper: resolve a finalist's display name from the bracket match data
  // finalists[] stores player IDs — look up the nickname via sf1/sf2 records
  function getFinalistNickname(bd: BracketState, id: string): string {
    if (bd.sf1.p1id === id) return bd.sf1.p1
    if (bd.sf1.p2id === id) return bd.sf1.p2
    if (bd.sf2.p1id === id) return bd.sf2.p1
    if (bd.sf2.p2id === id) return bd.sf2.p2
    return id // fallback (should not happen)
  }

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
          if (bracket.finalists.includes(playerId)) {
            isSpectatingRef.current = false
            setIsSpectating(false)
          } else if (!bracket.finalists.includes(playerId)) {
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
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { isExpired } = useCountdown(
    phase === 'answering' || phase === 'waiting' || phase === 'tiebreak-waiting'
      ? deadlineMs
      : FAR_FUTURE_MS
  )

  // Grace period countdown for banner
  const { secondsLeft: graceSecondsLeft } = useCountdown(isGracePeriod ? graceDeadlineMs : FAR_FUTURE_MS)

  const roundClosedRef = useRef(false)
  const allAnsweredConfirmedRef = useRef(false)
  // Reset when roundId changes so a new round can be closed
  useEffect(() => {
    roundClosedRef.current = false
    allAnsweredConfirmedRef.current = false
  }, [roundId])

  function inferMatchPhaseFromBracket(b: BracketState): 'sf1' | 'sf2' | 'final' | null {
    if (b.finalists?.length === 2 && (b.currentSF === null || b.currentSF === undefined)) {
      return 'final'
    }
    if (b.currentSF === 1) return 'sf1'
    if (b.currentSF === 2) return 'sf2'
    return null
  }

  function syncBracketRefs(bracket: BracketState, phase: 'sf1' | 'sf2' | 'final') {
    bracketDataRef.current = bracket
    currentMatchPhaseRef.current = phase
    setBracketData(bracket)
    setCurrentMatchPhase(phase)
  }

  function fetchAliveCountFromServer() {
    fetch(`/api/sessions/${roomCode}/bracket`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.aliveCount === 'number') {
          // #region agent log
          fetch('http://127.0.0.1:7710/ingest/98d0de17-cb9c-4207-923a-7861365e888d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4fcb3'},body:JSON.stringify({sessionId:'d4fcb3',location:'GameScreen:fetchAliveCount',message:'aliveCount fetched from server',data:{aliveCount:d.aliveCount,phase:d.phase},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          setAliveCount(d.aliveCount)
        }
      })
      .catch((err) => console.error('[aliveCount] fetch error:', err))
  }

  function applyFinalReadyState(bracket: BracketState, aliveCount?: number) {
    pendingFinalIntroRef.current = bracket
    syncBracketRefs(bracket, 'final')
    setAliveCount(typeof aliveCount === 'number' ? aliveCount : 2)
    if (playerId && bracket.finalists.includes(playerId)) {
      isSpectatingRef.current = false
      setIsSpectating(false)
    }
    // #region agent log
    fetch('http://127.0.0.1:7710/ingest/98d0de17-cb9c-4207-923a-7861365e888d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4fcb3'},body:JSON.stringify({sessionId:'d4fcb3',location:'GameScreen:applyFinalReadyState',message:'final ready applied',data:{aliveCount:typeof aliveCount==='number'?aliveCount:2,finalists:bracket.finalists},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  }

  function applyAliveCountFromPayload(data: {
    aliveCount?: number
    eliminated?: EliminatedPlayer[]
  }) {
    if (typeof data.aliveCount === 'number') {
      // #region agent log
      fetch('http://127.0.0.1:7710/ingest/98d0de17-cb9c-4207-923a-7861365e888d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4fcb3'},body:JSON.stringify({sessionId:'d4fcb3',location:'GameScreen:applyAliveCount',message:'sync aliveCount from server',data:{aliveCount:data.aliveCount,eliminatedCount:data.eliminated?.length??0},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setAliveCount(data.aliveCount)
    } else if (data.eliminated?.length) {
      // #region agent log
      fetch('http://127.0.0.1:7710/ingest/98d0de17-cb9c-4207-923a-7861365e888d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4fcb3'},body:JSON.stringify({sessionId:'d4fcb3',location:'GameScreen:applyAliveCount',message:'aliveCount missing, fetching from server',data:{eliminatedCount:data.eliminated.length},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      fetchAliveCountFromServer()
    }
  }

  function applyEliminationSpectatorState(
    eliminated: EliminatedPlayer[] | undefined,
    bracket?: BracketState | null,
    finalReady?: boolean,
  ) {
    const amFinalist =
      Boolean(finalReady && bracket?.finalists?.length && playerId) &&
      bracket!.finalists.includes(playerId!)

    if (amFinalist) {
      isSpectatingRef.current = false
      setIsSpectating(false)
      return
    }

    if (eliminated?.some((e) => e.playerId === playerId)) {
      isSpectatingRef.current = true
      setIsSpectating(true)
    }
  }

  function showFinalIntro(bracket: BracketState) {
    setBracketData(bracket)
    setCurrentMatchPhase('final')
    setMatchWins([0, 0])
    if (playerId && bracket.finalists.includes(playerId)) {
      isSpectatingRef.current = false
      setIsSpectating(false)
    }
    setAliveCount(2)
    const finalist1 = getFinalistNickname(bracket, bracket.finalists[0] ?? '')
    const finalist2 = getFinalistNickname(bracket, bracket.finalists[1] ?? '')
    setMatchResultData({
      winnerNickname: '',
      matchLabel: 'The Final',
      finalScore: `${finalist1} vs ${finalist2}`,
      nextLabel: 'First to 3 nearest answers wins!',
    })
    setPhase('match-result')
    channelRef.current?.send({
      type: 'broadcast',
      event: 'final:ready',
      payload: {
        bracket,
        matchWinnerNickname: '',
        matchLabel: 'The Final',
        finalScore: `${finalist1} vs ${finalist2}`,
        nextLabel: 'First to 3 nearest answers wins!',
        nextMatchPhase: 'final',
        aliveCount: 2,
      },
    })
  }

  function advanceAfterReveal() {
    if (!isHost || !playerId) return
    if (gameOverRef.current) {
      setPhase('winner')
      channelRef.current?.send({
        type: 'broadcast',
        event: 'game:over',
        payload: {},
      })
      return
    }

    const pending = pendingTiebreakRef.current
    if (pending) {
      applyTiebreakStartedState(pending, playerId, getRoundTransitionSetters(), FAR_FUTURE_MS)
      channelRef.current?.send({
        type: 'broadcast',
        event: 'tiebreak:started',
        payload: {
          roundId: pending.roundId,
          question: pending.question,
          startedAt: pending.startedAt,
          playerIds: pending.playerIds,
        },
      })
      return
    }

    const pendingFinal = pendingFinalIntroRef.current
    if (pendingFinal) {
      pendingFinalIntroRef.current = null
      showFinalIntro(pendingFinal)
      return
    }

    fetch(`/api/sessions/${roomCode}/bracket`)
      .then((r) => r.json())
      .then((sessionState) => {
        if (sessionState.phase === 'final' && sessionState.bracket) {
          // #region agent log
          fetch('http://127.0.0.1:7710/ingest/98d0de17-cb9c-4207-923a-7861365e888d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4fcb3'},body:JSON.stringify({sessionId:'d4fcb3',location:'GameScreen:advanceAfterReveal',message:'recovered missed final transition',data:{phase:sessionState.phase},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          showFinalIntro(sessionState.bracket as BracketState)
          return
        }
        if (sessionState.phase === 'semifinal' && sessionState.bracket) {
          setBracketData(sessionState.bracket as BracketState)
          setCurrentMatchPhase('sf1')
          setPhase('bracket')
          channelRef.current?.send({
            type: 'broadcast',
            event: 'bracket:ready',
            payload: { bracket: sessionState.bracket },
          })
          return
        }

        fetch(`/api/sessions/${roomCode}/rounds/next`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, sessionSecret }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (!data.roundId && !data.bracketReady) {
              if (data.error === 'No questions available') {
                setQuestionsExhausted(true)
                channelRef.current?.send({ type: 'broadcast', event: 'game:exhausted', payload: {} })
              }
              return
            }
            applyNextRoundResponse(data)
          })
      })
      .catch((err) => console.error('[advance] session phase check failed:', err))
  }

  // Shared close-handling logic extracted to avoid duplication
  function handleCloseData(data: any) {
    if (data.error) {
      console.error('[close] API error:', data.error)
      return
    }
    if (data.wasAlreadyClosed) {
      if (roundClosedRef.current) return
      fetchRoundReveal()
      return
    }
    if (roundClosedRef.current) return
    roundClosedRef.current = true

    // --- TIEBREAK NEEDED ---
    if (data.tiebreakNeeded && data.tiebreakRoundId) {
      setEliminated([])
      setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
      setPhase('reveal')

      const tbQuestion: QuestionData = {
        id: data.tiebreakQuestion.id,
        text: data.tiebreakQuestion.text,
        timeLimit: data.tiebreakQuestion.timeLimit,
        category: data.tiebreakQuestion.category,
        options: data.tiebreakOptions ?? undefined,
      }
      const deadline = new Date(data.tiebreakStartedAt).getTime() + data.tiebreakQuestion.timeLimit * 1000
      setTiebreakDeadlineMs(deadline)
      setPendingTiebreak({
        roundId: data.tiebreakRoundId,
        question: tbQuestion,
        startedAt: data.tiebreakStartedAt,
        playerIds: data.tiebreakPlayerIds ?? [],
      })

      channelRef.current?.send({
        type: 'broadcast',
        event: 'round:closed',
        payload: {
          correctAnswer: data.correctAnswer,
          answers: data.answers,
          eliminated: [],
          winner: null,
          gameOver: false,
          tiebreakNeeded: true,
          tiebreakRoundId: data.tiebreakRoundId,
          tiebreakQuestion: { ...data.tiebreakQuestion, options: data.tiebreakOptions },
          tiebreakPlayerIds: data.tiebreakPlayerIds,
          tiebreakStartedAt: data.tiebreakStartedAt,
        },
      })
      return
    }
    // --- END TIEBREAK NEEDED ---

    // --- BRACKET MODE: bracket just generated ---
    if (data.bracketReady && data.bracket) {
      setBracketData(data.bracket)
      setCurrentMatchPhase('sf1')
      setPhase('bracket')
      channelRef.current?.send({
        type: 'broadcast',
        event: 'bracket:ready',
        payload: { bracket: data.bracket },
      })
      return
    }

    // --- BRACKET MODE: tie — replay with new question ---
    if (data.isTie) {
      setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
      setPhase('reveal')
      channelRef.current?.send({
        type: 'broadcast',
        event: 'tie:replay',
        payload: { correctAnswer: data.correctAnswer, answers: data.answers },
      })
      // auto-advance useEffect will call /rounds/next after 5s
      return
    }

    // --- BRACKET MODE: game over (Final winner) ---
    if (data.gameOver && data.winner) {
      setGameOver(true)
      gameOverRef.current = true
      setWinner(data.winner ?? null)
      setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
      setPhase('reveal')
      channelRef.current?.send({
        type: 'broadcast',
        event: 'round:closed',
        payload: {
          correctAnswer: data.correctAnswer,
          answers: data.answers,
          eliminated: [],
          winner: data.winner,
          gameOver: true,
        },
      })
      return
    }

    // --- BRACKET MODE: SF match complete (winner advances) ---
    if (data.sfComplete) {
      const currentBracketSF = bracketDataRef.current?.currentSF
      const sfLabel = currentBracketSF === 1 ? 'Semi-Final 1' : 'Semi-Final 2'
      const sfKey = currentBracketSF === 1 ? 'sf1' : 'sf2'
      const sfWins = (data.bracket as any)?.[sfKey]?.wins ?? [0, 0]
      const finalScore = `${sfWins[0]} \u2013 ${sfWins[1]}`
      const nextLabel = data.finalReady ? 'The Final is next!' : 'Semi-Final 2 up next'
      const nextMatchPhase = data.finalReady ? 'final' : 'sf2'

      setBracketData(data.bracket)
      setMatchWins([0, 0])
      setCurrentMatchPhase(nextMatchPhase as 'sf1' | 'sf2' | 'final')
      setMatchResultData({
        winnerNickname: data.matchWinnerNickname ?? '',
        matchLabel: sfLabel,
        finalScore,
        nextLabel,
      })
      setPhase('match-result')

      const eventName = data.finalReady ? 'final:ready' : 'match:complete'
      channelRef.current?.send({
        type: 'broadcast',
        event: eventName,
        payload: {
          bracket: data.bracket,
          matchWinnerNickname: data.matchWinnerNickname,
          matchLabel: sfLabel,
          finalScore,
          nextLabel,
          nextMatchPhase,
        },
      })
      return
    }

    // --- BRACKET MODE: match continues (no winner yet) ---
    if (data.bracket && !data.finalReady && !data.bracketReady && !data.sfComplete && !data.isTie && !(data.gameOver && data.winner)) {
      const inferred = inferMatchPhaseFromBracket(data.bracket)
      if (inferred && !currentMatchPhaseRef.current) {
        syncBracketRefs(data.bracket, inferred)
      }
    }

    if (data.bracket && currentMatchPhaseRef.current && !data.finalReady && !data.bracketReady && !data.sfComplete && !data.isTie && !(data.gameOver && data.winner)) {
      const sfKey2 = data.bracket.currentSF === 1 ? 'sf1' : data.bracket.currentSF === 2 ? 'sf2' : null
      const newWins: [number, number] = sfKey2
        ? (data.bracket as any)[sfKey2].wins
        : [data.bracket.finalWins?.[0] ?? 0, data.bracket.finalWins?.[1] ?? 0]
      setMatchWins(newWins)
      setBracketData(data.bracket)
      setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
      setPhase('reveal')
      channelRef.current?.send({ type: 'broadcast', event: 'match:point', payload: { wins: newWins, bracket: data.bracket } })
      channelRef.current?.send({
        type: 'broadcast',
        event: 'round:closed',
        payload: {
          correctAnswer: data.correctAnswer,
          answers: data.answers,
          eliminated: [],
          winner: null,
          gameOver: false,
        },
      })
      return
    }

    // --- NORMAL MODE ---
    setEliminated(data.eliminated ?? [])
    setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
    setPhase('reveal')

    if (data.finalReady && data.bracket && !data.sfComplete) {
      applyFinalReadyState(data.bracket, data.aliveCount)
    }

    if (data.gameOver) {
      setGameOver(true)
      gameOverRef.current = true
      setWinner(data.winner ?? null)
    }

    applyAliveCountFromPayload(data)
    applyEliminationSpectatorState(data.eliminated, data.bracket, data.finalReady)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'round:closed',
      payload: {
        correctAnswer: data.correctAnswer,
        answers: data.answers,
        eliminated: data.eliminated,
        aliveCount: data.aliveCount,
        finalReady: data.finalReady,
        bracket: data.bracket,
        winner: data.winner,
        gameOver: data.gameOver,
      },
    })
  }

  function fetchRoundReveal() {
    if (!playerId || !sessionSecret) return
    const params = new URLSearchParams({ playerId, sessionSecret })
    fetch(`/api/sessions/${roomCode}/rounds/${roundIdRef.current}?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.status !== 'closed' || roundClosedRef.current) return
        handleCloseData({ ...data, wasAlreadyClosed: false })
      })
      .catch(err => console.error('[reveal] fetch error:', err))
  }

  function attemptClose() {
    if (!playerId || !sessionSecret || roundClosedRef.current) return
    fetch(`/api/sessions/${roomCode}/rounds/${roundIdRef.current}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, sessionSecret }),
    })
      .then(r => r.json())
      .then(data => handleCloseData(data))
      .catch(err => console.error('[close] network error:', err))
  }

  // Timer expired → 40s grace period → close the round (any connected player)
  useEffect(() => {
    if (!isExpired) return
    if (phase !== 'answering' && phase !== 'waiting' && phase !== 'tiebreak-waiting') return

    // Skip if already in grace period (new host takeover handled by separate effect)
    if (isGracePeriod) return

    const doClose = () => {
      setIsGracePeriod(false)
      setGraceDeadlineMs(FAR_FUTURE_MS)
      attemptClose()
    }

    // If the timer expired long before this effect ran (stale reconnect), skip grace
    if (Date.now() - deadlineMs > 40_000) {
      doClose()
      return
    }

    // If the server confirmed everyone answered, close immediately (no grace)
    if (allAnsweredConfirmedRef.current) {
      doClose()
      return
    }

    // Start 40s grace period
    const deadline = Date.now() + 40_000
    setIsGracePeriod(true)
    setGraceDeadlineMs(deadline)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'grace:started',
      payload: { graceDeadlineMs: deadline, roundId: roundIdRef.current },
    })

    graceTimeoutRef.current = setTimeout(() => {
      graceTimeoutRef.current = null
      doClose()
    }, 40_000)

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

  // Poll for closed round if realtime broadcast was missed
  useEffect(() => {
    if (!isExpired) return
    if (phase !== 'waiting' && phase !== 'answering') return
    if (roundClosedRef.current) return
    fetchRoundReveal()
    const interval = setInterval(fetchRoundReveal, 3000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired, phase, roomCode, playerId, sessionSecret])

  // Auto-advance after reveal
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
  }, [phase, isHost, playerId, roomCode])

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

  useGameRoomEvents({
    roomCode,
    playerId: playerId ?? '',
    sessionSecret,
    ready: ready && !!playerId,
    initialHostId: sessionHostId,
    channelRef,
    roundIdRef,
    currentHostIdRef,
    isSpectatingRef,
    roundClosedRef,
    allAnsweredConfirmedRef,
    graceTimeoutRef,
    setCurrentHostId,
    attemptClose,
    onRoundClosed: (payload) => {
      if (roundClosedRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7710/ingest/98d0de17-cb9c-4207-923a-7861365e888d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4fcb3'},body:JSON.stringify({sessionId:'d4fcb3',location:'GameScreen:onRoundClosed',message:'skipped duplicate round close',data:{},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return
      }
      roundClosedRef.current = true

      if (payload.tiebreakNeeded && payload.tiebreakRoundId) {
        setEliminated([])
        setRevealData({
          correctAnswer: payload.correctAnswer as number,
          answers: payload.answers as RankedAnswer[],
        })
        setPhase('reveal')
        const tbQ: QuestionData = {
          id: (payload.tiebreakQuestion as QuestionData).id,
          text: (payload.tiebreakQuestion as QuestionData).text,
          timeLimit: (payload.tiebreakQuestion as QuestionData).timeLimit,
          category: (payload.tiebreakQuestion as QuestionData).category,
          options: (payload.tiebreakQuestion as { options?: number[] }).options ?? undefined,
        }
        const deadline =
          new Date(payload.tiebreakStartedAt as string).getTime() +
          (payload.tiebreakQuestion as QuestionData).timeLimit * 1000
        setTiebreakDeadlineMs(deadline)
        setPendingTiebreak({
          roundId: payload.tiebreakRoundId as string,
          question: tbQ,
          startedAt: payload.tiebreakStartedAt as string,
          playerIds: (payload.tiebreakPlayerIds as string[]) ?? [],
        })
        return
      }

      setEliminated((payload.eliminated as EliminatedPlayer[]) ?? [])
      setRevealData({
        correctAnswer: payload.correctAnswer as number,
        answers: payload.answers as RankedAnswer[],
      })
      setPhase('reveal')

      if (payload.finalReady && payload.bracket) {
        applyFinalReadyState(payload.bracket as BracketState, payload.aliveCount as number | undefined)
      }

      if (payload.gameOver) {
        setGameOver(true)
        gameOverRef.current = true
        setWinner((payload.winner as WinnerInfo) ?? null)
      }

      const eliminatedList = (payload.eliminated as EliminatedPlayer[]) ?? []
      applyAliveCountFromPayload({
        aliveCount: payload.aliveCount as number | undefined,
        eliminated: eliminatedList,
      })
      applyEliminationSpectatorState(
        eliminatedList,
        payload.bracket as BracketState | undefined,
        payload.finalReady as boolean | undefined,
      )
    },
    onRoundStarted: (payload) => {
      applyRoundStartedState(
        payload as NextRoundPayload,
        getRoundTransitionSetters(),
        getRoundTransitionContext(),
      )
    },
    onGameOver: () => setPhase('winner'),
    onBracketReady: (bracket) => {
      setBracketData(bracket)
      setCurrentMatchPhase('sf1')
      setPhase('bracket')
    },
    onMatchPoint: (wins, bracket) => {
      setMatchWins(wins)
      setBracketData(bracket)
    },
    onMatchComplete: (payload) => {
      setBracketData(payload.bracket as BracketState)
      setCurrentMatchPhase((payload.nextMatchPhase as 'sf2') ?? 'sf2')
      setMatchWins([0, 0])
      setMatchResultData({
        winnerNickname: payload.matchWinnerNickname as string,
        matchLabel: payload.matchLabel as string,
        finalScore: payload.finalScore as string,
        nextLabel: payload.nextLabel as string,
      })
      setPhase('match-result')
    },
    onTieReplay: (payload) => {
      setRevealData({
        correctAnswer: payload.correctAnswer as number,
        answers: payload.answers as RankedAnswer[],
      })
      setPhase('reveal')
    },
    onFinalReady: (payload) => {
      const bracket = payload.bracket as BracketState
      setBracketData(bracket)
      setCurrentMatchPhase('final')
      setMatchWins([0, 0])
      if (playerId && bracket.finalists?.includes(playerId)) {
        isSpectatingRef.current = false
        setIsSpectating(false)
      }
      setAliveCount(typeof payload.aliveCount === 'number' ? (payload.aliveCount as number) : 2)
      setMatchResultData({
        winnerNickname: payload.matchWinnerNickname as string,
        matchLabel: payload.matchLabel as string,
        finalScore: payload.finalScore as string,
        nextLabel: 'The Final is next!',
      })
      setPhase('match-result')
    },
    onTiebreakStarted: (payload) => {
      applyTiebreakStartedState(
        {
          roundId: payload.roundId as string,
          question: payload.question as QuestionData,
          startedAt: payload.startedAt as string,
          playerIds: (payload.playerIds as string[]) ?? [],
        },
        playerId,
        getRoundTransitionSetters(),
        FAR_FUTURE_MS,
      )
    },
    onRoundAnswered: (answeredId) => {
      setAnsweredPlayerIds((prev) => new Set([...prev, answeredId]))
    },
    onGraceStarted: (deadline) => {
      setIsGracePeriod(true)
      setGraceDeadlineMs(deadline)
    },
    onAllAnswered: () => {
      setIsGracePeriod(false)
      setGraceDeadlineMs(FAR_FUTURE_MS)
    },
    onGameExhausted: () => setQuestionsExhausted(true),
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
      // Track own answer locally — Supabase broadcasts are not delivered back to sender
      setAnsweredPlayerIds(prev => new Set([...prev, playerId]))
      channelRef.current?.send({
        type: 'broadcast',
        event: 'round:answered',
        payload: { roundId: roundIdRef.current, playerId },
      })

      // Server confirmed all alive players have answered — close immediately
      if (data.allAnswered) {
        allAnsweredConfirmedRef.current = true
        channelRef.current?.send({
          type: 'broadcast',
          event: 'all:answered',
          payload: { roundId: roundIdRef.current },
        })
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

  const amICompeting = computeAmICompeting(bracketData, currentMatchPhase, playerId)

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
          // All players advance their own UI phase
          setPhase(amICompeting ? 'answering' : 'spectating')
          // Host also triggers next round
          if (isHost) {
            fetch(`/api/sessions/${roomCode}/rounds/next`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId, sessionSecret }),
            })
              .then(r => r.json())
              .then(nextData => {
                if (!nextData.roundId && !nextData.bracketReady) return
                applyNextRoundResponse(nextData)
              })
          }
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
          setMatchResultData(null)
          setPhase(amICompeting ? 'answering' : 'spectating')
          if (isHost) {
            fetch(`/api/sessions/${roomCode}/rounds/next`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId, sessionSecret }),
            })
              .then(r => r.json())
              .then(nextData => {
                if (!nextData.roundId && !nextData.bracketReady) return
                applyNextRoundResponse(nextData)
              })
          }
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
      const p1Spec = sfSpec ? sfSpec.p1 : getFinalistNickname(bracketData, bracketData.finalists[0] ?? '')
      const p2Spec = sfSpec ? sfSpec.p2 : getFinalistNickname(bracketData, bracketData.finalists[1] ?? '')
      return (
        <>
          <MatchScoreBar p1={p1Spec} p2={p2Spec} wins={matchWins} matchLabel={matchLabelSpec} winsToWin={winsToWinSpec} />
          <QuestionPanel
            roundNumber={roundNumber}
            question={question}
            startedAt={startedAt}
            isWaiting={true}
            isGracePeriod={false}
            graceSecondsLeft={0}
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
        const p1 = sf ? sf.p1 : getFinalistNickname(bracketData, bracketData.finalists[0] ?? '')
        const p2 = sf ? sf.p2 : getFinalistNickname(bracketData, bracketData.finalists[1] ?? '')
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
