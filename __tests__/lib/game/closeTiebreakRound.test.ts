import { resolveTiebreakRound } from '@/lib/game/closeTiebreak'
import type { Round, Session } from '@/types'

const session = { id: 'sess-1', category: 'all', phase: 'normal' } as Session
const round = { id: 'round-2', tiebreak_players: ['p1', 'p2'] } as unknown as Round

function ranked(playerId: string, value: number) {
  return {
    playerId,
    nickname: playerId,
    value,
    delta: Math.abs(value - 100),
    noAnswer: false,
  }
}

/** Any database call in these cases is a bug, so the stub refuses them. */
const untouchable = {
  from: () => {
    throw new Error('unexpected database call')
  },
} as never

describe('resolveTiebreakRound', () => {
  it('resolves with no elimination when every tiebreak participant is exactly right', async () => {
    const res = await resolveTiebreakRound({
      supabase: untouchable,
      session,
      round,
      roundId: 'round-2',
      correctAnswer: 100,
      answers: [ranked('p1', 100), ranked('p2', 100)],
      activeList: [
        { id: 'p1', nickname: 'p1' },
        { id: 'p2', nickname: 'p2' },
      ],
    })

    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body.eliminated).toEqual([])
    expect(body.tiebreakNeeded).toBe(false)
    expect(body.aliveCount).toBe(2)
  })
})
