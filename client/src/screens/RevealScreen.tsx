import { useEffect, useMemo, useRef } from 'react';
import { TIMINGS, formatDistance, getCity, type RoomSnapshot } from '@cityguess/shared';
import { RevealMap } from '../components/map/RevealMap';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { useSequence } from '../hooks/useSequence';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

const { reveal } = TIMINGS;

/** Scripted reveal (§20). No interaction. */
export function RevealScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const round = snapshot.round;
  const data = round?.reveal;
  const city = getCity(round?.cityId ?? '');
  const results = data?.results ?? [];
  const checkpoints = useMemo(() => [reveal.truthMs, reveal.linesMs, reveal.gridMs, ...results.map((_, i) => reveal.gridMs + i * reveal.gridStepMs), reveal.perfectMs], [results]);
  const elapsed = useSequence(data?.revealStartsAt ?? null, checkpoints);
  const mine = results.find((r) => r.playerId === snapshot.you);
  const perfect = !!mine && mine.bonusLabel === 'perfect';

  const fired = useRef({ impact: false, whoosh: false, perfect: false });
  useEffect(() => {
    if (elapsed >= reveal.truthMs && !fired.current.impact) {
      fired.current.impact = true;
      playSound('impact');
      haptic('heavy');
    }
    if (elapsed >= reveal.linesMs && !fired.current.whoosh) {
      fired.current.whoosh = true;
      playSound('whoosh');
    }
    if (perfect && elapsed >= reveal.perfectMs && !fired.current.perfect) {
      fired.current.perfect = true;
      playSound('perfect');
      haptic('success');
    }
  }, [elapsed, perfect]);

  if (!round || !data || !city) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));

  return (
    <div className="screen reveal" data-testid="reveal" aria-live="polite">
      <div className="guess__head">
        <span className="t-label">
          Manche {round.number}/{round.total} · {city.name}
        </span>
      </div>
      <div className="reveal__map-wrap" style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <RevealMap location={data.location} results={results} players={snapshot.players} revealStartsAt={data.revealStartsAt} />
        {elapsed >= reveal.truthMs && (
          <span className="reveal__truth-label" data-testid="truth-label">
            ● Vraie position
          </span>
        )}
      </div>
      {elapsed >= reveal.gridMs && (
        <div className="reveal__grid" data-testid="distances">
          {results.map((r, i) => {
            if (elapsed < reveal.gridMs + i * reveal.gridStepMs) return null;
            const p = byId.get(r.playerId);
            return (
              <div key={r.playerId} className={`dist ${r.playerId === snapshot.you ? 'dist--me' : ''}`} data-testid={`dist-${p?.name ?? r.playerId}`}>
                <PlayerAvatar avatar={p?.avatar ?? 'diamond'} name={p?.name ?? '?'} size={22} />
                <span className="dist__name">{p?.name ?? '?'}</span>
                {r.auto && <span className="dist__auto">auto</span>}
                <span className="dist__value">{formatDistance(r.distanceMeters)}</span>
              </div>
            );
          })}
        </div>
      )}
      {perfect && elapsed >= reveal.perfectMs && (
        <div className="perfect" data-testid="perfect">
          <span>Guess parfait</span>
          <span>Bonus +100</span>
        </div>
      )}
    </div>
  );
}
