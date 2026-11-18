import { describe, expect, it } from 'vitest';
import { newGame, returnOfTheFallen, type Game } from './game';

function arena(standing: number, fallen: { wins: number; left?: boolean }[]): Game {
  const g = newGame('A', 's0', 't', 30);
  g.players = [];
  for (let i = 0; i < standing; i++) g.players.push({ id: `s${i}`, name: `S${i}`, token: 't', eliminated: false, shields: 2, golden: false, councilPoints: 100 });
  fallen.forEach((f, i) => g.players.push({ id: `f${i}`, name: `F${i}`, token: 't', eliminated: true, shields: 0, golden: false, councilPoints: 100, closestWins: f.wins, left: !!f.left }));
  g.phase = 'reveal'; g.fallenSinceComeback = 3; return g;
}
const back = (g: Game) => g.players.filter(p => p.id.startsWith('f') && !p.eliminated).map(p => p.id);

describe('Return of the Fallen', () => {
  it('after 3 eliminations with 5 knights standing, the top closest-bet predictor returns with 1 shield', () => {
    const g = arena(5, [{ wins: 1 }, { wins: 3 }, { wins: 2 }]); returnOfTheFallen(g);
    expect(back(g)).toEqual(['f1']); expect(g.players.find(p => p.id === 'f1')!.shields).toBe(1);
    expect(g.fallenSinceComeback).toBe(0); expect(g.players.every(p => (p.closestWins ?? 0) === 0)).toBe(true);
  });
  it('waits until 3 eliminations have happened', () => {
    const g = arena(5, [{ wins: 3 }]); g.fallenSinceComeback = 2; returnOfTheFallen(g); expect(back(g)).toEqual([]);
  });
  it('does not trigger with fewer than 5 knights standing', () => {
    const g = arena(4, [{ wins: 3 }]); returnOfTheFallen(g); expect(back(g)).toEqual([]);
  });
  it('tied predictors all return', () => {
    const g = arena(5, [{ wins: 2 }, { wins: 2 }, { wins: 1 }]); returnOfTheFallen(g); expect(back(g)).toEqual(['f0', 'f1']);
  });
  it('nobody returns without a correct closest bet, and players who left never return', () => {
    const none = arena(5, [{ wins: 0 }]); returnOfTheFallen(none); expect(back(none)).toEqual([]);
    const gone = arena(5, [{ wins: 4, left: true }, { wins: 1 }]); returnOfTheFallen(gone); expect(back(gone)).toEqual(['f1']);
  });
});
