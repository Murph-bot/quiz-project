// Hand-maintained Database types matching supabase/migrations/001–011.
// Regenerate with `supabase gen types typescript --linked` once the CLI is
// available; until then, keep this file in sync with new migrations.

import type { BracketState } from '@/types'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SessionStatus = 'lobby' | 'active' | 'finished'
export type SessionPhase = 'normal' | 'semifinal' | 'final'
export type RoundStatus = 'active' | 'closed'

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          room_code: string
          host_id: string
          status: SessionStatus
          category: string
          created_at: string
          winner_id: string | null
          phase: SessionPhase
          bracket: BracketState | null
          resurrection_interval: number
        }
        Insert: {
          id?: string
          room_code: string
          host_id: string
          status?: SessionStatus
          category?: string
          created_at?: string
          winner_id?: string | null
          phase?: SessionPhase
          bracket?: BracketState | null
          resurrection_interval?: number
        }
        Update: {
          id?: string
          room_code?: string
          host_id?: string
          status?: SessionStatus
          category?: string
          created_at?: string
          winner_id?: string | null
          phase?: SessionPhase
          bracket?: BracketState | null
          resurrection_interval?: number
        }
        Relationships: []
      }
      players: {
        Row: {
          id: string
          session_id: string
          nickname: string
          is_host: boolean
          is_alive: boolean
          joined_at: string
          session_secret: string | null
        }
        Insert: {
          id?: string
          session_id: string
          nickname: string
          is_host?: boolean
          is_alive?: boolean
          joined_at?: string
          session_secret?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          nickname?: string
          is_host?: boolean
          is_alive?: boolean
          joined_at?: string
          session_secret?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          id: string
          text: string
          answer: number
          category: string
          time_limit: number
          unit: string | null
          hint: string | null
        }
        Insert: {
          id?: string
          text: string
          answer: number
          category: string
          time_limit: number
          unit?: string | null
          hint?: string | null
        }
        Update: {
          id?: string
          text?: string
          answer?: number
          category?: string
          time_limit?: number
          unit?: string | null
          hint?: string | null
        }
        Relationships: []
      }
      rounds: {
        Row: {
          id: string
          session_id: string
          question_id: string | null
          round_number: number
          started_at: string
          status: RoundStatus
          tiebreak_players: string[] | null
        }
        Insert: {
          id?: string
          session_id: string
          question_id?: string | null
          round_number: number
          started_at?: string
          status?: RoundStatus
          tiebreak_players?: string[] | null
        }
        Update: {
          id?: string
          session_id?: string
          question_id?: string | null
          round_number?: number
          started_at?: string
          status?: RoundStatus
          tiebreak_players?: string[] | null
        }
        Relationships: []
      }
      answers: {
        Row: {
          id: string
          round_id: string
          player_id: string
          value: number
          submitted_at: string
        }
        Insert: {
          id?: string
          round_id: string
          player_id: string
          value: number
          submitted_at?: string
        }
        Update: {
          id?: string
          round_id?: string
          player_id?: string
          value?: number
          submitted_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
