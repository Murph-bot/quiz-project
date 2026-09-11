import { generateRoomCode, isValidRoomCode } from '@/lib/roomCode'

describe('generateRoomCode', () => {
  it('returns a 4-character string', () => {
    expect(generateRoomCode()).toHaveLength(4)
  })

  it('only contains uppercase letters and digits', () => {
    const code = generateRoomCode()
    expect(code).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('generates different codes on repeated calls', () => {
    const codes = new Set(Array.from({ length: 20 }, generateRoomCode))
    expect(codes.size).toBeGreaterThan(1)
  })

  it('never contains ambiguous characters (I, O, 0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).not.toMatch(/[IO01]/)
    }
  })
})

describe('isValidRoomCode', () => {
  it('accepts a valid 4-char uppercase code', () => {
    expect(isValidRoomCode('AB12')).toBe(true)
  })

  it('rejects lowercase', () => {
    expect(isValidRoomCode('ab12')).toBe(false)
  })

  it('rejects codes shorter than 4 chars', () => {
    expect(isValidRoomCode('AB1')).toBe(false)
  })

  it('rejects codes longer than 4 chars', () => {
    expect(isValidRoomCode('AB123')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidRoomCode('')).toBe(false)
  })

  it('rejects special characters', () => {
    expect(isValidRoomCode('AB!@')).toBe(false)
  })
})
