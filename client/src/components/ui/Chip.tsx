import type { ReactNode } from 'react';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface ChipProps {
  selected?: boolean;
  future?: boolean;
  small?: boolean;
  onClick?(): void;
  children: ReactNode;
  ariaLabel?: string;
}

export function Chip({ selected = false, future = false, small = false, onClick, children, ariaLabel }: ChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      className={`chip ${selected ? 'chip--selected' : ''} ${future ? 'chip--future' : ''} ${small ? 'chip--sm' : ''}`}
      disabled={future}
      onClick={() => {
        if (selected) return;
        playSound('click');
        haptic('light');
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  fill = false,
  small = false,
  ariaLabel,
}: {
  options: readonly { value: T; label: string; future?: boolean }[];
  value: T;
  onChange(v: T): void;
  fill?: boolean;
  small?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className={`chip-row ${fill ? 'chip-row--fill' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <Chip key={String(o.value)} selected={o.value === value} future={o.future} small={small} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
