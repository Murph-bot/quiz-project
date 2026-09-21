'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { MuteToggle } from '@/components/ui/MuteToggle'
import { formatNumber } from '@/lib/format'
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
  /** Host only — advances immediately instead of waiting out the timer. */
  onSkipAhead?: () => void
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
  onSkipAhead,
}: Props) {
  const [skipClicked, setSkipClicked] = useState(false)
  const eliminatedIds = new Set(eliminated.map((e) => e.playerId))

  // Dramatic sequencing: the answer lands first, then guesses flip in ranked
  // order (best → worst, so the eliminated row is the final beat). Total
  // stagger is capped to stay well inside the 12s auto-advance window.
  const rowDelayMs = Math.min(500, 3600 / Math.max(answers.length, 1))
  const firstRowMs = 600
  const winnerBannerMs = firstRowMs + answers.length * rowDelayMs + 400

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe phase-enter">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center relative">
          <span className="bg-qk-surface/80 text-qk-text border border-qk-violet/30 px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber} — RESULTS
          </span>
          <MuteToggle className="absolute right-0 -top-2" />
        </div>

        {winner && (
          <div
            className="qk-guess-reveal bg-qk-warn/15 border border-qk-warn/50 rounded-2xl py-3 text-center"
            style={{ opacity: 0, animation: `fadeIn 0.4s ease ${winnerBannerMs}ms forwards` }}
          >
            <div className="text-lg font-black text-qk-warn">🏆 {winner.nickname} wins!</div>
          </div>
        )}

        <Card
          className="text-center qk-answer-reveal"
          padding="md"
          style={{ opacity: 0, animation: 'answerReveal 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) 150ms both' }}
        >
          <div className="text-xs font-bold text-qk-label uppercase tracking-widest">The answer is…</div>
          <div className="text-5xl font-black text-qk-cyan">{formatNumber(correctAnswer)}</div>
        </Card>

        {spectatorBanner && (
          <div className="bg-qk-surface/70 border border-qk-violet/25 rounded-xl px-4 py-2 text-center">
            <span className="text-qk-muted text-xs">
              You are spectating as{' '}
              <span className="font-bold text-qk-text">{spectatorBanner}</span>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2" aria-live="polite">
          {answers.map((a, i) => {
            const isEliminated = eliminatedIds.has(a.playerId)
            const entryMs = firstRowMs + i * rowDelayMs
            return (
              <div
                key={a.playerId}
                className={`rounded-xl px-4 py-3 min-h-[44px] flex justify-between items-center border qk-guess-reveal ${
                  isEliminated
                    ? 'bg-qk-danger/10 border-qk-danger/40'
                    : i === 0 && !a.noAnswer
                      ? 'bg-qk-cyan/10 border-qk-cyan/60 shadow-qk-neon-sm'
                      : 'bg-qk-surface/80 border-qk-violet/25'
                }`}
                style={{
                  opacity: 0,
                  animation: isEliminated
                    ? `fadeIn 0.35s ease ${entryMs}ms forwards, eliminationShake 0.45s ease-in-out ${entryMs + 300}ms`
                    : `fadeIn 0.35s ease ${entryMs}ms forwards`,
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
                        {formatNumber(a.value ?? 0)}
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
                        {a.delta === 0 ? 'exact!' : `off by ${formatNumber(a.delta)}`}
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
          <>
            {autoAdvanceIn > 0 && (
              <p className="text-center text-qk-muted text-xs">
                Next question in <span className="font-bold text-qk-text">{autoAdvanceIn}s</span>
              </p>
            )}
            {onSkipAhead && (
              <button
                type="button"
                disabled={skipClicked}
                onClick={() => {
                  setSkipClicked(true)
                  onSkipAhead()
                }}
                className="w-full min-h-[48px] rounded-2xl py-3 text-base font-black transition-all active:scale-95 disabled:opacity-50 border bg-qk-cyan/10 text-qk-cyan border-qk-cyan/60 hover:bg-qk-cyan/20"
              >
                {skipClicked ? 'Advancing…' : 'Next →'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
