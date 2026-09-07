import { computeRejoinCode, isValidRejoinCode, rejoinCodesMatch } from '@/lib/rejoinCode'

describe('rejoinCode', () => {
  it('derives a deterministic 6-char uppercase hex code from a secret', async () => {
    const a = await computeRejoinCode('secret-1')
    const b = await computeRejoinCode('secret-1')
    expect(a).toMatch(/^[0-9A-F]{6}$/)
    expect(a).toBe(b)
  })

  it('produces different codes for different secrets', async () => {
    const a = await computeRejoinCode('secret-1')
    const b = await computeRejoinCode('secret-2')
    expect(a).not.toBe(b)
  })

  it('validates code shape', () => {
    expect(isValidRejoinCode('A1B2C3')).toBe(true)
    expect(isValidRejoinCode('a1b2c3')).toBe(false) // lowercase rejected at the boundary
    expect(isValidRejoinCode('ABC')).toBe(false)
    expect(isValidRejoinCode('ABCXYZ')).toBe(false) // non-hex
    expect(isValidRejoinCode('')).toBe(false)
  })

  it('compares codes in constant time and rejects length mismatch', () => {
    expect(rejoinCodesMatch('A1B2C3', 'A1B2C3')).toBe(true)
    expect(rejoinCodesMatch('A1B2C3', 'A1B2C4')).toBe(false)
    expect(rejoinCodesMatch('A1B2C3', 'A1B2C')).toBe(false)
  })
})
