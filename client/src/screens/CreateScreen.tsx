import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { BackIcon } from '../components/ui/Icons';
import { ProfileForm } from '../components/ProfileForm';
import { useProfile } from '../hooks/useProfile';
import { createRoom, RequestError } from '../services/socket';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export function CreateScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useProfile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const name = profile.name.trim();
    if (!name) {
      setError('Pick a name first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const joined = await createRoom({ name, avatar: profile.avatar });
      playSound('confirm');
      haptic('success');
      navigate(`/room/${joined.code}`, { replace: true });
    } catch (e) {
      setError(e instanceof RequestError ? e.message : 'Something went wrong. Please try again.');
      playSound('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <BackIcon />
        </IconButton>
        <span className="eyebrow">Create room</span>
        <span style={{ width: 44 }} />
      </header>
      <form
        className="screen__scroll"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="title">Who's playing?</h1>
        <p className="muted">You'll be the host. Friends join with the room code.</p>
        <ProfileForm profile={profile} onChange={setProfile} autoFocus error={error} />
        <button type="submit" className="visually-hidden" aria-hidden="true" tabIndex={-1} />
      </form>
      <div className="screen__footer">
        <Button block loading={loading} onClick={() => void submit()} data-testid="create-submit">
          Create room
        </Button>
      </div>
    </div>
  );
}
