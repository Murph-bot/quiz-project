'use client'

import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { supabase } from '@/lib/supabase'
import { useHostFailover } from '@/hooks/useHostFailover'

interface PresenceEntry {
  playerId: string
  isAlive?: boolean
}

export interface GameRoomEventsConfig {
  roomCode: string
  playerId: string
  sessionSecret: string | null
  ready: boolean
  initialHostId: string
  roundIdRef: MutableRefObject<string>
  currentHostIdRef: MutableRefObject<string>
  isSpectatingRef: MutableRefObject<boolean>
  roundClosedRef: MutableRefObject<boolean>
  allAnsweredConfirmedRef: MutableRefObject<boolean>
  graceTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  setCurrentHostId: (id: string) => void
  /** Authoritative close result broadcast by the server after a round closes. */
  onRoundClosed: (payload: Record<string, unknown>) => void
  /** Authoritative round/bracket-start payload broadcast by the server. */
  onRoundStarted: (payload: Record<string, unknown>) => void
  onRoundAnswered: (playerId: string) => void
  onAllAnswered: () => void
  onGameExhausted: () => void
  attemptClose: () => void
}

export function useGameRoomEvents(config: GameRoomEventsConfig) {
  // Keep the latest config available to broadcast callbacks without
  // resubscribing the channel on every render.
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  })

  const { syncHostFromBroadcast, handlePresenceSync } = useHostFailover(config.initialHostId)

  useEffect(() => {
    if (!config.ready || !config.playerId) return

    const channel = supabase
      .channel(`room:${config.roomCode}`)
      .on('broadcast', { event: 'round:closed' }, ({ payload }) => {
        configRef.current.onRoundClosed(payload as Record<string, unknown>)
      })
      .on('broadcast', { event: 'round:started' }, ({ payload }) => {
        configRef.current.onRoundStarted(payload as Record<string, unknown>)
      })
      .on('broadcast', { event: 'round:answered' }, ({ payload }) => {
        if (payload.roundId !== configRef.current.roundIdRef.current) return
        if (payload.playerId) configRef.current.onRoundAnswered(payload.playerId as string)
      })
      .on('broadcast', { event: 'all:answered' }, ({ payload }) => {
        if (payload.roundId !== configRef.current.roundIdRef.current) return
        configRef.current.allAnsweredConfirmedRef.current = true
        if (configRef.current.roundClosedRef.current) return
        if (configRef.current.graceTimeoutRef.current) {
          clearTimeout(configRef.current.graceTimeoutRef.current)
          configRef.current.graceTimeoutRef.current = null
        }
        configRef.current.onAllAnswered()
        configRef.current.attemptClose()
      })
      .on('broadcast', { event: 'host:changed' }, ({ payload }) => {
        const hostId = payload.hostId as string
        // Verify against the server — broadcasts are hints, not truth.
        fetch(`/api/sessions/${configRef.current.roomCode}`)
          .then((r) => r.json())
          .then((d) => {
            if (d?.session?.host_id !== hostId) return
            syncHostFromBroadcast(hostId)
            configRef.current.setCurrentHostId(hostId)
            configRef.current.currentHostIdRef.current = hostId
          })
          .catch((err) => console.error('[host:changed] verify failed:', err))
      })
      .on('broadcast', { event: 'game:exhausted' }, () => {
        configRef.current.onGameExhausted()
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceEntry>()
        const entries = Object.values(state).flat()
        if (entries.length === 0) return
        const aliveEntries = entries.filter((p) => p.isAlive !== false)
        const candidates = aliveEntries.length > 0 ? aliveEntries : entries
        const candidateIds = candidates.map((p) => p.playerId)

        handlePresenceSync(candidateIds, {
          roomCode: configRef.current.roomCode,
          playerId: configRef.current.playerId,
          sessionSecret: configRef.current.sessionSecret,
          onHostChanged: (hostId) => {
            syncHostFromBroadcast(hostId)
            configRef.current.setCurrentHostId(hostId)
            configRef.current.currentHostIdRef.current = hostId
          },
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && configRef.current.playerId) {
          await channel.track({
            playerId: configRef.current.playerId,
            isAlive: !configRef.current.isSpectatingRef.current,
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [config.roomCode, config.playerId, config.ready, config.initialHostId, handlePresenceSync, syncHostFromBroadcast])
}
