import { canonicalCategory, QUESTION_CATEGORIES, VALID_CATEGORIES } from '@/lib/categories'

describe('categories', () => {
  it('includes the extended categories', () => {
    expect(VALID_CATEGORIES).toContain('Money')
    expect(VALID_CATEGORIES).toContain('Science')
    expect(VALID_CATEGORIES).toContain('Sports')
    expect(VALID_CATEGORIES).toContain('all')
    expect(QUESTION_CATEGORIES).not.toContain('all')
  })

  it('canonicalizes casing', () => {
    expect(canonicalCategory('geography')).toBe('Geography')
    expect(canonicalCategory(' POPULAR TOOLS ')).toBe('Popular Tools')
    expect(canonicalCategory('all')).toBe('all')
    expect(canonicalCategory('nope')).toBeNull()
  })
})
