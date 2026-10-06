/**
 * Server clock synchronisation. The server is the source of truth for every deadline;
 * the client only renders countdowns using `serverNow()`.
 */
let offsetMs = 0;
let samples = 0;

/** Called with a server timestamp received just now (optionally with the measured round trip). */
export function recordServerTime(serverTime: number, roundTripMs = 0): void {
  const estimate = serverTime + roundTripMs / 2 - Date.now();
  // Exponential smoothing; the first samples dominate so the first render is already right.
  offsetMs = samples === 0 ? estimate : offsetMs * 0.7 + estimate * 0.3;
  samples++;
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function getClockOffset(): number {
  return offsetMs;
}
