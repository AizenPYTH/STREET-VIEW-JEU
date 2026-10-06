import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIMINGS, formatDistance, formatPoints, getCity, type RoomSnapshot, type Standing } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { HomeIcon } from '../components/ui/Icons';
import { Leaderboard } from '../components/ui/Leaderboard';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { useSequence } from '../hooks/useSequence';
import { api, leaveRoom, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';

const { final: T } = TIMINGS;

/** Final results in four beats, REVANCHE above everything (§22). */
export function FinalScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const navigate = useNavigate();
  const showToast = useGameStore((s) => s.showToast);
  const final = snapshot.final;
  const isHost = snapshot.hostId === snapshot.you;
  const city = getCity(snapshot.settings.cityId);
  const [busy, setBusy] = useState<'rematch' | 'newCity' | null>(null);
  const elapsed = useSequence(final?.startsAt ?? null, [T.heroMs, T.rankingMs, T.statsMs, T.actionsMs]);
  const standings = useMemo<Standing[]>(() => {
    if (!final) return [];
    const leader = final.ranking[0]?.totalScore ?? 0;
    return final.ranking.map((e) => ({ playerId: e.playerId, rank: e.rank, previousRank: null, totalScore: e.totalScore, roundPoints: 0, streak: 0, gapToLeader: leader - e.totalScore }));
  }, [final]);

  if (!final) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const winner = byId.get(final.winnerIds[0] ?? '');
  const won = final.winnerIds.includes(snapshot.you);
  const myStats = final.stats.find((s) => s.playerId === snapshot.you);

  const rematch = async (newCity: boolean): Promise<void> => {
    setBusy(newCity ? 'newCity' : 'rematch');
    try {
      await api.rematch(newCity);
      if (newCity) navigate(`/room/${snapshot.code}/city`, { replace: true });
    } catch (e) {
      showToast(e instanceof RequestError ? e.message : 'Impossible de relancer', 'muted', 2000);
    } finally {
      setBusy(null);
    }
  };

  const share = async (): Promise<void> => {
    const mine = myStats?.bestGuessMeters;
    const text = `${won ? "J'ai gagné" : `${winner?.name ?? 'Quelqu’un'} a gagné`} sur CityGuess à ${city?.name}${mine !== null && mine !== undefined ? ` — mon meilleur guess : ${formatDistance(mine)}` : ''}. Revanche ?`;
    const url = `${window.location.origin}/join/${snapshot.code}`;
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title: 'CityGuess', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        showToast('Lien copié', 'muted', 1500);
      }
    } catch {
      /* cancelled */
    }
  };

  const home = async (): Promise<void> => {
    await leaveRoom();
    navigate('/', { replace: true });
  };

  return (
    <div className="screen final" data-testid="final">
      <div className="screen__body">
        {elapsed >= T.heroMs && winner && (
          <section className="winner" data-testid="winner">
            <span className={`winner__label ${won ? 'hot' : 'muted'}`}>{won ? '🏆 Victoire' : '🏆 Défaite'}</span>
            <div className="winner__avatar">
              <PlayerAvatar avatar={winner.avatar} name={winner.name} size={96} ring />
            </div>
            <h1 className="winner__name" data-testid="winner-name">
              {winner.name}
            </h1>
            <span className="winner__total">{formatPoints(winner.totalScore)}</span>
            <p className="winner__sub">{won ? 'Tu connais cette ville.' : `${winner.name} l'emporte. Revanche ?`}</p>
          </section>
        )}
        {elapsed >= T.rankingMs && (
          <section className="cg-up" data-testid="final-ranking">
            <span className="t-label">Classement final</span>
            <div style={{ height: 10 }} />
            <Leaderboard standings={standings} players={snapshot.players} me={snapshot.you} compact movement={false} />
          </section>
        )}
        {elapsed >= T.statsMs && myStats && (
          <section className="final__stats" data-testid="final-stats">
            <div className="stat-tile">
              <span className="stat-tile__label">Meilleur guess</span>
              <span className="stat-tile__value">{myStats.bestGuessMeters === null ? '—' : formatDistance(myStats.bestGuessMeters)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__label">Meilleure manche</span>
              <span className="stat-tile__value">{formatPoints(myStats.bestRoundPoints)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__label">Série</span>
              <span className="stat-tile__value">{myStats.maxStreak > 0 ? `×${myStats.maxStreak}` : '—'}</span>
            </div>
          </section>
        )}
      </div>
      {elapsed >= T.actionsMs && (
        <div className="screen__footer cg-up">
          {isHost ? (
            <Button glow loading={busy === 'rematch'} disabled={busy !== null} onClick={() => void rematch(false)} data-testid="rematch">
              Revanche
            </Button>
          ) : (
            <Button disabled>En attente de l'hôte…</Button>
          )}
          <div className="final__secondary">
            {isHost && (
              <Button variant="secondary" loading={busy === 'newCity'} disabled={busy !== null} onClick={() => void rematch(true)} data-testid="new-city">
                Nouvelle ville
              </Button>
            )}
            <Button variant="secondary" onClick={() => void share()}>
              Partager
            </Button>
            <IconButton label="Accueil" large onClick={() => void home()} data-testid="back-home">
              <HomeIcon />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
