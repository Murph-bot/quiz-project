// Server-side Supabase Realtime broadcast via the HTTP API.
// Used by API routes to publish authoritative game events after mutations.
// Clients only listen — they never broadcast game state themselves.

export interface RoomEvent {
  event: string
  payload: Record<string, unknown>
}

export async function broadcastToRoom(roomCode: string, events: RoomEvent[]): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey || events.length === 0) return

  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
      },
      body: JSON.stringify({
        messages: events.map((e) => ({
          topic: `room:${roomCode}`,
          event: e.event,
          payload: e.payload,
        })),
      }),
    })
    if (!res.ok) {
      console.error(`[realtime] broadcast failed: HTTP ${res.status}`)
    }
  } catch (err) {
    // Realtime is best-effort — clients reconcile via API polls on miss.
    console.error('[realtime] broadcast error:', err)
  }
}
