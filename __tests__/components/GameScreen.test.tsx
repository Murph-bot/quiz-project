/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react'
import { GameScreen } from '@/components/GameScreen'

const mockPush = jest.fn()
// Stable like Next's router, so the redirect effect is not restarted every render.
const mockRouter = { push: mockPush }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('@/hooks/usePlayerSession', () => ({
  usePlayerSession: () => ({ playerId: 'p1', nickname: 'Ana', sessionSecret: 's', ready: true }),
}))
jest.mock('@/hooks/useGameRoomEvents', () => ({ useGameRoomEvents: () => {} }))
jest.mock('@/hooks/useWakeLock', () => ({ useWakeLock: () => {} }))
jest.mock('@/lib/sfx', () => ({ playSfx: () => {} }))

const baseProps = {
  roomCode: 'ABCD',
  sessionHostId: 'p1',
  initialRoundId: null,
  initialRoundNumber: 1,
  initialQuestion: null,
  initialStartedAt: null,
  initialRevealData: null,
  initialWinner: null,
  initialAliveCount: 2,
}

describe('GameScreen winner countdown', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('starts at 30s when the game loads already won, then counts down and redirects', () => {
    render(<GameScreen {...baseProps} initialWinner={{ playerId: 'p1', nickname: 'Ana' }} />)
    expect(screen.getByText('30s')).toBeTruthy()

    act(() => { jest.advanceTimersByTime(1000) })
    expect(screen.getByText('29s')).toBeTruthy()

    act(() => { jest.advanceTimersByTime(29000) })
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})
