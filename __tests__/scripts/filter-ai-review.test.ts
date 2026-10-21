import { fileOf, filterReview, normalizeChanged, parseFindings } from '../../scripts/filter-ai-review.js'

const REVIEW = [
  '**Should fix** `src/lib/game/closeTiebreak.ts:96` - Incomplete response object',
  'Problem: it builds a response with nulls.',
  'Fix: return null entirely.',
  '',
  '---',
  '',
  '**Blocker** `src/components/GameScreen.tsx:448` - Race condition',
  'Problem: res may be undefined.',
  'Fix: return early.',
  '',
  '---',
  '',
  '**Nit** `__tests__/lib/categories.test.ts:5-11` - Removed test',
  'Problem: no justification.',
  'Fix: verify no imports.',
].join('\n')

describe('filter-ai-review', () => {
  it('parses paths out of a location with and without a line range', () => {
    expect(fileOf('src/a.ts:12')).toBe('src/a.ts')
    expect(fileOf('src/a.ts:12-18')).toBe('src/a.ts')
    expect(fileOf('./src/a.ts')).toBe('src/a.ts')
  })

  it('keeps only findings whose file the push touched', () => {
    const kept = filterReview(REVIEW, normalizeChanged(['__tests__/lib/categories.test.ts']))

    expect(kept).toContain('`__tests__/lib/categories.test.ts:5-11` - Removed test')
    expect(kept).not.toContain('GameScreen.tsx')
    expect(kept).not.toContain('closeTiebreak.ts')
  })

  it('reports LGTM when every finding cites an untouched file', () => {
    const kept = filterReview(REVIEW, normalizeChanged(['src/lib/categories.ts']))

    expect(kept).toBe('LGTM')
  })

  it('passes a clean LGTM through untouched', () => {
    expect(filterReview('LGTM', normalizeChanged(['src/a.ts']))).toBe('LGTM')
  })

  it('passes the too-large notice through instead of treating it as findings', () => {
    const notice = '**AI Review skipped:** this push is too large (67123 chars) for the cheap automatic review.'

    expect(filterReview(notice, normalizeChanged([]))).toBe(notice)
  })

  it('parses three findings from the sample review', () => {
    expect(parseFindings(REVIEW)).toHaveLength(3)
  })
})
