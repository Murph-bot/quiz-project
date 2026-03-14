'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PlayerList from '@/components/PlayerList'
import type { Session, PresencePlayer } from '@/types'

const VALID_CATEGORIES = ['all', 'history', 'science', 'money', 'geography', 'sports']
const MIN_PLAYERS = 3

interface Props {
  roomCode: string
  initialSession: Session
}

export default function LobbyScreen({ roomCode, initialSession }: Props) {
  const router = useRouter()
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [category, setCategory] = useState(initialSession.category)
  const [starting, setStarting] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const nickname = typeof window !== 'undefined' ? sessionStorage.getItem('nickname') : null
  const isHost = players.find(p => p.playerId === playerId)?.isHost ?? false

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
      .on('broadcast', { event: 'game:start' }, () => {
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

  async function handleStart() {
    if (players.length < MIN_PLAYERS || !isHost) return
    setStarting(true)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:start',
      payload: {},
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">⚔️ QuizKnight</h1>
        </div>

        {/* Room code (hero) */}
        <div className="text-center bg-white/15 backdrop-blur border border-white/30 rounded-2xl py-5">
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
            <select
              value={category}
              onChange={e => handleCategoryChange(e.target.value)}
              className="bg-white/20 border border-white/40 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none capitalize"
            >
              {VALID_CATEGORIES.map(c => (
                <option key={c} value={c} className="text-purple-900 capitalize">{c}</option>
              ))}
            </select>
          </div>
        )}

        {/* Start / waiting */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={players.length < MIN_PLAYERS || starting}
            className="w-full bg-white text-purple-700 font-black text-sm rounded-full py-4 disabled:opacity-40 active:scale-95 transition-transform"
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
