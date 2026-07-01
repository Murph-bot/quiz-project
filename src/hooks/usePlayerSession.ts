'use client'

import { useEffect, useState } from 'react'

interface PlayerSession {
  playerId: string | null
  nickname: string | null
  sessionSecret: string | null
  ready: boolean
}

export function usePlayerSession(): PlayerSession {
  const [session, setSession] = useState<Omit<PlayerSession, 'ready'>>({
    playerId: null,
    nickname: null,
    sessionSecret: null,
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const playerId = sessionStorage.getItem('playerId')
    const nickname = sessionStorage.getItem('nickname')
    const sessionSecret = sessionStorage.getItem('sessionSecret')
    setSession({ playerId, nickname, sessionSecret })
    setReady(true)
  }, [])

  return { ...session, ready }
}
