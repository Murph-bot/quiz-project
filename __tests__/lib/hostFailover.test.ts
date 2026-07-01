import { computeFailoverCandidate } from '@/lib/hostFailover'

describe('computeFailoverCandidate', () => {
  it('does not failover before host was online', () => {
    const result = computeFailoverCandidate('host-1', ['player-2'], false)
    expect(result.newHostId).toBeNull()
    expect(result.hostWasOnline).toBe(false)
  })

  it('marks host as online when seen in presence', () => {
    const result = computeFailoverCandidate('host-1', ['host-1', 'player-2'], false)
    expect(result.newHostId).toBeNull()
    expect(result.hostWasOnline).toBe(true)
  })

  it('elects lowest sorted player id when host leaves', () => {
    const result = computeFailoverCandidate('host-1', ['player-2', 'player-3'], true)
    expect(result.newHostId).toBe('player-2')
  })

  it('does not failover when candidate list is empty', () => {
    const result = computeFailoverCandidate('host-1', [], true)
    expect(result.newHostId).toBeNull()
  })
})
