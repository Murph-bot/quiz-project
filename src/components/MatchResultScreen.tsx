'use client'

import { useEffect, useState } from 'react'

interface Props {
  winnerNickname: string
  matchLabel: string // "Semi-Final 1" | "Semi-Final 2"
  finalScore: string // "2 – 0"
  nextLabel: string  // "Semi-Final 2 up next" | "Final up next"
  onContinue: () => void
}

export function MatchResultScreen({ winnerNickname, matchLabel, finalScore, nextLabel, onContinue }: Props) {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(t); onContinue(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onContinue])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5 text-center">
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">{matchLabel} Result</p>
        <div className="bg-white rounded-2xl shadow-md p-6">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-gray-400 text-sm mb-1">Winner</p>
          <p className="text-orange-500 font-black text-3xl">{winnerNickname}</p>
          <p className="text-gray-400 text-sm mt-3">{finalScore}</p>
        </div>
        <div className="bg-white/10 rounded-2xl p-4">
          <p className="text-white font-bold">{nextLabel}</p>
        </div>
        <p className="text-white/40 text-sm">Continuing in {countdown}s...</p>
      </div>
    </div>
  )
}
