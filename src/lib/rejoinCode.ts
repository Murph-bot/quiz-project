// Deterministic per-player rejoin code derived from the session secret —
// no schema change needed. Mid-game reconnects must present it, so knowing
// a nickname alone is no longer enough to impersonate a player.

const REJOIN_CODE_LENGTH = 6

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function computeRejoinCode(sessionSecret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('quizknight-rejoin'))
  return toHex(new Uint8Array(sig)).slice(0, REJOIN_CODE_LENGTH).toUpperCase()
}

export function isValidRejoinCode(code: string): boolean {
  return new RegExp(`^[0-9A-F]{${REJOIN_CODE_LENGTH}}$`).test(code)
}

export function rejoinCodesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
