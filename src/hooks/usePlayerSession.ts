'use client'

import { useEffect, useState } from 'react'

interface PlayerSession {
  playerId: string | null
  nickname: string | null
  sessionSecret: string | null
  rejoinCode: string | null
  ready: boolean
}

export function usePlayerSession(): PlayerSession {
  const [session, setSession] = useState<Omit<PlayerSession, 'ready'>>({
    playerId: null,
    nickname: null,
    sessionSecret: null,
    rejoinCode: null,
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Deferred so the initial render (and SSR hydration) matches.
    const timer = setTimeout(() => {
      const playerId = sessionStorage.getItem('playerId')
      const nickname = sessionStorage.getItem('nickname')
      const sessionSecret = sessionStorage.getItem('sessionSecret')
      const rejoinCode = sessionStorage.getItem('rejoinCode')
      setSession({ playerId, nickname, sessionSecret, rejoinCode })
      setReady(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return { ...session, ready }
}
