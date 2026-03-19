'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PlayerList from '@/components/PlayerList'
import type { Session, PresencePlayer } from '@/types'

const VALID_CATEGORIES = [
  'all',
  'geography',
  'nature',
  'animals',
  'music industry',
  'nations',
  'popular products',
  'popular tools',
  'history',
  'music instruments',
  'sodas',
  'alcoholic drinks',
  'pop culture',
  'movies',
  'formula 1',
  'food & drink',
  'technology',
  '00s nostalgia',
]
const MIN_PLAYERS = 3
const RESURRECTION_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 3, label: 'Every 3rd round' },
  { value: 5, label: 'Every 5th round' },
  { value: 7, label: 'Every 7th round' },
  { value: 10, label: 'Every 10th round' },
]

interface Props {
  roomCode: string
  initialSession: Session
}

export default function LobbyScreen({ roomCode, initialSession }: Props) {
  const router = useRouter()
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [category, setCategory] = useState(initialSession.category)
  const [resurrectionInterval, setResurrectionInterval] = useState(initialSession.resurrection_interval ?? 5)
  const [starting, setStarting] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const nickname = typeof window !== 'undefined' ? sessionStorage.getItem('nickname') : null
  const isHost = playerId !== null && initialSession.host_id === playerId

  useEffect(() => {
    if (!playerId || !nickname) {
      router.push('/')
      return
    }

    const channel = supabase.channel(`room:${roomCode}`)
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePlayer>()
        const list = Object.values(state).flat()
        setPlayers(list)
      })
      .on('broadcast', { event: 'game:started' }, () => {
        // Layer 3: navigate to game screen (404 until Layer 3 is built)
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
  }, [roomCode, playerId, nickname, initialSession.host_id, router])

  async function handleCategoryChange(newCategory: string) {
    const previousCategory = category
    setCategory(newCategory) // optimistic update
    const res = await fetch(`/api/sessions/${roomCode}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory, playerId }),
    })
    if (!res.ok) {
      setCategory(previousCategory) // roll back on failure
    }
  }

  async function handleResurrectionChange(value: number) {
    const previous = resurrectionInterval
    setResurrectionInterval(value)
    const res = await fetch(`/api/sessions/${roomCode}/resurrection`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resurrectionInterval: value, playerId }),
    })
    if (!res.ok) setResurrectionInterval(previous)
  }

  async function handleStart() {
    if (players.length < MIN_PLAYERS || !isHost || !playerId) return
    setStarting(true)
    const res = await fetch(`/api/sessions/${roomCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })
    if (!res.ok) {
      setStarting(false)
      return
    }
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:started',
      payload: {},
    })
    // Host won't receive its own broadcast — navigate directly
    router.push(`/game/${roomCode}`)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">⚔️ QuizKnight</h1>
        </div>

        {/* Room code — directly on gradient, no card */}
        <div className="text-center">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Room Code</p>
          <p className="text-white text-5xl font-black tracking-[0.3em]">{roomCode}</p>
          <p className="text-white/50 text-xs mt-2">Share this code with friends</p>
        </div>

        {/* Player list */}
        <PlayerList players={players} />

        {/* Category selector (host only) */}
        {isHost && (
          <div className="flex flex-col gap-2">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Category</p>
            <div className="bg-white rounded-2xl shadow-md px-4 py-1">
              <select
                value={category}
                onChange={e => handleCategoryChange(e.target.value)}
                className="bg-transparent border-none text-gray-900 font-bold text-sm focus:outline-none capitalize w-full py-2"
              >
                {VALID_CATEGORIES.map(c => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Resurrection interval (host only) */}
        {isHost && (
          <div className="flex flex-col gap-2">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Resurrection</p>
            <div className="bg-white rounded-2xl shadow-md px-4 py-1">
              <select
                value={resurrectionInterval}
                onChange={e => handleResurrectionChange(Number(e.target.value))}
                className="bg-transparent border-none text-gray-900 font-bold text-sm focus:outline-none w-full py-2"
              >
                {RESURRECTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Start / waiting */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={players.length < MIN_PLAYERS || starting}
            className="w-full bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full py-4 disabled:opacity-40 active:scale-95 transition-transform"
          >
            {players.length < MIN_PLAYERS
              ? `Need ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length > 1 ? 's' : ''}`
              : starting ? 'Starting...' : '🚀 Start Game'}
          </button>
        ) : (
          <p className="text-center text-white/60 text-sm">Waiting for host to start...</p>
        )}
      </div>
    </div>
  )
}
