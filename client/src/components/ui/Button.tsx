import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'surface';
export type ButtonSize = 'md' | 'lg' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
  silent?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'lg', loading = false, block = false, icon, silent = false, className = '', children, onClick, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${loading ? 'btn--loading' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={(e) => {
        if (!silent) {
          playSound('click');
          haptic('light');
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon}
      <span className="btn__label">{children}</span>
    </button>
  );
});
