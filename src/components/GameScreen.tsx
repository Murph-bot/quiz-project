'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/hooks/useCountdown'
import { QuestionPanel } from './QuestionPanel'
import { RevealPanel } from './RevealPanel'
import { SpectatorScreen } from './SpectatorScreen'
import { WinnerScreen } from './WinnerScreen'
import type { RankedAnswer, EliminatedPlayer, WinnerInfo } from '@/types'

interface QuestionData {
  id: string
  text: string
  timeLimit: number
  category: string
}

interface RevealData {
  correctAnswer: number
  answers: RankedAnswer[]
}

interface Props {
  roomCode: string
  sessionHostId: string
  initialRoundId: string
  initialRoundNumber: number
  initialQuestion: QuestionData
  initialStartedAt: string
  initialRevealData: RevealData | null
  initialWinner: WinnerInfo | null
}

const FAR_FUTURE_MS = Date.now() + 1e9

type Phase = 'answering' | 'waiting' | 'reveal' | 'spectating' | 'winner'

export function GameScreen({
  roomCode,
  sessionHostId,
  initialRoundId,
  initialRoundNumber,
  initialQuestion,
  initialStartedAt,
  initialRevealData,
  initialWinner,
}: Props) {
  const router = useRouter()
  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const nickname = typeof window !== 'undefined' ? sessionStorage.getItem('nickname') : null
  const isHost = playerId !== null && playerId === sessionHostId

  const [roundId, setRoundId] = useState(initialRoundId)
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber)
  const [question, setQuestion] = useState(initialQuestion)
  const [startedAt, setStartedAt] = useState(initialStartedAt)

  const getInitialPhase = (): Phase => {
    if (initialWinner !== null) return 'winner'
    if (initialRevealData) return 'reveal'
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

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isSpectatingRef = useRef(false)
  const gameOverRef = useRef(initialWinner !== null)

  // Redirect if no identity
  useEffect(() => {
    if (!playerId) router.push('/')
  }, [playerId, router])

  // Countdown for current question — used to trigger close when expired
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { isExpired } = useCountdown(phase === 'answering' || phase === 'waiting' ? deadlineMs : FAR_FUTURE_MS)

  const GRACE_PERIOD_MS = 10000

  // Timer expired → grace period → race to close the round
  useEffect(() => {
    if (!isExpired || (phase !== 'answering' && phase !== 'waiting')) return
    setIsGracePeriod(true)
    const grace = setTimeout(() => {
      setIsGracePeriod(false)
      fetch(`/api/sessions/${roomCode}/rounds/${roundId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
        .then(r => r.json())
        .then(data => {
        if (!data.wasAlreadyClosed) {
          // Won the race — update own state (won't receive own broadcast)
          setEliminated(data.eliminated ?? [])
          setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
          setPhase('reveal')

          if (data.gameOver) {
            setGameOver(true)
            gameOverRef.current = true
            setWinner(data.winner ?? null)
          }

          if (data.eliminated?.some((e: EliminatedPlayer) => e.playerId === playerId)) {
            isSpectatingRef.current = true
            setIsSpectating(true)
          }

          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:closed',
            payload: {
              correctAnswer: data.correctAnswer,
              answers: data.answers,
              eliminated: data.eliminated,
              winner: data.winner,
              gameOver: data.gameOver,
            },
          })
        }
          // wasAlreadyClosed: true → another client already broadcast, we'll receive it
        })
    }, GRACE_PERIOD_MS)
    return () => clearTimeout(grace)
  }, [isExpired, phase, roundId, roomCode, playerId])

  // Auto-advance after reveal
  useEffect(() => {
    if (phase !== 'reveal') return
    setAutoAdvanceIn(5)
    const tick = setInterval(() => setAutoAdvanceIn(s => Math.max(0, s - 1)), 1000)
    const advance = setTimeout(() => {
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
      fetch(`/api/sessions/${roomCode}/rounds/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
        .then(r => r.json())
        .then(data => {
          if (!data.roundId) return
          // Check if this player was resurrected
          if (data.resurrected?.playerId === playerId) {
            isSpectatingRef.current = false
            setIsSpectating(false)
          }
          setResurrected(data.resurrected ?? null)
          if (data.isSuddenDeath) setIsSuddenDeath(true)
          setRoundId(data.roundId)
          setRoundNumber(data.roundNumber)
          setQuestion(data.question)
          setStartedAt(data.startedAt)
          setRevealData(null)
          setEliminated([])
          setIsGracePeriod(false)
          setPhase(isSpectatingRef.current ? 'spectating' : 'answering')
          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:started',
            payload: {
              roundId: data.roundId,
              roundNumber: data.roundNumber,
              question: data.question,
              startedAt: data.startedAt,
              resurrected: data.resurrected ?? null,
              isSuddenDeath: data.isSuddenDeath ?? false,
            },
          })
        })
    }, 5000)
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

  // Supabase Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on('broadcast', { event: 'round:closed' }, ({ payload }) => {
        setEliminated(payload.eliminated ?? [])
        setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
        setPhase('reveal')

        if (payload.gameOver) {
          setGameOver(true)
          gameOverRef.current = true
          setWinner(payload.winner ?? null)
        }

        if (payload.eliminated?.some((e: EliminatedPlayer) => e.playerId === playerId)) {
          isSpectatingRef.current = true
          setIsSpectating(true)
        }
      })
      .on('broadcast', { event: 'round:started' }, ({ payload }) => {
        if (payload.resurrected?.playerId === playerId) {
          isSpectatingRef.current = false
          setIsSpectating(false)
        }
        setResurrected(payload.resurrected ?? null)
        if (payload.isSuddenDeath) setIsSuddenDeath(true)
        setRoundId(payload.roundId)
        setRoundNumber(payload.roundNumber)
        setQuestion(payload.question)
        setStartedAt(payload.startedAt)
        setRevealData(null)
        setEliminated([])
        setIsGracePeriod(false)
        setPhase(isSpectatingRef.current ? 'spectating' : 'answering')
      })
      .on('broadcast', { event: 'game:over' }, () => {
        setPhase('winner')
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [roomCode, playerId])

  async function handleSubmit(value: number) {
    if (!playerId || isSpectatingRef.current) return
    const res = await fetch(`/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, value }),
    })
    if (res.ok) setPhase('waiting')
  }

  if (phase === 'winner') {
    return <WinnerScreen winnerNickname={winner?.nickname ?? null} autoRedirectIn={autoRedirectIn} />
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
    return <SpectatorScreen roundNumber={roundNumber} />
  }

  // Show resurrection banner briefly at start of answering phase
  return (
    <>
      {isSuddenDeath && (
        <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            ⚡ Sudden Death — last player standing wins!
          </div>
        </div>
      )}
      {resurrected && (
        <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            🔄 {resurrected.nickname} has been resurrected!
          </div>
        </div>
      )}
      <QuestionPanel
        roundNumber={roundNumber}
        question={question}
        startedAt={startedAt}
        isWaiting={phase === 'waiting'}
        isGracePeriod={isGracePeriod}
        onSubmit={handleSubmit}
      />
    </>
  )
}
