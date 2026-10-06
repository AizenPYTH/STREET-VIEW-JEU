import { describe, expect, it } from 'vitest';
import { calculateScore, formatPoints } from './scoring.js';

describe('calculateScore (§14)', () => {
  it('matches the documented curve', () => {
    expect(calculateScore(0).base).toBe(1000);
    expect(calculateScore(500).base).toBe(700);
    expect(calculateScore(1000).base).toBe(490);
    expect(calculateScore(2000).base).toBe(240);
    expect(calculateScore(5000).base).toBe(28);
    expect(calculateScore(20_000).base).toBe(0);
  });

  it('adds +100 for a perfect guess strictly under 200 m', () => {
    expect(calculateScore(0)).toEqual({ base: 1000, bonus: 100, bonusLabel: 'perfect', total: 1100 });
    expect(calculateScore(199.9).bonusLabel).toBe('perfect');
    expect(calculateScore(200).bonusLabel).toBeNull();
    expect(calculateScore(200).total).toBe(calculateScore(200).base);
  });

  it('doubles the curve (not the bonus) on a doubled round', () => {
    expect(calculateScore(500, 2).total).toBe(1400);
    expect(calculateScore(50, 2)).toEqual({ base: 1930, bonus: 100, bonusLabel: 'perfect', total: 2030 });
  });

  it('is monotonically decreasing and never negative', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= 50_000; d += 37) {
      const s = calculateScore(d).base;
      expect(s).toBeLessThanOrEqual(previous);
      expect(s).toBeGreaterThanOrEqual(0);
      previous = s;
    }
  });

  it('rejects invalid input', () => {
    expect(() => calculateScore(-1)).toThrow(RangeError);
    expect(() => calculateScore(Number.NaN)).toThrow(RangeError);
    expect(() => calculateScore(10, 0)).toThrow(RangeError);
    expect(() => calculateScore(10, 1.5)).toThrow(RangeError);
  });

  it('is deterministic', () => {
    expect(calculateScore(1234.5)).toEqual(calculateScore(1234.5));
  });
});

describe('formatPoints', () => {
  it('uses a thin space as thousands separator', () => {
    expect(formatPoints(842)).toBe('842');
    expect(formatPoints(4820)).toBe('4 820');
    expect(formatPoints(1234567)).toBe('1 234 567');
  });
});
