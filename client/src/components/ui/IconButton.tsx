import type { ButtonHTMLAttributes } from 'react';
import { playSound } from '../../services/sound';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  large?: boolean;
  overlay?: boolean;
}

export function IconButton({ label, large = false, overlay = false, className = '', onClick, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn ${large ? 'icon-btn--lg' : ''} ${overlay ? 'icon-btn--overlay' : ''} ${className}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        playSound('click');
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
