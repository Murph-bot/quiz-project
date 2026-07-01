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
    setSession({
      playerId: sessionStorage.getItem('playerId'),
      nickname: sessionStorage.getItem('nickname'),
      sessionSecret: sessionStorage.getItem('sessionSecret'),
    })
    setReady(true)
  }, [])

  return { ...session, ready }
}
