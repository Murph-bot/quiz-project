'use client'

import { useEffect, useState } from 'react'

interface Props {
  roundNumber: number
  question: { text: string; timeLimit: number } | null
  startedAt: string | null
  aliveCount: number
}

export function SpectatorScreen({ roundNumber, question, startedAt, aliveCount }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!question || !startedAt) return 0
    return Math.max(0, Math.ceil((new Date(startedAt).getTime() + question.timeLimit * 1000 - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!question || !startedAt) return
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((new Date(startedAt).getTime() + question.timeLimit * 1000 - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(interval)
  }, [question, startedAt])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-6xl">💀</div>

        <div className="bg-white rounded-2xl shadow-md px-6 py-5 w-full">
          <div className="text-lg font-black text-gray-900">You&apos;ve been eliminated</div>
          <div className="text-sm text-gray-500 mt-1">
            Hang tight — a resurrection could bring you back every 5 rounds.
          </div>
        </div>

        {question && startedAt && (
          <div className="bg-white/10 rounded-2xl px-6 py-5 w-full flex flex-col gap-3">
            <div className="text-white/60 text-xs uppercase tracking-widest">Current question</div>
            <div className="text-white font-semibold text-base leading-snug">{question.text}</div>
            <div className="text-3xl font-black text-white tabular-nums">{secondsLeft}s</div>
          </div>
        )}

        <div className="flex flex-col items-center gap-1">
          <p className="text-white/70 text-sm">
            Spectating Round <span className="font-bold text-white">{roundNumber}</span>
          </p>
          <p className="text-white/50 text-xs">{aliveCount} player{aliveCount !== 1 ? 's' : ''} still alive</p>
        </div>
      </div>
    </div>
  )
}
