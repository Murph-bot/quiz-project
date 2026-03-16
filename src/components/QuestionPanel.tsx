'use client'

import { useState } from 'react'
import { useCountdown } from '@/hooks/useCountdown'

interface Props {
  roundNumber: number
  question: { id: string; text: string; timeLimit: number; category: string }
  startedAt: string
  isWaiting: boolean
  onSubmit: (value: number) => void
}

export function QuestionPanel({ roundNumber, question, startedAt, isWaiting, onSubmit }: Props) {
  const [input, setInput] = useState('')
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { secondsLeft } = useCountdown(deadlineMs)
  const progress = Math.round((secondsLeft / question.timeLimit) * 100)
  const disabled = isWaiting || secondsLeft === 0
  const isUrgent = secondsLeft <= 4 && secondsLeft > 0

  function handleSubmit() {
    const value = parseInt(input, 10)
    if (isNaN(value)) return
    onSubmit(value)
  }

  return (
    <div className={`flex flex-col items-center justify-center min-h-dvh p-4 ${isUrgent ? 'urgent-bg' : ''}`}>
      <div className="w-full max-w-sm flex flex-col gap-5">

        <div className="flex justify-between items-center">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber}
          </span>
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
            {question.category}
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 text-center">
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

        <div className="bg-white rounded-2xl shadow-md p-5 text-center">
          <p className="text-gray-900 font-bold text-lg leading-snug">{question.text}</p>
        </div>

        <div className="flex gap-3">
          <input
            type="number"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Your answer..."
            disabled={disabled}
            className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-bold text-lg text-center focus:outline-none focus:border-orange-400 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || input === ''}
            className="bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-xl px-5 disabled:opacity-40 active:scale-95 transition-transform"
          >
            {isWaiting ? 'Sent!' : 'SUBMIT'}
          </button>
        </div>

        {isWaiting && (
          <p className="text-center text-white/70 text-sm">Waiting for round to close...</p>
        )}
      </div>
    </div>
  )
}
