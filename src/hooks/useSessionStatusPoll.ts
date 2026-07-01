'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type SessionStatus = 'lobby' | 'active' | 'finished'

interface Options {
  roomCode: string
  enabled: boolean
  /** Navigate when session reaches one of these statuses */
  navigateOn: SessionStatus[]
  /** Target path template — defaults to `/game/{roomCode}` */
  getPath?: (roomCode: string) => string
  intervalMs?: number
}

export function useSessionStatusPoll({
  roomCode,
  enabled,
  navigateOn,
  getPath = (code) => `/game/${code}`,
  intervalMs = 3000,
}: Options) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function checkStatus() {
      try {
        const res = await fetch(`/api/sessions/${roomCode}`)
        if (!res.ok) return
        const data = await res.json()
        const status = data?.session?.status as SessionStatus | undefined
        if (!cancelled && status && navigateOn.includes(status)) {
          router.push(getPath(roomCode))
        }
      } catch {
        // ignore transient network errors
      }
    }

    void checkStatus()
    const interval = setInterval(checkStatus, intervalMs)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, roomCode, router, navigateOn, getPath, intervalMs])
}
