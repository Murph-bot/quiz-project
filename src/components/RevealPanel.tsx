'use client'

import { Card } from '@/components/ui/Card'
import type { RankedAnswer, EliminatedPlayer, WinnerInfo } from '@/types'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  roundNumber: number
  correctAnswer: number
  answers: RankedAnswer[]
  eliminated: EliminatedPlayer[]
  gameOver: boolean
  winner: WinnerInfo | null
  autoAdvanceIn: number
  spectatorBanner?: string | null
}

export function RevealPanel({
  roundNumber,
  correctAnswer,
  answers,
  eliminated,
  gameOver,
  winner,
  autoAdvanceIn,
  spectatorBanner,
}: Props) {
  const eliminatedIds = new Set(eliminated.map((e) => e.playerId))

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe phase-enter">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center">
          <span className="bg-qk-surface/80 text-qk-text border border-qk-violet/30 px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber} — RESULTS
          </span>
        </div>

        {winner && (
          <div className="bg-qk-warn/15 border border-qk-warn/50 rounded-2xl py-3 text-center">
            <div className="text-lg font-black text-qk-warn">🏆 {winner.nickname} wins!</div>
          </div>
        )}

        <Card className="text-center" padding="md">
          <div className="text-xs font-bold text-qk-label uppercase tracking-widest">Correct Answer</div>
          <div className="text-5xl font-black text-qk-cyan">{correctAnswer}</div>
        </Card>

        {spectatorBanner && (
          <div className="bg-qk-surface/70 border border-qk-violet/25 rounded-xl px-4 py-2 text-center">
            <span className="text-qk-muted text-xs">
              You are spectating as{' '}
              <span className="font-bold text-qk-text">{spectatorBanner}</span>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {answers.map((a, i) => {
            const isEliminated = eliminatedIds.has(a.playerId)
            return (
              <div
                key={a.playerId}
                className={`rounded-xl px-4 py-3 min-h-[44px] flex justify-between items-center border ${
                  isEliminated
                    ? 'bg-qk-danger/10 border-qk-danger/40 elimination-shake'
                    : 'bg-qk-surface/80 border-qk-violet/25'
                }`}
                style={{
                  opacity: 0,
                  animation: 'fadeIn 0.3s ease forwards',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isEliminated ? '💀' : (MEDALS[i] ?? '▫️')}</span>
                  <span className={`font-bold text-sm ${isEliminated ? 'text-qk-danger' : 'text-qk-text'}`}>
                    {a.nickname}
                  </span>
                </div>
                <div className="text-right">
                  {a.noAnswer ? (
                    <>
                      <span className="text-qk-muted font-black text-base">—</span>
                      <span className="text-qk-muted text-xs ml-2">no answer</span>
                    </>
                  ) : (
                    <>
                      <span
                        className={`font-black text-base ${isEliminated ? 'text-qk-danger' : 'text-qk-text'}`}
                      >
                        {a.value}
                      </span>
                      <span
                        className={`text-xs ml-2 ${
                          isEliminated
                            ? 'text-qk-danger/80'
                            : a.delta === 0
                              ? 'text-qk-success font-bold'
                              : 'text-qk-muted'
                        }`}
                      >
                        {a.delta === 0 ? 'exact!' : `off by ${a.delta}`}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {gameOver ? (
          <p className="text-center text-qk-muted text-xs">
            Game over — results in <span className="font-bold text-qk-text">5s</span>
          </p>
        ) : (
          autoAdvanceIn > 0 && (
            <p className="text-center text-qk-muted text-xs">
              Next question in <span className="font-bold text-qk-text">{autoAdvanceIn}s</span>
            </p>
          )
        )}
      </div>
    </div>
  )
}
