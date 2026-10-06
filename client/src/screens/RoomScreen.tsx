import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { normalizeRoomCode } from '@cityguess/shared';
import { useGameStore } from '../store/gameStore';
import { rejoinRoom, RequestError } from '../services/socket';
import { storage } from '../services/storage';
import { Loader } from '../components/ui/Spinner';
import { ErrorScreen } from '../components/ui/ErrorScreen';
import { useBlockBack } from '../hooks/useBlockBack';
import { LobbyScreen } from './LobbyScreen';
import { CityScreen } from './CityScreen';
import { StartingScreen } from './StartingScreen';
import { PlayScreen } from './PlayScreen';
import { RevealScreen } from './RevealScreen';
import { ScoresScreen } from './ScoresScreen';
import { FinalScreen } from './FinalScreen';

/** Renders whichever screen the server's room phase calls for, reclaiming the seat on reload. */
export function RoomScreen() {
  const navigate = useNavigate();
  const { code: rawCode = '', sub } = useParams<{ code: string; sub?: string }>();
  const code = normalizeRoomCode(rawCode);
  const snapshot = useGameStore((s) => s.snapshot);
  const connection = useGameStore((s) => s.connection);
  const lastLeft = useGameStore((s) => s.lastLeft);
  const clearLastLeft = useGameStore((s) => s.clearLastLeft);
  const inRoom = snapshot?.code === code;
  const justLeft = lastLeft?.code === code;
  const [rejoining, setRejoining] = useState(false);
  const [failed, setFailed] = useState<'notFound' | 'notMember' | null>(null);
  const inGame = !!snapshot && inRoom && snapshot.phase !== 'waiting' && snapshot.phase !== 'finished';
  useBlockBack(inGame);

  useEffect(() => {
    if (justLeft && lastLeft?.reason === 'left') {
      navigate('/', { replace: true });
      return;
    }
    if (inRoom || rejoining || failed || justLeft || connection !== 'connected') return;
    let cancelled = false;
    setRejoining(true);
    rejoinRoom(code)
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof RequestError && error.code === 'ROOM_NOT_FOUND') {
          storage.setLastRoom(null);
          setFailed('notFound');
        } else navigate(`/join/${code}`, { replace: true });
      })
      .finally(() => {
        if (!cancelled) setRejoining(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inRoom, code, connection, failed, justLeft]);

  if (justLeft && lastLeft?.reason === 'closed' && !inRoom) {
    return (
      <ErrorScreen
        kind="hostLeft"
        onAction={() => {
          clearLastLeft();
          navigate('/create', { replace: true });
        }}
        onHome={() => {
          clearLastLeft();
          navigate('/', { replace: true });
        }}
      />
    );
  }
  if (justLeft && !inRoom) return null;
  if (failed === 'notFound') return <ErrorScreen kind="roomNotFound" onAction={() => navigate('/join', { replace: true })} onHome={() => navigate('/', { replace: true })} />;

  if (!snapshot || !inRoom) {
    return (
      <div className="screen screen--deep">
        <div className="screen__center">
          <Loader label={connection === 'connected' ? `Room ${code}…` : 'Connexion…'} />
        </div>
      </div>
    );
  }

  const isHost = snapshot.hostId === snapshot.you;
  switch (snapshot.phase) {
    case 'waiting':
      return sub === 'city' && isHost ? <CityScreen snapshot={snapshot} /> : <LobbyScreen snapshot={snapshot} />;
    case 'starting':
      return <StartingScreen snapshot={snapshot} />;
    case 'round':
    case 'guessing':
      return <PlayScreen key={`${snapshot.gameNumber}-${snapshot.round?.index ?? 0}`} snapshot={snapshot} />;
    case 'revealing':
      return <RevealScreen key={`${snapshot.gameNumber}-${snapshot.round?.index ?? 0}`} snapshot={snapshot} />;
    case 'results':
      return <ScoresScreen key={`${snapshot.gameNumber}-${snapshot.round?.index ?? 0}`} snapshot={snapshot} />;
    case 'finished':
      return <FinalScreen snapshot={snapshot} />;
    default:
      return null;
  }
}
