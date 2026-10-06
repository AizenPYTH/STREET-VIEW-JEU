import type { ButtonHTMLAttributes } from 'react';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function IconButton({ label, className = '', onClick, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        playSound('click');
        haptic('light');
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
