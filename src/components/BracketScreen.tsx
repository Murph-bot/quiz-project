'use client'

import { useEffect, useRef, useState } from 'react'
import type { BracketState } from '@/types'

interface Props {
  bracket: BracketState
  myPlayerId: string
  onReady: () => void
}

export function BracketScreen({ bracket, myPlayerId, onReady }: Props) {
  const [countdown, setCountdown] = useState(5)
  const onReadyRef = useRef(onReady)
  useEffect(() => { onReadyRef.current = onReady }, [onReady])

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(t); onReadyRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const isInSF1 = bracket.sf1.p1id === myPlayerId || bracket.sf1.p2id === myPlayerId
  const isInSF2 = bracket.sf2.p1id === myPlayerId || bracket.sf2.p2id === myPlayerId

  function MatchCard({ match, label, highlighted }: { match: typeof bracket.sf1; label: string; highlighted: boolean }) {
    return (
      <div className={`bg-white rounded-2xl shadow-md p-4 ${highlighted ? 'ring-2 ring-orange-400' : ''}`}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{label}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-black text-gray-900 text-lg">{match.p1}</span>
          <span className="text-orange-500 font-black text-sm">VS</span>
          <span className="font-black text-gray-900 text-lg">{match.p2}</span>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Best of 3</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Semi-Finals</p>
          <h1 className="text-3xl font-black text-white">⚔️ The Bracket</h1>
          <p className="text-white/50 text-sm mt-1">4 players remain</p>
        </div>

        <MatchCard match={bracket.sf1} label="Semi-Final 1" highlighted={isInSF1} />
        <MatchCard match={bracket.sf2} label="Semi-Final 2" highlighted={isInSF2} />

        <div className="bg-white/10 rounded-2xl p-4 text-center">
          <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Final</p>
          <p className="text-white font-black">Winner SF1 vs Winner SF2</p>
          <p className="text-white/40 text-xs mt-1">Best of 5</p>
        </div>

        <p className="text-center text-white/50 text-sm">
          {isInSF1 ? '⚡ You play in Semi-Final 1' : isInSF2 ? '⚡ You play in Semi-Final 2' : '👀 You watch Semi-Final 1 first'}
        </p>
        <p className="text-center text-white/40 text-xs">Starting in {countdown}s...</p>
      </div>
    </div>
  )
}
