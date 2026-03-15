'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/hooks/useCountdown'
import { QuestionPanel } from './QuestionPanel'
import { RevealPanel } from './RevealPanel'
import type { RankedAnswer } from '@/types'

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
}

const FAR_FUTURE_MS = Date.now() + 1e9

type Phase = 'answering' | 'waiting' | 'reveal'

export function GameScreen({
  roomCode,
  sessionHostId,
  initialRoundId,
  initialRoundNumber,
  initialQuestion,
  initialStartedAt,
  initialRevealData,
}: Props) {
  const router = useRouter()
  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const isHost = playerId !== null && playerId === sessionHostId

  const [roundId, setRoundId] = useState(initialRoundId)
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber)
  const [question, setQuestion] = useState(initialQuestion)
  const [startedAt, setStartedAt] = useState(initialStartedAt)
  const [phase, setPhase] = useState<Phase>(initialRevealData ? 'reveal' : 'answering')
  const [revealData, setRevealData] = useState<RevealData | null>(initialRevealData)
  const [autoAdvanceIn, setAutoAdvanceIn] = useState(5)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Redirect if no identity
  useEffect(() => {
    if (!playerId) router.push('/')
  }, [playerId, router])

  // Countdown for current question — used to trigger close when expired
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { isExpired } = useCountdown(phase === 'answering' ? deadlineMs : FAR_FUTURE_MS)

  // Timer expired → race to close the round
  useEffect(() => {
    if (!isExpired || phase !== 'answering') return
    fetch(`/api/sessions/${roomCode}/rounds/${roundId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.wasAlreadyClosed) {
          // Won the race — update own state (won't receive own broadcast)
          setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
          setPhase('reveal')
          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:closed',
            payload: { correctAnswer: data.correctAnswer, answers: data.answers },
          })
        }
        // wasAlreadyClosed: true → another client already broadcast, we'll receive it
      })
  }, [isExpired, phase, roundId, roomCode])

  // Auto-advance after reveal: host calls /next, updates own state directly (Supabase
  // Broadcast does NOT echo back to the sender), then broadcasts to all other clients.
  useEffect(() => {
    if (phase !== 'reveal') return
    setAutoAdvanceIn(5)
    const tick = setInterval(() => setAutoAdvanceIn(s => Math.max(0, s - 1)), 1000)
    const advance = setTimeout(() => {
      if (!isHost || !playerId) return
      fetch(`/api/sessions/${roomCode}/rounds/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
        .then(r => r.json())
        .then(data => {
          if (!data.roundId) return // POST /next failed (e.g. round still active), ignore
          // Host transitions its own state directly — it won't receive its own broadcast
          setRoundId(data.roundId)
          setRoundNumber(data.roundNumber)
          setQuestion(data.question)
          setStartedAt(data.startedAt)
          setRevealData(null)
          setPhase('answering')
          // Broadcast to all other clients
          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:started',
            payload: {
              roundId: data.roundId,
              roundNumber: data.roundNumber,
              question: data.question,
              startedAt: data.startedAt,
            },
          })
        })
    }, 5000)
    return () => {
      clearInterval(tick)
      clearTimeout(advance)
    }
  }, [phase, isHost, playerId, roomCode])

  // Supabase Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on('broadcast', { event: 'round:closed' }, ({ payload }) => {
        setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
        setPhase('reveal')
      })
      .on('broadcast', { event: 'round:started' }, ({ payload }) => {
        setRoundId(payload.roundId)
        setRoundNumber(payload.roundNumber)
        setQuestion(payload.question)
        setStartedAt(payload.startedAt)
        setRevealData(null)
        setPhase('answering')
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [roomCode])

  async function handleSubmit(value: number) {
    if (!playerId) return
    const res = await fetch(`/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, value }),
    })
    if (res.ok) setPhase('waiting')
  }

  if (phase === 'reveal' && revealData) {
    return (
      <RevealPanel
        roundNumber={roundNumber}
        correctAnswer={revealData.correctAnswer}
        answers={revealData.answers}
        autoAdvanceIn={autoAdvanceIn}
      />
    )
  }

  return (
    <QuestionPanel
      roundNumber={roundNumber}
      question={question}
      startedAt={startedAt}
      isWaiting={phase === 'waiting'}
      onSubmit={handleSubmit}
    />
  )
}
