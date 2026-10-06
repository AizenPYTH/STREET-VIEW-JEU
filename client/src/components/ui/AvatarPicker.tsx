import { AVATARS } from '@cityguess/shared';
import { PlayerAvatar } from './PlayerAvatar';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface AvatarPickerProps {
  value: string;
  name: string;
  onChange(id: string): void;
  taken?: readonly string[];
}

export function AvatarPicker({ value, name, onChange, taken = [] }: AvatarPickerProps) {
  return (
    <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
      {AVATARS.map((a) => {
        const isTaken = taken.includes(a.id) && a.id !== value;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={a.id === value}
            aria-label={a.label}
            className={`avatar-cell ${a.id === value ? 'avatar-cell--selected' : ''} ${isTaken ? 'avatar-cell--taken' : ''}`}
            disabled={isTaken}
            onClick={() => {
              playSound('click');
              haptic('light');
              onChange(a.id);
            }}
          >
            <PlayerAvatar avatar={a.id} name={name || '?'} size={36} />
          </button>
        );
      })}
    </div>
  );
}
