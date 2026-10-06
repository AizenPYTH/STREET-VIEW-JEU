import { forwardRef, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, hint, error, id, className = '', ...rest }, ref) {
  const inputId = id ?? `field-${label?.toLowerCase().replace(/\s+/g, '-') ?? 'input'}`;
  return (
    <label className={`field ${error ? 'field--error' : ''} ${className}`} htmlFor={inputId}>
      {label && <span className="field__label">{label}</span>}
      <input ref={ref} id={inputId} className="field__input" {...rest} />
      {error ? <span className="field__error" role="alert">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
});
