import { describe, expect, it } from 'vitest';
import { autoAdvanceDue, maybeEndEarly, newGame, openQuestion, resolveRound, revealPause, type Game, type Pacing, type Question } from './game';

const bank: Question[] = Array.from({ length: 20 }, (_, i) => ({ text: `Q${i}`, answer: 1000 + i, unit: '', category: 'c', source: 's', level: (i % 3) + 1 }));
const levels = bank.map(q => q.level!);

// Mirrors roomAction: any poll resolves expired rounds and auto-advances paused reveals.
function poll(g: Game, now: number) {
  if (g.phase === 'question' && now >= g.deadline) { resolveRound(g, bank[g.questionIndex]!); g.revealUntil = (g.phase as string) === 'reveal' ? now + revealPause[g.pacing] : 0; }
  if (autoAdvanceDue(g, now)) openQuestion(g, bank.length, now, levels, Math.random);
}

function play(pacing: Pacing, size: number) {
  const g = newGame('P0', 'p0', 't0', 30, pacing);
  for (let i = 1; i < size; i++) g.players.push({ id: `p${i}`, name: `P${i}`, token: `t${i}`, eliminated: false, shields: 2, golden: false, councilPoints: 100 });
  let now = 0; openQuestion(g, bank.length, now, levels, Math.random);
  const timers: number[] = [];
  for (let step = 0; step < 400 && g.phase !== 'finished'; step++) {
    if (g.phase === 'question') {
      timers.push(g.roundSeconds); const opened = now;
      g.contenders.forEach((id, i) => { g.answers[id] = bank[g.questionIndex]!.answer + 300 + i * 50 + Number(id.slice(1)); maybeEndEarly(g, now); });
      while (g.phase === 'question') { now += 1000; poll(g, now); }
      if (pacing === 'chaos') expect(now - opened).toBeLessThanOrEqual(5000);
      else expect(now - opened).toBeGreaterThanOrEqual(g.roundSeconds * 1000);
    } else if (g.phase === 'reveal') {
      if (pacing === 'steady') { now += 1000; poll(g, now); expect(g.phase).toBe('reveal'); openQuestion(g, bank.length, now, levels, Math.random); }
      else { const start = now; while (g.phase === 'reveal') { now += 1000; poll(g, now); } expect(now - start).toBeGreaterThanOrEqual(revealPause[pacing]); }
    }
  }
  return { g, timers };
}

describe('complete games per pacing', () => {
  for (const pacing of ['steady', 'rising', 'chaos'] as Pacing[]) {
    it(`${pacing}: 6 knights reach a champion through the bracket`, () => {
      const { g, timers } = play(pacing, 6);
      expect(g.phase).toBe('finished');
      expect(g.champion).toBeTruthy();
      expect(g.matches.map(m => m.target)).toEqual([2, 2, 3]);
      if (pacing === 'rising') { expect(timers[1]).toBe(25); expect(Math.min(...timers)).toBe(12); }
      else expect(new Set(timers)).toEqual(new Set([30]));
    });
  }
  it('chaos ends early when a silent contender leaves the duel', () => {
    const g = newGame('A', 'a', 'ta', 30, 'chaos');
    g.players.push({ id: 'b', name: 'B', token: 'tb', eliminated: false, shields: 2, golden: false, councilPoints: 100 }, { id: 'c', name: 'C', token: 'tc', eliminated: false, shields: 2, golden: false, councilPoints: 100 });
    openQuestion(g, bank.length, 0, levels);
    g.answers['a'] = 1; g.answers['b'] = 2; maybeEndEarly(g, 1000); expect(g.deadline).toBe(30000);
    g.players[2]!.eliminated = true; maybeEndEarly(g, 2000); expect(g.deadline).toBe(5000);
  });
});
