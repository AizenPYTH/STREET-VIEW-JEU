import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING, calculateScore, scoringForScale } from './scoring.js';

describe('calculateScore', () => {
  it('gives max score + perfect bonus at distance 0', () => {
    expect(calculateScore(0)).toEqual({ base: 1000, bonus: 100, bonusLabel: 'perfect', total: 1100 });
  });

  it('gives the perfect bonus up to the threshold and not beyond', () => {
    expect(calculateScore(25).bonusLabel).toBe('perfect');
    expect(calculateScore(25.5).bonusLabel).toBeNull();
    expect(calculateScore(25.5).total).toBeLessThan(1000);
  });

  it('follows the documented curve', () => {
    expect(calculateScore(100).total).toBe(900);
    expect(calculateScore(250).total).toBe(819);
    expect(calculateScore(500).total).toBe(723);
    expect(calculateScore(1000).total).toBe(591);
    expect(calculateScore(2000).total).toBe(425);
    expect(calculateScore(5000).total).toBe(197);
    expect(calculateScore(10_000).total).toBe(71);
  });

  it('is monotonically decreasing', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= 50_000; d += 37) {
      const s = calculateScore(d).total;
      expect(s).toBeLessThanOrEqual(previous);
      previous = s;
    }
  });

  it('never goes negative, even very far away', () => {
    expect(calculateScore(2_000_000).total).toBe(0);
  });

  it('small distance differences do not produce cliffs (outside the perfect zone)', () => {
    for (let d = 30; d < 20_000; d += 50) {
      const a = calculateScore(d).total;
      const b = calculateScore(d + 10).total;
      expect(a - b).toBeLessThanOrEqual(12);
    }
  });

  it('larger cities are more forgiving', () => {
    const small = calculateScore(2000, scoringForScale(1800)).total;
    const big = calculateScore(2000, scoringForScale(5000)).total;
    expect(big).toBeGreaterThan(small);
  });

  it('rejects invalid input', () => {
    expect(() => calculateScore(-1)).toThrow(RangeError);
    expect(() => calculateScore(Number.NaN)).toThrow(RangeError);
    expect(() => calculateScore(10, { ...DEFAULT_SCORING, scaleMeters: 0 })).toThrow(RangeError);
  });

  it('is deterministic', () => {
    expect(calculateScore(1234.5)).toEqual(calculateScore(1234.5));
  });
});
