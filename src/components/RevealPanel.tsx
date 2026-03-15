'use client'

import type { RankedAnswer } from '@/types'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  roundNumber: number
  correctAnswer: number
  answers: RankedAnswer[]
  autoAdvanceIn: number
}

export function RevealPanel({ roundNumber, correctAnswer, answers, autoAdvanceIn }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-4">

        <div className="text-center">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber} — RESULTS
          </span>
        </div>

        <div className="bg-white rounded-2xl py-4 text-center">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-widest">Correct Answer</div>
          <div className="text-4xl font-black text-purple-700">{correctAnswer}</div>
        </div>

        <div className="flex flex-col gap-2">
          {answers.map((a, i) => (
            <div
              key={a.playerId}
              className="bg-white/15 backdrop-blur border border-white/30 rounded-xl px-4 py-3 flex justify-between items-center"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{MEDALS[i] ?? '▫️'}</span>
                <span className="text-white font-bold text-sm">{a.nickname}</span>
              </div>
              <div className="text-right">
                <span className="text-white font-black text-base">{a.value}</span>
                <span className="text-white/60 text-xs ml-2">
                  {a.delta === 0 ? 'exact!' : `off by ${a.delta}`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {autoAdvanceIn > 0 && (
          <p className="text-center text-white/60 text-xs">
            Next question in <span className="font-bold text-white">{autoAdvanceIn}s</span>
          </p>
        )}

      </div>
    </div>
  )
}
