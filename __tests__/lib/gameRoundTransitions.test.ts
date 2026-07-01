import { applyTiebreakStartedState } from '@/lib/game/gameRoundTransitions'

describe('applyTiebreakStartedState', () => {
  it('sets answering phase for tiebreaker participants', () => {
    const setPhase = jest.fn()
    const setRoundId = jest.fn()

    applyTiebreakStartedState(
      {
        roundId: 'r1',
        question: { id: 'q1', text: 'Q?', timeLimit: 30, category: 'history' },
        startedAt: '2026-01-01T00:00:00.000Z',
        playerIds: ['p1'],
      },
      'p1',
      {
        setRoundId,
        setQuestion: jest.fn(),
        setStartedAt: jest.fn(),
        setRevealData: jest.fn(),
        setEliminated: jest.fn(),
        setIsGracePeriod: jest.fn(),
        setAnsweredPlayerIds: jest.fn(),
        setGraceDeadlineMs: jest.fn(),
        setPendingTiebreak: jest.fn(),
        setTiebreakDeadlineMs: jest.fn(),
        setPhase,
      },
      999,
    )

    expect(setRoundId).toHaveBeenCalledWith('r1')
    expect(setPhase).toHaveBeenCalledWith('answering')
  })

  it('sets tiebreak-waiting for non-participants', () => {
    const setPhase = jest.fn()

    applyTiebreakStartedState(
      {
        roundId: 'r1',
        question: { id: 'q1', text: 'Q?', timeLimit: 30, category: 'history' },
        startedAt: '2026-01-01T00:00:00.000Z',
        playerIds: ['p1'],
      },
      'p2',
      {
        setRoundId: jest.fn(),
        setQuestion: jest.fn(),
        setStartedAt: jest.fn(),
        setRevealData: jest.fn(),
        setEliminated: jest.fn(),
        setIsGracePeriod: jest.fn(),
        setAnsweredPlayerIds: jest.fn(),
        setGraceDeadlineMs: jest.fn(),
        setPendingTiebreak: jest.fn(),
        setTiebreakDeadlineMs: jest.fn(),
        setPhase,
      },
      999,
    )

    expect(setPhase).toHaveBeenCalledWith('tiebreak-waiting')
  })
})
