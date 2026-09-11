/**
 * @jest-environment jsdom
 */
import { isMuted, setMuted, playSfx } from '@/lib/sfx'

interface FakeOsc { type: string; frequency: { value: number }; connect: jest.Mock; start: jest.Mock; stop: jest.Mock }

// One shared fake context — sfx.ts caches the AudioContext as a module
// singleton, so every test must observe the same instance's oscillators.
const oscillators: FakeOsc[] = []
const fakeCtx = {
  currentTime: 0,
  state: 'running',
  destination: {},
  resume: jest.fn().mockResolvedValue(undefined),
  createOscillator: jest.fn(() => {
    const osc: FakeOsc = {
      type: 'sine',
      frequency: { value: 0 },
      connect: jest.fn(() => ({ connect: jest.fn() })),
      start: jest.fn(),
      stop: jest.fn(),
    }
    oscillators.push(osc)
    return osc
  }),
  createGain: jest.fn(() => ({
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  })),
}

describe('sfx', () => {
  beforeEach(() => {
    localStorage.clear()
    oscillators.length = 0
    ;(window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => fakeCtx)
  })

  it('defaults to unmuted and persists the mute flag', () => {
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
    setMuted(false)
    expect(isMuted()).toBe(false)
  })

  it('plays tones through a lazily created AudioContext', () => {
    playSfx('tick')
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].start).toHaveBeenCalled()
    expect(oscillators[0].frequency.value).toBe(880)
  })

  it('plays nothing while muted', () => {
    setMuted(true)
    playSfx('victory')
    expect(oscillators).toHaveLength(0)
  })

  it('does not throw when AudioContext is unavailable', () => {
    ;(window as unknown as { AudioContext: unknown }).AudioContext = undefined
    expect(() => playSfx('roundStart')).not.toThrow()
  })

  it('victory plays a four-note fanfare', () => {
    playSfx('victory')
    expect(oscillators).toHaveLength(4)
  })
})
