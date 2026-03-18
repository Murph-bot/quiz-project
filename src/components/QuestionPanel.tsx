'use client'

import { useState } from 'react'
import { useCountdown } from '@/hooks/useCountdown'

interface Props {
  roundNumber: number
  question: { id: string; text: string; timeLimit: number; category: string }
  startedAt: string
  isWaiting: boolean
  isGracePeriod: boolean
  onSubmit: (value: number) => void
}

export function QuestionPanel({ roundNumber, question, startedAt, isWaiting, isGracePeriod, onSubmit }: Props) {
  const [input, setInput] = useState('')
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { secondsLeft } = useCountdown(deadlineMs)
  const progress = Math.round((secondsLeft / question.timeLimit) * 100)
  const disabled = isWaiting || (secondsLeft === 0 && !isGracePeriod)
  const isUrgent = secondsLeft <= 4 && secondsLeft > 0

  function handleSubmit() {
    const value = parseInt(input, 10)
    if (isNaN(value)) return
    onSubmit(value)
  }

  return (
    <div className={`flex flex-col min-h-dvh px-4 pt-4 pb-safe ${isUrgent ? 'urgent-bg' : ''}`}>
      {/* Timer + question float centered in remaining space above the input */}
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

      {/* Input row anchored to bottom — always visible above keyboard */}
      <div className="w-full max-w-sm mx-auto mt-4">
        <div className="flex gap-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={input}
            onChange={e => setInput(e.target.value.replace(/[^0-9-]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Your answer..."
            disabled={disabled}
            autoComplete="off"
            className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-bold text-base text-center focus:outline-none focus:border-orange-400 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || input === ''}
            className="bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-xl px-5 min-w-[80px] disabled:opacity-40 active:scale-95 transition-transform"
          >
            {isWaiting ? 'Sent!' : 'SUBMIT'}
          </button>
        </div>

        {isWaiting && (
          <p className="text-center text-white/70 text-sm mt-3">Waiting for round to close...</p>
        )}
        {isGracePeriod && !isWaiting && (
          <p className="text-center text-white/70 text-sm mt-3">⏳ Last chance to answer...</p>
        )}
      </div>
    </div>
  )
}
