import { TIMINGS } from '@cityguess/shared';

interface TimerProps {
  seconds: number;
  variant: 'hud' | 'map';
  /** Shown while the timer is held (street views loading). */
  held?: boolean;
}

/** Circular countdown (§13): neutral → hot ≤ 10 s → danger ≤ 5 s with pulse. */
export function Timer({ seconds, variant, held = false }: TimerProps) {
  const danger = !held && seconds <= TIMINGS.timerDangerAt;
  const hot = !held && !danger && seconds <= TIMINGS.timerHotAt;
  const warn = !held && !danger && !hot && seconds <= TIMINGS.timerWarnAt;
  return (
    <div
      className={`timer timer--${variant} ${warn ? 'timer--warn' : ''} ${hot ? 'timer--hot' : ''} ${danger ? 'timer--danger' : ''}`}
      role="timer"
      aria-live={seconds === 10 || seconds === 5 ? 'polite' : 'off'}
      aria-label={`${seconds} secondes`}
      data-testid="timer"
      data-seconds={seconds}
    >
      {Math.max(0, seconds)}
    </div>
  );
}
