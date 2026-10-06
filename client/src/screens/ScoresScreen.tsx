import { useEffect, useMemo, useRef, useState } from 'react';
import { TIMINGS, formatPoints, getCity, maxRoundPoints, resultsLeaderboardAt, resultsRowAt, type PlayerPublic, type RoomSnapshot, type Standing } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { Leaderboard } from '../components/ui/Leaderboard';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { useSequence } from '../hooks/useSequence';
import { useCountdown } from '../hooks/useCountdown';
import { useCountUp } from '../hooks/useCountUp';
import { api, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

/** "+842" counting up, then "2 431 → 3 273" (phase 2 §5). */
function ScoreRow({ standing, player, isMe, active }: { standing: Standing; player: PlayerPublic | undefined; isMe: boolean; active: boolean }) {
  const points = useCountUp(0, standing.roundPoints, active, 700, isMe);
  const before = standing.totalScore - standing.roundPoints;
  const total = useCountUp(before, standing.totalScore, active, 900);
  return (
    <li className={`score-row ${isMe ? 'score-row--me' : ''}`} data-testid={`score-${player?.name ?? ''}`}>
      <PlayerAvatar avatar={player?.avatar ?? 'diamond'} name={player?.name ?? '?'} size={34} />
      <span className="score-row__name">
        {player?.name}
        <br />
        <span className="score-row__total">
          {formatPoints(before)} → {formatPoints(total)}
        </span>
      </span>
      <span className="score-row__points">+{formatPoints(points)}</span>
    </li>
  );
}

/** Who overtook whom this round, the one involving me first, else the highest (phase 2 §7). */
function findOvertake(standings: Standing[], me: string): { winner: string; loser: string } | null {
  const candidates: { winner: string; loser: string; rank: number }[] = [];
  for (const a of standings) {
    if (a.previousRank === null || a.rank >= a.previousRank) continue;
    for (const b of standings) {
      if (b.previousRank !== null && b.previousRank < a.previousRank && b.rank > a.rank) candidates.push({ winner: a.playerId, loser: b.playerId, rank: a.rank });
    }
  }
  if (candidates.length === 0) return null;
  const mine = candidates.find((c) => c.winner === me || c.loser === me);
  const best = mine ?? candidates.sort((a, b) => a.rank - b.rank)[0]!;
  return { winner: best.winner, loser: best.loser };
}

/** Round scores then leaderboard with movement, overtakes and streaks (§21, phase 2 §7–§11). */
export function ScoresScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const showToast = useGameStore((s) => s.showToast);
  const round = snapshot.round;
  const data = round?.reveal;
  const city = getCity(round?.cityId ?? '');
  const isHost = snapshot.hostId === snapshot.you;
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => [...(data?.standings ?? [])].sort((a, b) => b.roundPoints - a.roundPoints), [data]);
  const count = rows.length;
  const leaderboardAt = resultsLeaderboardAt(count);
  const overtakeAt = leaderboardAt + TIMINGS.results.overtakeDelayMs;
  const checkpoints = useMemo(() => [...rows.map((_, i) => resultsRowAt(i)), leaderboardAt, overtakeAt], [rows, leaderboardAt, overtakeAt]);
  const elapsed = useSequence(data?.resultsStartsAt ?? null, checkpoints);
  const autoAdvance = useCountdown(elapsed >= leaderboardAt ? snapshot.phaseEndsAt : null, 250);
  const overtake = useMemo(() => (data ? findOvertake(data.standings, snapshot.you) : null), [data, snapshot.you]);

  const fired = useRef({ rows: 0, overtake: false });
  useEffect(() => {
    const visible = rows.filter((_, i) => elapsed >= resultsRowAt(i)).length;
    while (fired.current.rows < visible) {
      const row = rows[fired.current.rows];
      fired.current.rows += 1;
      playSound('points');
      if (row?.playerId === snapshot.you) haptic('light');
    }
    if (overtake && elapsed >= overtakeAt && !fired.current.overtake) {
      fired.current.overtake = true;
      playSound('overtake');
      if (overtake.winner === snapshot.you || overtake.loser === snapshot.you) haptic('overtake');
    }
  }, [elapsed, rows, snapshot.you, overtake, overtakeAt]);

  if (!round || !data || !city) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const myStanding = data.standings.find((s) => s.playerId === snapshot.you);
  const nextIsLast = round.number + 1 === round.total;
  const cta = round.isLast ? 'Résultats finaux →' : nextIsLast ? 'Dernière manche →' : 'Manche suivante →';
  const leaderboardVisible = elapsed >= leaderboardAt;
  const streakBroken = !!myStanding && myStanding.previousStreak >= 2 && myStanding.streak === 0;
  const roundsLeft = round.total - round.number;
  const nextMultiplier = nextIsLast && snapshot.settings.doubleFinal ? 2 : 1;

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

  const meLine = (): string | null => {
    if (!myStanding || round.isLast) return null;
    const ordinal = myStanding.rank === 1 ? '1er' : `${myStanding.rank}e`;
    if (myStanding.rank === 1) return roundsLeft === 1 ? 'Tu mènes. Dernière manche, tiens bon.' : 'Tu mènes.';
    const catchable = myStanding.gapToLeader <= maxRoundPoints(nextMultiplier) * roundsLeft;
    if (!catchable) return `Tu es ${ordinal}.`;
    return roundsLeft === 1 ? `Tu es ${ordinal}. Une bonne manche et c'est gagné.` : `Tu es ${ordinal}. Tout reste possible.`;
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
          {rows.map((s, i) => (elapsed >= resultsRowAt(i) ? <ScoreRow key={s.playerId} standing={s} player={byId.get(s.playerId)} isMe={s.playerId === snapshot.you} active /> : null))}
        </ul>
        {leaderboardVisible && (
          <div className="scores__ranking" data-testid="ranking">
            <div className="scores__ranking-head">
              <span className="t-label">Classement</span>
              {myStanding && myStanding.streak >= 2 && <span className="streak-pill">🔥 Série ×{myStanding.streak}</span>}
              {streakBroken && (
                <span className="streak-pill streak-pill--broken" data-testid="streak-broken">
                  Série perdue
                </span>
              )}
            </div>
            <Leaderboard standings={data.standings} players={snapshot.players} me={snapshot.you} compact />
            {overtake && elapsed >= overtakeAt && (
              <div className="overtake" data-testid="overtake">
                <span aria-hidden="true">⚡</span>
                <span>
                  {overtake.winner === snapshot.you ? 'Tu dépasses' : `${byId.get(overtake.winner)?.name ?? '?'} dépasse`} {overtake.loser === snapshot.you ? 'toi' : (byId.get(overtake.loser)?.name ?? '?')}
                </span>
              </div>
            )}
            {meLine() && (
              <p className="me-line" data-testid="me-line">
                <strong>{meLine()}</strong>
              </p>
            )}
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
