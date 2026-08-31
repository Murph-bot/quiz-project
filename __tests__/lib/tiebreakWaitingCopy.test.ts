import { TIEBREAK_WAITING_REASSURANCE } from '@/lib/game/closeClient'

describe('TIEBREAK_WAITING_REASSURANCE', () => {
  it('does not claim the player reached the semi-finals', () => {
    expect(TIEBREAK_WAITING_REASSURANCE.toLowerCase()).not.toMatch(/semi-?final/)
  })

  it('tells waiting players they are still in during a farthest-out tiebreak', () => {
    expect(TIEBREAK_WAITING_REASSURANCE.toLowerCase()).toMatch(/still in/)
    expect(TIEBREAK_WAITING_REASSURANCE.toLowerCase()).toMatch(/tiebreak/)
  })
})
