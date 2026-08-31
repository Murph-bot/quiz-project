'use client'

import { Card } from '@/components/ui/Card'

interface Props {
  winnerNickname: string | null
  autoRedirectIn: number
}

export function WinnerScreen({ winnerNickname, autoRedirectIn }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center phase-enter">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div
          className="text-7xl"
          style={winnerNickname ? { animation: 'trophy 1.8s ease-in-out infinite' } : undefined}
        >
          {winnerNickname ? '🏆' : '😶'}
        </div>

        <Card padding="md" className="text-center">
          {winnerNickname ? (
            <>
              <div className="text-xs font-bold text-qk-label uppercase tracking-widest mb-1">Winner</div>
              <div className="text-2xl font-black text-qk-cyan">{winnerNickname}</div>
              <div className="text-sm text-qk-muted mt-1">Last one standing! 🎉</div>
            </>
          ) : (
            <>
              <div className="text-xl font-black text-qk-text">Nobody won this time.</div>
              <div className="text-sm text-qk-muted mt-1">Better luck next game!</div>
            </>
          )}
        </Card>

        <p className="text-qk-muted text-sm">
          Returning to home in <span className="font-bold text-qk-text">{autoRedirectIn}s</span>
        </p>
      </div>
    </div>
  )
}
