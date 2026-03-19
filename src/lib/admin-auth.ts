const ADMIN_COOKIE_NAME = 'qk_admin_token'

async function getExpectedToken(): Promise<string> {
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET env var is not set')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('admin-session'))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function signAdminToken(): Promise<string> {
  return getExpectedToken()
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const expected = await getExpectedToken()
    if (expected.length !== token.length) return false
    // constant-time comparison
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i)
    return diff === 0
  } catch { return false }
}

export { ADMIN_COOKIE_NAME }
