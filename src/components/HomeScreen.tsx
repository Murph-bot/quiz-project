'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MuteToggle } from '@/components/ui/MuteToggle'

const inputClass =
  'w-full bg-qk-inset border border-qk-violet/30 rounded-2xl px-5 text-qk-text placeholder-qk-muted/70 font-black focus:outline-none focus:border-qk-cyan/70 focus:shadow-qk-neon-sm'

export default function HomeScreen() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [rejoinCode, setRejoinCode] = useState('')
  const [needRejoinCode, setNeedRejoinCode] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Prefill the nickname (and rejoin code) from a previous session on this browser,
  // and the room code from an invite link (?join=CODE).
  useEffect(() => {
    const timer = setTimeout(() => {
      setNickname(sessionStorage.getItem('nickname') ?? '')
      setRejoinCode(sessionStorage.getItem('rejoinCode') ?? '')
      const joinCode = new URLSearchParams(window.location.search).get('join')
      if (joinCode) setRoomCode(joinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
    }, 0)
    return () => clearTimeout(timer)
  }, [])

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
    if (loading) return
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
      if (!res.ok) {
        setError(data.error ?? 'Failed to create game')
        return
      }
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('nickname', nickname.trim())
      sessionStorage.setItem('sessionSecret', data.sessionSecret)
      sessionStorage.setItem('rejoinCode', data.rejoinCode)
      router.push(`/lobby/${data.roomCode}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (loading) return
    if (!validate(true)) return
    setLoading(true)
    setError('')
    const code = roomCode.trim().toUpperCase()
    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim(),
          rejoinCode: rejoinCode.trim().toUpperCase() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to join game')
        // The game already started — a rejoin code is needed to reconnect.
        if (data.error === 'Game already started') setNeedRejoinCode(true)
        return
      }
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('nickname', nickname.trim())
      sessionStorage.setItem('sessionSecret', data.sessionSecret)
      if (data.rejoinCode) sessionStorage.setItem('rejoinCode', data.rejoinCode)
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
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-safe pb-safe phase-enter">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center relative">
          <h1 className="text-4xl font-black text-qk-text tracking-tight">⚔️ QuizKnight</h1>
          <p className="text-qk-muted text-sm mt-1 font-medium">Last one standing wins</p>
          <MuteToggle className="absolute right-0 top-0" />
        </div>

        <Card padding="lg" className="flex flex-col gap-5 overflow-hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleCreate()
            }}
            className="flex flex-col gap-5"
          >
            <label htmlFor="nickname" className="text-sm font-bold text-qk-label uppercase tracking-wide">
              Your nickname
            </label>
            <input
              id="nickname"
              type="text"
              placeholder="Enter your name"
              maxLength={20}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value)
                setError('')
              }}
              autoComplete="nickname"
              className={`${inputClass} min-h-[64px] py-4 text-xl`}
            />
            <Button type="submit" disabled={loading} fullWidth>
              🎮 Create Game
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-qk-violet/25" />
            <span className="text-qk-muted text-xs">or join</span>
            <div className="flex-1 h-px bg-qk-violet/25" />
          </div>

          <div className="flex gap-2 w-full min-w-0">
            <label htmlFor="room-code" className="sr-only">Room code</label>
            <input
              id="room-code"
              type="text"
              inputMode="text"
              placeholder="Room code"
              maxLength={4}
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase())
                setError('')
                setNeedRejoinCode(false)
              }}
              onKeyDown={(e) => {
                // Enter in the room-code field joins (default form submit would create).
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleJoin()
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              aria-label="Room code"
              className={`${inputClass} flex-1 min-w-0 min-h-[52px] px-4 py-3 text-lg uppercase tracking-widest`}
            />
            <Button onClick={handleJoin} disabled={loading} variant="compact">
              Join
            </Button>
          </div>

          {needRejoinCode && (
            <div className="flex flex-col gap-2">
              <label htmlFor="rejoin-code" className="text-sm font-bold text-qk-label uppercase tracking-wide">
                Rejoin code
              </label>
              <input
                id="rejoin-code"
                type="text"
                placeholder="6-character code"
                maxLength={6}
                value={rejoinCode}
                onChange={(e) => {
                  setRejoinCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))
                  setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleJoin()
                  }
                }}
                autoComplete="off"
                aria-label="Rejoin code"
                className={`${inputClass} min-h-[52px] px-4 py-3 text-lg uppercase tracking-widest text-center`}
              />
              <p className="text-qk-muted text-xs">
                Shown in the lobby — needed to reconnect from a new device mid-game.
              </p>
            </div>
          )}

          {error && <p className="text-qk-danger text-xs text-center font-semibold">{error}</p>}
        </Card>
      </div>
    </div>
  )
}
