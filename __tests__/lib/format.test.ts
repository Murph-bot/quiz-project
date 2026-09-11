import { formatNumber } from '@/lib/format'

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(17508)).toBe('17,508')
    expect(formatNumber(1000000)).toBe('1,000,000')
  })

  it('leaves small numbers unchanged', () => {
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(7)).toBe('7')
  })

  it('handles negatives', () => {
    expect(formatNumber(-12345)).toBe('-12,345')
  })
})
