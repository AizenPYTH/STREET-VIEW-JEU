import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, normalizeRoomCode } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { AvatarPicker } from '../components/ui/AvatarPicker';
import { ErrorScreen, type ErrorKind } from '../components/ui/ErrorScreen';
import { useProfile } from '../hooks/useProfile';
import { joinRoom, RequestError } from '../services/socket';
import { checkRoom } from '../services/rooms';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

/** PSEUDO step: name + avatar, then join. */
export function NameScreen() {
  const navigate = useNavigate();
  const { code: raw = '' } = useParams<{ code: string }>();
  const code = normalizeRoomCode(raw);
  const [profile, setProfile] = useProfile();
  const [taken, setTaken] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorKind | null>(null);

  useEffect(() => {
    checkRoom(code)
      .then((room) => setTaken(room?.players.map((p) => p.avatar) ?? []))
      .catch(() => undefined);
  }, [code]);

  const submit = async (): Promise<void> => {
    const name = profile.name.trim();
    if (name.length < MIN_NAME_LENGTH) {
      setFieldError(`Ton pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères`);
      return;
    }
    setLoading(true);
    setFieldError(null);
    try {
      const joined = await joinRoom(code, { name, avatar: profile.avatar });
      haptic('light');
      navigate(`/room/${joined.code}`, { replace: true });
    } catch (e) {
      playSound('error');
      haptic('error');
      if (e instanceof RequestError) {
        if (e.code === 'NAME_TAKEN' || e.code === 'INVALID_INPUT') setFieldError(e.message);
        else if (e.code === 'ROOM_FULL') setError('roomFull');
        else if (e.code === 'ROOM_NOT_FOUND') setError('roomNotFound');
        else if (e.code === 'GAME_IN_PROGRESS') setError('gameOver');
        else setError('generic');
      } else setError('generic');
    } finally {
      setLoading(false);
    }
  };

  if (error === 'roomNotFound') return <ErrorScreen kind="roomNotFound" onAction={() => navigate('/join')} onHome={() => navigate('/')} />;
  if (error === 'roomFull') return <ErrorScreen kind="roomFull" onAction={() => navigate('/create')} onHome={() => navigate('/')} />;
  if (error === 'gameOver') return <ErrorScreen kind="gameOver" onAction={() => navigate('/')} />;
  if (error === 'generic') return <ErrorScreen kind="generic" onAction={() => setError(null)} onHome={() => navigate('/')} />;

  return (
    <div className="screen" data-testid="name">
      <div className="topbar">
        <Button variant="ghost" onClick={() => navigate(`/join/${code}`)}>
          ← Code
        </Button>
        <span className="t-label">Room {code}</span>
      </div>
      <form
        className="screen__body form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="t-title">Ton pseudo</h1>
        <label className={`field ${fieldError ? 'field--error' : ''}`}>
          <input
            className="field__input"
            value={profile.name}
            placeholder="Ton pseudo"
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="done"
            data-testid="name-input"
            onChange={(e) => setProfile({ name: e.target.value })}
          />
          {fieldError && (
            <span className="field__error" role="alert">
              {fieldError}
            </span>
          )}
        </label>
        <div className="form__section">
          <span className="t-label">Avatar</span>
          <AvatarPicker value={profile.avatar} name={profile.name} taken={taken} onChange={(avatar) => setProfile({ avatar })} />
        </div>
        <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true" />
      </form>
      <div className="screen__footer">
        <Button loading={loading} onClick={() => void submit()} data-testid="join-name-submit">
          Rejoindre la room
        </Button>
      </div>
    </div>
  );
}
