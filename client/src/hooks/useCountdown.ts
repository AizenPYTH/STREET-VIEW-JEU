import { useEffect, useState } from 'react';
import { serverNow } from '../services/clock';

export interface Countdown {
  /** Whole seconds left, never negative. */
  seconds: number;
  msLeft: number;
  done: boolean;
}

function compute(endsAt: number | null): Countdown {
  if (endsAt === null) return { seconds: 0, msLeft: 0, done: false };
  const msLeft = Math.max(0, endsAt - serverNow());
  return { seconds: Math.ceil(msLeft / 1000), msLeft, done: msLeft <= 0 };
}

/** Countdown towards a server timestamp, resilient to device clock tampering. */
export function useCountdown(endsAt: number | null, intervalMs = 200): Countdown {
  const [state, setState] = useState<Countdown>(() => compute(endsAt));
  useEffect(() => {
    setState(compute(endsAt));
    if (endsAt === null) return;
    const id = window.setInterval(() => {
      const next = compute(endsAt);
      setState((prev) => (prev.seconds === next.seconds && prev.done === next.done ? prev : next));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [endsAt, intervalMs]);
  return state;
}
