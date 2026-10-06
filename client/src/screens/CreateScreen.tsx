import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CAPACITY_OPTIONS,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXPLORE_SECONDS_OPTIONS,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  ROUND_OPTIONS,
  type GameSettings,
} from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { ChipGroup } from '../components/ui/Chip';
import { AvatarPicker } from '../components/ui/AvatarPicker';
import { Toggle } from '../components/ui/Toggle';
import { useProfile } from '../hooks/useProfile';
import { createRoom, RequestError } from '../services/socket';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

const MODES = [
  { value: 'classic', label: 'Classique' },
  { value: 'timeattack', label: 'Contre-la-montre', future: true },
  { value: 'nomove', label: 'Sans bouger', future: true },
  { value: 'duel', label: 'Duel', future: true },
] as const;

export function CreateScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useProfile();
  const [settings, setSettings] = useState<GameSettings>({ ...DEFAULT_SETTINGS });
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const name = profile.name.trim();
    if (name.length < MIN_NAME_LENGTH) {
      setError(`Ton pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const joined = await createRoom({ name, avatar: profile.avatar }, settings);
      haptic('light');
      navigate(`/room/${joined.code}/city`, { replace: true });
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "Quelque chose s'est mal passé. Réessaie.");
      playSound('error');
      haptic('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" data-testid="create">
      <div className="topbar">
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← Accueil
        </Button>
      </div>
      <form
        className="screen__body form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="t-title">Crée ta room</h1>
        <label className={`field ${error ? 'field--error' : ''}`}>
          <span className="t-label">Ton pseudo</span>
          <input
            className="field__input"
            value={profile.name}
            placeholder="Ton pseudo"
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="done"
            data-testid="name-input"
            onChange={(e) => setProfile({ name: e.target.value })}
          />
          {error && (
            <span className="field__error" role="alert">
              {error}
            </span>
          )}
        </label>
        <div className="form__section">
          <span className="t-label">Avatar</span>
          <AvatarPicker value={profile.avatar} name={profile.name} onChange={(avatar) => setProfile({ avatar })} />
        </div>
        <div className="form__section">
          <span className="t-label">Mode</span>
          <ChipGroup ariaLabel="Mode" options={MODES} value="classic" onChange={() => undefined} />
        </div>
        <button type="button" className="options-toggle" aria-expanded={showOptions} onClick={() => setShowOptions((v) => !v)} data-testid="toggle-options">
          <span>Options de la partie</span>
          <span className="options-toggle__value">
            {settings.capacity} joueurs · {settings.rounds} manches · {settings.exploreSeconds} s {showOptions ? '▴' : '▾'}
          </span>
        </button>
        {showOptions && (
          <>
        <div className="form__section">
          <span className="t-label">Joueurs</span>
          <ChipGroup ariaLabel="Joueurs" fill small options={CAPACITY_OPTIONS.map((c) => ({ value: c, label: String(c) }))} value={settings.capacity} onChange={(capacity) => setSettings({ ...settings, capacity })} />
        </div>
        <div className="form__section">
          <span className="t-label">Manches</span>
          <ChipGroup ariaLabel="Manches" fill options={ROUND_OPTIONS.map((r) => ({ value: r, label: String(r) }))} value={settings.rounds} onChange={(rounds) => setSettings({ ...settings, rounds })} />
        </div>
        <div className="form__section">
          <span className="t-label">Temps par manche</span>
          <ChipGroup ariaLabel="Temps" fill options={EXPLORE_SECONDS_OPTIONS.map((s) => ({ value: s, label: `${s} s` }))} value={settings.exploreSeconds} onChange={(exploreSeconds) => setSettings({ ...settings, exploreSeconds })} />
        </div>
        <div className="form__section">
          <span className="t-label">Difficulté des lieux</span>
          <ChipGroup ariaLabel="Difficulté" fill small options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d].label }))} value={settings.difficulty} onChange={(difficulty) => setSettings({ ...settings, difficulty })} />
        </div>
        <Toggle label="Dernière manche ×2" hint="Points doublés pour la finale" on={settings.doubleFinal} onChange={(doubleFinal) => setSettings({ ...settings, doubleFinal })} />
          </>
        )}
        <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true" />
      </form>
      <div className="screen__footer">
        <Button loading={loading} onClick={() => void submit()} data-testid="create-submit">
          Choisir la ville →
        </Button>
      </div>
    </div>
  );
}
