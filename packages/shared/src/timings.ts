/**
 * Every scripted duration of the game, in milliseconds (design handoff §13, §20–23, §28, §33).
 * The server schedules phases with these values; clients derive each sequence step from the
 * server timestamps carried in snapshots, so every phone plays the sequences in sync.
 */
export const TIMINGS = {
  /** Logo beat shown before the first round intro ("starting" phase). */
  startingLogoMs: 700,
  /** "Revanche demandée par X" beat before a rematch restarts. */
  rematchDelayMs: 3000,
  /** Round intro: title 1400 → 3·2·1 (700 each) → GO 500. */
  intro: { titleMs: 1400, countMs: 700, goMs: 500, totalMs: 3800 },
  /** Extra time the server waits for every player's street view to be ready before starting the timer. */
  panoReadyMaxWaitMs: 4000,
  /** Seconds to place the marker once exploration is over. */
  guessMs: 20_000,
  /** Alignment latency so the reveal starts at the same instant everywhere. */
  revealAlignMs: 300,
  reveal: { truthMs: 500, markersMs: 1100, markerStepMs: 120, linesMs: 1900, gridMs: 2600, gridStepMs: 100, perfectMs: 3400, totalMs: 5400 },
  results: { firstRowMs: 500, rowStepMs: 600, leaderboardMs: 3000, autoAdvanceMs: 8000 },
  final: { heroMs: 400, rankingMs: 1200, statsMs: 2000, actionsMs: 2800 },
  /** Timer thresholds (seconds). */
  timerHotAt: 10,
  timerDangerAt: 5,
  /** A disconnected host loses host rights after this delay. */
  hostGraceMs: 10_000,
  /** A disconnected player is removed from the game after this delay (they can still come back). */
  disconnectRemoveMs: 20_000,
  /** Lobby "X a rejoint" toast lifetime. */
  joinToastMs: 1100,
} as const;

export const RESULTS_PHASE_MS = TIMINGS.results.leaderboardMs + TIMINGS.results.autoAdvanceMs;
