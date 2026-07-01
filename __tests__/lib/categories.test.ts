import { isValidCategory, VALID_CATEGORIES } from '@/lib/categories'

describe('categories', () => {
  it('includes money category', () => {
    expect(VALID_CATEGORIES).toContain('money')
  })

  it('validates known categories', () => {
    expect(isValidCategory('geography')).toBe(true)
    expect(isValidCategory('money')).toBe(true)
    expect(isValidCategory('invalid')).toBe(false)
  })
})
