import { POST } from '@/app/api/sessions/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => true),
  clientKey: jest.fn(() => 'test'),
}))

import { createServerClient } from '@/lib/supabase-server'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/sessions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 if nickname is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 if nickname is empty', async () => {
    const res = await POST(makeRequest({ nickname: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if nickname exceeds 20 chars', async () => {
    const res = await POST(makeRequest({ nickname: 'a'.repeat(21) }))
    expect(res.status).toBe(400)
  })

  it('creates session and returns roomCode and playerId on success', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ error: null })
    const mockSelect = jest.fn().mockReturnThis()
    const mockEq = jest.fn().mockReturnThis()
    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'sess-uuid' }, error: null })
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
            select: mockSelect,
            eq: mockEq,
            single: mockSingle,
          }
        }
        return { insert: mockInsert }
      }),
    })

    const res = await POST(makeRequest({ nickname: 'SirAnswers' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toHaveProperty('roomCode')
    expect(body).toHaveProperty('playerId')
    expect(body).toHaveProperty('sessionSecret')
    expect(body.roomCode).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('returns 500 if Supabase session insert fails', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      }),
    })

    const res = await POST(makeRequest({ nickname: 'SirAnswers' }))
    expect(res.status).toBe(500)
  })

  it('returns 500 if player insert fails after session is created', async () => {
    let callCount = 0
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          callCount++
          if (callCount === 1) {
            // First call: insert succeeds
            return { insert: jest.fn().mockResolvedValue({ error: null }) }
          }
          // Second call: select returns session id
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'sess-uuid' }, error: null }),
          }
        }
        // players insert fails
        return { insert: jest.fn().mockResolvedValue({ error: { message: 'player insert failed' } }) }
      }),
    })

    const res = await POST(makeRequest({ nickname: 'SirAnswers' }))
    expect(res.status).toBe(500)
  })
})
