// src/types/index.ts

export interface Session {
  id: string
  room_code: string
  host_id: string
  status: 'lobby' | 'active' | 'finished'
  category: string
  resurrection_interval: number
  created_at: string
  phase?: GamePhase       // bracket mode phase (added in migration 004)
  bracket?: BracketState  // bracket tournament state
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
  tiebreak_players?: string[] | null
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
  value: number | null   // null for players who didn't answer
  delta: number          // Number.MAX_SAFE_INTEGER for no-answer players
  noAnswer: boolean
}

export interface EliminatedPlayer {
  playerId: string
  nickname: string
}

export interface WinnerInfo {
  playerId: string
  nickname: string
}

export interface BracketMatch {
  p1id: string
  p1: string
  p2id: string
  p2: string
  wins: [number, number] // [p1wins, p2wins]
}

export interface BracketState {
  sf1: BracketMatch
  sf2: BracketMatch
  currentSF: 1 | 2 | null // null = in final
  finalists: string[] // player IDs [winner_sf1_id, winner_sf2_id]
  finalWins?: [number, number] // [p1wins, p2wins] during Final
}

export type GamePhase = 'normal' | 'semifinal' | 'final'

export type UIPhase =
  | 'answering'
  | 'waiting'
  | 'reveal'
  | 'spectating'
  | 'tiebreak-waiting'
  | 'bracket'
  | 'match-result'
  | 'winner'
