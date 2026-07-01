'use client'

import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useHostFailover } from '@/hooks/useHostFailover'
import type { BracketState } from '@/types'

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
  channelRef: MutableRefObject<RealtimeChannel | null>
  roundIdRef: MutableRefObject<string>
  currentHostIdRef: MutableRefObject<string>
  isSpectatingRef: MutableRefObject<boolean>
  roundClosedRef: MutableRefObject<boolean>
  allAnsweredConfirmedRef: MutableRefObject<boolean>
  graceTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  setCurrentHostId: (id: string) => void
  onRoundClosed: (payload: Record<string, unknown>) => void
  onRoundStarted: (payload: Record<string, unknown>) => void
  onGameOver: () => void
  onBracketReady: (bracket: BracketState) => void
  onMatchPoint: (wins: [number, number], bracket: BracketState) => void
  onMatchComplete: (payload: Record<string, unknown>) => void
  onTieReplay: (payload: Record<string, unknown>) => void
  onFinalReady: (payload: Record<string, unknown>) => void
  onTiebreakStarted: (payload: Record<string, unknown>) => void
  onRoundAnswered: (playerId: string) => void
  onGraceStarted: (graceDeadlineMs: number) => void
  onAllAnswered: () => void
  onGameExhausted: () => void
  attemptClose: () => void
}

export function useGameRoomEvents(config: GameRoomEventsConfig) {
  const configRef = useRef(config)
  configRef.current = config

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
      .on('broadcast', { event: 'game:over' }, () => {
        configRef.current.onGameOver()
      })
      .on('broadcast', { event: 'bracket:ready' }, ({ payload }) => {
        configRef.current.onBracketReady(payload.bracket as BracketState)
      })
      .on('broadcast', { event: 'match:point' }, ({ payload }) => {
        configRef.current.onMatchPoint(payload.wins as [number, number], payload.bracket as BracketState)
      })
      .on('broadcast', { event: 'match:complete' }, ({ payload }) => {
        configRef.current.onMatchComplete(payload as Record<string, unknown>)
      })
      .on('broadcast', { event: 'tie:replay' }, ({ payload }) => {
        configRef.current.onTieReplay(payload as Record<string, unknown>)
      })
      .on('broadcast', { event: 'final:ready' }, ({ payload }) => {
        configRef.current.onFinalReady(payload as Record<string, unknown>)
      })
      .on('broadcast', { event: 'tiebreak:started' }, ({ payload }) => {
        configRef.current.onTiebreakStarted(payload as Record<string, unknown>)
      })
      .on('broadcast', { event: 'round:answered' }, ({ payload }) => {
        if (payload.roundId !== configRef.current.roundIdRef.current) return
        if (payload.playerId) configRef.current.onRoundAnswered(payload.playerId as string)
      })
      .on('broadcast', { event: 'grace:started' }, ({ payload }) => {
        if (payload.roundId !== configRef.current.roundIdRef.current) return
        configRef.current.onGraceStarted(payload.graceDeadlineMs as number)
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
        syncHostFromBroadcast(hostId)
        configRef.current.setCurrentHostId(hostId)
        configRef.current.currentHostIdRef.current = hostId
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
          channel,
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

    configRef.current.channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
    }
  }, [config.roomCode, config.playerId, config.ready, config.initialHostId, handlePresenceSync, syncHostFromBroadcast])
}
