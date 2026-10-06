import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  /** Pulsing glow: this is THE next gesture (§8). */
  glow?: boolean;
  filled?: boolean;
  small?: boolean;
  center?: boolean;
  icon?: ReactNode;
  silent?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, glow = false, filled = false, small = false, center = false, icon, silent = false, className = '', children, onClick, disabled, ...rest },
  ref,
) {
  const classes = [
    'btn',
    `btn--${variant}`,
    glow ? 'btn--glow' : '',
    filled ? 'btn--filled' : '',
    small ? 'btn--cta-sm' : '',
    center ? 'btn--center' : '',
    loading ? 'btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      onClick={(e) => {
        if (!silent) {
          playSound('click');
          if (variant === 'primary') haptic('light');
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {icon}
      <span className="btn__label">{children}</span>
      {loading && (
        <span className="btn__spinner">
          <Spinner size={20} color="currentColor" />
        </span>
      )}
    </button>
  );
});
