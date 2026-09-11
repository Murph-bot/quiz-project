'use client'

import { useEffect, useState } from 'react'
import { isMuted, setMuted } from '@/lib/sfx'

export function MuteToggle({ className = '' }: { className?: string }) {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMutedState(isMuted()), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted
        setMuted(next)
        setMutedState(next)
      }}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-qk-surface/80 border border-qk-violet/30 text-base ${className}`}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
