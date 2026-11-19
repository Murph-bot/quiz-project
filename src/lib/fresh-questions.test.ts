import { describe, expect, it } from 'vitest';
import { newGame, openQuestion, questionKey, rankAnswers, resolveRound } from './game';
import { questions } from './questions.server';

const fresh = questions.slice(592);
const checkedAnswers = [687, 3390, 13, 2737, 1280, 227, 27572, 233, 14, 102, 1973, 46, 254, 20, 5.5, 800, 600, 260, 220, 7, 2.5, 4, 1958, 2005];

describe('source-checked estimation batch', () => {
  it('adds 24 questions without duplicate identities', () => {
    expect(fresh).toHaveLength(24);
    expect(new Set(questions.map(questionKey)).size).toBe(616);
  });
  checkedAnswers.forEach((answer, index) => {
    it(`retains verified answer ${answer} for addition ${index + 1}`, () => {
      expect(fresh[index]?.answer).toBe(answer);
    });
  });
  it('ranks decimal guesses using absolute distance', () => {
    expect(rankAnswers(['a', 'b'], { a: 5.4, b: 5.7 }, 5.5)[0]?.id).toBe('a');
  });
  it('plays and reveals every new question through the normal round rules', () => {
    for (const question of fresh) {
      const g = newGame('Tester', 'a', 'ticket', 30);
      g.players.push(...newGame('Opponent', 'b', 'other-ticket', 30).players);
      expect(openQuestion(g, 1, 0, [question.level ?? 1], () => 0, [questionKey(question)])).toBe(true);
      g.answers = { a: question.answer, b: question.answer + 10 };
      resolveRound(g, question);
      expect(g.phase).toBe('reveal');
      expect(g.answer).toBe(question.answer);
      expect(g.source).toBe(question.source);
      expect(g.ranking[0]?.distance).toBe(0);
      expect(g.ranking[0]?.guess).toBe(question.answer);
    }
  });
});