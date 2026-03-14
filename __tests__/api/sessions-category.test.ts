import { PATCH } from '@/app/api/sessions/[roomCode]/category/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/category`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PATCH /api/sessions/[roomCode]/category', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid category', async () => {
    const res = await PATCH(makeRequest('AB12', { category: 'invalid', playerId: 'p1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await PATCH(makeRequest('AB12', { category: 'all' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 403 if player is not the host', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { is_host: false }, error: null }),
      }),
    })

    const res = await PATCH(makeRequest('AB12', { category: 'all', playerId: 'p1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 200 on successful category update', async () => {
    const mockUpdate = jest.fn().mockReturnThis()
    const mockEq = jest.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'players') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
          }
        }
        return { update: mockUpdate, eq: mockEq }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await PATCH(makeRequest('AB12', { category: 'history', playerId: 'p1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(200)
  })
})
