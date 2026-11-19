import { describe, expect, it } from 'vitest';
import { newGame, openQuestion, resolveRound } from './game';
const q = { category: 'T', text: 'T', answer: 100, unit: '', source: '' };
function game(n: number) { const g = newGame('A', '0', 't', 30); for (let i = 1; i < n; i++) g.players.push({ id: String(i), name: String(i), token: 't', eliminated: false, shields: 2, golden: false, councilPoints: 100 }); return g; }
const answers = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), 100 + i]));
const shields = (g: ReturnType<typeof game>, id: string) => g.players.find(p => p.id === id)?.shields;
describe('double hit with 22+ knights', () => {
  it('hits the two farthest guesses at 22 knights', () => { const g = game(22); openQuestion(g, 20, 0); g.answers = answers(22); resolveRound(g, q); expect(shields(g, '21')).toBe(1); expect(shields(g, '20')).toBe(1); expect(shields(g, '19')).toBe(2); });
  it('hits only the farthest guess at 21 knights', () => { const g = game(21); openQuestion(g, 20, 0); g.answers = answers(21); resolveRound(g, q); expect(shields(g, '20')).toBe(1); expect(shields(g, '19')).toBe(2); });
  it('eliminates two knights in one round at 22+', () => { const g = game(22); for (const p of g.players) if (p.id === '20' || p.id === '21') p.shields = 1; openQuestion(g, 20, 0); g.answers = answers(22); resolveRound(g, q); expect(g.eliminatedIds.sort()).toEqual(['20', '21']); });
  it('sends a tie for second-farthest to sudden death after hitting the farthest', () => { const g = game(22); openQuestion(g, 20, 0); g.answers = { ...answers(22), '19': 120, '20': 120, '21': 200 }; resolveRound(g, q); expect(shields(g, '21')).toBe(1); expect(g.sudden).toBe(true); expect(g.contenders.sort()).toEqual(['19', '20']); });
});
