import { broadcastToRoom } from '@/lib/realtime'

const originalEnv = process.env

describe('broadcastToRoom', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('posts messages to the realtime broadcast endpoint', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))

    await broadcastToRoom('AB12', [
      { event: 'round:closed', payload: { correctAnswer: 42 } },
      { event: 'game:exhausted', payload: {} },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.supabase.co/realtime/v1/api/broadcast')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).apikey).toBe('service-key')
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([
      { topic: 'room:AB12', event: 'round:closed', payload: { correctAnswer: 42 } },
      { topic: 'room:AB12', event: 'game:exhausted', payload: {} },
    ])
  })

  it('does nothing without env config or events', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')

    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await broadcastToRoom('AB12', [{ event: 'x', payload: {} }])
    expect(fetchMock).not.toHaveBeenCalled()

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    await broadcastToRoom('AB12', [])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows network errors (best-effort fanout)', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      broadcastToRoom('AB12', [{ event: 'x', payload: {} }]),
    ).resolves.toBeUndefined()
  })

  it('logs but does not throw on non-OK responses', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('bad', { status: 500 }))
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      broadcastToRoom('AB12', [{ event: 'x', payload: {} }]),
    ).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
  })
})
