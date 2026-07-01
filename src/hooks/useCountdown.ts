'use client'

import { useState, useEffect } from 'react'

function computeSeconds(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
}

export function useCountdown(deadlineMs: number): { secondsLeft: number; isExpired: boolean } {
  // Start at 0 to avoid SSR/client hydration mismatch from Date.now().
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [hasTicked, setHasTicked] = useState(false)

  useEffect(() => {
    const update = () => setSecondsLeft(computeSeconds(deadlineMs))
    update()
    setHasTicked(true)
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [deadlineMs])

  // Never treat the pre-effect initial 0 as expired — that spuriously closes rounds on mount.
  return { secondsLeft, isExpired: hasTicked && secondsLeft === 0 }
}
