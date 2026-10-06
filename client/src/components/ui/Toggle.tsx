import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface ToggleProps {
  on: boolean;
  onChange(next: boolean): void;
  label: string;
  hint?: string;
}

export function Toggle({ on, onChange, label, hint }: ToggleProps) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-row__label">{label}</div>
        {hint && <div className="toggle-row__hint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`toggle ${on ? 'toggle--on' : ''}`}
        onClick={() => {
          onChange(!on);
          playSound('click');
          haptic('light');
        }}
      >
        <span className="toggle__knob" />
      </button>
    </div>
  );
}
