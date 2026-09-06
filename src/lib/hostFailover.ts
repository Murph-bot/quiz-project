export function computeFailoverCandidate(
  currentHostId: string,
  candidateIds: string[],
  hostWasOnline: boolean,
): { newHostId: string | null; hostWasOnline: boolean } {
  let wasOnline = hostWasOnline
  if (candidateIds.includes(currentHostId)) {
    wasOnline = true
  }
  if (wasOnline && candidateIds.length > 0 && !candidateIds.includes(currentHostId)) {
    const newHostId = [...candidateIds].sort()[0]
    return { newHostId, hostWasOnline: wasOnline }
  }
  return { newHostId: null, hostWasOnline: wasOnline }
}

// The server broadcasts `host:changed` to the room on success.
export async function promoteHost(params: {
  roomCode: string
  newHostId: string
  requesterId: string
  sessionSecret: string | null
}): Promise<void> {
  await fetch(`/api/sessions/${params.roomCode}/host`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: params.newHostId,
      requesterId: params.requesterId,
      sessionSecret: params.sessionSecret,
    }),
  })
}
