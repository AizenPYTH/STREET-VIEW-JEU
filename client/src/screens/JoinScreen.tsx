import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { CodeInput } from '../components/ui/CodeInput';
import { ErrorScreen, type ErrorKind } from '../components/ui/ErrorScreen';
import { checkRoom } from '../services/rooms';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

/** CODE step (§33): custom keypad, explicit "Rejoindre", errors as full screens. */
export function JoinScreen() {
  const navigate = useNavigate();
  const params = useParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalizeRoomCode(params.code ?? ''));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);

  useEffect(() => {
    if (params.code) setCode(normalizeRoomCode(params.code));
  }, [params.code]);

  const submit = async (): Promise<void> => {
    if (code.length !== ROOM_CODE_LENGTH) return;
    setChecking(true);
    try {
      const room = await checkRoom(code);
      if (!room) {
        setError('roomNotFound');
        playSound('error');
        haptic('error');
        return;
      }
      if (!room.joinable) {
        setError(room.reason === 'full' ? 'roomFull' : 'gameOver');
        playSound('error');
        haptic('error');
        return;
      }
      navigate(`/join/${code}/name`);
    } catch {
      setError('generic');
    } finally {
      setChecking(false);
    }
  };

  if (error === 'roomNotFound') return <ErrorScreen kind="roomNotFound" onAction={() => setError(null)} onHome={() => navigate('/')} />;
  if (error === 'roomFull') return <ErrorScreen kind="roomFull" onAction={() => navigate('/create')} onHome={() => navigate('/')} />;
  if (error === 'gameOver') return <ErrorScreen kind="gameOver" onAction={() => navigate('/')} />;
  if (error === 'generic') return <ErrorScreen kind="generic" onAction={() => setError(null)} onHome={() => navigate('/')} />;

  return (
    <div className="screen" data-testid="join">
      <div className="topbar">
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← Accueil
        </Button>
      </div>
      <div className="screen__body">
        <h1 className="t-title">Rejoindre</h1>
        <p className="t-body">Entre le code affiché sur l'écran de ton ami.</p>
        <CodeInput value={code} onChange={setCode} />
      </div>
      <div className="screen__footer">
        <Button disabled={code.length < ROOM_CODE_LENGTH} loading={checking} glow={code.length === ROOM_CODE_LENGTH} onClick={() => void submit()} data-testid="join-submit">
          Rejoindre
        </Button>
      </div>
    </div>
  );
}
