import { formatPoints, type PlayerPublic, type Standing } from '@cityguess/shared';
import { PlayerAvatar } from './PlayerAvatar';

interface LeaderboardProps {
  standings: Standing[];
  players: PlayerPublic[];
  me: string;
  compact?: boolean;
  /** Hide movement arrows (final screen). */
  movement?: boolean;
}

function moveFor(s: Standing): { glyph: string; cls: string; label: string } {
  if (s.previousRank === null || s.previousRank === s.rank) return { glyph: '—', cls: 'same', label: 'stable' };
  if (s.rank < s.previousRank) return { glyph: '↑', cls: 'up', label: 'monte' };
  return { glyph: '↓', cls: 'down', label: 'descend' };
}

/** Ordered standings with "LEADER / −gap" and movement arrows vs the previous round (§15). */
export function Leaderboard({ standings, players, me, compact = false, movement = true }: LeaderboardProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <ol className="lb" data-testid="leaderboard">
      {standings.map((s) => {
        const p = byId.get(s.playerId);
        if (!p) return null;
        const move = moveFor(s);
        return (
          <li key={s.playerId} className={`lb__row ${s.playerId === me ? 'lb__row--me' : ''} ${compact ? 'lb__row--compact' : ''}`} data-testid={`lb-${p.name}`}>
            <span className="lb__rank">{s.rank}</span>
            <PlayerAvatar avatar={p.avatar} name={p.name} size={24} />
            <span className="lb__name">{p.name}</span>
            <span className="lb__gap">{s.gapToLeader === 0 ? 'LEADER' : `−${formatPoints(s.gapToLeader)}`}</span>
            <span className="lb__total">{formatPoints(s.totalScore)}</span>
            {movement && (
              <span className={`lb__move lb__move--${move.cls}`} aria-label={move.label}>
                {move.glyph}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
