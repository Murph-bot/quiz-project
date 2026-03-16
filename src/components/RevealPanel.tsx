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

        <div className="bg-white rounded-2xl shadow-md py-4 text-center">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Correct Answer</div>
          <div className="text-5xl font-black text-orange-500">{correctAnswer}</div>
        </div>

        {spectatorBanner && (
          <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
            <span className="text-white/80 text-xs">
              You are spectating as <span className="font-bold text-white">{spectatorBanner}</span>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {answers.map((a, i) => {
            const isEliminated = eliminatedIds.has(a.playerId)
            return (
              <div
                key={a.playerId}
                className={`rounded-xl px-4 py-3 flex justify-between items-center shadow-sm ${
                  isEliminated ? 'bg-red-100' : 'bg-white'
                }`}
                style={{
                  opacity: 0,
                  animation: 'fadeIn 0.3s ease forwards',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isEliminated ? '💀' : (MEDALS[i] ?? '▫️')}</span>
                  <span className={`font-bold text-sm ${isEliminated ? 'text-red-800' : 'text-gray-900'}`}>
                    {a.nickname}
                  </span>
                </div>
                <div className="text-right">
                  {a.noAnswer ? (
                    <>
                      <span className="text-gray-400 font-black text-base">—</span>
                      <span className="text-gray-400 text-xs ml-2">no answer</span>
                    </>
                  ) : (
                    <>
                      <span className={`font-black text-base ${isEliminated ? 'text-red-600' : 'text-gray-900'}`}>
                        {a.value}
                      </span>
                      <span className={`text-xs ml-2 ${
                        isEliminated
                          ? 'text-red-400'
                          : a.delta === 0
                          ? 'text-green-600 font-bold'
                          : 'text-gray-400'
                      }`}>
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
          <p className="text-center text-white/70 text-xs">
            Game over — results in <span className="font-bold text-white">5s</span>
          </p>
        ) : (
          autoAdvanceIn > 0 && (
            <p className="text-center text-white/70 text-xs">
              Next question in <span className="font-bold text-white">{autoAdvanceIn}s</span>
            </p>
          )
        )}

      </div>
    </div>
  )
}
