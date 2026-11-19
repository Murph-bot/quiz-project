import { describe, expect, it } from 'vitest';
import { newGame, openQuestion, questionKey } from './game';
import { questions } from './questions.server';

describe('same-room question history', () => {
  it('does not replay a question when the bank is reordered between rounds', () => {
    const g = newGame('A', 'a', 't', 30);
    const keys = ['First question?', 'Second question?'].map(text => questionKey({ text }));
    openQuestion(g, 2, 0, [1, 1], () => 0, keys);
    expect(g.usedKeys).toEqual([keys[0]]);
    openQuestion(g, 2, 1000, [1, 1], () => 0, [...keys].reverse());
    expect(g.questionIndex).toBe(0);
    expect(g.usedKeys).toEqual(keys);
  });
  it('does not reset history or reopen an old question when all questions are used', () => {
    const g = newGame('A', 'a', 't', 30);
    openQuestion(g, 1, 0);
    g.phase = 'reveal';
    expect(openQuestion(g, 1, 1000)).toBe(false);
    expect(g.phase).toBe('reveal');
    expect(g.round).toBe(1);
    expect(g.used).toEqual([0]);
    expect(g.questionExhausted).toBe(true);
    expect(g.revealUntil).toBe(0);
  });
  for (const pacing of ['steady', 'rising', 'chaos'] as const) {
    it(`${pacing}: never repeats any question in the expanded bank, including after exhaustion`, () => {
      const g = newGame('A', 'a', 't', 30, pacing);
      const keys = questions.map(questionKey), levels = questions.map(q => q.level ?? 1);
      const seen = new Set<string>();
      expect(questions.length).toBe(616);
      for (let i = 0; i < questions.length; i++) {
        expect(openQuestion(g, questions.length, i * 1000, levels, () => 0.5, keys)).toBe(true);
        const key = keys[g.questionIndex];
        if (key === undefined) throw new Error('Missing question identity');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      expect(openQuestion(g, questions.length, 999999, levels, () => 0.5, keys)).toBe(false);
      expect(seen.size).toBe(616);
      expect(g.usedKeys?.length).toBe(616);
    });
  }
  it('treats punctuation and case edits as the same question', () => {
    expect(questionKey({ text: 'How many planets?' })).toBe(questionKey({ text: 'HOW MANY PLANETS !' }));
  });
});