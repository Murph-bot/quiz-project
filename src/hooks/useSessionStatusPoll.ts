'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type SessionStatus = 'lobby' | 'active' | 'finished'

const DEFAULT_GET_PATH = (code: string) => `/game/${code}`

interface Options {
  roomCode: string
  enabled: boolean
  /** Navigate when session reaches one of these statuses */
  navigateOn: readonly SessionStatus[]
  /** Target path template — defaults to `/game/{roomCode}` */
  getPath?: (roomCode: string) => string
  intervalMs?: number
}

export function useSessionStatusPoll({
  roomCode,
  enabled,
  navigateOn,
  getPath = DEFAULT_GET_PATH,
  intervalMs = 8000,
}: Options) {
  const router = useRouter()
  const navigateOnRef = useRef(navigateOn)
  const getPathRef = useRef(getPath)

  useEffect(() => {
    navigateOnRef.current = navigateOn
    getPathRef.current = getPath
  }, [navigateOn, getPath])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function checkStatus() {
      try {
        const res = await fetch(`/api/sessions/${roomCode}`)
        if (!res.ok) return
        const data = await res.json()
        const status = data?.session?.status as SessionStatus | undefined
        if (!cancelled && status && navigateOnRef.current.includes(status)) {
          router.push(getPathRef.current(roomCode))
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
  }, [enabled, roomCode, router, intervalMs])
}
