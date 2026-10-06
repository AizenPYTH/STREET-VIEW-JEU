import { useEffect, useRef, useState } from 'react';
import { playSound } from '../services/sound';

/**
 * Animates a number from `from` to `to` once `active` turns true (ease‑out, ~16 ticks of sound).
 * Used for "+842" and "2 431 → 3 273" (phase 2 §5).
 */
export function useCountUp(from: number, to: number, active: boolean, durationMs = 700, sound = false): number {
  const [value, setValue] = useState(active ? to : from);
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    const start = performance.now();
    let lastTick = -1;
    let frame = 0;
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      const tick = Math.floor(t * 14);
      if (sound && tick !== lastTick && t < 1) {
        lastTick = tick;
        playSound('countUp');
      }
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, from, to, durationMs, sound]);
  return value;
}
