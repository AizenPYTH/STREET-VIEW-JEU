import type { RankingEntry } from './types.js';

export interface RankablePlayer {
  id: string;
  totalScore: number;
  totalDistanceMeters: number;
}

/**
 * Sorts players by score (desc), then by total distance (asc, closer is better).
 * Players with identical score and distance share the same rank (1, 1, 3…).
 */
export function rankPlayers(players: readonly RankablePlayer[]): RankingEntry[] {
  const sorted = [...players].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.totalDistanceMeters - b.totalDistanceMeters;
  });
  const entries: RankingEntry[] = [];
  sorted.forEach((player, index) => {
    const previous = entries[index - 1];
    const prevPlayer = sorted[index - 1];
    const tied =
      previous !== undefined &&
      prevPlayer !== undefined &&
      prevPlayer.totalScore === player.totalScore &&
      prevPlayer.totalDistanceMeters === player.totalDistanceMeters;
    entries.push({
      playerId: player.id,
      totalScore: player.totalScore,
      totalDistanceMeters: player.totalDistanceMeters,
      rank: tied && previous ? previous.rank : index + 1,
    });
  });
  return entries;
}

/** Ids of every player holding rank 1 (several in case of a perfect tie). Empty when nobody played. */
export function winnersOf(ranking: readonly RankingEntry[]): string[] {
  return ranking.filter((e) => e.rank === 1).map((e) => e.playerId);
}
