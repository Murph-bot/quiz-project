'use client'

import { useState } from 'react'
import { useCountdown } from '@/hooks/useCountdown'

interface Props {
  roundNumber: number
  question: { id: string; text: string; timeLimit: number; category: string; options?: number[] }
  startedAt: string
  isWaiting: boolean
  isGracePeriod: boolean
  graceSecondsLeft?: number
  onSubmit: (value: number) => void
}

export function QuestionPanel({ roundNumber, question, startedAt, isWaiting, isGracePeriod, graceSecondsLeft, onSubmit }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { secondsLeft } = useCountdown(deadlineMs)
  const progress = Math.round((secondsLeft / question.timeLimit) * 100)
  const disabled = isWaiting || submitted || (secondsLeft === 0 && !isGracePeriod)
  const isUrgent = secondsLeft <= 4 && secondsLeft > 0

  function handleOptionSelect(value: number) {
    if (disabled) return
    setSelectedOption(value)
    setSubmitted(true)
    onSubmit(value)
  }

  return (
    <div className={`flex flex-col min-h-dvh px-4 pt-4 pb-safe ${isUrgent ? 'urgent-bg' : ''}`}>
      {isGracePeriod && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-3">
          <div className="bg-amber-500 text-white px-5 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
            <span>⏳ Grace period</span>
            <span className="font-black tabular-nums">{graceSecondsLeft ?? 0}s</span>
          </div>
        </div>
      )}
      {/* Timer + question float centered in remaining space above the options */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 w-full max-w-sm mx-auto">

        <div className="flex justify-between items-center w-full">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber}
          </span>
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
            {question.category}
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 text-center w-full">
          <div
            className={`text-6xl font-black leading-none ${isUrgent ? 'text-red-600' : 'text-orange-500'}`}
            style={isUrgent ? { animation: 'timerPulse 0.6s ease infinite' } : undefined}
          >
            {secondsLeft}
          </div>
          <div className={`text-xs uppercase tracking-widest mt-1 ${isUrgent ? 'text-red-600' : 'text-gray-400'}`}>
            seconds left
          </div>
          <div className="bg-gray-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isUrgent ? 'bg-red-600' : ''}`}
              style={
                isUrgent
                  ? { width: `${progress}%` }
                  : { width: `${progress}%`, background: 'linear-gradient(90deg, #ff6b00, #e84393)' }
              }
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 text-center w-full">
          <p className="text-gray-900 font-bold text-lg leading-snug">{question.text}</p>
        </div>

      </div>

      {/* Choice buttons (or waiting state) anchored to bottom */}
      <div className="w-full max-w-sm mx-auto mt-4 flex flex-col gap-3">
        {question.options ? (
          <>
            {question.options.map(opt => {
              const isSelected = selectedOption === opt
              return (
                <button
                  key={opt}
                  onClick={() => handleOptionSelect(opt)}
                  disabled={disabled}
                  className={`w-full rounded-2xl py-5 text-2xl font-black transition-all active:scale-95 disabled:cursor-not-allowed
                    ${isSelected
                      ? 'bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-md'
                      : 'bg-white text-gray-900 shadow-md disabled:opacity-50'
                    }`}
                >
                  {opt}
                </button>
              )
            })}
            {isWaiting && (
              <p className="text-center text-white/70 text-sm mt-1">Waiting for round to close...</p>
            )}
            {isGracePeriod && !isWaiting && !submitted && (
              <p className="text-center text-white/70 text-sm mt-1">⏳ Last chance to answer...</p>
            )}
          </>
        ) : (
          // Fallback: plain number input for rounds without options
          <>
            <p className="text-center text-white/70 text-sm">Type your answer</p>
            {isWaiting && (
              <p className="text-center text-white/70 text-sm">Waiting for round to close...</p>
            )}
            {isGracePeriod && !isWaiting && (
              <p className="text-center text-white/70 text-sm">⏳ Last chance to answer...</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
