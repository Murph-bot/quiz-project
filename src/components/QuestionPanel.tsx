'use client'

import { useState } from 'react'
import { useCountdown } from '@/hooks/useCountdown'
import { Banner } from '@/components/ui/Banner'
import { Card } from '@/components/ui/Card'
import { normalizeOptions } from '@/lib/questionOptions'

interface Props {
  roundNumber: number
  question: { id: string; text: string; timeLimit: number; category: string; options?: unknown }
  startedAt: string
  isWaiting: boolean
  isGracePeriod: boolean
  graceSecondsLeft?: number
  onSubmit: (value: number) => void
}

export function QuestionPanel({
  roundNumber,
  question,
  startedAt,
  isWaiting,
  isGracePeriod,
  graceSecondsLeft,
  onSubmit,
}: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const options = normalizeOptions(question.options)
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { secondsLeft } = useCountdown(deadlineMs)
  const progress = question.timeLimit > 0 ? Math.round((secondsLeft / question.timeLimit) * 100) : 0
  const disabled = isWaiting || submitted || (secondsLeft === 0 && !isGracePeriod)
  const isUrgent = secondsLeft <= 4 && secondsLeft > 0

  function handleOptionSelect(value: number) {
    if (disabled) return
    setSelectedOption(value)
    setSubmitted(true)
    onSubmit(value)
  }

  return (
    <div className={`flex flex-col min-h-dvh px-4 pt-4 pb-safe phase-enter ${isUrgent ? 'urgent-bg' : ''}`}>
      {isGracePeriod && (
        <Banner variant="grace">
          <span>⏳ Grace period</span>
          <span className="font-black tabular-nums">{graceSecondsLeft ?? 0}s</span>
        </Banner>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-5 w-full max-w-sm mx-auto">
        <div className="flex justify-between items-center w-full">
          <span className="bg-qk-surface/80 text-qk-text border border-qk-violet/30 px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber}
          </span>
          <span className="bg-qk-surface/80 text-qk-label border border-qk-violet/30 px-3 py-1 rounded-full text-xs font-bold uppercase">
            {question.category}
          </span>
        </div>

        <Card className="text-center" padding="md">
          <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
            <div
              className={`absolute inset-0 rounded-full border-2 ${
                isUrgent
                  ? 'border-qk-danger qk-timer-ring-urgent'
                  : 'border-qk-cyan/50'
              }`}
              aria-hidden
            />
            <div
              className={`text-5xl font-black leading-none tabular-nums ${isUrgent ? 'text-qk-danger' : 'text-qk-cyan'}`}
              suppressHydrationWarning
            >
              {secondsLeft}
            </div>
          </div>
          <div className={`text-xs uppercase tracking-widest mt-3 ${isUrgent ? 'text-qk-danger' : 'text-qk-muted'}`}>
            seconds left
          </div>
          <div className="bg-qk-inset rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isUrgent ? 'bg-qk-danger' : 'bg-qk-cyan'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </Card>

        <Card className="text-center" padding="md">
          <p className="text-qk-text font-bold text-lg leading-snug">{question.text}</p>
        </Card>
      </div>

      <div className="w-full max-w-sm mx-auto mt-4 flex flex-col gap-3">
        {options ? (
          <>
            {options.map((opt) => {
              const isSelected = selectedOption === opt
              return (
                <button
                  key={opt}
                  onClick={() => handleOptionSelect(opt)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className={`w-full min-h-[56px] rounded-2xl py-5 text-2xl font-black transition-all active:scale-95 disabled:cursor-not-allowed border
                    ${
                      isSelected
                        ? 'bg-qk-cyan/10 text-qk-cyan border-qk-cyan/80 shadow-[inset_0_0_18px_rgb(94_239_255_/_0.18),0_0_8px_rgb(94_239_255_/_0.22)]'
                        : 'bg-qk-surface/80 text-qk-text border-qk-violet/30 disabled:opacity-50'
                    }`}
                >
                  {opt}
                </button>
              )
            })}
            {isWaiting && (
              <p className="text-center text-qk-muted text-sm mt-1">Waiting for round to close...</p>
            )}
            {isGracePeriod && !isWaiting && !submitted && (
              <p className="text-center text-qk-muted text-sm mt-1">⏳ Last chance to answer...</p>
            )}
          </>
        ) : (
          <>
            <p className="text-center text-qk-muted text-sm">Type your answer</p>
            {isWaiting && (
              <p className="text-center text-qk-muted text-sm">Waiting for round to close...</p>
            )}
            {isGracePeriod && !isWaiting && (
              <p className="text-center text-qk-muted text-sm">⏳ Last chance to answer...</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
