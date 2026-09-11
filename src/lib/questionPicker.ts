import type { createServerClient } from '@/lib/supabase-server'
import type { Question } from '@/types'

type Supabase = ReturnType<typeof createServerClient>

// unit/hint come from migration 012 — fall back to the base column set if the
// migration hasn't been applied yet so question selection never breaks.
export const QUESTION_COLS = 'id, text, answer, category, time_limit, unit, hint'
export const QUESTION_COLS_BASE = 'id, text, answer, category, time_limit'

export async function fetchQuestionsForCategory(
  supabase: Supabase,
  category: string,
): Promise<Question[]> {
  for (const cols of [QUESTION_COLS, QUESTION_COLS_BASE]) {
    let query = supabase.from('questions').select(cols)
    if (category !== 'all') {
      query = query.ilike('category', category)
    }
    const { data, error } = await query
    if (!error) return (data ?? []) as unknown as Question[]
  }
  return []
}

export async function getUsedQuestionIds(
  supabase: Supabase,
  sessionId: string,
): Promise<string[]> {
  const { data: usedRows } = await supabase
    .from('rounds')
    .select('question_id')
    .eq('session_id', sessionId)
  return (usedRows ?? []).map((r) => r.question_id as string)
}

export async function pickUnusedQuestion(
  supabase: Supabase,
  sessionId: string,
  category: string,
): Promise<Question | null> {
  const usedIds = await getUsedQuestionIds(supabase, sessionId)
  const all = await fetchQuestionsForCategory(supabase, category)
  const available = all.filter((q) => !usedIds.includes(q.id))
  if (available.length === 0) return null
  return available[Math.floor(Math.random() * available.length)]
}

export async function pickRandomQuestion(
  supabase: Supabase,
  category: string,
): Promise<Question | null> {
  const all = await fetchQuestionsForCategory(supabase, category)
  if (all.length === 0) return null
  return all[Math.floor(Math.random() * all.length)]
}

export type TiebreakRoundResult =
  | {
      ok: true
      roundId: string
      startedAt: string
      question: { id: string; text: string; timeLimit: number; category: string; unit: string | null; hint: string | null }
    }
  | { ok: false; error: 'no_questions' | 'insert_failed' }

export async function createTiebreakRound(
  supabase: Supabase,
  sessionId: string,
  category: string,
  tiebreakPlayerIds: string[],
): Promise<TiebreakRoundResult> {
  const tbQuestion = await pickUnusedQuestion(supabase, sessionId, category)
  if (!tbQuestion) return { ok: false, error: 'no_questions' }

  const { data: latestRoundRows } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('session_id', sessionId)
    .order('round_number', { ascending: false })
    .limit(1)

  const latestRoundNumber = latestRoundRows?.[0]?.round_number ?? 0

  const { data: newRound, error } = await supabase
    .from('rounds')
    .insert({
      session_id: sessionId,
      question_id: tbQuestion.id,
      round_number: latestRoundNumber + 1,
      tiebreak_players: tiebreakPlayerIds,
    })
    .select('id, started_at')
    .single()

  if (error || !newRound) return { ok: false, error: 'insert_failed' }

  return {
    ok: true,
    roundId: newRound.id,
    startedAt: newRound.started_at,
    question: {
      id: tbQuestion.id,
      text: tbQuestion.text,
      timeLimit: tbQuestion.time_limit,
      category: tbQuestion.category,
      unit: tbQuestion.unit ?? null,
      hint: tbQuestion.hint ?? null,
    },
  }
}
