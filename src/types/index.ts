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

export interface Round {
  id: string
  session_id: string
  question_id: string
  round_number: number
  started_at: string
  status: 'active' | 'closed'
}

export interface Answer {
  id: string
  round_id: string
  player_id: string
  value: number
  submitted_at: string
}

export interface Question {
  id: string
  text: string
  answer: number
  category: string
  time_limit: number
}

export interface RankedAnswer {
  playerId: string
  nickname: string
  value: number
  delta: number
}
