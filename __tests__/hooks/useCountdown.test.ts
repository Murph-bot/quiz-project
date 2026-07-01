/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '@/hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns correct secondsLeft before deadline', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0)
    const { result } = renderHook(() => useCountdown(10000))
    act(() => {
      jest.advanceTimersByTime(0)
    })
    expect(result.current.secondsLeft).toBe(10)
    expect(result.current.isExpired).toBe(false)
  })

  it('returns 0 and isExpired:true when past deadline', () => {
    jest.spyOn(Date, 'now').mockReturnValue(20000)
    const { result } = renderHook(() => useCountdown(10000))
    act(() => {
      jest.advanceTimersByTime(0)
    })
    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.isExpired).toBe(true)
  })

  it('updates secondsLeft as time passes', () => {
    let now = 0
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const { result } = renderHook(() => useCountdown(10000))
    act(() => {
      jest.advanceTimersByTime(0)
    })
    expect(result.current.secondsLeft).toBe(10)
    act(() => {
      now = 3000
      jest.advanceTimersByTime(500)
    })
    expect(result.current.secondsLeft).toBe(7)
  })

  it('cleans up interval on unmount', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0)
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useCountdown(10000))
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
