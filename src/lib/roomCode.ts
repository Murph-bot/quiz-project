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
