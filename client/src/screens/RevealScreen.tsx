import { useEffect, useMemo, useRef } from 'react';
import { TIMINGS, formatDistance, getCity, guessCategory, revealMarkerAt, revealPerfectAt, revealWinnerAt, type RoomSnapshot } from '@cityguess/shared';
import { RevealMap } from '../components/map/RevealMap';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { useSequence } from '../hooks/useSequence';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

/**
 * The most important moment of the game (phase 2 §4): real position → players from the farthest
 * to the closest, each with its distance and category → round winner → perfect bonus.
 * No interaction.
 */
export function RevealScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const round = snapshot.round;
  const data = round?.reveal;
  const city = getCity(round?.cityId ?? '');
  const results = data?.results ?? []; // closest first
  const count = results.length;
  const order = useMemo(() => [...results].sort((a, b) => b.distanceMeters - a.distanceMeters), [results]); // farthest first
  const winnerAt = revealWinnerAt(count);
  const perfectAt = revealPerfectAt(count);
  const checkpoints = useMemo(() => [TIMINGS.reveal.truthMs, ...order.map((_, i) => revealMarkerAt(i)), winnerAt, perfectAt], [order, winnerAt, perfectAt]);
  const elapsed = useSequence(data?.revealStartsAt ?? null, checkpoints);
  const mine = results.find((r) => r.playerId === snapshot.you);
  const perfect = !!mine && mine.bonusLabel === 'perfect';
  const winner = results[0] ?? null;
  const iWin = winner?.playerId === snapshot.you;

  const fired = useRef({ impact: false, revealed: 0, winner: false, perfect: false });
  useEffect(() => {
    const f = fired.current;
    if (elapsed >= TIMINGS.reveal.truthMs && !f.impact) {
      f.impact = true;
      playSound('impact');
      haptic('heavy');
    }
    const revealedNow = order.filter((_, i) => elapsed >= revealMarkerAt(i)).length;
    while (f.revealed < revealedNow) {
      const r = order[f.revealed];
      f.revealed += 1;
      const isLast = f.revealed === order.length;
      playSound(isLast ? 'closeGuess' : 'whoosh');
      if (r?.playerId === snapshot.you) haptic('light');
    }
    if (elapsed >= winnerAt && !f.winner && winner) {
      f.winner = true;
      playSound('roundWinner');
      if (iWin) haptic('success');
    }
    if (perfect && elapsed >= perfectAt && !f.perfect) {
      f.perfect = true;
      playSound('perfect');
      haptic('success');
    }
  }, [elapsed, order, winnerAt, perfectAt, perfect, winner, iWin, snapshot.you]);

  if (!round || !data || !city) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const revealedIds = new Set(order.filter((_, i) => elapsed >= revealMarkerAt(i)).map((r) => r.playerId));
  const winnerPlayer = winner ? byId.get(winner.playerId) : null;

  return (
    <div className="screen reveal" data-testid="reveal" aria-live="polite">
      <div className="guess__head">
        <span className="t-label">
          Manche {round.number}/{round.total} · {city.name}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <RevealMap location={data.location} results={results} players={snapshot.players} revealStartsAt={data.revealStartsAt} />
        {elapsed >= TIMINGS.reveal.truthMs && (
          <span className="reveal__truth-label" data-testid="truth-label">
            ● Vraie position
          </span>
        )}
      </div>
      <div className="reveal__grid" data-testid="distances">
        {results.map((r) => {
          if (!revealedIds.has(r.playerId)) return null;
          const p = byId.get(r.playerId);
          const cat = guessCategory(r.distanceMeters);
          const isWinner = elapsed >= winnerAt && r.playerId === winner?.playerId;
          return (
            <div key={r.playerId} className={`dist ${r.playerId === snapshot.you ? 'dist--me' : ''} ${isWinner ? 'dist--winner' : ''}`} data-testid={`dist-${p?.name ?? r.playerId}`}>
              <PlayerAvatar avatar={p?.avatar ?? 'diamond'} name={p?.name ?? '?'} size={22} />
              <span className="dist__name">
                {p?.name ?? '?'}
                <br />
                <span className="dist__cat">
                  {cat.emoji} {cat.label}
                  {r.auto ? ' · auto' : ''}
                </span>
              </span>
              <span className="dist__value">{formatDistance(r.distanceMeters)}</span>
            </div>
          );
        })}
      </div>
      {elapsed >= winnerAt && winnerPlayer && (
        <div className="round-winner" data-testid="round-winner">
          <span className="dist__trophy">🏆</span>
          <span>{iWin ? 'Tu remportes la manche' : `${winnerPlayer.name} remporte la manche`}</span>
        </div>
      )}
      {perfect && elapsed >= perfectAt && (
        <div className="perfect" data-testid="perfect">
          <span>{guessCategory(mine.distanceMeters).label} · Bonus</span>
          <span>+100</span>
        </div>
      )}
    </div>
  );
}
