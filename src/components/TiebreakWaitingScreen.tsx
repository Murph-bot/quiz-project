'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { TIEBREAK_WAITING_REASSURANCE } from '@/lib/game/closeClient'

interface Props {
  roundNumber: number
  deadlineMs: number
}

export function TiebreakWaitingScreen({ roundNumber, deadlineMs }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)))
    // Deferred so the initial value renders before state updates.
    const timer = setTimeout(update, 0)
    const interval = setInterval(update, 500)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [deadlineMs])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center phase-enter">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-6xl">⚔️</div>
        <Card padding="md" className="text-center">
          <div className="text-lg font-black text-qk-text">Tiebreak in progress</div>
          <div className="text-sm text-qk-muted mt-1">{TIEBREAK_WAITING_REASSURANCE}</div>
        </Card>
        <div className="bg-qk-surface/70 backdrop-blur-md border border-qk-violet/25 rounded-xl px-6 py-4 w-full">
          <div className="text-qk-label text-sm mb-1">Time remaining</div>
          <div className="text-4xl font-black text-qk-cyan tabular-nums" suppressHydrationWarning>
            {secondsLeft}s
          </div>
        </div>
        <p className="text-qk-muted text-sm">Round {roundNumber} · Tiebreak</p>
      </div>
    </div>
  )
}
