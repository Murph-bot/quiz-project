'use client'

import { useState, useEffect } from 'react'

function computeSeconds(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
}

export function useCountdown(deadlineMs: number): { secondsLeft: number; isExpired: boolean } {
  const [secondsLeft, setSecondsLeft] = useState(() => computeSeconds(deadlineMs))

  useEffect(() => {
    setSecondsLeft(computeSeconds(deadlineMs))
    const interval = setInterval(() => {
      setSecondsLeft(computeSeconds(deadlineMs))
    }, 500)
    return () => clearInterval(interval)
  }, [deadlineMs])

  return { secondsLeft, isExpired: secondsLeft === 0 }
}
