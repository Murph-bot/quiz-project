import { generateOptions } from '@/lib/generateOptions'

const SAMPLE_COUNT = 80

const sample = (correct: number, n = SAMPLE_COUNT): number[][] =>
  Array.from({ length: n }, () => generateOptions(correct))

const distractorsOf = (options: number[], correct: number): number[] =>
  options.filter((value) => value !== correct)

const sortedOffsets = (options: number[], correct: number): number[] =>
  distractorsOf(options, correct)
    .map((value) => Math.abs(value - correct))
    .sort((a, b) => a - b)

describe('generateOptions', () => {
  describe('shared invariants', () => {
    it.each([0, 1, 7, 42, 99, 100, 500, 999, 1000, 1933, 2200, 2500, 3847, 5000])(
      'returns 3 unique integers including the correct answer for %s',
      (correct) => {
        for (const result of sample(correct, 20)) {
          expect(result).toHaveLength(3)
          expect(new Set(result).size).toBe(3)
          expect(result).toContain(correct)
          for (const value of result) {
            expect(Number.isInteger(value)).toBe(true)
          }
        }
      }
    )

    it('shuffles so the correct answer is not always first', () => {
      const orders = new Set(sample(1933, 40).map((result) => result.join(',')))
      expect(orders.size).toBeGreaterThan(1)
    })
  })

  describe('zero input', () => {
    it('includes 0 and two small nearby integers, not a cartoon outlier', () => {
      for (const result of sample(0)) {
        expect(result).toContain(0)
        expect(result).toHaveLength(3)
        expect(new Set(result).size).toBe(3)
        for (const value of result) {
          expect(Number.isInteger(value)).toBe(true)
          expect(Math.abs(value)).toBeLessThanOrEqual(3)
        }
        expect(result).not.toContain(5)
      }
    })

    it('places one trap below and one above zero', () => {
      for (const result of sample(0)) {
        const traps = distractorsOf(result, 0)
        expect(traps.some((value) => value < 0)).toBe(true)
        expect(traps.some((value) => value > 0)).toBe(true)
      }
    })
  })

  describe('year input (1933)', () => {
    it('returns exactly 3 unique values including 1933', () => {
      const result = generateOptions(1933)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
      expect(result).toContain(1933)
    })

    it('all options are within 1000–2200', () => {
      for (const result of sample(1933)) {
        for (const value of result) {
          expect(value).toBeGreaterThanOrEqual(1000)
          expect(value).toBeLessThanOrEqual(2200)
        }
      }
    })

    it('keeps both traps within ±2–18 (no wild year outliers)', () => {
      for (const result of sample(1933)) {
        const [closeOffset, farOffset] = sortedOffsets(result, 1933)
        expect(closeOffset).toBeGreaterThanOrEqual(2)
        expect(closeOffset).toBeLessThanOrEqual(8)
        expect(farOffset).toBeGreaterThanOrEqual(8)
        expect(farOffset).toBeLessThanOrEqual(18)
      }
    })

    it('places one trap below and one above when possible', () => {
      for (const result of sample(1933)) {
        const traps = distractorsOf(result, 1933)
        expect(traps.some((value) => value < 1933)).toBe(true)
        expect(traps.some((value) => value > 1933)).toBe(true)
      }
    })

    it('all values are positive integers', () => {
      const result = generateOptions(1933)
      for (const value of result) {
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
    })
  })

  describe('year clamp edges', () => {
    it('stays inside 1000–2200 at the low bound', () => {
      for (const result of sample(1000, 40)) {
        for (const value of result) {
          expect(value).toBeGreaterThanOrEqual(1000)
          expect(value).toBeLessThanOrEqual(2200)
          expect(Math.abs(value - 1000)).toBeLessThanOrEqual(18)
        }
      }
    })

    it('stays inside 1000–2200 at the high bound', () => {
      for (const result of sample(2200, 40)) {
        for (const value of result) {
          expect(value).toBeGreaterThanOrEqual(1000)
          expect(value).toBeLessThanOrEqual(2200)
          expect(Math.abs(value - 2200)).toBeLessThanOrEqual(18)
        }
      }
    })
  })

  describe('small input (7)', () => {
    it('returns exactly 3 unique values including 7', () => {
      const result = generateOptions(7)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
      expect(result).toContain(7)
    })

    it('all values are > 0', () => {
      for (const result of sample(7)) {
        for (const value of result) {
          expect(value).toBeGreaterThan(0)
        }
      }
    })

    it('keeps both traps within ±1–6 (no double-digit outliers)', () => {
      for (const result of sample(7)) {
        const [closeOffset, farOffset] = sortedOffsets(result, 7)
        expect(closeOffset).toBeGreaterThanOrEqual(1)
        expect(closeOffset).toBeLessThanOrEqual(3)
        expect(farOffset).toBeGreaterThanOrEqual(3)
        expect(farOffset).toBeLessThanOrEqual(6)
      }
    })

    it('places one trap below and one above when possible', () => {
      for (const result of sample(7)) {
        const traps = distractorsOf(result, 7)
        expect(traps.some((value) => value < 7)).toBe(true)
        expect(traps.some((value) => value > 7)).toBe(true)
      }
    })

    it('all values are positive integers', () => {
      const result = generateOptions(7)
      for (const value of result) {
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
    })

    it('keeps traps above 0 for a tiny answer like 1 (both may be above)', () => {
      for (const result of sample(1, 40)) {
        expect(result).toContain(1)
        expect(new Set(result).size).toBe(3)
        for (const value of result) {
          expect(value).toBeGreaterThan(0)
          expect(Math.abs(value - 1)).toBeLessThanOrEqual(6)
        }
      }
    })
  })

  describe('medium input (500)', () => {
    it('returns exactly 3 unique values including 500', () => {
      const result = generateOptions(500)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
      expect(result).toContain(500)
    })

    it('all values are > 0', () => {
      for (const result of sample(500)) {
        for (const value of result) {
          expect(value).toBeGreaterThan(0)
        }
      }
    })

    it('keeps traps around 4–10% and 10–18% (no 20%+ outliers)', () => {
      for (const result of sample(500)) {
        const [closeOffset, farOffset] = sortedOffsets(result, 500)
        expect(closeOffset / 500).toBeGreaterThanOrEqual(0.04)
        expect(closeOffset / 500).toBeLessThanOrEqual(0.10)
        expect(farOffset / 500).toBeGreaterThanOrEqual(0.10)
        expect(farOffset / 500).toBeLessThanOrEqual(0.18)
      }
    })

    it('places one trap below and one above when possible', () => {
      for (const result of sample(500)) {
        const traps = distractorsOf(result, 500)
        expect(traps.some((value) => value < 500)).toBe(true)
        expect(traps.some((value) => value > 500)).toBe(true)
      }
    })
  })

  describe('large input (5000)', () => {
    it('returns exactly 3 unique values including 5000', () => {
      const result = generateOptions(5000)
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)
      expect(result).toContain(5000)
    })

    it('all values are > 0', () => {
      for (const result of sample(5000)) {
        for (const value of result) {
          expect(value).toBeGreaterThan(0)
        }
      }
    })

    it('forbids wild outliers of 30% or more', () => {
      for (const result of sample(5000)) {
        const maxOffset = Math.max(...result.map((value) => Math.abs(value - 5000)))
        expect(maxOffset).toBeLessThan(1500)
        expect(maxOffset / 5000).toBeLessThanOrEqual(0.20)
      }
    })

    it('keeps traps around 5–10% and 10–18% after human rounding', () => {
      for (const result of sample(5000)) {
        const [closeOffset, farOffset] = sortedOffsets(result, 5000)
        expect(closeOffset / 5000).toBeGreaterThanOrEqual(0.04)
        expect(closeOffset / 5000).toBeLessThanOrEqual(0.12)
        expect(farOffset / 5000).toBeGreaterThanOrEqual(0.08)
        expect(farOffset / 5000).toBeLessThanOrEqual(0.20)
      }
    })

    it('rounds distractors to a similar scale as the answer (round answer → round distractors)', () => {
      for (const result of sample(5000)) {
        for (const value of distractorsOf(result, 5000)) {
          expect(value % 100).toBe(0)
        }
      }
    })

    it('places one trap below and one above when possible', () => {
      for (const result of sample(5000)) {
        const traps = distractorsOf(result, 5000)
        expect(traps.some((value) => value < 5000)).toBe(true)
        expect(traps.some((value) => value > 5000)).toBe(true)
      }
    })
  })

  describe('large unrounded correct (3847)', () => {
    it('emits precise-looking distractors within ~18% — no round-number giveaway', () => {
      for (const result of sample(3847, 40)) {
        expect(result).toContain(3847)
        expect(new Set(result).size).toBe(3)
        for (const value of distractorsOf(result, 3847)) {
          expect(Math.abs(value - 3847) / 3847).toBeLessThanOrEqual(0.20)
          expect(Math.abs(value - 3847) / 3847).toBeGreaterThanOrEqual(0.04)
        }
        // The correct answer is precise (3847) — distractors must not all be
        // round hundreds, otherwise the odd one out is trivially correct.
        const distractors = distractorsOf(result, 3847)
        expect(distractors.some((value) => value % 100 !== 0)).toBe(true)
      }
    })

    it('matches precision for a precise big answer (17508 — the islands case)', () => {
      for (const result of sample(17508, 60)) {
        const distractors = distractorsOf(result, 17508)
        // None of the distractors should be a "3 zeros" giveaway number.
        expect(distractors.filter((v) => v % 1000 === 0)).toHaveLength(0)
        // And they stay in a plausible range.
        for (const value of distractors) {
          expect(Math.abs(value - 17508) / 17508).toBeLessThanOrEqual(0.25)
        }
      }
    })
  })
})
