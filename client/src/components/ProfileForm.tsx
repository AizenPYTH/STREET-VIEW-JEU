import { AVATARS, MAX_NAME_LENGTH, PLAYER_COLORS } from '@cityguess/shared';
import { TextField } from './ui/TextField';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';
import type { StoredProfile } from '../services/storage';

interface ProfileFormProps {
  profile: StoredProfile;
  onChange(patch: Partial<StoredProfile>): void;
  autoFocus?: boolean;
  error?: string | null;
}

export function ProfileForm({ profile, onChange, autoFocus = false, error }: ProfileFormProps) {
  return (
    <div className="profile">
      <TextField
        label="Your name"
        placeholder="e.g. Alex"
        value={profile.name}
        maxLength={MAX_NAME_LENGTH}
        autoFocus={autoFocus}
        autoComplete="nickname"
        autoCapitalize="words"
        enterKeyHint="done"
        error={error ?? null}
        data-testid="name-input"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <div className="profile__avatars" role="radiogroup" aria-label="Avatar">
        {AVATARS.map((a, i) => {
          const selected = a.id === profile.avatar;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={a.label}
              className={`profile__avatar ${selected ? 'profile__avatar--selected' : ''}`}
              style={{ ['--avatar-color' as string]: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
              onClick={() => {
                playSound('click');
                haptic('light');
                onChange({ avatar: a.id });
              }}
            >
              {a.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
