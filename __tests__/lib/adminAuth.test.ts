import { signAdminToken, verifyAdminToken } from '@/lib/admin-auth'

describe('admin-auth', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.restoreAllMocks()
    process.env = { ...OLD_ENV, ADMIN_SECRET: 'test-secret' }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it('signs a token that verifies', async () => {
    const token = await signAdminToken()
    expect(token).toContain('.')
    await expect(verifyAdminToken(token)).resolves.toBe(true)
  })

  it('rejects a tampered token', async () => {
    const token = await signAdminToken()
    const dot = token.lastIndexOf('.')
    const tampered = token.slice(0, dot) + '.00' + token.slice(dot + 1).slice(2)
    await expect(verifyAdminToken(tampered)).resolves.toBe(false)
  })

  it('rejects malformed tokens', async () => {
    await expect(verifyAdminToken('garbage')).resolves.toBe(false)
    await expect(verifyAdminToken('')).resolves.toBe(false)
    await expect(verifyAdminToken('123.nothex')).resolves.toBe(false)
  })

  it('rejects a token whose expiry has passed', async () => {
    const realNow = Date.now
    const base = 1_700_000_000_000
    jest.spyOn(Date, 'now').mockReturnValue(base)
    const token = await signAdminToken()

    // verify before expiry
    await expect(verifyAdminToken(token)).resolves.toBe(true)

    // advance beyond the 24h TTL
    jest.spyOn(Date, 'now').mockReturnValue(base + 24 * 60 * 60 * 1000 + 1)
    await expect(verifyAdminToken(token)).resolves.toBe(false)
    Date.now = realNow
  })

  it('treats a token from a different secret as invalid', async () => {
    const token = await signAdminToken()
    process.env = { ...OLD_ENV, ADMIN_SECRET: 'other-secret' }
    await expect(verifyAdminToken(token)).resolves.toBe(false)
  })
})
