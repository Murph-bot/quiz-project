export type Player = { id: string; name: string; token: string; eliminated: boolean; shields: number; golden: boolean; councilPoints: number; closestWins?: number; left?: boolean };
export type Prediction = { target: string; kind: 'closest' | 'survive'; stake: number; won?: boolean };
export type Quest = { name: string; percent: number; winners: string[] };
export type Question = { text: string; answer: number; unit: string; category: string; source: string; level?: number };
export type Match = { players: string[]; scores: number[]; winner?: string; target: number };
export type Ranking = { id: string; guess: number | null; distance: number | null };
export type Pacing = 'steady' | 'rising' | 'chaos';
export const revealPause: Record<Pacing, number> = { steady: 0, rising: 6000, chaos: 4000 };
export type Game = {
  pacing: Pacing; used: number[]; revealUntil: number; roundSeconds: number;
  players: Player[]; host: string; phase: 'lobby' | 'question' | 'reveal' | 'finished';
  round: number; seconds: number; deadline: number; questionIndex: number;
  answers: Record<string, number>; ranking: Ranking[]; eliminatedIds: string[];
  contenders: string[]; sudden: boolean; matches: Match[]; matchIndex: number;
  finalists: string[]; champion?: string; answer?: number; source?: string;
  damagedIds: string[]; returnedIds: string[]; fallenSinceComeback: number; quest: Quest; predictions: Record<string, Prediction>;
};
export type View = Omit<Game, 'players' | 'answers'> & {
  code: string; players: Omit<Player, 'token'>[]; me: string;
  serverNow: number; submitted: string[]; myGuess: number | null; question: Omit<Question, 'answer' | 'source' | 'level'> | null;
};

