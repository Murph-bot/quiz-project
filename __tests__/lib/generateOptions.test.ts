import { generateOptions } from '@/lib/generateOptions'

describe('generateOptions', () => {
  describe('zero input', () => {
    it('returns [0, 1, 5] (possibly shuffled)', () => {
      const result = generateOptions(0)
      expect(result).toHaveLength(3)
      expect(result).toEqual(expect.arrayContaining([0, 1, 5]))
    })
  })

  describe('year input (1933)', () => {
    it('returns exactly 3 unique values', () => {
      const result = generateOptions(1933)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
    })

    it('all options are within 1000–2200', () => {
      // Run multiple times to cover randomness
      for (let i = 0; i < 50; i++) {
        const result = generateOptions(1933)
        for (const v of result) {
          expect(v).toBeGreaterThanOrEqual(1000)
          expect(v).toBeLessThanOrEqual(2200)
        }
      }
    })

    it('no option is more than 100 away from correct', () => {
      for (let i = 0; i < 50; i++) {
        const result = generateOptions(1933)
        for (const v of result) {
          expect(Math.abs(v - 1933)).toBeLessThanOrEqual(100)
        }
      }
    })

    it('all values are positive integers', () => {
      const result = generateOptions(1933)
      for (const v of result) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
      }
    })
  })

  describe('small input (7)', () => {
    it('returns exactly 3 unique values', () => {
      const result = generateOptions(7)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
    })

    it('all values are > 0', () => {
      for (let i = 0; i < 50; i++) {
        const result = generateOptions(7)
        for (const v of result) {
          expect(v).toBeGreaterThan(0)
        }
      }
    })

    it('all values are positive integers', () => {
      const result = generateOptions(7)
      for (const v of result) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
      }
    })
  })

  describe('large input (5000)', () => {
    it('returns exactly 3 unique values', () => {
      const result = generateOptions(5000)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
    })

    it('all values are > 0', () => {
      for (let i = 0; i < 50; i++) {
        const result = generateOptions(5000)
        for (const v of result) {
          expect(v).toBeGreaterThan(0)
        }
      }
    })

    it('outlier is noticeably different from correct', () => {
      // Run many times — at least one outlier should be >=30% off
      const deltas = Array.from({ length: 50 }, () => {
        const result = generateOptions(5000)
        // The outlier is the value farthest from 5000
        return Math.max(...result.map(v => Math.abs(v - 5000)))
      })
      // Every run should produce a max delta of at least 30% (1500)
      for (const d of deltas) {
        expect(d).toBeGreaterThanOrEqual(1500)
      }
    })
  })

  describe('medium input (500)', () => {
    it('returns exactly 3 unique values', () => {
      const result = generateOptions(500)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
    })

    it('all values are > 0', () => {
      for (let i = 0; i < 50; i++) {
        const result = generateOptions(500)
        for (const v of result) {
          expect(v).toBeGreaterThan(0)
        }
      }
    })
  })
})
