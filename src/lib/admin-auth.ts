const ADMIN_COOKIE_NAME = 'qk_admin_token'

// Must match the cookie maxAge set at login.
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(message: string): Promise<string> {
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET env var is not set')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return toHex(new Uint8Array(sig))
}

/** Signs a self-expiring token: `{expMs}.{hmac(expMs.admin-session)}`. */
export async function signAdminToken(): Promise<string> {
  const exp = Date.now() + ADMIN_SESSION_TTL_MS
  const sig = await hmac(`${exp}.admin-session`)
  return `${exp}.${sig}`
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot <= 0) return false
    const expStr = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const exp = Number(expStr)
    if (!Number.isInteger(exp) || exp < Date.now()) return false

    const expected = await hmac(`${exp}.admin-session`)
    if (expected.length !== sig.length) return false
    // constant-time comparison
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
    return diff === 0
  } catch {
    return false
  }
}

export { ADMIN_COOKIE_NAME }
