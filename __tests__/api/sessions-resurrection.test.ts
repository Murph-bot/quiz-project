import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/sessions/[roomCode]/resurrection/route'
import { createServerClient } from '@/lib/supabase-server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))

const params = (roomCode: string) => ({ params: Promise.resolve({ roomCode }) })

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/sessions/AB12/resurrection', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMock({ isHost = true, updateError = null as null | { message: string } } = {}) {
  const updates: Record<string, unknown>[] = []
  const mock = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'sess-1' }, error: null }),
          update: jest.fn().mockImplementation((values: Record<string, unknown>) => {
            updates.push(values)
            return { eq: jest.fn().mockResolvedValue({ error: updateError }) }
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: isHost ? { is_host: true } : { is_host: false }, error: null }),
      }
    }),
  }
  return { mock, updates }
}

describe('PATCH /api/sessions/[roomCode]/resurrection', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for an interval that is not offered in the lobby', async () => {
    const res = await PATCH(
      makeRequest({ resurrectionInterval: 4, playerId: 'p1', sessionSecret: 'secret-1' }),
      params('AB12'),
    )
    expect(res.status).toBe(400)
  })

  it('returns 403 when a non-host changes the setting', async () => {
    const { mock, updates } = makeMock({ isHost: false })
    ;(createServerClient as jest.Mock).mockReturnValue(mock)

    const res = await PATCH(
      makeRequest({ resurrectionInterval: 3, playerId: 'p2', sessionSecret: 'secret-2' }),
      params('AB12'),
    )
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('saves the interval for the host', async () => {
    const { mock, updates } = makeMock()
    ;(createServerClient as jest.Mock).mockReturnValue(mock)

    const res = await PATCH(
      makeRequest({ resurrectionInterval: 7, playerId: 'p1', sessionSecret: 'secret-1' }),
      params('AB12'),
    )

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ resurrection_interval: 7 }])
  })
})
