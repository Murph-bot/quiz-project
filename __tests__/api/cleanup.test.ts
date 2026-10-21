import { NextRequest } from 'next/server'
import { POST } from '@/app/api/cleanup/route'
import { createServerClient } from '@/lib/supabase-server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))

process.env.CLEANUP_SECRET = 'cleanup-secret'
delete process.env.CRON_SECRET

function request(authorization?: string) {
  return new NextRequest('http://localhost/api/cleanup', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

function mockDelete(result: { data: unknown; error: { message: string } | null }) {
  const lt = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(result) })
  const deleteFn = jest.fn().mockReturnValue({ lt })
  ;(createServerClient as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({ delete: deleteFn }),
  })
  return { lt, deleteFn }
}

describe('POST /api/cleanup', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without a bearer secret', async () => {
    const res = await POST(request())
    expect(res.status).toBe(401)
  })

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(request('Bearer nope'))
    expect(res.status).toBe(401)
  })

  it('deletes sessions created more than 24 hours ago', async () => {
    const { lt } = mockDelete({ data: [{ id: 's1' }, { id: 's2' }], error: null })

    const res = await POST(request('Bearer cleanup-secret'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
    expect(lt).toHaveBeenCalledTimes(1)
    const [column, cutoff] = lt.mock.calls[0] as [string, string]
    expect(column).toBe('created_at')
    expect(Date.now() - new Date(cutoff).getTime()).toBeGreaterThanOrEqual(23.9 * 60 * 60 * 1000)
    expect(Date.now() - new Date(cutoff).getTime()).toBeLessThanOrEqual(24.1 * 60 * 60 * 1000)
  })

  it('returns 500 when the delete fails', async () => {
    mockDelete({ data: null, error: { message: 'connection reset' } })

    const res = await POST(request('Bearer cleanup-secret'))
    expect(res.status).toBe(500)
  })
})
