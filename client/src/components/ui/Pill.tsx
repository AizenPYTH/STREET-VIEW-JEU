import type { HTMLAttributes } from 'react';

export type PillTone = 'neutral' | 'accent' | 'info' | 'danger' | 'success' | 'warning';

export function Pill({ tone = 'neutral', className = '', ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return <span className={`pill pill--${tone} ${className}`} {...rest} />;
}
