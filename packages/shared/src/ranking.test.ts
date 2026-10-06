import { describe, expect, it } from 'vitest';
import { rankPlayers, winnersOf } from './ranking.js';

describe('rankPlayers', () => {
  it('returns an empty ranking for zero players', () => {
    expect(rankPlayers([])).toEqual([]);
    expect(winnersOf([])).toEqual([]);
  });

  it('ranks a single player first', () => {
    const r = rankPlayers([{ id: 'a', totalScore: 0, totalDistanceMeters: 0 }]);
    expect(r[0]?.rank).toBe(1);
    expect(winnersOf(r)).toEqual(['a']);
  });

  it('orders by score then by distance', () => {
    const r = rankPlayers([
      { id: 'a', totalScore: 900, totalDistanceMeters: 5000 },
      { id: 'b', totalScore: 1200, totalDistanceMeters: 100 },
      { id: 'c', totalScore: 900, totalDistanceMeters: 4000 },
    ]);
    expect(r.map((e) => e.playerId)).toEqual(['b', 'c', 'a']);
    expect(r.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('shares ranks on perfect ties', () => {
    const r = rankPlayers([
      { id: 'a', totalScore: 500, totalDistanceMeters: 100 },
      { id: 'b', totalScore: 500, totalDistanceMeters: 100 },
      { id: 'c', totalScore: 100, totalDistanceMeters: 100 },
    ]);
    expect(r.map((e) => e.rank)).toEqual([1, 1, 3]);
    expect(winnersOf(r).sort()).toEqual(['a', 'b']);
  });
});
