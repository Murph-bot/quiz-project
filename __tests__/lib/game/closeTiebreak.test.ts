import { buildRankedAnswers } from '@/lib/game/closeTiebreak'

describe('buildRankedAnswers', () => {
  it('ranks answered players by delta and appends no-answer players', () => {
    const answers = buildRankedAnswers(
      [
        { player_id: 'p1', value: 12, players: { nickname: 'Alice' } },
        { player_id: 'p2', value: 8, players: { nickname: 'Bob' } },
      ],
      10,
      [
        { id: 'p1', nickname: 'Alice' },
        { id: 'p2', nickname: 'Bob' },
        { id: 'p3', nickname: 'Cara' },
      ],
    )

    expect(answers[0].playerId).toBe('p1')
    expect(answers[0].delta).toBe(2)
    expect(answers[1].playerId).toBe('p2')
    expect(answers[2].playerId).toBe('p3')
    expect(answers[2].noAnswer).toBe(true)
  })
})
