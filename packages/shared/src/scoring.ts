import type { ScoreBreakdown } from './types.js';

export interface ScoringConfig {
  /** Points for a guess at distance 0. */
  maxScore: number;
  /** Distance (meters) at which the score has decayed to ~37% of `maxScore`. */
  scaleMeters: number;
  /** Guesses strictly under this distance earn the PERFECT bonus. */
  perfectThresholdMeters: number;
  perfectBonus: number;
}

/** Design handoff §14. */
export const DEFAULT_SCORING: ScoringConfig = {
  maxScore: 1000,
  scaleMeters: 1400,
  perfectThresholdMeters: 200,
  perfectBonus: 100,
};

/**
 * Pure, deterministic scoring function (server‑side only).
 *
 *   points = round(maxScore · e^(−d / scale)) · multiplier
 *
 * With the defaults: 0 m = 1000, 500 m ≈ 700, 1 km ≈ 490, 2 km ≈ 240, 5 km ≈ 28.
 * A doubled round (last round) uses `multiplier = 2` on the curve; the perfect bonus
 * (< 200 m) is a fixed +100 shown separately then added to the total.
 */
export function calculateScore(distanceMeters: number, multiplier = 1, config: ScoringConfig = DEFAULT_SCORING): ScoreBreakdown {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new RangeError(`Invalid distance: ${distanceMeters}`);
  }
  if (!Number.isInteger(multiplier) || multiplier < 1) throw new RangeError(`Invalid multiplier: ${multiplier}`);
  const { maxScore, scaleMeters, perfectThresholdMeters, perfectBonus } = config;
  if (scaleMeters <= 0 || maxScore <= 0) throw new RangeError('Invalid scoring configuration');

  const base = Math.round(maxScore * Math.exp(-distanceMeters / scaleMeters)) * multiplier;
  const isPerfect = distanceMeters < perfectThresholdMeters;
  const bonus = isPerfect ? perfectBonus : 0;
  return { base, bonus, bonusLabel: isPerfect ? 'perfect' : null, total: base + bonus };
}

/** Score for a player who did not guess at all (never happens in a normal game: the server auto‑guesses). */
export const NO_GUESS_SCORE: ScoreBreakdown = { base: 0, bonus: 0, bonusLabel: null, total: 0 };

/** Thousands separated by a thin space, French style ("4 820"). */
export function formatPoints(points: number): string {
  return Math.round(points)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export type GuessCategoryId = 'perfect' | 'sharp' | 'close' | 'near' | 'far';

export interface GuessCategory {
  id: GuessCategoryId;
  /** Short French label shown on the reveal ("PARFAIT", "PRÉCIS"…). */
  label: string;
  emoji: string;
}

/**
 * Memorable distance buckets (phase 2 §6). Few enough to read instantly.
 * The +100 bonus still applies strictly under `perfectThresholdMeters` (200 m), i.e. PARFAIT and PRÉCIS.
 */
export function guessCategory(distanceMeters: number): GuessCategory {
  if (distanceMeters < 50) return { id: 'perfect', label: 'Parfait', emoji: '🔥' };
  if (distanceMeters < 200) return { id: 'sharp', label: 'Précis', emoji: '🎯' };
  if (distanceMeters < 500) return { id: 'close', label: 'Proche', emoji: '👌' };
  if (distanceMeters < 1500) return { id: 'near', label: 'Pas loin', emoji: '🙂' };
  return { id: 'far', label: 'Loin', emoji: '🧭' };
}

/** Highest total a player can reach in a game (for comeback messaging). */
export function maxRoundPoints(multiplier: number, config: ScoringConfig = DEFAULT_SCORING): number {
  return config.maxScore * multiplier + config.perfectBonus;
}
