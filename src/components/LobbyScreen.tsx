'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canonicalCategory, VALID_CATEGORIES } from '@/lib/categories'
import { useHostFailover } from '@/hooks/useHostFailover'
import { usePlayerSession } from '@/hooks/usePlayerSession'
import { useSessionStatusPoll } from '@/hooks/useSessionStatusPoll'
import PlayerList from '@/components/PlayerList'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/ui/LoadingState'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { Session, PresencePlayer } from '@/types'

const MIN_PLAYERS = 3
const POLL_NAVIGATE_STATUSES: Array<'active' | 'finished'> = ['active', 'finished']
const RESURRECTION_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 3, label: 'Every 3rd round' },
  { value: 5, label: 'Every 5th round' },
  { value: 7, label: 'Every 7th round' },
  { value: 10, label: 'Every 10th round' },
]

const selectClass =
  'bg-transparent border-none text-qk-text font-bold text-sm focus:outline-none w-full min-h-[44px] py-2'

interface Props {
  roomCode: string
  initialSession: Session
}

export default function LobbyScreen({ roomCode, initialSession }: Props) {
  const router = useRouter()
  const { playerId, nickname, sessionSecret, ready } = usePlayerSession()
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [category, setCategory] = useState(
    canonicalCategory(initialSession.category) ?? 'all',
  )
  const [resurrectionInterval, setResurrectionInterval] = useState(initialSession.resurrection_interval ?? 5)
  const [starting, setStarting] = useState(false)

  const [currentHostId, setCurrentHostId] = useState(initialSession.host_id)
  const isHost = playerId !== null && currentHostId === playerId
  const { syncHostFromBroadcast, handlePresenceSync } = useHostFailover(initialSession.host_id)

  useSessionStatusPoll({
    roomCode,
    enabled: ready,
    navigateOn: POLL_NAVIGATE_STATUSES,
  })

  useEffect(() => {
    if (!ready) return
    if (!playerId || !nickname) {
      router.push('/')
      return
    }

    const channel = supabase.channel(`room:${roomCode}`)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePlayer>()
        const list = Object.values(state).flat()
        setPlayers(list)

        const onlineIds = list.map((p) => p.playerId).filter(Boolean)
        handlePresenceSync(onlineIds, {
          roomCode,
          playerId,
          sessionSecret,
          onHostChanged: (hostId) => {
            syncHostFromBroadcast(hostId)
            setCurrentHostId(hostId)
          },
        })
      })
      .on('broadcast', { event: 'host:changed' }, ({ payload }) => {
        // Verify against the server — broadcasts are hints, not truth.
        fetch(`/api/sessions/${roomCode}`)
          .then((r) => r.json())
          .then((d) => {
            if (d?.session?.host_id !== payload.hostId) return
            syncHostFromBroadcast(payload.hostId)
            setCurrentHostId(payload.hostId)
          })
          .catch((err) => console.error('[host:changed] verify failed:', err))
      })
      .on('broadcast', { event: 'game:started' }, () => {
        router.push(`/game/${roomCode}`)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            playerId,
            nickname,
            isHost: initialSession.host_id === playerId,
          })
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [
    roomCode,
    playerId,
    nickname,
    initialSession.host_id,
    router,
    ready,
    sessionSecret,
    handlePresenceSync,
    syncHostFromBroadcast,
  ])

  if (!ready) {
    return <LoadingState message="Loading lobby..." />
  }

  async function handleCategoryChange(newCategory: string) {
    const next = canonicalCategory(newCategory)
    if (!next) return
    const previousCategory = category
    setCategory(next)
    const res = await fetch(`/api/sessions/${roomCode}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: next, playerId, sessionSecret }),
    })
    if (!res.ok) {
      setCategory(previousCategory)
    }
  }

  async function handleResurrectionChange(value: number) {
    const previous = resurrectionInterval
    setResurrectionInterval(value)
    const res = await fetch(`/api/sessions/${roomCode}/resurrection`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resurrectionInterval: value, playerId, sessionSecret }),
    })
    if (!res.ok) setResurrectionInterval(previous)
  }

  async function handleStart() {
    if (players.length < MIN_PLAYERS || !isHost || !playerId) return
    setStarting(true)
    const res = await fetch(`/api/sessions/${roomCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, sessionSecret }),
    })
    if (!res.ok) {
      setStarting(false)
      return
    }
    // The server broadcasts game:started to the room on success.
    router.push(`/game/${roomCode}`)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe phase-enter">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-black text-qk-text">⚔️ QuizKnight</h1>
        </div>

        <div className="text-center">
          <SectionLabel className="mb-1">Room Code</SectionLabel>
          <p className="text-qk-cyan text-5xl font-black tracking-[0.3em]">{roomCode}</p>
          <p className="text-qk-muted text-xs mt-2">Share this code with friends</p>
        </div>

        <PlayerList players={players} />

        {isHost && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Category</SectionLabel>
            <Card padding="sm">
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                aria-label="Category"
                className={`${selectClass} capitalize`}
              >
                {VALID_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize bg-qk-field text-qk-text">
                    {c}
                  </option>
                ))}
              </select>
            </Card>
          </div>
        )}

        {isHost && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Resurrection</SectionLabel>
            <Card padding="sm">
              <select
                value={resurrectionInterval}
                onChange={(e) => handleResurrectionChange(Number(e.target.value))}
                aria-label="Resurrection"
                className={selectClass}
              >
                {RESURRECTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-qk-field text-qk-text">
                    {o.label}
                  </option>
                ))}
              </select>
            </Card>
          </div>
        )}

        {isHost ? (
          <Button
            onClick={handleStart}
            disabled={players.length < MIN_PLAYERS || starting}
            fullWidth
          >
            {players.length < MIN_PLAYERS
              ? `Need ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length > 1 ? 's' : ''}`
              : starting
                ? 'Starting...'
                : '🚀 Start Game'}
          </Button>
        ) : (
          <p className="text-center text-qk-muted text-sm">Waiting for host to start...</p>
        )}
      </div>
    </div>
  )
}
