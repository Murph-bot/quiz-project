jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

const cookieSet = jest.fn()
const mockHeaders = { get: jest.fn<string | null, [string]>(() => null) }
jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve(mockHeaders)),
  cookies: jest.fn(() => Promise.resolve({ set: cookieSet })),
}))

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))

import { loginAction } from '@/app/admin/login/action'
import { createServerClient } from '@/lib/supabase-server'

function formWithPassword(password: string) {
  const fd = new FormData()
  fd.set('password', password)
  return fd
}

async function runAction(fd: FormData) {
  try {
    await loginAction(fd)
    return null
  } catch (err) {
    const msg = (err as Error).message
    return msg.startsWith('REDIRECT:') ? msg.slice('REDIRECT:'.length) : null
  }
}

describe('admin loginAction', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...OLD_ENV, ADMIN_SECRET: 'correct-password' }
    mockHeaders.get.mockImplementation(() => null)
    ;(createServerClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
    })
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it('does not key the rate limit on the client-controlled leftmost X-Forwarded-For hop', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    ;(createServerClient as jest.Mock).mockReturnValue({ rpc })
    mockHeaders.get.mockImplementation((name: string) =>
      name === 'x-forwarded-for' ? 'attacker-chosen-value, 5.6.7.8' : null,
    )

    await runAction(formWithPassword('wrong'))

    // The real connecting IP is the rightmost hop; the limiter must key on
    // that, not on whatever the client put in the leftmost position.
    expect(rpc).toHaveBeenCalledWith(
      'increment_rate_limit',
      expect.objectContaining({ p_key: 'admin-login:5.6.7.8' }),
    )
  })

  it('rejects an incorrect password', async () => {
    const target = await runAction(formWithPassword('wrong-password'))
    expect(target).toBe('/admin/login?error=1')
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('accepts the correct password and sets the session cookie', async () => {
    const target = await runAction(formWithPassword('correct-password'))
    expect(target).toBe('/admin')
    expect(cookieSet).toHaveBeenCalled()
  })

  it('redirects with error=2 when the rate limit is exceeded', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
    })
    const target = await runAction(formWithPassword('correct-password'))
    expect(target).toBe('/admin/login?error=2')
    expect(cookieSet).not.toHaveBeenCalled()
  })
})
