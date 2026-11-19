import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { autoAdvanceDue, maybeEndEarly, revealPause, newGame, normalizeGame, openQuestion, placePrediction, questionKey, resolveRound, type Game, type View } from './game';

const MAX_PLAYERS = 52;
const ticketSchema = z.object({ code: z.string().regex(/^[A-Z]{4}$/), token: z.string().uuid(), action: z.enum(['sync', 'start', 'next', 'answer', 'leave', 'predict']), guess: z.number().finite().min(-1e12).max(1e12).optional(), prediction: z.object({ target: z.string().uuid(), kind: z.enum(['closest', 'survive']), stake: z.union([z.literal(5), z.literal(10), z.literal(20)]) }).optional() });
export const enterRoom = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ name: z.string().trim().min(1).max(18), code: z.string().regex(/^[A-Z]{4}$/).optional(), seconds: z.number().int().min(15).max(60).default(30), pacing: z.enum(['steady', 'rising', 'chaos']).default('steady') }))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const id = crypto.randomUUID(), token = crypto.randomUUID();
    if (!data.code) {
      for (let i = 0; i < 8; i++) {
        const bytes = crypto.getRandomValues(new Uint8Array(4));
        const code = [...bytes].map(b => String.fromCharCode(65 + b % 26)).join('');
        const { error } = await db.from('quiz_rooms').insert({ code, state: JSON.parse(JSON.stringify(newGame(data.name, id, token, data.seconds, data.pacing))) });
        if (!error) return { code, token };
        if (error.code !== '23505') throw new Error('The room could not be created. Please try again.');
      }
      throw new Error('Please try creating a room again.');
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const { data: row } = await db.from('quiz_rooms').select('*').eq('code', data.code).single();
      if (!row) throw new Error('Room not found. Check your four-letter code.');
      const g = normalizeGame(row.state as unknown as Game);
      if (g.players.length >= MAX_PLAYERS) throw new Error('This room is full.');
      if (g.players.some(p => p.name.toLowerCase() === data.name.toLowerCase())) throw new Error('That nickname is taken in this room.');
      g.players.push({ id, token, name: data.name, eliminated: g.phase !== 'lobby', shields: g.phase === 'lobby' ? 2 : 0, golden: false, councilPoints: 100 });
      const { data: updated, error } = await db.from('quiz_rooms').update({ state: JSON.parse(JSON.stringify(g)), version: row.version + 1 }).eq('code', data.code).eq('version', row.version).select('code');
      if (error) throw new Error('Could not join this room.');
      if (updated?.length) return { code: data.code, token };
    }
    throw new Error('Room is busy. Please try again.');
  });

export const roomAction = createServerFn({ method: 'POST' }).inputValidator(ticketSchema)
  .handler(async ({ data }): Promise<View> => {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { questions } = await import('./questions.server');
    const levels = questions.map(q => q.level ?? 1), keys = questions.map(questionKey);
    const rand = () => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;
    for (let attempt = 0; attempt < 12; attempt++) {
      const { data: row, error } = await db.from('quiz_rooms').select('*').eq('code', data.code).single();
      if (error || !row) throw new Error('This room is no longer available.');
      const g = normalizeGame(row.state as unknown as Game);
      const me = g.players.find(p => p.token === data.token);
      if (!me) throw new Error('Your player ticket is not valid for this room.');
      let changed = false;
      // Migrate legacy index histories once; all new history survives bank reordering.
      if (!g.usedKeys) { g.usedKeys = g.used.flatMap(i => keys[i] ? [keys[i]] : []); changed = true; }
      const savedQuestion = questions[g.questionIndex];
      if (!g.currentQuestion && savedQuestion) { g.currentQuestion = savedQuestion; changed = true; }
      const now = Date.now();
      const advance = () => {
        if (openQuestion(g, questions.length, now, levels, rand, keys)) {
          const selected = questions[g.questionIndex];
          if (!selected) throw new Error('The next question is unavailable.');
          g.currentQuestion = selected;
        }
        changed = true;
      };
      if (g.phase === 'question' && now >= g.deadline) {
        const currentQuestion = g.currentQuestion;
        if (!currentQuestion) throw new Error('The current question is unavailable.');
        resolveRound(g, currentQuestion); g.revealUntil = (g.phase as string) === 'reveal' ? now + revealPause[g.pacing] : 0; changed = true;
      }
      if (autoAdvanceDue(g, now)) advance();
      if (data.action === 'start' || data.action === 'next') {
        if (g.host !== me.id) throw new Error('Only the host can advance the game.');
        if (data.action === 'start' && g.phase === 'lobby') {
          if (g.players.length < 2) throw new Error('Invite at least one friend to start.');
          advance();
        } else if (data.action === 'next' && g.phase === 'reveal') {
          advance();
        }
      }
      if (data.action === 'answer') {
        if (g.phase !== 'question' || now >= g.deadline) throw new Error('Time is up!');
        if (!g.contenders.includes(me.id) || me.eliminated) throw new Error('You are spectating this round.');
        if (g.answers[me.id] !== undefined) throw new Error('Your guess is already locked in.');
        if (data.guess === undefined) throw new Error('Enter a numeric guess.');
        g.answers[me.id] = data.guess; maybeEndEarly(g, now); changed = true;
      }
      if (data.action === 'leave') {
        if (g.phase === 'lobby') g.players = g.players.filter(p => p.id !== me.id);
        else { me.eliminated = true; me.left = true; me.shields = 0; maybeEndEarly(g, now); }
        if (g.host === me.id) g.host = g.players.find(p => p.id !== me.id)?.id ?? '';
        changed = true;
      }
      if (data.action === 'predict') {
        if (!data.prediction) throw new Error('Choose a prediction.');
        placePrediction(g, me.id, data.prediction, now); changed = true;
      }
      if (changed) {
        const { data: updated, error: updateError } = await db.from('quiz_rooms').update({ state: JSON.parse(JSON.stringify(g)), version: row.version + 1 }).eq('code', data.code).eq('version', row.version).select('code');
        if (updateError) throw new Error('Could not update the game. Try again.');
        if (!updated?.length) continue;
      }
      const { answers, players, currentQuestion: q, usedKeys: _usedKeys, ...state } = g;
      return { ...state, code: data.code, serverNow: Date.now(), me: me.id, players: players.map(({ token: _ticket, ...p }) => p), submitted: Object.keys(answers), myGuess: answers[me.id] ?? null, question: q ? { text: q.text, unit: q.unit, category: q.category } : null };
    }
    throw new Error('Room is busy. Please try again.');
  });