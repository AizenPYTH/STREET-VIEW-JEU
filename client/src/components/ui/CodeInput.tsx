import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@cityguess/shared';
import { BackspaceIcon } from './Icons';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface CodeInputProps {
  value: string;
  onChange(value: string): void;
  error?: boolean;
}

/** Five boxes driven by the custom keypad below (§11): no system keyboard, no autocorrect. */
export function CodeInput({ value, onChange, error = false }: CodeInputProps) {
  const boxes = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, ROOM_CODE_LENGTH - 1);
  const press = (ch: string): void => {
    if (value.length >= ROOM_CODE_LENGTH) return;
    playSound('click');
    haptic('light');
    onChange(value + ch);
  };
  const back = (): void => {
    if (!value) return;
    playSound('click');
    onChange(value.slice(0, -1));
  };
  return (
    <>
      <div className={`code ${error ? 'code--error' : ''}`} role="group" aria-label={`Code de la room : ${value || 'vide'}`} data-testid="code-boxes">
        {boxes.map((ch, i) => (
          <span key={i} className={`code__box ${ch ? 'code__box--filled' : ''} ${i === active && value.length < ROOM_CODE_LENGTH ? 'code__box--active' : ''}`}>
            {ch}
          </span>
        ))}
      </div>
      <div className="keypad" aria-label="Clavier" data-testid="keypad">
        {[...ROOM_CODE_ALPHABET].map((ch) => (
          <button key={ch} type="button" className="key" onClick={() => press(ch)} data-key={ch} disabled={value.length >= ROOM_CODE_LENGTH}>
            {ch}
          </button>
        ))}
        <button type="button" className="key key--wide" onClick={back} aria-label="Effacer" data-key="backspace" disabled={!value}>
          <BackspaceIcon />
        </button>
      </div>
    </>
  );
}
