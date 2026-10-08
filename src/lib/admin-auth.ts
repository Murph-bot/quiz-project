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

    return safeEqual(sig, await hmac(`${exp}.admin-session`))
  } catch {
    return false
  }
}

/** Compares HMACs of both values so neither length nor content leaks through timing. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return safeEqual(await hmac(password), await hmac(secret))
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export { ADMIN_COOKIE_NAME }
