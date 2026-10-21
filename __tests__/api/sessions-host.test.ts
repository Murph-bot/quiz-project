import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/sessions/[roomCode]/host/route'
import { createServerClient } from '@/lib/supabase-server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/realtime', () => ({ broadcastToRoom: jest.fn(() => Promise.resolve()) }))
import { broadcastToRoom } from '@/lib/realtime'

const params = (roomCode: string) => ({ params: Promise.resolve({ roomCode }) })

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/sessions/AB12/host', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeHostMock({
  session = { id: 'sess-1', host_id: 'p1' },
  requester = { id: 'p1' } as { id: string } | null,
  newHostPlayer = { id: 'p2' } as { id: string } | null,
} = {}) {
  let playerCalls = 0
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []

  const mock = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: session, error: null }),
          update: jest.fn().mockImplementation((values: Record<string, unknown>) => {
            updates.push({ table, values })
            return { eq: jest.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      playerCalls++
      if (playerCalls === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: requester, error: null }),
        }
      }
      if (playerCalls === 2) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: newHostPlayer, error: null }),
        }
      }
      return {
        update: jest.fn().mockImplementation((values: Record<string, unknown>) => {
          updates.push({ table, values })
          return { eq: jest.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }),
  }
  return { mock, updates }
}

describe('PATCH /api/sessions/[roomCode]/host', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when the host target or secret is missing', async () => {
    const res = await PATCH(makeRequest({ playerId: 'p2' }), params('AB12'))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the secret does not match the requester', async () => {
    const { mock } = makeHostMock({ requester: null })
    ;(createServerClient as jest.Mock).mockReturnValue(mock)

    const res = await PATCH(
      makeRequest({ playerId: 'p1', requesterId: 'p1', sessionSecret: 'wrong' }),
      params('AB12'),
    )
    expect(res.status).toBe(403)
  })

  it('returns 403 when a non-host tries to hand the role to someone else', async () => {
    const { mock, updates } = makeHostMock()
    ;(createServerClient as jest.Mock).mockReturnValue(mock)

    const res = await PATCH(
      makeRequest({ playerId: 'p2', requesterId: 'p3', sessionSecret: 'secret-3' }),
      params('AB12'),
    )
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('returns 403 when the new host is not in this session', async () => {
    const { mock } = makeHostMock({ newHostPlayer: null })
    ;(createServerClient as jest.Mock).mockReturnValue(mock)

    const res = await PATCH(
      makeRequest({ playerId: 'p9', requesterId: 'p1', sessionSecret: 'secret-1' }),
      params('AB12'),
    )
    expect(res.status).toBe(403)
  })

  it('moves the host to another player and broadcasts the change', async () => {
    const { mock, updates } = makeHostMock()
    ;(createServerClient as jest.Mock).mockReturnValue(mock)

    const res = await PATCH(
      makeRequest({ playerId: 'p2', requesterId: 'p1', sessionSecret: 'secret-1' }),
      params('AB12'),
    )

    expect(res.status).toBe(200)
    expect(updates).toContainEqual({ table: 'sessions', values: { host_id: 'p2' } })
    expect(broadcastToRoom).toHaveBeenCalledWith('AB12', [
      { event: 'host:changed', payload: { hostId: 'p2' } },
    ])
  })
})
