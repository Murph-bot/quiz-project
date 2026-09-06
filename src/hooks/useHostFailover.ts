'use client'

import { useCallback, useEffect, useRef } from 'react'
import { computeFailoverCandidate, promoteHost } from '@/lib/hostFailover'

interface HostFailoverOptions {
  roomCode: string
  playerId: string
  sessionSecret: string | null
  onHostChanged: (hostId: string) => void
}

export function useHostFailover(initialHostId: string) {
  const hostWasOnlineRef = useRef(false)
  const hostIdRef = useRef(initialHostId)

  useEffect(() => {
    hostIdRef.current = initialHostId
  }, [initialHostId])

  const syncHostFromBroadcast = useCallback((hostId: string) => {
    hostIdRef.current = hostId
  }, [])

  const handlePresenceSync = useCallback(
    (candidateIds: string[], opts: HostFailoverOptions) => {
      const result = computeFailoverCandidate(
        hostIdRef.current,
        candidateIds,
        hostWasOnlineRef.current,
      )
      hostWasOnlineRef.current = result.hostWasOnline
      if (!result.newHostId) return

      hostIdRef.current = result.newHostId
      opts.onHostChanged(result.newHostId)

      if (result.newHostId === opts.playerId) {
        void promoteHost({
          roomCode: opts.roomCode,
          newHostId: result.newHostId,
          requesterId: opts.playerId,
          sessionSecret: opts.sessionSecret,
        })
      }
    },
    [],
  )

  return { hostIdRef, syncHostFromBroadcast, handlePresenceSync }
}
