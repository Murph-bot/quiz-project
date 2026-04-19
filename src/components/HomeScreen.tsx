'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomeScreen() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate(requireCode: boolean): boolean {
    if (!nickname.trim()) {
      setError('Please enter a nickname')
      return false
    }
    if (nickname.trim().length > 20) {
      setError('Nickname must be 20 characters or fewer')
      return false
    }
    if (requireCode && !roomCode.trim()) {
      setError('Please enter a room code')
      return false
    }
    return true
  }

  async function handleCreate() {
    if (!validate(false)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create game'); return }
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('nickname', nickname.trim())
      sessionStorage.setItem('sessionSecret', data.sessionSecret)
      router.push(`/lobby/${data.roomCode}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!validate(true)) return
    setLoading(true)
    setError('')
    const code = roomCode.trim().toUpperCase()
    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to join game'); return }
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('nickname', nickname.trim())
      sessionStorage.setItem('sessionSecret', data.sessionSecret)
      if (data.spectatorReconnect) {
        router.push(`/game/${code}`)
      } else {
        router.push(`/lobby/${code}`)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center">
          <h1 className="text-4xl font-black text-white tracking-tight">⚔️ QuizKnight</h1>
          <p className="text-white/70 text-sm mt-1">Last one standing wins</p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Your nickname"
            maxLength={20}
            value={nickname}
            onChange={e => { setNickname(e.target.value); setError('') }}
            autoComplete="nickname"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 font-bold text-base focus:outline-none focus:border-orange-400"
          />

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full py-3 disabled:opacity-50 active:scale-95 transition-transform"
          >
            🎮 Create Game
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-xs">or join</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="text"
              placeholder="Room code"
              maxLength={4}
              value={roomCode}
              onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 font-black text-base uppercase tracking-widest focus:outline-none focus:border-orange-400"
            />
            <button
              onClick={handleJoin}
              disabled={loading}
              className="bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full px-5 min-w-[80px] disabled:opacity-50 active:scale-95 transition-transform"
            >
              Join
            </button>
          </div>

          {error && (
            <p className="text-red-500 text-xs text-center font-semibold">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
