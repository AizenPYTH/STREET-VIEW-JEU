interface TimerRingProps {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  label?: string;
}

/** Circular countdown. Turns red and pulses in the last 10 seconds. */
export function TimerRing({ secondsLeft, totalSeconds, size = 64, label }: TimerRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const urgent = secondsLeft <= 10;
  const critical = secondsLeft <= 5;
  return (
    <div
      className={`timer ${urgent ? 'timer--urgent' : ''} ${critical ? 'timer--critical' : ''}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={label ?? `${secondsLeft} seconds left`}
      data-testid="timer"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="timer__track" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="timer__progress"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="timer__value tabular">{Math.max(0, secondsLeft)}</span>
    </div>
  );
}
