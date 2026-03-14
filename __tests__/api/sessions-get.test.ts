import { GET } from '@/app/api/sessions/[roomCode]/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}`)
}

const mockSession = { id: 'sess-1', room_code: 'AB12', status: 'lobby', category: 'all' }
const mockPlayers = [{ id: 'p1', nickname: 'Alice', is_host: true }]

describe('GET /api/sessions/[roomCode]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid room code', async () => {
    const res = await GET(makeRequest('bad!'), { params: Promise.resolve({ roomCode: 'bad!' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 if session not found', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    })

    const res = await GET(makeRequest('AB12'), { params: Promise.resolve({ roomCode: 'AB12' }) })
    expect(res.status).toBe(404)
  })

  it('returns session and players on success', async () => {
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: mockPlayers, error: null }),
        }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await GET(makeRequest('AB12'), { params: Promise.resolve({ roomCode: 'AB12' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('session')
    expect(body).toHaveProperty('players')
  })
})
