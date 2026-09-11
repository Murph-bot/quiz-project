import { DELETE } from '@/app/api/sessions/[roomCode]/players/[playerId]/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))
jest.mock('@/lib/realtime', () => ({
  broadcastToRoom: jest.fn().mockResolvedValue(undefined),
}))

import { createServerClient } from '@/lib/supabase-server'
import { broadcastToRoom } from '@/lib/realtime'

const PARAMS = Promise.resolve({ roomCode: 'AB12', playerId: 'target-1' })

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/sessions/AB12/players/target-1', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const BODY = { playerId: 'host-1', sessionSecret: 'secret-1' }

interface MockOpts {
  session?: { id: string; status: string; host_id: string } | null
  requesterIsHost?: boolean
  requesterFound?: boolean
  deletedRows?: Array<{ id: string }>
}

function mockSupabase(opts: MockOpts = {}) {
  const {
    session = { id: 'sess-1', status: 'lobby', host_id: 'host-1' },
    requesterIsHost = true,
    requesterFound = true,
    deletedRows = [{ id: 'target-1' }],
  } = opts

  let playersCalls = 0
  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'sessions') {
      const chain: Record<string, jest.Mock> = {}
      chain.select = jest.fn(() => chain)
      chain.eq = jest.fn(() => chain)
      chain.single = jest.fn().mockResolvedValue({ data: session, error: session ? null : {} })
      return chain
    }
    // players: 1st call = verifyHostPlayer, 2nd = delete
    playersCalls++
    if (playersCalls === 1) {
      const chain: Record<string, jest.Mock> = {}
      chain.select = jest.fn(() => chain)
      chain.eq = jest.fn(() => chain)
      chain.single = jest
        .fn()
        .mockResolvedValue({
          data: requesterFound ? { is_host: requesterIsHost } : null,
          error: null,
        })
      return chain
    }
    const chain: Record<string, jest.Mock> = {}
    chain.delete = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.select = jest.fn().mockResolvedValue({ data: deletedRows, error: null })
    return chain
  })

  ;(createServerClient as jest.Mock).mockReturnValue({ from })
  return { from }
}

describe('DELETE /api/sessions/[roomCode]/players/[playerId]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when credentials are missing', async () => {
    const res = await DELETE(makeRequest({}), { params: PARAMS })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the session does not exist', async () => {
    mockSupabase({ session: null })
    const res = await DELETE(makeRequest(BODY), { params: PARAMS })
    expect(res.status).toBe(404)
  })

  it('returns 409 when the game has already started', async () => {
    mockSupabase({ session: { id: 'sess-1', status: 'active', host_id: 'host-1' } })
    const res = await DELETE(makeRequest(BODY), { params: PARAMS })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already started/i)
  })

  it('returns 400 when the target is the host', async () => {
    mockSupabase()
    const params = Promise.resolve({ roomCode: 'AB12', playerId: 'host-1' })
    const res = await DELETE(makeRequest(BODY), { params })
    expect(res.status).toBe(400)
  })

  it('returns 403 for a non-host requester', async () => {
    mockSupabase({ requesterIsHost: false })
    const res = await DELETE(makeRequest(BODY), { params: PARAMS })
    expect(res.status).toBe(403)
  })

  it('returns 403 for a bad session secret', async () => {
    mockSupabase({ requesterFound: false })
    const res = await DELETE(makeRequest(BODY), { params: PARAMS })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the target player is not in the session', async () => {
    mockSupabase({ deletedRows: [] })
    const res = await DELETE(makeRequest(BODY), { params: PARAMS })
    expect(res.status).toBe(404)
  })

  it('kicks the player and broadcasts player:kicked on success', async () => {
    mockSupabase()
    const res = await DELETE(makeRequest(BODY), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kicked).toBe('target-1')
    expect(broadcastToRoom).toHaveBeenCalledWith('AB12', [
      { event: 'player:kicked', payload: { playerId: 'target-1' } },
    ])
  })
})
