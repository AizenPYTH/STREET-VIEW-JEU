import { useEffect, useRef } from 'react';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@cityguess/shared';

interface CodeInputProps {
  value: string;
  onChange(value: string): void;
  onComplete?(value: string): void;
  autoFocus?: boolean;
  error?: string | null;
}

/** Five big boxes backed by a single hidden input so the native keyboard and paste work everywhere. */
export function CodeInput({ value, onChange, onComplete, autoFocus = false, error }: CodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const boxes = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, ROOM_CODE_LENGTH - 1);

  return (
    <div className={`code ${error ? 'code--error' : ''}`} onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        className="code__input"
        value={value}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={ROOM_CODE_LENGTH}
        aria-label="Room code"
        data-testid="code-input"
        onChange={(e) => {
          const next = normalizeRoomCode(e.target.value);
          onChange(next);
          if (next.length === ROOM_CODE_LENGTH) onComplete?.(next);
        }}
      />
      <div className="code__boxes" aria-hidden="true">
        {boxes.map((ch, i) => (
          <span key={i} className={`code__box ${ch ? 'code__box--filled' : ''} ${i === activeIndex ? 'code__box--active' : ''}`}>
            {ch || <span className="code__placeholder">·</span>}
          </span>
        ))}
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
