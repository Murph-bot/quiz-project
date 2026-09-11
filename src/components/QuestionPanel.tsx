'use client'

import { useEffect, useState } from 'react'
import { useCountdown } from '@/hooks/useCountdown'
import { Banner } from '@/components/ui/Banner'
import { Card } from '@/components/ui/Card'
import { MuteToggle } from '@/components/ui/MuteToggle'
import { formatNumber } from '@/lib/format'
import { playSfx } from '@/lib/sfx'

interface Props {
  roundNumber: number
  question: { id: string; text: string; timeLimit: number; category: string }
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
  const [submittedValue, setSubmittedValue] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { secondsLeft } = useCountdown(deadlineMs)
  const progress = question.timeLimit > 0 ? Math.round((secondsLeft / question.timeLimit) * 100) : 0
  const submitted = submittedValue !== null
  const disabled = isWaiting || submitted || (secondsLeft === 0 && !isGracePeriod)
  const isUrgent = secondsLeft <= 4 && secondsLeft > 0

  // Ticking under 5s while actively answering.
  useEffect(() => {
    if (!isWaiting && !isGracePeriod && secondsLeft > 0 && secondsLeft <= 5) {
      playSfx('tick')
    }
  }, [secondsLeft, isWaiting, isGracePeriod])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled || input === '') return
    const value = parseInt(input, 10)
    if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return
    playSfx('lockIn')
    navigator.vibrate?.(50)
    setSubmittedValue(value)
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
          <div className="flex items-center gap-2">
            <span className="bg-qk-surface/80 text-qk-label border border-qk-violet/30 px-3 py-1 rounded-full text-xs font-bold uppercase">
              {question.category}
            </span>
            <MuteToggle />
          </div>
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {submitted ? (
            <div
              className="w-full min-h-[56px] rounded-2xl py-4 text-2xl font-black text-center bg-qk-cyan/10 text-qk-cyan border border-qk-cyan/80 shadow-[inset_0_0_18px_rgb(94_239_255_/_0.18),0_0_8px_rgb(94_239_255_/_0.22)]"
              aria-live="polite"
            >
              {formatNumber(submittedValue)}
            </div>
          ) : (
            <>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Your guess"
                disabled={disabled}
                aria-label="Your guess"
                className="w-full min-h-[56px] rounded-2xl px-5 text-3xl font-black text-center tabular-nums bg-qk-surface/80 text-qk-text border border-qk-violet/30 focus:outline-none focus:border-qk-cyan/80 focus:shadow-[0_0_12px_rgb(94_239_255_/_0.25)] disabled:opacity-50 placeholder:text-qk-muted/40 placeholder:text-lg placeholder:font-bold"
              />
              <button
                type="submit"
                disabled={disabled || input === ''}
                className="w-full min-h-[56px] rounded-2xl py-4 text-xl font-black transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 border bg-qk-cyan/10 text-qk-cyan border-qk-cyan/60 hover:bg-qk-cyan/20"
              >
                Lock it in
              </button>
            </>
          )}
        </form>
        {isWaiting && (
          <p className="text-center text-qk-muted text-sm mt-1">Waiting for round to close...</p>
        )}
        {isGracePeriod && !isWaiting && !submitted && (
          <p className="text-center text-qk-muted text-sm mt-1">⏳ Last chance to answer...</p>
        )}
      </div>
    </div>
  )
}
