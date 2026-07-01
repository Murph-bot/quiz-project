const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateRoomCode(): string {
  return Array.from(
    { length: 4 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('')
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code)
}

/** Normalize URL param to canonical uppercase room code, or null if invalid. */
export function normalizeRoomCode(raw: string): string | null {
  const roomCode = raw.toUpperCase()
  return isValidRoomCode(roomCode) ? roomCode : null
}
