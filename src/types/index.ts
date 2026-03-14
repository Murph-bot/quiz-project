// src/types/index.ts

export interface Session {
  id: string
  room_code: string
  host_id: string
  status: 'lobby' | 'active' | 'finished'
  category: string
  created_at: string
}

export interface Player {
  id: string
  session_id: string
  nickname: string
  is_host: boolean
  is_alive: boolean
  joined_at: string
}

// Shape of each entry tracked via Supabase Presence
export interface PresencePlayer {
  playerId: string
  nickname: string
  isHost: boolean
}
