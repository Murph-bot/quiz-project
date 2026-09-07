import type { BracketState } from '@/types'

export function getBracketFinalists(bracket: BracketState | null | undefined): string[] {
  return bracket?.finalists ?? []
}

export function isBracketFinalist(
  bracket: BracketState | null | undefined,
  playerId: string | null | undefined,
): boolean {
  if (!bracket || !playerId) return false
  return getBracketFinalists(bracket).includes(playerId)
}

export type MatchPhase = 'sf1' | 'sf2' | 'final'

export function inferMatchPhaseFromBracket(b: BracketState): MatchPhase | null {
  if (b.finalists?.length === 2 && (b.currentSF === null || b.currentSF === undefined)) {
    return 'final'
  }
  if (b.currentSF === 1) return 'sf1'
  if (b.currentSF === 2) return 'sf2'
  return null
}

/** The two players of the current bracket match, or null outside bracket phases. */
export function getBracketMatchPlayerIds(session: {
  phase?: string | null
  bracket?: BracketState | null
}): string[] | null {
  if (session.phase !== 'semifinal' && session.phase !== 'final') return null
  if (!session.bracket) return null
  if (session.phase === 'final') {
    return session.bracket.finalists ?? null
  }
  const sf =
    session.bracket.currentSF === 1 ? session.bracket.sf1 : session.bracket.sf2
  return sf ? [sf.p1id, sf.p2id] : null
}

/** Am I one of the two players competing in the current bracket match? */
export function isCompetingInMatch(
  bd: BracketState | null,
  phase: MatchPhase | null,
  pid: string | null,
): boolean {
  if (!bd || !phase || !pid) return true
  if (phase === 'sf1') return bd.sf1.p1id === pid || bd.sf1.p2id === pid
  if (phase === 'sf2') return bd.sf2.p1id === pid || bd.sf2.p2id === pid
  return isBracketFinalist(bd, pid)
}

/** finalists[] stores player IDs — resolve display names via the sf1/sf2 records. */
export function getFinalistNickname(bd: BracketState, id: string): string {
  if (bd.sf1.p1id === id) return bd.sf1.p1
  if (bd.sf1.p2id === id) return bd.sf1.p2
  if (bd.sf2.p1id === id) return bd.sf2.p1
  if (bd.sf2.p2id === id) return bd.sf2.p2
  return id // fallback (should not happen)
}

export async function generateBracketForSession(
  supabase: ReturnType<typeof import('@/lib/supabase-server').createServerClient>,
  sessionId: string
): Promise<BracketState | null> {
  const { data: alivePlayers } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('session_id', sessionId)
    .eq('is_alive', true)

  const aliveList = (alivePlayers ?? []) as Array<{ id: string; nickname: string }>
  if (aliveList.length !== 4) return null

  const { data: roundsWithAnswers } = await supabase
    .from('rounds')
    .select('question_id, answers(player_id, value), questions(answer)')
    .eq('session_id', sessionId)
    .eq('status', 'closed')
    .is('tiebreak_players', null)

  const totalDelta: Record<string, number> = {}
  for (const p of aliveList) totalDelta[p.id] = 0

  interface RoundWithAnswers {
    questions: { answer: number } | Array<{ answer: number }> | null
    answers: Array<{ player_id: string; value: number | null }> | null
  }

  for (const r of (roundsWithAnswers ?? []) as RoundWithAnswers[]) {
    const q = r.questions
    const correct = (Array.isArray(q) ? q[0]?.answer : q?.answer) ?? 0
    const answeredIds = new Set((r.answers ?? []).map((a) => a.player_id))
    for (const ans of r.answers ?? []) {
      totalDelta[ans.player_id] = (totalDelta[ans.player_id] ?? 0) + Math.abs((ans.value ?? 0) - correct)
    }
    for (const p of aliveList) {
      if (!answeredIds.has(p.id)) {
        totalDelta[p.id] = (totalDelta[p.id] ?? 0) + 999999
      }
    }
  }

  const ranked = [...aliveList].sort((a, b) => (totalDelta[a.id] ?? 0) - (totalDelta[b.id] ?? 0))
  return {
    sf1: { p1id: ranked[0].id, p1: ranked[0].nickname, p2id: ranked[3].id, p2: ranked[3].nickname, wins: [0, 0] },
    sf2: { p1id: ranked[1].id, p1: ranked[1].nickname, p2id: ranked[2].id, p2: ranked[2].nickname, wins: [0, 0] },
    currentSF: 1,
    finalists: [],
  }
}

const EMPTY_MATCH = { p1id: '', p1: '', p2id: '', p2: '', wins: [0, 0] as [number, number] }

/** Two survivors enter a best-of-3-nearest final (first to 3 round wins). */
export async function generateFinalForSession(
  supabase: ReturnType<typeof import('@/lib/supabase-server').createServerClient>,
  sessionId: string,
): Promise<BracketState | null> {
  const { data: alivePlayers } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('session_id', sessionId)
    .eq('is_alive', true)

  const aliveList = (alivePlayers ?? []) as Array<{ id: string; nickname: string }>
  if (aliveList.length !== 2) return null

  const [a, b] = aliveList
  return {
    sf1: { p1id: a.id, p1: a.nickname, p2id: b.id, p2: b.nickname, wins: [0, 0] },
    sf2: { ...EMPTY_MATCH },
    currentSF: null,
    finalists: [a.id, b.id],
    finalWins: [0, 0],
  }
}

