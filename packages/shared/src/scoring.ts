import type { ScoreBreakdown } from './types.js';

export interface ScoringConfig {
  /** Points for a guess at distance 0. */
  maxScore: number;
  /**
   * Distance (meters) controlling how fast points decay. Roughly: at `scaleMeters`
   * a guess is worth ~37% of `maxScore`. Larger cities use a larger scale.
   */
  scaleMeters: number;
  /** Shape of the curve. Values < 1 keep mid‑range guesses generous. */
  exponent: number;
  /** Guesses at or under this distance earn the PERFECT bonus. */
  perfectThresholdMeters: number;
  perfectBonus: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  maxScore: 1000,
  scaleMeters: 2500,
  exponent: 0.7,
  perfectThresholdMeters: 25,
  perfectBonus: 100,
};

/**
 * Pure, deterministic scoring function.
 *
 * score = maxScore · exp(−(d / scale)^exponent)
 *
 * With the defaults (scale 2.5 km, exponent 0.7) this gives:
 *   ≤25 m → 1000 (+100 perfect)   100 m → 900   250 m → 819   500 m → 723
 *   1 km → 591   2 km → 425   5 km → 197   10 km → 71   25 km → 7
 *
 * The curve is continuous, so two guesses a few meters apart never get wildly
 * different scores, while a guess twice as far always scores less.
 */
export function calculateScore(distanceMeters: number, config: ScoringConfig = DEFAULT_SCORING): ScoreBreakdown {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new RangeError(`Invalid distance: ${distanceMeters}`);
  }
  const { maxScore, scaleMeters, exponent, perfectThresholdMeters, perfectBonus } = config;
  if (scaleMeters <= 0 || maxScore <= 0 || exponent <= 0) {
    throw new RangeError('Invalid scoring configuration');
  }

  const isPerfect = distanceMeters <= perfectThresholdMeters;
  const base = isPerfect ? maxScore : Math.round(maxScore * Math.exp(-((distanceMeters / scaleMeters) ** exponent)));
  const bonus = isPerfect ? perfectBonus : 0;
  return {
    base,
    bonus,
    bonusLabel: isPerfect ? 'perfect' : null,
    total: base + bonus,
  };
}

/** Score for a player who did not guess. */
export const NO_GUESS_SCORE: ScoreBreakdown = { base: 0, bonus: 0, bonusLabel: null, total: 0 };

export function scoringForScale(scaleMeters: number): ScoringConfig {
  return { ...DEFAULT_SCORING, scaleMeters };
}
