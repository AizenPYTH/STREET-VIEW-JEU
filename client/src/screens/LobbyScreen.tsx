import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCity, type RoomSnapshot } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { RoomCode } from '../components/ui/RoomCode';
import { EmptySlot, PlayerRow } from '../components/ui/PlayerRow';
import { Sheet } from '../components/ui/Sheet';
import { useStreetViewReady } from '../hooks/useStreetViewReady';
import { api, leaveRoom, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export function LobbyScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const navigate = useNavigate();
  const showToast = useGameStore((s) => s.showToast);
  const [starting, setStarting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [svAttempt, setSvAttempt] = useState(0);
  const availability = useStreetViewReady(svAttempt);
  const me = snapshot.players.find((p) => p.id === snapshot.you);
  const isHost = snapshot.hostId === snapshot.you;
  const city = getCity(snapshot.settings.cityId);
  const active = snapshot.players.filter((p) => !p.left);
  const connected = active.filter((p) => p.connected);
  const readyCount = connected.filter((p) => p.isReady).length;
  const everyoneReady = connected.length > 0 && readyCount === connected.length;
  const capacity = snapshot.settings.capacity;
  const shareUrl = `${window.location.origin}/join/${snapshot.code}`;

  // PRÊT = this device can load street views (§33).
  useEffect(() => {
    if (availability === 'ready' && me && !me.isReady) api.setReady(true).catch(() => undefined);
  }, [availability, me]);

  const start = async (): Promise<void> => {
    setStarting(true);
    try {
      await api.startGame();
    } catch (e) {
      showToast(e instanceof RequestError ? e.message : 'Impossible de lancer la partie', 'muted', 2500);
      playSound('error');
      haptic('error');
    } finally {
      setStarting(false);
    }
  };

  const leave = async (): Promise<void> => {
    await leaveRoom();
    navigate('/', { replace: true });
  };

  return (
    <div className="screen" data-testid="lobby">
      <div className="topbar">
        <Button variant="ghost" onClick={() => (isHost && active.length > 1 ? setConfirmLeave(true) : void leave())} data-testid="leave-room">
          ← Quitter
        </Button>
        <span className="t-label">
          {city?.flag} {city?.name}
        </span>
      </div>
      <div className="screen__body">
        <RoomCode code={snapshot.code} shareUrl={shareUrl} />
        <div className="lobby__head">
          <span className="lobby__count" data-testid="player-count">
            {active.length}/{capacity} joueurs
          </span>
          <span className="lobby__hint">{everyoneReady && active.length === capacity ? 'Tout le monde est prêt' : everyoneReady ? 'Prêts à jouer' : 'On attend les autres…'}</span>
        </div>
        <ul className="lobby__players" data-testid="player-list">
          {active.map((p) => (
            <PlayerRow key={p.id} player={p} isMe={p.id === snapshot.you} mode="lobby" />
          ))}
          {Array.from({ length: Math.max(0, capacity - active.length) }, (_, i) => (
            <EmptySlot key={`empty-${i}`} />
          ))}
        </ul>
        <div className="lobby__settings" aria-label="Réglages de la partie">
          <span className="lobby__setting">
            Manches <strong>{snapshot.settings.rounds}</strong>
          </span>
          <span className="lobby__setting">
            Temps <strong>{snapshot.settings.exploreSeconds} s</strong>
          </span>
          {snapshot.settings.doubleFinal && (
            <span className="lobby__setting">
              Finale <strong>×2</strong>
            </span>
          )}
        </div>
        {availability === 'error' && (
          <button type="button" className="notice notice--danger" onClick={() => setSvAttempt((a) => a + 1)}>
            La vue rue n'a pas chargé · Réessayer
          </button>
        )}
      </div>
      <div className="screen__footer">
        {isHost ? (
          <Button disabled={!everyoneReady} glow={everyoneReady} loading={starting} onClick={() => void start()} data-testid="start-game">
            {everyoneReady ? 'Lancer la partie →' : `Lancer (${readyCount}/${active.length})`}
          </Button>
        ) : (
          <Button disabled data-testid="waiting-host">
            En attente de l'hôte…
          </Button>
        )}
      </div>
      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Quitter la room ?">
        <p className="t-body">Un autre joueur deviendra l'hôte.</p>
        <Button small onClick={() => void leave()}>
          Quitter
        </Button>
        <Button variant="ghost" center onClick={() => setConfirmLeave(false)}>
          Rester
        </Button>
      </Sheet>
    </div>
  );
}
