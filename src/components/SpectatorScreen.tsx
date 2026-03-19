'use client'

import { useEffect, useState } from 'react'

interface Props {
  roundNumber: number
  question: { text: string; timeLimit: number } | null
  startedAt: string | null
  aliveCount: number
  isGracePeriod: boolean
  graceSecondsLeft: number
}

export function SpectatorScreen({ roundNumber, question, startedAt, aliveCount, isGracePeriod, graceSecondsLeft }: Props) {
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
      {isGracePeriod && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-3">
          <div className="bg-amber-500 text-white px-5 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
            <span>⏳ Grace period</span>
            <span className="font-black tabular-nums">{graceSecondsLeft}s</span>
          </div>
        </div>
      )}
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-6xl">💀</div>

        <div className="bg-white rounded-2xl shadow-md px-6 py-5 w-full">
          <div className="text-lg font-black text-gray-900">You&apos;ve been eliminated</div>
          <div className="text-sm text-gray-500 mt-1">
            Hang tight — a resurrection could bring you back into the game!
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
