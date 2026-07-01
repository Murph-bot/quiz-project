import {
  isIdenticalWrongReplay,
  resolveNormalElimination,
  resolveSubsetElimination,
} from '@/lib/elimination'
import type { RankedAnswer } from '@/types'

function answer(id: string, nickname: string, delta: number, noAnswer = false): RankedAnswer {
  return {
    playerId: id,
    nickname,
    value: noAnswer ? null : delta,
    delta,
    noAnswer,
  }
}

describe('resolveNormalElimination', () => {
  it('eliminates only the farthest wrong answer', () => {
    const result = resolveNormalElimination([
      answer('p1', 'Alex', 0),
      answer('p2', 'Maria', 16),
      answer('p3', 'Nick', 2),
    ])
    expect(result.eliminated).toEqual([{ playerId: 'p2', nickname: 'Maria' }])
    expect(result.tiedForWorstIds).toEqual([])
  })

  it('returns tiebreak ids when multiple players share the worst delta', () => {
    const result = resolveNormalElimination([
      answer('p1', 'Alex', 0),
      answer('p2', 'Maria', 16),
      answer('p3', 'Nick', 16),
    ])
    expect(result.eliminated).toEqual([])
    expect(result.tiedForWorstIds).toEqual(['p2', 'p3'])
  })

  it('eliminates the single no-answer player when they are farthest', () => {
    const result = resolveNormalElimination([
      answer('p1', 'Alex', 2),
      answer('p2', 'Maria', 5),
      answer('p3', 'Nick', Number.MAX_SAFE_INTEGER, true),
    ])
    expect(result.eliminated).toEqual([{ playerId: 'p3', nickname: 'Nick' }])
  })
})

describe('isIdenticalWrongReplay', () => {
  it('is true when every player is wrong with the same delta', () => {
    const answers = [
      answer('p1', 'Alex', 10),
      answer('p2', 'Maria', 10),
      answer('p3', 'Nick', 10),
    ]
    expect(isIdenticalWrongReplay(answers, 3)).toBe(true)
  })

  it('is false when players have different wrong deltas', () => {
    const answers = [
      answer('p1', 'Alex', 10),
      answer('p2', 'Maria', 20),
      answer('p3', 'Nick', 30),
    ]
    expect(isIdenticalWrongReplay(answers, 3)).toBe(false)
  })
})

describe('resolveSubsetElimination', () => {
  it('picks the farthest among tiebreak participants', () => {
    const result = resolveSubsetElimination([
      { playerId: 'p1', nickname: 'Alex', delta: 4 },
      { playerId: 'p2', nickname: 'Maria', delta: 9 },
    ])
    expect(result.eliminated).toEqual([{ playerId: 'p2', nickname: 'Maria' }])
  })
})