export function rankAnswers(ids: string[], answers: Record<string, number>, truth: number): Ranking[] {
  return ids.map(id => ({ id, guess: answers[id] ?? null, distance: answers[id] === undefined ? null : Math.abs(answers[id] - truth) }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}
export function worstTies(ranking: Ranking[]) {
  const worst = ranking.at(-1)?.distance;
  return ranking.filter(r => r.distance === worst).map(r => r.id);
}
export function newGame(name: string, id: string, token: string, seconds: number, pacing: Pacing = 'steady'): Game {
  return { pacing, used: [], revealUntil: 0, roundSeconds: seconds, players: [{ id, name, token, eliminated: false, shields: 2, golden: false, councilPoints: 100 }], host: id, phase: 'lobby', round: 0, seconds,
    deadline: 0, questionIndex: -1, answers: {}, ranking: [], eliminatedIds: [], contenders: [], sudden: false,
    matches: [], matchIndex: 0, finalists: [], damagedIds: [], returnedIds: [], fallenSinceComeback: 0, quest: { name: 'Bullseye Bounty', percent: 8, winners: [] }, predictions: {} };
}
export function normalizeGame(g: Game) {
  for (const p of g.players) { p.shields ??= p.eliminated ? 0 : 2; p.golden ??= false; p.councilPoints ??= 100; }
  g.damagedIds ??= []; g.returnedIds ??= []; g.fallenSinceComeback ??= 0; g.quest ??= { name: 'Bullseye Bounty', percent: 8, winners: [] }; g.predictions ??= {};
  g.pacing ??= 'steady'; g.used ??= []; g.revealUntil ??= 0; g.roundSeconds ??= g.seconds;
  return g;
}
/** Legacy percentage window, no longer used for the bounty: the closest absolute guess wins. */
export function qualifiesBounty(guess: number, answer: number, percent: number) {
  return Math.abs(guess - answer) <= Math.abs(answer) * percent / 100;
}
export function placePrediction(g: Game, playerId: string, prediction: Prediction, now: number) {
  const player = g.players.find(p => p.id === playerId);
  if (!player?.eliminated) throw new Error('Only the Shadow Council can wager.');
  if (g.phase !== 'question' || now >= g.deadline) throw new Error('Predictions are closed for this round.');
  if (g.predictions[playerId]) throw new Error('Your prediction is already locked.');
  if (!g.contenders.includes(prediction.target) || g.players.find(p => p.id === prediction.target)?.eliminated) throw new Error('Choose a knight in this round.');
  if (![5, 10, 20].includes(prediction.stake) || player.councilPoints < prediction.stake) throw new Error('Not enough council points for this wager.');
  player.councilPoints -= prediction.stake; g.predictions[playerId] = prediction;
}
function settlePredictions(g: Game) {
  const closestDistance = g.ranking[0]?.distance;
  for (const [id, prediction] of Object.entries(g.predictions)) {
    const player = g.players.find(p => p.id === id);
    const target = g.players.find(p => p.id === prediction.target);
    const result = g.ranking.find(r => r.id === prediction.target);
    prediction.won = prediction.kind === 'survive' ? target?.eliminated === false : result?.distance !== null && result?.distance !== undefined && result.distance === closestDistance;
    if (prediction.won && player) player.councilPoints += prediction.stake * 2;
    if (prediction.won && player && prediction.kind === 'closest') player.closestWins = (player.closestWins ?? 0) + 1;
  }
}
export function startBracket(g: Game) {
  const ids = g.players.filter(p => !p.eliminated).map(p => p.id);
  if (ids.length === 4) {
    g.matches = [{ players: ids.slice(0, 2), scores: [0, 0], target: 2 }, { players: ids.slice(2, 4), scores: [0, 0], target: 2 }];
  } else if (ids.length === 2) {
    g.matches = [{ players: ids, scores: [0, 0], target: 3 }];
  }
  g.matchIndex = 0;
}
export function secondsFor(g: Pick<Game, 'pacing' | 'seconds' | 'round' | 'sudden'>) {
  if (g.sudden) return 15;
  return g.pacing === 'rising' ? Math.max(12, g.seconds - 5 * (g.round - 1)) : g.seconds;
}
export function pickQuestion(g: Game, levels: number[], rand: () => number = Math.random) {
  let pool = levels.map((_, i) => i).filter(i => !g.used.includes(i));
  if (!pool.length) { g.used = []; pool = levels.map((_, i) => i); }
  if (g.pacing === 'rising') {
    const active = g.players.filter(p => !p.eliminated).length;
    const tier = g.matches.length || active <= 4 ? 3 : active <= 6 ? 2 : 1;
    const tiered = pool.filter(i => levels[i] === tier);
    if (tiered.length) pool = tiered;
  }
  const pick = pool[Math.floor(rand() * pool.length)] ?? 0;
  g.used.push(pick); return pick;
}
export function autoAdvanceDue(g: Game, now: number) {
  return g.phase === 'reveal' && g.pacing !== 'steady' && g.revealUntil > 0 && now >= g.revealUntil;
}
export function maybeEndEarly(g: Game, now: number) {
  const live = g.contenders.filter(id => !g.players.find(p => p.id === id)?.eliminated);
  if (g.pacing === 'chaos' && g.phase === 'question' && live.length > 0 && live.every(id => g.answers[id] !== undefined)) g.deadline = Math.min(g.deadline, now + 3000);
}
export function openQuestion(g: Game, questionCount: number, now: number, levels?: number[], rand?: () => number) {
  normalizeGame(g);
  if (!g.sudden) {
    const active = g.players.filter(p => !p.eliminated).map(p => p.id);
    if (!g.matches.length && (active.length === 4 || active.length === 2)) startBracket(g);
    const match = g.matches[g.matchIndex];
    g.contenders = match ? [...match.players] : active;
  }
  g.phase = 'question'; g.round++; g.questionIndex = pickQuestion(g, levels ?? Array<number>(questionCount).fill(1), rand ?? (() => 0));
  g.answers = {}; g.ranking = []; g.eliminatedIds = []; delete g.answer; delete g.source;
  g.damagedIds = []; g.returnedIds = []; g.predictions = {};
  g.quest = { name: 'Bullseye Bounty', percent: 0, winners: [] };
  g.roundSeconds = secondsFor(g); g.revealUntil = 0;
  g.deadline = now + g.roundSeconds * 1000;
}
export function resolveRound(g: Game, q: Question) {
  normalizeGame(g);
  g.ranking = rankAnswers(g.contenders, g.answers, q.answer);
  g.answer = q.answer; g.source = q.source; g.phase = 'reveal';
  for (const r of g.ranking) {
    const p = g.players.find(p => p.id === r.id);
    if (!g.matches.length && p && !p.eliminated && r.guess !== null && r.distance === g.ranking[0]?.distance) {
      if (p.shields < 2) p.shields++; else p.golden = true;
      g.quest.winners.push(p.id);
    }
  }
  const tied = worstTies(g.ranking);
  if (tied.length > 1) { settlePredictions(g); g.sudden = true; g.contenders = tied; return; }
  const loser = tied[0];
  if (!loser) return;
  g.sudden = false;
  const loserPlayer = g.players.find(p => p.id === loser);
  if (!g.matches.length && loserPlayer) {
    if (loserPlayer.golden) loserPlayer.golden = false;
    else loserPlayer.shields = Math.max(0, loserPlayer.shields - 1);
    g.damagedIds = [loser];
  }
  if (g.matches.length) {
    const match = g.matches[g.matchIndex];
    if (!match) return;
    const winnerIndex = match.players.findIndex(id => id !== loser);
    if (winnerIndex < 0) return;
    const winner = match.players[winnerIndex];
    if (!winner) return;
    const score = (match.scores[winnerIndex] ?? 0) + 1;
    match.scores[winnerIndex] = score;
    if (score >= match.target) {
      match.winner = winner;
      g.eliminatedIds = [loser];
      const p = g.players.find(p => p.id === loser); if (p) { p.shields = 0; p.golden = false; p.eliminated = true; }
      if (match.target === 3) { g.champion = winner; g.phase = 'finished'; }
      else {
        g.finalists.push(winner); g.matchIndex++;
        if (g.finalists.length === 2) g.matches.push({ players: [...g.finalists], scores: [0, 0], target: 3 });
      }
    }
  } else {
    if (loserPlayer && loserPlayer.shields === 0) { loserPlayer.eliminated = true; g.eliminatedIds = [loser]; g.fallenSinceComeback++; }
    const active = g.players.filter(p => !p.eliminated);
    const survivor = active[0];
    if (active.length === 1 && survivor) { g.champion = survivor.id; g.phase = 'finished'; }
  }
  settlePredictions(g);
  if (g.phase === 'reveal' && !g.matches.length) returnOfTheFallen(g);
}
/** Every 3 eliminations, while 5+ knights stand, the spectator(s) with the most correct "closest knight" bets return with 1 shield. */
export function returnOfTheFallen(g: Game) {
  if (g.fallenSinceComeback < 3) return;
  if (g.players.filter(p => !p.eliminated).length < 5) return;
  const fallen = g.players.filter(p => p.eliminated && !p.left);
  const best = Math.max(0, ...fallen.map(p => p.closestWins ?? 0));
  if (best === 0) return;
  g.returnedIds = fallen.filter(p => (p.closestWins ?? 0) === best).map(p => p.id);
  for (const p of fallen) { if (g.returnedIds.includes(p.id)) { p.eliminated = false; p.shields = 1; p.golden = false; } }
  for (const p of g.players) p.closestWins = 0;
  g.fallenSinceComeback = 0;
}
