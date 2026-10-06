import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { RESULTS_SECONDS, formatDistance, getCity, type RoomSnapshot } from '@cityguess/shared';
import { RevealMap } from '../components/map/RevealMap';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { ScoreCounter } from '../components/ui/ScoreCounter';
import { useCountdown } from '../hooks/useCountdown';
import { nextRound, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';

const MEDALS = ['🥇', '🥈', '🥉'];

export function RevealScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const pushToast = useGameStore((s) => s.pushToast);
  const round = snapshot.round;
  const reveal = round?.reveal;
  const city = getCity(round?.cityId ?? '');
  const isHost = snapshot.hostId === snapshot.you;
  const showingResults = snapshot.phase === 'results';
  const [tab, setTab] = useState<'round' | 'total'>('round');
  const countdown = useCountdown(showingResults ? snapshot.phaseEndsAt : null, 200);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (showingResults) setTab('total');
  }, [showingResults]);

  if (!round || !reveal || !city) return null;

  const isLastRound = round.number === round.total;
  const players = snapshot.players.filter((p) => !p.left || reveal.results.some((r) => r.playerId === p.id));
  const roundRows = players
    .map((p) => ({ player: p, result: reveal.results.find((r) => r.playerId === p.id) ?? null }))
    .sort((a, b) => (b.result?.total ?? -1) - (a.result?.total ?? -1) || (a.result?.distanceMeters ?? Infinity) - (b.result?.distanceMeters ?? Infinity));
  const totalRows = [...players].sort((a, b) => b.totalScore - a.totalScore);

  const onNext = async (): Promise<void> => {
    setSkipping(true);
    try {
      await nextRound();
    } catch (e) {
      pushToast({ kind: 'error', text: e instanceof RequestError ? e.message : 'Could not continue' });
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div className="screen screen--immersive reveal" data-testid="reveal" data-phase={snapshot.phase}>
      <div className="reveal__map">
        <RevealMap location={reveal.location} results={reveal.results} players={snapshot.players} />
        <div className="hud hud--top">
          <span className="pill pill--overlay">
            Round {round.number}/{round.total} · {city.flag} {city.name}
          </span>
          <span className="pill pill--danger pill--overlay">📍 Real location</span>
        </div>
      </div>

      <motion.section className="reveal__panel" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 30 }}>
        <div className="reveal__tabs">
          <Segmented
            ariaLabel="Results"
            options={[
              { value: 'round', label: 'Round results' },
              { value: 'total', label: 'Total score' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        <ul className="results" data-testid={`results-${tab}`}>
          {tab === 'round'
            ? roundRows.map(({ player, result }, index) => (
                <motion.li
                  key={player.id}
                  className={`result ${player.id === snapshot.you ? 'result--me' : ''}`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.12 }}
                  data-testid={`result-${player.name}`}
                >
                  <span className="result__rank">{result ? (MEDALS[index] ?? `${index + 1}`) : '—'}</span>
                  <Avatar avatar={player.avatar} color={player.color} size={36} dimmed={!result} />
                  <span className="result__name">{player.name}</span>
                  <span className="result__distance">
                    {result ? formatDistance(result.distanceMeters) : 'No guess'}
                    {result?.bonusLabel === 'perfect' && <span className="result__badge">PERFECT</span>}
                  </span>
                  <span className="result__score">
                    {result ? <ScoreCounter value={result.total} prefix="+" delay={0.7 + index * 0.12} sound={player.id === snapshot.you} /> : '+0'}
                  </span>
                </motion.li>
              ))
            : totalRows.map((player, index) => (
                <li key={player.id} className={`result ${player.id === snapshot.you ? 'result--me' : ''}`} data-testid={`total-${player.name}`}>
                  <span className="result__rank">{MEDALS[index] ?? `${index + 1}`}</span>
                  <Avatar avatar={player.avatar} color={player.color} size={36} />
                  <span className="result__name">{player.name}</span>
                  <span className="result__score result__score--total">{player.totalScore.toLocaleString('en-US')}</span>
                </li>
              ))}
        </ul>

        <div className="reveal__footer">
          {showingResults ? (
            <>
              <div className="progress" aria-hidden="true">
                <div className="progress__bar" style={{ width: `${(countdown.msLeft / (RESULTS_SECONDS * 1000)) * 100}%` }} />
              </div>
              {isHost ? (
                <Button block loading={skipping} onClick={() => void onNext()} data-testid="next-round">
                  {isLastRound ? 'Final results' : 'Next round'}
                </Button>
              ) : (
                <p className="muted reveal__auto">
                  {isLastRound ? 'Final results' : `Round ${round.number + 1}`} in {countdown.seconds}s
                </p>
              )}
            </>
          ) : (
            <p className="muted reveal__auto">Revealing…</p>
          )}
        </div>
      </motion.section>
    </div>
  );
}
