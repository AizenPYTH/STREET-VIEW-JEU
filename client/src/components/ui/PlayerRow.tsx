import type { PlayerPublic } from '@cityguess/shared';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerRowProps {
  player: PlayerPublic;
  isMe: boolean;
  /** Lobby: ready/joining status. Waiting: locked ✓. */
  mode: 'lobby' | 'locked';
}

export function PlayerRow({ player, isMe, mode }: PlayerRowProps) {
  const reconnecting = !player.connected;
  const tags = [player.isHost ? 'hôte' : null, isMe ? 'toi' : null].filter(Boolean);
  return (
    <li className={`prow ${isMe ? 'prow--me' : ''}`} data-testid={`player-${player.name}`}>
      <PlayerAvatar avatar={player.avatar} name={player.name} size={36} dim={reconnecting} />
      <span className="prow__name">
        {player.name}
        {tags.length > 0 && <span className="prow__tag"> · {tags.join(' · ')}</span>}
      </span>
      {mode === 'lobby' ? (
        reconnecting ? (
          <span className="prow__status prow__status--reconnecting">reconnexion…</span>
        ) : player.isReady ? (
          <span className="prow__status prow__status--ready">Prêt</span>
        ) : (
          <span className="prow__status">Arrive</span>
        )
      ) : player.hasGuessed ? (
        <>
          <span className="prow__status prow__status--ready">verrouillé</span>
          <span className="prow__check" aria-label="Guess verrouillé">
            ✓
          </span>
        </>
      ) : (
        <>
          <span className="prow__status prow__status--thinking">{player.connected ? 'réfléchit…' : 'reconnexion…'}</span>
          <span className="prow__check prow__check--pending" aria-label="En attente" />
        </>
      )}
    </li>
  );
}

export function EmptySlot() {
  return (
    <li className="empty-slot" aria-hidden="true">
      <span className="empty-slot__circle" />
      <span>
        En attente d'un joueur
        <span className="dots">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </li>
  );
}
