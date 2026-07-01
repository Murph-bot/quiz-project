'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'

interface Props {
  roundNumber: number
  deadlineMs: number
}

export function TiebreakWaitingScreen({ roundNumber, deadlineMs }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)))
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(interval)
  }, [deadlineMs])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center phase-enter">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-6xl">⚔️</div>
        <Card padding="md" className="text-center">
          <div className="text-lg font-black text-gray-900">Tiebreak in progress</div>
          <div className="text-sm text-gray-500 mt-1">
            Don&apos;t worry — you&apos;ve made it to the semi-finals!
          </div>
        </Card>
        <div className="bg-white/10 rounded-xl px-6 py-4 w-full">
          <div className="text-white/70 text-sm mb-1">Time remaining</div>
          <div className="text-4xl font-black text-white tabular-nums" suppressHydrationWarning>
            {secondsLeft}s
          </div>
        </div>
        <p className="text-white/60 text-sm">Round {roundNumber} · Tiebreak</p>
      </div>
    </div>
  )
}
