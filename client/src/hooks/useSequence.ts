import { useEffect, useState } from 'react';
import { serverNow } from '../services/clock';

/**
 * Milliseconds elapsed since a server timestamp. Re‑renders exactly when one of the
 * `checkpoints` (ms) is crossed, so scripted sequences stay in sync across phones
 * without polling. Returns -1 when `startsAt` is null.
 */
export function useSequence(startsAt: number | null, checkpoints: readonly number[]): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (startsAt === null) return;
    const timers: number[] = [];
    const elapsed = serverNow() - startsAt;
    for (const cp of checkpoints) {
      if (cp > elapsed) timers.push(window.setTimeout(() => force((n) => n + 1), cp - elapsed + 5));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [startsAt, checkpoints.join(',')]);
  return startsAt === null ? -1 : serverNow() - startsAt;
}

/** True once `ms` has elapsed since `startsAt` (server time). */
export function useElapsedAtLeast(startsAt: number | null, ms: number): boolean {
  const elapsed = useSequence(startsAt, [ms]);
  return elapsed >= ms;
}
