import { computeRevealElimination } from '@/lib/game/revealElimination'

describe('computeRevealElimination', () => {
  const activeList = [
    { id: 'p1', nickname: 'Alex' },
    { id: 'p2', nickname: 'Maria' },
    { id: 'p3', nickname: 'Nick' },
  ]

  it('eliminates only the farthest wrong answer when one player is exact', () => {
    const { eliminated, answers } = computeRevealElimination(
      [
        { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
        { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
        { player_id: 'p3', value: 1991, players: { nickname: 'Nick' } },
      ],
      1989,
      activeList,
    )

    expect(answers).toHaveLength(3)
    expect(eliminated).toHaveLength(1)
    expect(eliminated[0].nickname).toBe('Maria')
  })
})
