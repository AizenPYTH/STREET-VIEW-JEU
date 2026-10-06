import { describe, expect, it } from 'vitest';
import { calculateScore, guessCategory, maxRoundPoints } from './scoring.js';

/**
 * Playtest simulation (phase 2 §30–31): four profiles play many 5‑round games.
 * The assertions pin the properties we want from the scoring: skill is rewarded,
 * a close second can still come back thanks to the doubled final, ties are rare.
 */
let seed = 12345;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = (): number => {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const lognormal = (median: number, sigma: number): number => median * Math.exp(sigma * gauss());

type Profile = () => number;
const PROFILES: Record<string, Profile> = {
  expert: () => lognormal(350, 0.9),
  average: () => lognormal(1200, 0.8),
  bad: () => lognormal(3000, 0.7),
  lucky: () => (rnd() < 0.35 ? lognormal(120, 0.6) : lognormal(4000, 0.6)),
};

interface Outcome {
  winRate: Record<string, number>;
  leaderAfterR4Loses: number;
  closeSecondWins: number;
  draws: number;
}

function simulate(profiles: Record<string, Profile>, games: number, rounds = 5): Outcome {
  const names = Object.keys(profiles);
  const wins: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  let leaderLoses = 0;
  let closeSecond = 0;
  let closeSecondWins = 0;
  let draws = 0;
  for (let g = 0; g < games; g++) {
    const totals: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
    let beforeLast: [string, number][] = [];
    for (let r = 0; r < rounds; r++) {
      const multiplier = r === rounds - 1 ? 2 : 1;
      for (const n of names) totals[n] = (totals[n] ?? 0) + calculateScore(profiles[n]!(), multiplier).total;
      if (r === rounds - 2) beforeLast = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    }
    const final = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const winner = final[0]![0];
    wins[winner] = (wins[winner] ?? 0) + 1;
    if (final[0]![1] === final[1]![1]) draws++;
    if (beforeLast[0]![0] !== winner) leaderLoses++;
    if (beforeLast[0]![1] - beforeLast[1]![1] <= 600) {
      closeSecond++;
      if (beforeLast[1]![0] === winner) closeSecondWins++;
    }
  }
  return {
    winRate: Object.fromEntries(names.map((n) => [n, (wins[n] ?? 0) / games])),
    leaderAfterR4Loses: leaderLoses / games,
    closeSecondWins: closeSecondWins / Math.max(1, closeSecond),
    draws: draws / games,
  };
}

describe('scoring balance', () => {
  it('rewards the best player without making the outcome a formality', () => {
    const o = simulate(PROFILES, 4000);
    expect(o.winRate.expert).toBeGreaterThan(0.7);
    expect(o.winRate.expert).toBeLessThan(0.98);
    expect(o.winRate.bad).toBeLessThan(0.02);
    expect(o.draws).toBeLessThan(0.01);
  });

  it('keeps comebacks alive: a close second after round 4 wins often enough', () => {
    const o = simulate(PROFILES, 4000);
    expect(o.closeSecondWins).toBeGreaterThan(0.15);
    expect(o.leaderAfterR4Loses).toBeGreaterThan(0.05);
  });

  it('between equally skilled friends the lead changes hands regularly', () => {
    const friends: Record<string, Profile> = {
      a: () => lognormal(900, 0.9),
      b: () => lognormal(900, 0.9),
      c: () => lognormal(900, 0.9),
      d: () => lognormal(900, 0.9),
    };
    const o = simulate(friends, 4000);
    expect(o.leaderAfterR4Loses).toBeGreaterThan(0.25);
    expect(o.leaderAfterR4Loses).toBeLessThan(0.6);
    for (const rate of Object.values(o.winRate)) expect(rate).toBeGreaterThan(0.15);
  });

  it('a doubled final can always close a gap of one great round', () => {
    expect(maxRoundPoints(2)).toBe(2100);
    expect(maxRoundPoints(1)).toBe(1100);
  });
});

describe('guessCategory', () => {
  it('maps distances to five readable buckets', () => {
    expect(guessCategory(0).id).toBe('perfect');
    expect(guessCategory(49.9).id).toBe('perfect');
    expect(guessCategory(50).id).toBe('sharp');
    expect(guessCategory(199).id).toBe('sharp');
    expect(guessCategory(200).id).toBe('close');
    expect(guessCategory(499).id).toBe('close');
    expect(guessCategory(500).id).toBe('near');
    expect(guessCategory(1499).id).toBe('near');
    expect(guessCategory(1500).id).toBe('far');
    expect(guessCategory(50_000).id).toBe('far');
  });

  it('the bonus zone matches PARFAIT + PRÉCIS', () => {
    expect(calculateScore(199).bonus).toBe(100);
    expect(guessCategory(199).id).toBe('sharp');
    expect(calculateScore(200).bonus).toBe(0);
    expect(guessCategory(200).id).toBe('close');
  });
});
