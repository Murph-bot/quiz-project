import {
  getBracketFinalists,
  getFinalistNickname,
  inferMatchPhaseFromBracket,
  isBracketFinalist,
  isCompetingInMatch,
} from '@/lib/bracket'
import type { BracketState } from '@/types'

const bracket: BracketState = {
  sf1: { p1: 'A', p2: 'B', p1id: 'p1', p2id: 'p2', wins: [0, 0] },
  sf2: { p1: 'C', p2: 'D', p1id: 'p3', p2id: 'p4', wins: [0, 0] },
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

  it('infers match phase from bracket shape', () => {
    // finalists set + no currentSF → final
    expect(inferMatchPhaseFromBracket(bracket)).toBe('final')
    expect(inferMatchPhaseFromBracket({ ...bracket, finalists: [], currentSF: 1 })).toBe('sf1')
    expect(inferMatchPhaseFromBracket({ ...bracket, finalists: [], currentSF: 2 })).toBe('sf2')
    expect(inferMatchPhaseFromBracket({ ...bracket, finalists: [], currentSF: null })).toBeNull()
  })

  it('computes whether a player competes in the current match', () => {
    const sf1Bracket = { ...bracket, finalists: [], currentSF: 1 as const }
    expect(isCompetingInMatch(sf1Bracket, 'sf1', 'p1')).toBe(true)
    expect(isCompetingInMatch(sf1Bracket, 'sf1', 'p3')).toBe(false)
    expect(isCompetingInMatch(sf1Bracket, 'sf2', 'p3')).toBe(true)
    expect(isCompetingInMatch(bracket, 'final', 'p1')).toBe(true)
    expect(isCompetingInMatch(bracket, 'final', 'p2')).toBe(false)
    // Missing context → default to competing (safe for normal mode)
    expect(isCompetingInMatch(null, 'sf1', 'p1')).toBe(true)
    expect(isCompetingInMatch(sf1Bracket, null, 'p1')).toBe(true)
    expect(isCompetingInMatch(sf1Bracket, 'sf1', null)).toBe(true)
  })

  it('resolves finalist nicknames via sf match records', () => {
    expect(getFinalistNickname(bracket, 'p1')).toBe('A')
    expect(getFinalistNickname(bracket, 'p3')).toBe('C')
    expect(getFinalistNickname(bracket, 'unknown')).toBe('unknown')
  })
})
