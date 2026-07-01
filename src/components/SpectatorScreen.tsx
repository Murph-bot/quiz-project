'use client'

import { useEffect, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Card } from '@/components/ui/Card'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  roundNumber: number
  question: { text: string; timeLimit: number } | null
  startedAt: string | null
  aliveCount: number
  isGracePeriod: boolean
  graceSecondsLeft: number
}

function computeSecondsLeft(startedAt: string, timeLimit: number): number {
  return Math.max(0, Math.ceil((new Date(startedAt).getTime() + timeLimit * 1000 - Date.now()) / 1000))
}

export function SpectatorScreen({
  roundNumber,
  question,
  startedAt,
  aliveCount,
  isGracePeriod,
  graceSecondsLeft,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!question || !startedAt) {
      setSecondsLeft(0)
      return
    }
    setSecondsLeft(computeSecondsLeft(startedAt, question.timeLimit))
    const interval = setInterval(() => {
      setSecondsLeft(computeSecondsLeft(startedAt, question.timeLimit))
    }, 500)
    return () => clearInterval(interval)
  }, [question, startedAt])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center phase-enter">
      {isGracePeriod && (
        <Banner variant="grace">
          <span>⏳ Grace period</span>
          <span className="font-black tabular-nums">{graceSecondsLeft}s</span>
        </Banner>
      )}
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-6xl">💀</div>

        <Card padding="md" className="text-center">
          <div className="text-lg font-black text-gray-900">You&apos;ve been eliminated</div>
          <div className="text-sm text-gray-500 mt-1">
            Hang tight — a resurrection could bring you back into the game!
          </div>
        </Card>

        {question && startedAt && (
          <div className="bg-white/10 rounded-2xl px-6 py-5 w-full flex flex-col gap-3">
            <SectionLabel>Current question</SectionLabel>
            <div className="text-white font-semibold text-base leading-snug">{question.text}</div>
            <div className="text-3xl font-black text-white tabular-nums" suppressHydrationWarning>
              {secondsLeft}s
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-1">
          <p className="text-white/70 text-sm">
            Spectating Round <span className="font-bold text-white">{roundNumber}</span>
          </p>
          <p className="text-white/50 text-xs">
            {aliveCount} player{aliveCount !== 1 ? 's' : ''} still alive
          </p>
        </div>
      </div>
    </div>
  )
}
