import { getBracketFinalists, isBracketFinalist } from '@/lib/bracket'
import type { BracketState } from '@/types'

const bracket: BracketState = {
  sf1: { p1: 'A', p2: 'B', p1id: 'p1', p2id: 'p2' },
  sf2: { p1: 'C', p2: 'D', p1id: 'p3', p2id: 'p4' },
  finalists: ['p1', 'p3'],
  currentSF: null,
}

describe('bracket helpers', () => {
  it('returns empty finalists when bracket is missing', () => {
    expect(getBracketFinalists(null)).toEqual([])
    expect(getBracketFinalists(undefined)).toEqual([])
  })

  it('returns empty finalists when finalists array is missing', () => {
    const partial = { ...bracket, finalists: undefined } as unknown as BracketState
    expect(getBracketFinalists(partial)).toEqual([])
    expect(isBracketFinalist(partial, 'p1')).toBe(false)
  })

  it('detects finalists safely', () => {
    expect(isBracketFinalist(bracket, 'p1')).toBe(true)
    expect(isBracketFinalist(bracket, 'p4')).toBe(false)
    expect(isBracketFinalist(null, 'p1')).toBe(false)
  })
})
