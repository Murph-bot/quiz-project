import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/admin/questions/[id]/route'
import { signAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

process.env.ADMIN_SECRET = 'test-admin-secret'

function request(cookie?: string) {
  return new NextRequest('http://localhost/api/admin/questions/q-1', {
    method: 'DELETE',
    headers: cookie ? { cookie } : {},
  })
}

const params = { params: Promise.resolve({ id: 'q-1' }) }

function mockDelete(result: { data: unknown; error: { code: string; message: string } | null }) {
  ;(createServerClient as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(result),
    }),
  })
}

describe('DELETE /api/admin/questions/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without an admin cookie', async () => {
    const res = await DELETE(request(), params)
    expect(res.status).toBe(401)
  })

  it('returns 409 with a reason when a played round still references the question', async () => {
    const token = await signAdminToken()
    mockDelete({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint "rounds_question_id_fkey"' },
    })

    const res = await DELETE(request(`${ADMIN_COOKIE_NAME}=${token}`), params)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/used in a played round/i)
  })

  it('returns 204 when the question is removed', async () => {
    const token = await signAdminToken()
    mockDelete({ data: [{ id: 'q-1' }], error: null })

    const res = await DELETE(request(`${ADMIN_COOKIE_NAME}=${token}`), params)
    expect(res.status).toBe(204)
  })
})
