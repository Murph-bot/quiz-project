'use client'

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
  const eliminatedIds = new Set(eliminated.map(e => e.playerId))

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-4">

        <div className="text-center">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber} — RESULTS
          </span>
        </div>

        {winner && (
          <div className="bg-yellow-400 rounded-2xl py-3 text-center">
            <div className="text-lg font-black text-yellow-900">🏆 {winner.nickname} wins!</div>
          </div>
        )}

        <div className="bg-white rounded-2xl py-4 text-center">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-widest">Correct Answer</div>
          <div className="text-4xl font-black text-purple-700">{correctAnswer}</div>
        </div>

        {spectatorBanner && (
          <div className="bg-white/10 border border-white/30 rounded-xl px-4 py-2 text-center">
            <span className="text-white/80 text-xs">You are spectating as <span className="font-bold text-white">{spectatorBanner}</span></span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {answers.map((a, i) => {
            const isEliminated = eliminatedIds.has(a.playerId)
            return (
              <div
                key={a.playerId}
                className={`backdrop-blur border rounded-xl px-4 py-3 flex justify-between items-center ${
                  isEliminated
                    ? 'bg-red-900/30 border-red-400/40 opacity-60'
                    : 'bg-white/15 border-white/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isEliminated ? '💀' : (MEDALS[i] ?? '▫️')}</span>
                  <span className={`font-bold text-sm ${isEliminated ? 'text-red-200' : 'text-white'}`}>
                    {a.nickname}
                  </span>
                </div>
                <div className="text-right">
                  {a.noAnswer ? (
                    <>
                      <span className="text-white/40 font-black text-base">—</span>
                      <span className="text-white/40 text-xs ml-2">no answer</span>
                    </>
                  ) : (
                    <>
                      <span className={`font-black text-base ${isEliminated ? 'text-red-200' : 'text-white'}`}>
                        {a.value}
                      </span>
                      <span className={`text-xs ml-2 ${isEliminated ? 'text-red-200/60' : 'text-white/60'}`}>
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
          <p className="text-center text-white/60 text-xs">
            Game over — results in <span className="font-bold text-white">5s</span>
          </p>
        ) : (
          autoAdvanceIn > 0 && (
            <p className="text-center text-white/60 text-xs">
              Next question in <span className="font-bold text-white">{autoAdvanceIn}s</span>
            </p>
          )
        )}

      </div>
    </div>
  )
}
