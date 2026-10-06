/**
 * Every scripted duration of the game, in milliseconds (design handoff §13, §20–23, §28, §33,
 * tuned in phase 2 for suspense). The server schedules phases with these values; clients derive
 * each sequence step from the server timestamps carried in snapshots, so every phone plays the
 * sequences in sync.
 */
export const TIMINGS = {
  /** Logo beat shown before the first round intro ("starting" phase). */
  startingLogoMs: 700,
  /** "Revanche demandée par X" beat before a rematch restarts. */
  rematchDelayMs: 3000,
  /** Round intro: title 1200 → 3·2·1 (700 each) → GO 500. */
  intro: { titleMs: 1200, countMs: 700, goMs: 500, totalMs: 3800 },
  /** Extra time the server waits for every player's street view to be ready before starting the timer. */
  panoReadyMaxWaitMs: 4000,
  /** Seconds to place the marker once exploration is over. */
  guessMs: 20_000,
  /** Alignment latency so the reveal starts at the same instant everywhere. */
  revealAlignMs: 300,
  /**
   * Reveal beats: real position, then one player every `markerStepMs` from the farthest to the
   * closest (the round winner lands last), then the winner callout and the perfect banner.
   */
  reveal: { truthMs: 500, markersMs: 1400, markerStepMs: 550, winnerDelayMs: 250, perfectDelayMs: 700, tailMs: 1300 },
  /** Score rows one by one (best first), then the leaderboard, then auto‑advance. */
  results: { firstRowMs: 500, rowStepMs: 600, leaderboardDelayMs: 400, overtakeDelayMs: 700, autoAdvanceMs: 8000 },
  final: { heroMs: 400, rankingMs: 1200, statsMs: 2000, actionsMs: 2800 },
  /** Timer thresholds (seconds): calm → attention → tension → urgency. */
  timerWarnAt: 15,
  timerHotAt: 10,
  timerDangerAt: 5,
  /** A disconnected host loses host rights after this delay. */
  hostGraceMs: 10_000,
  /** A disconnected player is removed from the game after this delay (they can still come back). */
  disconnectRemoveMs: 20_000,
  /** Lobby "X a rejoint" toast lifetime. */
  joinToastMs: 1100,
} as const;

/** When the i‑th revealed player (0 = farthest) appears, for `count` players. */
export function revealMarkerAt(index: number): number {
  return TIMINGS.reveal.markersMs + index * TIMINGS.reveal.markerStepMs;
}

/** Round‑winner callout time for `count` players. */
export function revealWinnerAt(count: number): number {
  return revealMarkerAt(Math.max(0, count - 1)) + TIMINGS.reveal.winnerDelayMs;
}

export function revealPerfectAt(count: number): number {
  return revealWinnerAt(count) + TIMINGS.reveal.perfectDelayMs;
}

/** Total length of the reveal phase for `count` players. */
export function revealDurationMs(count: number): number {
  return revealPerfectAt(count) + TIMINGS.reveal.tailMs;
}

/** When the i‑th score row (0 = best) appears. */
export function resultsRowAt(index: number): number {
  return TIMINGS.results.firstRowMs + index * TIMINGS.results.rowStepMs;
}

/** When the leaderboard (and the host CTA) appears for `count` players. */
export function resultsLeaderboardAt(count: number): number {
  return resultsRowAt(Math.max(0, count - 1)) + TIMINGS.results.rowStepMs + TIMINGS.results.leaderboardDelayMs;
}

/** Total length of the results phase before auto‑advance. */
export function resultsDurationMs(count: number): number {
  return resultsLeaderboardAt(count) + TIMINGS.results.autoAdvanceMs;
}
