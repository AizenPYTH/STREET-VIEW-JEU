import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistance, getCity, type RoomSnapshot } from '@cityguess/shared';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ScoreCounter } from '../components/ui/ScoreCounter';
import { HomeIcon, RefreshIcon, ShuffleIcon } from '../components/ui/Icons';
import { leaveRoom, rematch, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';

const MEDALS = ['🥇', '🥈', '🥉'];
const CONFETTI = Array.from({ length: 28 }, (_, i) => i);

export function FinalScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const navigate = useNavigate();
  const pushToast = useGameStore((s) => s.pushToast);
  const [busy, setBusy] = useState<'rematch' | 'newCity' | null>(null);
  const final = snapshot.final;
  const isHost = snapshot.hostId === snapshot.you;
  const city = getCity(snapshot.settings.cityId);
  if (!final) return null;

  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const winners = final.winnerIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const winner = winners[0];
  const iWon = final.winnerIds.includes(snapshot.you);
  const h = final.highlights;
  const highlights = [
    h.bestGuess && { icon: '🎯', label: 'Best guess', value: `${byId.get(h.bestGuess.playerId)?.name ?? '?'} · ${formatDistance(h.bestGuess.distanceMeters)} (R${h.bestGuess.roundNumber})` },
    h.fastestGuess && { icon: '⚡', label: 'Fastest guess', value: `${byId.get(h.fastestGuess.playerId)?.name ?? '?'} · ${(h.fastestGuess.timeMs / 1000).toFixed(1)}s` },
    h.perfectGuesses && { icon: '💎', label: 'Perfect guesses', value: `${byId.get(h.perfectGuesses.playerId)?.name ?? '?'} · ${h.perfectGuesses.count}×` },
  ].filter((x): x is { icon: string; label: string; value: string } => Boolean(x));

  const doRematch = async (newCity: boolean): Promise<void> => {
    setBusy(newCity ? 'newCity' : 'rematch');
    try {
      await rematch(newCity);
    } catch (e) {
      pushToast({ kind: 'error', text: e instanceof RequestError ? e.message : 'Could not start a rematch' });
    } finally {
      setBusy(null);
    }
  };

  const goHome = async (): Promise<void> => {
    await leaveRoom();
    navigate('/', { replace: true });
  };

  return (
    <div className="screen bg-aurora final" data-testid="final">
      <div className="confetti" aria-hidden="true">
        {CONFETTI.map((i) => (
          <span key={i} className="confetti__piece" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.25}s`, background: ['#C8FF3D', '#5B8CFF', '#FF5C5C', '#FFD166', '#35D07F'][i % 5] }} />
        ))}
      </div>
      <div className="screen__scroll">
        <motion.div className="final__winner" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
          <span className="eyebrow">{winners.length > 1 ? 'Winners' : 'Winner'}</span>
          {winner ? (
            <>
              <div className="final__avatars">
                {winners.map((w) => (
                  <Avatar key={w.id} avatar={w.avatar} color={w.color} size={88} />
                ))}
              </div>
              <h1 className="final__name" data-testid="winner-name">
                {winners.map((w) => w.name).join(' & ')}
              </h1>
              <p className="final__points">
                <ScoreCounter value={winner.totalScore} duration={1.6} sound /> <span className="final__points-label">points</span>
              </p>
              <p className="muted">{iWon ? "🎉 That's you!" : `${city?.flag} ${city?.name} · ${snapshot.settings.rounds} rounds`}</p>
            </>
          ) : (
            <p className="muted">Nobody finished this game.</p>
          )}
        </motion.div>

        <section>
          <span className="eyebrow">Final standings</span>
          <ul className="results" data-testid="final-ranking">
            {final.ranking.map((entry) => {
              const p = byId.get(entry.playerId);
              if (!p) return null;
              return (
                <li key={entry.playerId} className={`result ${p.id === snapshot.you ? 'result--me' : ''}`} data-testid={`final-${p.name}`}>
                  <span className="result__rank">{MEDALS[entry.rank - 1] ?? entry.rank}</span>
                  <Avatar avatar={p.avatar} color={p.color} size={36} />
                  <span className="result__name">{p.name}</span>
                  <span className="result__distance">{formatDistance(entry.totalDistanceMeters)} total</span>
                  <span className="result__score result__score--total">{entry.totalScore.toLocaleString('en-US')}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {highlights.length > 0 && (
          <section>
            <span className="eyebrow">Highlights</span>
            <ul className="highlights">
              {highlights.map((item) => (
                <li key={item.label} className="highlight">
                  <span className="highlight__icon">{item.icon}</span>
                  <span className="highlight__label">{item.label}</span>
                  <span className="highlight__value">{item.value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="screen__footer">
        {isHost ? (
          <div className="final__actions">
            <Button block loading={busy === 'rematch'} disabled={busy !== null} icon={<RefreshIcon />} onClick={() => void doRematch(false)} data-testid="rematch">
              Rematch
            </Button>
            <Button block variant="secondary" loading={busy === 'newCity'} disabled={busy !== null} icon={<ShuffleIcon />} onClick={() => void doRematch(true)} data-testid="new-city">
              New city
            </Button>
          </div>
        ) : (
          <p className="lobby__hint">Waiting for the host to start a rematch…</p>
        )}
        <Button variant="ghost" size="md" block icon={<HomeIcon />} onClick={() => void goHome()} data-testid="back-home">
          Back home
        </Button>
      </div>
    </div>
  );
}
