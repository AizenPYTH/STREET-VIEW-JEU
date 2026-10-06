import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange?(value: T): void;
  disabled?: boolean;
  ariaLabel: string;
}

export function Segmented<T extends string | number>({ options, value, onChange, disabled = false, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${disabled ? 'segmented--readonly' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`segmented__option ${selected ? 'segmented__option--selected' : ''}`}
            disabled={disabled}
            onClick={() => {
              if (selected) return;
              playSound('click');
              haptic('light');
              onChange?.(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
