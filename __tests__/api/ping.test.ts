import { GET } from '@/app/api/ping/route'
import { createServerClient } from '@/lib/supabase-server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))

function mockQuery(error: { message: string } | null) {
  const settled = Promise.resolve({ error })
  ;(createServerClient as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          then: settled.then.bind(settled),
          catch: settled.catch.bind(settled),
        }),
      }),
    }),
  })
}

describe('GET /api/ping', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reports ok when the database answers', async () => {
    mockQuery(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('reports a failure when the database query fails', async () => {
    mockQuery({ message: 'connection refused' })
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false })
  })
})
