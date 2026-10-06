import { useEffect, useMemo, useRef, useState } from 'react';
import { TIMINGS, formatPoints, getCity, type RoomSnapshot } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { Leaderboard } from '../components/ui/Leaderboard';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { useSequence } from '../hooks/useSequence';
import { useCountdown } from '../hooks/useCountdown';
import { api, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

const { results: T } = TIMINGS;

/** Round scores then leaderboard (§21). */
export function ScoresScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const showToast = useGameStore((s) => s.showToast);
  const round = snapshot.round;
  const data = round?.reveal;
  const city = getCity(round?.cityId ?? '');
  const isHost = snapshot.hostId === snapshot.you;
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => [...(data?.standings ?? [])].sort((a, b) => b.roundPoints - a.roundPoints), [data]);
  const checkpoints = useMemo(() => [...rows.map((_, i) => T.firstRowMs + i * T.rowStepMs), T.leaderboardMs], [rows]);
  const elapsed = useSequence(data?.resultsStartsAt ?? null, checkpoints);
  const autoAdvance = useCountdown(elapsed >= T.leaderboardMs ? snapshot.phaseEndsAt : null, 250);

  const shown = useRef(0);
  useEffect(() => {
    const visible = rows.filter((_, i) => elapsed >= T.firstRowMs + i * T.rowStepMs).length;
    while (shown.current < visible) {
      const row = rows[shown.current];
      shown.current += 1;
      playSound('points');
      if (row?.playerId === snapshot.you) haptic('light');
    }
  }, [elapsed, rows, snapshot.you]);

  if (!round || !data || !city) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const myStanding = data.standings.find((s) => s.playerId === snapshot.you);
  const nextIsLast = round.number + 1 === round.total;
  const cta = round.isLast ? 'Résultats finaux →' : nextIsLast ? 'Dernière manche →' : 'Manche suivante →';
  const leaderboardVisible = elapsed >= T.leaderboardMs;

  const next = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.nextRound();
    } catch (e) {
      showToast(e instanceof RequestError ? e.message : 'Impossible de continuer', 'muted', 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" data-testid="scores" aria-live="polite">
      <div className="guess__head">
        <span className="t-label">
          Manche {round.number}/{round.total} · Scores
        </span>
        {round.multiplier > 1 && <span className="streak-pill">Points ×2</span>}
      </div>
      <div className="screen__body" style={{ paddingTop: 12 }}>
        <ul className="scores__list" data-testid="score-rows">
          {rows.map((s, i) => {
            if (elapsed < T.firstRowMs + i * T.rowStepMs) return null;
            const p = byId.get(s.playerId);
            const result = data.results.find((r) => r.playerId === s.playerId);
            return (
              <li key={s.playerId} className={`score-row ${s.playerId === snapshot.you ? 'score-row--me' : ''}`} data-testid={`score-${p?.name ?? ''}`}>
                <PlayerAvatar avatar={p?.avatar ?? 'diamond'} name={p?.name ?? '?'} size={34} />
                <span className="score-row__name">{p?.name}</span>
                {result?.bonus ? <span className="score-row__bonus">+{result.bonus} bonus</span> : null}
                <span className="score-row__points">+{formatPoints(s.roundPoints)}</span>
              </li>
            );
          })}
        </ul>
        {leaderboardVisible && (
          <div className="scores__ranking" data-testid="ranking">
            <div className="scores__ranking-head">
              <span className="t-label">Classement</span>
              {myStanding && myStanding.streak >= 2 && <span className="streak-pill">🔥 Série ×{myStanding.streak}</span>}
            </div>
            <Leaderboard standings={data.standings} players={snapshot.players} me={snapshot.you} compact />
          </div>
        )}
      </div>
      {leaderboardVisible && (
        <div className="screen__footer cg-up">
          {isHost ? (
            <Button glow loading={busy} onClick={() => void next()} data-testid="next-round">
              {cta}
            </Button>
          ) : (
            <Button disabled>En attente de l'hôte…</Button>
          )}
          <p className="guess__cta-hint">Suite automatique dans {autoAdvance.seconds} s</p>
        </div>
      )}
    </div>
  );
}
