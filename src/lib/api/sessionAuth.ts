import { NextResponse } from 'next/server'
import { normalizeRoomCode } from '@/lib/roomCode'
import { createServerClient } from '@/lib/supabase-server'
import type { Session } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

export type AuthError = NextResponse

export function invalidRoomCode(): AuthError {
  return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
}

export function sessionNotFound(): AuthError {
  return NextResponse.json({ error: 'Session not found' }, { status: 404 })
}

export function invalidCredentials(): AuthError {
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 403 })
}

export function hostOnly(message = 'Only the host can perform this action'): AuthError {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function badRequest(message: string): AuthError {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function parseRoomCode(rawCode: string): string | null {
  return normalizeRoomCode(rawCode)
}

export function getSupabase(): Supabase {
  return createServerClient()
}

export async function loadSession<T extends string>(
  supabase: Supabase,
  roomCode: string,
  select: T,
): Promise<Session | null> {
  const { data: session, error } = await supabase
    .from('sessions')
    .select(select)
    .eq('room_code', roomCode)
    .single()

  if (error || !session) return null
  return session as unknown as Session
}

export async function verifyPlayerSecret(
  supabase: Supabase,
  sessionId: string,
  playerId: string,
  sessionSecret: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('session_id', sessionId)
    .eq('session_secret', sessionSecret)
    .single()
  return !!data
}

export async function verifyHostPlayer(
  supabase: Supabase,
  sessionId: string,
  playerId: string,
  sessionSecret: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', sessionId)
    .eq('session_secret', sessionSecret)
    .single()
  return !!data?.is_host
}

export async function verifyHostById(
  supabase: Supabase,
  sessionId: string,
  playerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', sessionId)
    .single()
  return !!data?.is_host
}
