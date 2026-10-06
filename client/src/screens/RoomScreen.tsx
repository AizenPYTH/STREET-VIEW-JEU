import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { normalizeRoomCode } from '@cityguess/shared';
import { useGameStore } from '../store/gameStore';
import { rejoinRoom, RequestError } from '../services/socket';
import { Spinner } from '../components/ui/Spinner';
import { LobbyScreen } from './LobbyScreen';
import { StartingScreen } from './StartingScreen';
import { PlayScreen } from './PlayScreen';
import { RevealScreen } from './RevealScreen';
import { FinalScreen } from './FinalScreen';

/** Renders whichever screen the server's room phase calls for, reclaiming the seat on reload. */
export function RoomScreen() {
  const navigate = useNavigate();
  const { code: rawCode = '' } = useParams<{ code: string }>();
  const code = normalizeRoomCode(rawCode);
  const snapshot = useGameStore((s) => s.snapshot);
  const connection = useGameStore((s) => s.connection);
  const pushToast = useGameStore((s) => s.pushToast);
  const inRoom = snapshot?.code === code;
  const [rejoining, setRejoining] = useState(false);

  useEffect(() => {
    if (inRoom || rejoining || connection !== 'connected') return;
    let cancelled = false;
    setRejoining(true);
    rejoinRoom(code)
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof RequestError && error.code === 'ROOM_NOT_FOUND') {
          pushToast({ kind: 'error', text: 'That room is not open anymore' });
          navigate('/', { replace: true });
        } else {
          navigate(`/join/${code}`, { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setRejoining(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoom, code, connection]);

  if (!snapshot || !inRoom) {
    return (
      <div className="screen centered">
        <Spinner size={36} />
        <p className="muted">{connection === 'connected' ? `Joining room ${code}…` : 'Connecting…'}</p>
      </div>
    );
  }

  switch (snapshot.phase) {
    case 'waiting':
      return <LobbyScreen snapshot={snapshot} />;
    case 'starting':
      return <StartingScreen snapshot={snapshot} />;
    case 'round':
    case 'guessing':
      return <PlayScreen key={`${snapshot.gameNumber}-${snapshot.round?.index ?? 0}`} snapshot={snapshot} />;
    case 'revealing':
    case 'results':
      return <RevealScreen key={`${snapshot.gameNumber}-${snapshot.round?.index ?? 0}`} snapshot={snapshot} />;
    case 'finished':
      return <FinalScreen snapshot={snapshot} />;
    default:
      return null;
  }
}
