import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

export function HowToPlaySheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const steps = [
    { icon: '🔑', title: 'Create or join a room', text: 'Share the 5‑letter code with your friends. 2 to 8 players.' },
    { icon: '👀', title: 'Explore the same street', text: 'Everyone lands at the exact same spot in the city. Look around before the timer ends.' },
    { icon: '📍', title: 'Drop your guess', text: 'Place a marker where you think you are. Nobody sees your guess until the reveal.' },
    { icon: '🏆', title: 'Closest wins', text: 'Up to 1,000 points per round, +100 for a perfect guess. Most points after the last round wins.' },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="How to play">
      <ol className="howto">
        {steps.map((s) => (
          <li key={s.title} className="howto__step">
            <span className="howto__icon" aria-hidden="true">
              {s.icon}
            </span>
            <div>
              <strong>{s.title}</strong>
              <p className="muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button onClick={onClose} block>
        Got it
      </Button>
    </Sheet>
  );
}
