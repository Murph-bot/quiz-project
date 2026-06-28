import type { BracketState } from '@/types'

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

  for (const r of (roundsWithAnswers ?? []) as any[]) {
    const correct = r.questions?.answer ?? 0
    const answeredIds = new Set((r.answers ?? []).map((a: any) => a.player_id as string))
    for (const ans of r.answers ?? []) {
      totalDelta[ans.player_id] = (totalDelta[ans.player_id] ?? 0) + Math.abs(ans.value - correct)
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
