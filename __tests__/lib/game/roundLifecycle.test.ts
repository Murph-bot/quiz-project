import { createRoundLifecycle, type RoundLifecycleRefs, type RoundLifecycleSetters } from '@/lib/game/roundLifecycle'

function makeRefs(): RoundLifecycleRefs {
  return {
    roundIdRef: { current: 'round-1' },
    roundClosedRef: { current: false },
    pendingTiebreakRef: { current: null },
    pendingFinalIntroRef: { current: null },
    bracketDataRef: { current: null },
    currentMatchPhaseRef: { current: null },
    isSpectatingRef: { current: false },
    gameOverRef: { current: false },
    closeInFlightRef: { current: false },
  }
}

function makeSetters(): RoundLifecycleSetters {
  return {
    setRoundId: jest.fn(),
    setRoundNumber: jest.fn(),
    setQuestion: jest.fn(),
    setStartedAt: jest.fn(),
    setRevealData: jest.fn(),
    setEliminated: jest.fn(),
    setIsGracePeriod: jest.fn(),
    setAnsweredPlayerIds: jest.fn(),
    setGraceDeadlineMs: jest.fn(),
    setPhase: jest.fn(),
    setResurrected: jest.fn(),
    setIsSuddenDeath: jest.fn(),
    setAliveCount: jest.fn(),
    setIsSpectating: jest.fn(),
    setShowResurrectionSelf: jest.fn(),
    setBracketData: jest.fn(),
    setCurrentMatchPhase: jest.fn(),
    setPendingTiebreak: jest.fn(),
    setTiebreakDeadlineMs: jest.fn(),
    setWinner: jest.fn(),
    setGameOver: jest.fn(),
    setMatchWins: jest.fn(),
    setMatchResultData: jest.fn(),
    setQuestionsExhausted: jest.fn(),
  }
}

describe('attemptClose debounce', () => {
  let resolveFetch: (value: unknown) => void
  let fetchCallCount: number

  beforeEach(() => {
    fetchCallCount = 0
    global.fetch = jest.fn(() => {
      fetchCallCount++
      return new Promise((resolve) => {
        resolveFetch = resolve
      })
    }) as unknown as typeof fetch
  })

  it('collapses concurrent attemptClose calls into a single in-flight request', () => {
    // A thundering-herd `all:answered` broadcast makes every client fire
    // attemptClose repeatedly (once per handler invocation); without a
    // debounce guard each call issues its own POST, spiking the close
    // endpoint with duplicate requests for the same round.
    const refs = makeRefs()
    const lifecycle = createRoundLifecycle({
      roomCode: 'AB12',
      getPlayerId: () => 'p1',
      getSessionSecret: () => 'secret-1',
      getIsHost: () => false,
      setters: makeSetters(),
      refs,
    })

    lifecycle.attemptClose()
    lifecycle.attemptClose()
    lifecycle.attemptClose()

    expect(fetchCallCount).toBe(1)

    resolveFetch({ status: 200, json: () => Promise.resolve({}) })
  })

  it('allows a new attemptClose once the previous request settles', async () => {
    const refs = makeRefs()
    const lifecycle = createRoundLifecycle({
      roomCode: 'AB12',
      getPlayerId: () => 'p1',
      getSessionSecret: () => 'secret-1',
      getIsHost: () => false,
      setters: makeSetters(),
      refs,
    })

    lifecycle.attemptClose()
    expect(fetchCallCount).toBe(1)

    resolveFetch({ status: 200, json: () => Promise.resolve({}) })
    for (let i = 0; i < 10; i++) await Promise.resolve()

    // A fresh round — not the terminal state the first response put us in.
    refs.roundIdRef.current = 'round-2'
    refs.roundClosedRef.current = false

    lifecycle.attemptClose()
    expect(fetchCallCount).toBe(2)
  })
})
