import {
  normalizeCloseResponse,
  pendingTiebreakFromFollowUpRound,
  shouldPollForMissedClose,
} from '@/lib/game/closeClient'

describe('shouldPollForMissedClose', () => {
  it('polls waiting after expiry when close was not seen', () => {
    expect(
      shouldPollForMissedClose({
        phase: 'waiting',
        isExpired: true,
        roundClosed: false,
      }),
    ).toBe(true)
  })

  it('polls tiebreak-waiting after expiry when close was not seen', () => {
    expect(
      shouldPollForMissedClose({
        phase: 'tiebreak-waiting',
        isExpired: true,
        roundClosed: false,
      }),
    ).toBe(true)
  })

  it('does not poll during active answering', () => {
    expect(
      shouldPollForMissedClose({
        phase: 'answering',
        isExpired: true,
        roundClosed: false,
      }),
    ).toBe(false)
  })

  it('does not poll before the timer expires', () => {
    expect(
      shouldPollForMissedClose({
        phase: 'waiting',
        isExpired: false,
        roundClosed: false,
      }),
    ).toBe(false)
  })

  it('does not poll after the close broadcast arrived', () => {
    expect(
      shouldPollForMissedClose({
        phase: 'waiting',
        isExpired: true,
        roundClosed: true,
      }),
    ).toBe(false)
  })
})

describe('normalizeCloseResponse', () => {
  it('passes through a successful close payload', () => {
    const data = { correctAnswer: 47, wasAlreadyClosed: false }
    expect(normalizeCloseResponse(200, data)).toEqual(data)
  })

  it('keeps wasAlreadyClosed on 200 so the client can fetch reveal', () => {
    expect(normalizeCloseResponse(200, { wasAlreadyClosed: true })).toEqual({
      wasAlreadyClosed: true,
    })
  })

  it('treats HTTP 409 as already closed and drops the error so reveal can load', () => {
    expect(
      normalizeCloseResponse(409, { error: 'Round already closed' }),
    ).toEqual({ wasAlreadyClosed: true })
  })

  it('treats already-closed error text on 200 as already closed', () => {
    expect(normalizeCloseResponse(200, { error: 'Round already closed' })).toEqual({
      wasAlreadyClosed: true,
    })
  })

  it('leaves unrelated errors alone', () => {
    expect(normalizeCloseResponse(500, { error: 'Failed to close round' })).toEqual({
      error: 'Failed to close round',
    })
  })
})

describe('pendingTiebreakFromFollowUpRound', () => {
  const question = {
    id: 'q2',
    text: 'Tiebreak Q?',
    time_limit: 30,
    category: 'history',
  }

  it('returns null when there is no follow-up round', () => {
    expect(pendingTiebreakFromFollowUpRound(null)).toBeNull()
  })

  it('returns null for a closed follow-up', () => {
    expect(
      pendingTiebreakFromFollowUpRound({
        id: 'r2',
        status: 'closed',
        started_at: '2026-01-01T00:00:00.000Z',
        tiebreak_players: ['a', 'b'],
        question,
      }),
    ).toBeNull()
  })

  it('attaches an active farthest-out tiebreak so late closers can still advance', () => {
    expect(
      pendingTiebreakFromFollowUpRound({
        id: 'r2',
        status: 'active',
        started_at: '2026-01-01T00:00:10.000Z',
        tiebreak_players: ['alice', 'bob'],
        options: [10, 12, 11],
        question,
      }),
    ).toEqual({
      tiebreakNeeded: true,
      tiebreakRoundId: 'r2',
      tiebreakStartedAt: '2026-01-01T00:00:10.000Z',
      tiebreakPlayerIds: ['alice', 'bob'],
      tiebreakQuestion: {
        id: 'q2',
        text: 'Tiebreak Q?',
        timeLimit: 30,
        category: 'history',
      },
      tiebreakOptions: [10, 12, 11],
    })
  })
})
