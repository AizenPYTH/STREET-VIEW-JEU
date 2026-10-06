import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { BackIcon } from '../components/ui/Icons';
import { CodeInput } from '../components/ui/CodeInput';
import { ProfileForm } from '../components/ProfileForm';
import { useProfile } from '../hooks/useProfile';
import { joinRoom, RequestError } from '../services/socket';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export function JoinScreen() {
  const navigate = useNavigate();
  const params = useParams<{ code?: string }>();
  const [profile, setProfile] = useProfile();
  const [code, setCode] = useState(() => normalizeRoomCode(params.code ?? ''));
  const [loading, setLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const prefilled = Boolean(params.code);

  useEffect(() => {
    if (params.code) setCode(normalizeRoomCode(params.code));
  }, [params.code]);

  const submit = async (): Promise<void> => {
    setCodeError(null);
    setNameError(null);
    if (!isValidRoomCode(code)) {
      setCodeError(`Enter the ${ROOM_CODE_LENGTH}‑character room code`);
      return;
    }
    const name = profile.name.trim();
    if (!name) {
      setNameError('Pick a name first');
      return;
    }
    setLoading(true);
    try {
      const joined = await joinRoom(code, { name, avatar: profile.avatar });
      playSound('confirm');
      haptic('success');
      navigate(`/room/${joined.code}`, { replace: true });
    } catch (e) {
      const message = e instanceof RequestError ? e.message : 'Something went wrong. Please try again.';
      if (e instanceof RequestError && (e.code === 'NAME_TAKEN' || e.code === 'INVALID_INPUT')) setNameError(message);
      else setCodeError(message);
      playSound('error');
      haptic('warning');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <IconButton label="Back" onClick={() => navigate('/')}>
          <BackIcon />
        </IconButton>
        <span className="eyebrow">Join room</span>
        <span style={{ width: 44 }} />
      </header>
      <form
        className="screen__scroll"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="title">Enter room code</h1>
        <CodeInput value={code} onChange={setCode} autoFocus={!prefilled} error={codeError} />
        <ProfileForm profile={profile} onChange={setProfile} autoFocus={prefilled} error={nameError} />
        <button type="submit" className="visually-hidden" aria-hidden="true" tabIndex={-1} />
      </form>
      <div className="screen__footer">
        <Button block loading={loading} onClick={() => void submit()} data-testid="join-submit">
          Join
        </Button>
      </div>
    </div>
  );
}
