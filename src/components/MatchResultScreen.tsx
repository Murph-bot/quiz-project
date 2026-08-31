'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  winnerNickname: string
  matchLabel: string
  finalScore: string
  nextLabel: string
  onContinue: () => void
}

export function MatchResultScreen({
  winnerNickname,
  matchLabel,
  finalScore,
  nextLabel,
  onContinue,
}: Props) {
  const [countdown, setCountdown] = useState(5)
  const onContinueRef = useRef(onContinue)
  useEffect(() => {
    onContinueRef.current = onContinue
  }, [onContinue])

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) {
          clearInterval(t)
          onContinueRef.current()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe phase-enter">
      <div className="w-full max-w-sm flex flex-col gap-5 text-center">
        <SectionLabel>{matchLabel} Result</SectionLabel>
        <Card padding="lg" className="text-center">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-qk-label text-sm mb-1">Winner</p>
          <p className="text-qk-cyan font-black text-3xl">{winnerNickname}</p>
          <p className="text-qk-muted text-sm mt-3">{finalScore}</p>
        </Card>
        <div className="bg-qk-surface/70 backdrop-blur-md border border-qk-violet/25 rounded-2xl p-4">
          <p className="text-qk-text font-bold">{nextLabel}</p>
        </div>
        <p className="text-qk-muted text-sm">Continuing in {countdown}s...</p>
      </div>
    </div>
  )
}
