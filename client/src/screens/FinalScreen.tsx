import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIMINGS, formatDistance, formatPoints, getCity, maxRoundPoints, type RoomSnapshot, type Standing } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { HomeIcon } from '../components/ui/Icons';
import { Leaderboard } from '../components/ui/Leaderboard';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { useSequence } from '../hooks/useSequence';
import { api, leaveRoom, RequestError } from '../services/socket';
import { shareCard } from '../services/shareCard';
import { useGameStore } from '../store/gameStore';

const { final: T } = TIMINGS;

/** Final results in four beats, REVANCHE above everything (§22, phase 2 §28–29). */
export function FinalScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const navigate = useNavigate();
  const showToast = useGameStore((s) => s.showToast);
  const final = snapshot.final;
  const isHost = snapshot.hostId === snapshot.you;
  const city = getCity(snapshot.settings.cityId);
  const [busy, setBusy] = useState<'rematch' | 'newCity' | 'share' | null>(null);
  const elapsed = useSequence(final?.startsAt ?? null, [T.heroMs, T.rankingMs, T.statsMs, T.actionsMs]);
  const standings = useMemo<Standing[]>(() => {
    if (!final) return [];
    const leader = final.ranking[0]?.totalScore ?? 0;
    return final.ranking.map((e) => ({ playerId: e.playerId, rank: e.rank, previousRank: null, totalScore: e.totalScore, roundPoints: 0, streak: 0, previousStreak: 0, gapToLeader: leader - e.totalScore }));
  }, [final]);

  if (!final || !city) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const winner = byId.get(final.winnerIds[0] ?? '');
  const won = final.winnerIds.includes(snapshot.you);
  const mine = final.ranking.find((e) => e.playerId === snapshot.you);
  const myStats = final.stats.find((s) => s.playerId === snapshot.you);
  const gap = mine && winner ? winner.totalScore - mine.totalScore : 0;
  const h = final.highlights;

  const defeatLine = (): string => {
    if (!mine) return `${winner?.name ?? 'Quelqu’un'} l'emporte.`;
    if (gap > 0 && gap <= maxRoundPoints(snapshot.settings.doubleFinal ? 2 : 1)) return `Tu étais à ${formatPoints(gap)} points. Une bonne manche aurait tout changé.`;
    if (gap > 0) return `Tu étais à ${formatPoints(gap)} points. Revanche ?`;
    return `${winner?.name ?? 'Quelqu’un'} l'emporte. Revanche ?`;
  };

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
    if (!winner || !mine) return;
    setBusy('share');
    try {
      const text = won ? `J'ai gagné à ${city.name} sur CityGuess avec ${formatPoints(winner.totalScore)} pts. Tu peux me battre ?` : `${winner.name} a gagné à ${city.name} sur CityGuess. Revanche, qui vient ?`;
      const outcome = await shareCard(
        {
          city,
          code: snapshot.code,
          winnerName: winner.name,
          winnerPoints: winner.totalScore,
          myName: byId.get(snapshot.you)?.name ?? '',
          myRank: mine.rank,
          playerCount: final.ranking.length,
          bestGuessMeters: myStats?.bestGuessMeters ?? null,
          rounds: snapshot.settings.rounds,
          won,
        },
        text,
      );
      if (outcome === 'downloaded') showToast('Image enregistrée', 'muted', 1500);
    } catch {
      showToast("Impossible de créer l'image", 'muted', 1500);
    } finally {
      setBusy(null);
    }
  };

  const home = async (): Promise<void> => {
    await leaveRoom();
    navigate('/', { replace: true });
  };

  const tiles: { icon: string; label: string; value: string }[] = [];
  if (myStats) tiles.push({ icon: '🎯', label: 'Ton meilleur guess', value: myStats.bestGuessMeters === null ? '—' : formatDistance(myStats.bestGuessMeters) });
  if (h.closest) tiles.push({ icon: '📍', label: 'Plus proche', value: `${byId.get(h.closest.playerId)?.name ?? '?'} · ${formatDistance(h.closest.distanceMeters)}` });
  if (h.fastest) tiles.push({ icon: '⚡', label: 'Plus rapide', value: `${byId.get(h.fastest.playerId)?.name ?? '?'} · ${(h.fastest.timeMs / 1000).toFixed(1)} s` });
  if (h.streak) tiles.push({ icon: '🔥', label: 'Plus longue série', value: `${byId.get(h.streak.playerId)?.name ?? '?'} · ×${h.streak.length}` });

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
            <p className="winner__sub" data-testid="final-line">
              {won ? 'Tu connais cette ville.' : defeatLine()}
            </p>
          </section>
        )}
        {elapsed >= T.rankingMs && (
          <section className="cg-up" data-testid="final-ranking">
            <span className="t-label">Classement final</span>
            <div style={{ height: 10 }} />
            <Leaderboard standings={standings} players={snapshot.players} me={snapshot.you} compact movement={false} />
          </section>
        )}
        {elapsed >= T.statsMs && tiles.length > 0 && (
          <section className="final__stats" style={{ gridTemplateColumns: tiles.length > 2 ? '1fr 1fr' : `repeat(${tiles.length}, 1fr)` }} data-testid="final-stats">
            {tiles.slice(0, 4).map((t) => (
              <div key={t.label} className="stat-tile">
                <span className="stat-tile__label">
                  {t.icon} {t.label}
                </span>
                <span className="stat-tile__value">{t.value}</span>
              </div>
            ))}
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
            <Button variant="secondary" loading={busy === 'share'} disabled={busy !== null} onClick={() => void share()} data-testid="share">
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
