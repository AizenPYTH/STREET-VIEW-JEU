import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CITIES,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXPLORE_SECONDS_OPTIONS,
  ROUND_OPTIONS,
  getCity,
  type Difficulty,
  type ExploreSeconds,
  type RoomSnapshot,
  type RoundCount,
} from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { BackIcon, CopyIcon, ShareIcon } from '../components/ui/Icons';
import { Avatar } from '../components/ui/Avatar';
import { Segmented } from '../components/ui/Segmented';
import { Sheet } from '../components/ui/Sheet';
import { Logo } from '../components/ui/Logo';
import { leaveRoom, startGame, toggleReady, updateSettings, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export function LobbyScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const navigate = useNavigate();
  const pushToast = useGameStore((s) => s.pushToast);
  const [cityOpen, setCityOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const me = snapshot.players.find((p) => p.id === snapshot.you);
  const isHost = snapshot.hostId === snapshot.you;
  const city = getCity(snapshot.settings.cityId);
  const activePlayers = snapshot.players.filter((p) => !p.left);
  const slots = Math.max(4, Math.min(snapshot.maxPlayers, activePlayers.length + 1));
  const readyCount = activePlayers.filter((p) => p.isReady || p.isHost).length;
  const shareUrl = `${window.location.origin}/join/${snapshot.code}`;

  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(snapshot.code);
      pushToast({ kind: 'success', text: 'Code copied' });
    } catch {
      pushToast({ kind: 'info', text: `Room code: ${snapshot.code}` });
    }
  };

  const share = async (): Promise<void> => {
    const data = { title: 'CityGuess', text: `Join my CityGuess room with code ${snapshot.code}`, url: shareUrl };
    try {
      if (typeof navigator.share === 'function') await navigator.share(data);
      else {
        await navigator.clipboard.writeText(shareUrl);
        pushToast({ kind: 'success', text: 'Invite link copied' });
      }
    } catch {
      /* user cancelled */
    }
  };

  const patch = (p: Parameters<typeof updateSettings>[0]): void => {
    updateSettings(p).catch((e: RequestError) => pushToast({ kind: 'error', text: e.message }));
  };

  const onStart = async (): Promise<void> => {
    setStarting(true);
    try {
      await startGame();
    } catch (e) {
      pushToast({ kind: 'error', text: e instanceof RequestError ? e.message : 'Could not start the game' });
      playSound('error');
      haptic('warning');
    } finally {
      setStarting(false);
    }
  };

  const onLeave = async (): Promise<void> => {
    await leaveRoom();
    navigate('/', { replace: true });
  };

  return (
    <div className="screen bg-aurora lobby">
      <header className="topbar">
        <IconButton label="Leave room" onClick={() => void onLeave()} data-testid="leave-room">
          <BackIcon />
        </IconButton>
        <Logo size="sm" />
        <span style={{ width: 44 }} />
      </header>
      <div className="screen__scroll">
        <section className="card card--elevated lobby__code" data-testid="room-code-card">
          <span className="eyebrow">Room code</span>
          <button type="button" className="lobby__code-value mono" onClick={() => void copyCode()} data-testid="room-code">
            {snapshot.code}
          </button>
          <div className="lobby__code-actions">
            <Button variant="secondary" size="md" icon={<CopyIcon />} onClick={() => void copyCode()}>
              Copy
            </Button>
            <Button variant="secondary" size="md" icon={<ShareIcon />} onClick={() => void share()}>
              Share
            </Button>
          </div>
        </section>

        <section>
          <div className="section-head">
            <span className="eyebrow">Players</span>
            <span className="eyebrow" data-testid="player-count">
              {activePlayers.length} / {snapshot.maxPlayers}
            </span>
          </div>
          <ul className="lobby__players" data-testid="player-list">
            {Array.from({ length: slots }, (_, i) => {
              const p = activePlayers[i];
              if (!p) {
                return (
                  <li key={`empty-${i}`} className="lobby__player lobby__player--empty">
                    <span className="lobby__player-dot" />
                    <span className="muted">Waiting…</span>
                  </li>
                );
              }
              const ready = p.isHost || p.isReady;
              return (
                <li
                  key={p.id}
                  className={`lobby__player ${p.id === snapshot.you ? 'lobby__player--me' : ''} ${!p.connected ? 'lobby__player--offline' : ''}`}
                  data-testid={`player-${p.name}`}
                >
                  <Avatar avatar={p.avatar} color={p.color} size={44} dimmed={!p.connected} badge={p.isHost ? 'host' : ready ? 'check' : !p.connected ? 'offline' : null} />
                  <div className="lobby__player-info">
                    <span className="lobby__player-name">{p.name}</span>
                    <span className="lobby__player-status">
                      {!p.connected ? 'Disconnected' : p.isHost ? 'Host' : p.isReady ? 'Ready' : 'Not ready'}
                    </span>
                  </div>
                  <span className={`lobby__player-dot ${p.connected ? 'lobby__player-dot--on' : ''}`} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="lobby__settings">
          <div className="section-head">
            <span className="eyebrow">Game settings</span>
            {!isHost && <span className="eyebrow muted">Host only</span>}
          </div>
          <button
            type="button"
            className="setting setting--city"
            disabled={!isHost}
            onClick={() => {
              playSound('click');
              setCityOpen(true);
            }}
            data-testid="city-setting"
          >
            <span className="setting__label">City</span>
            <span className="setting__value">
              <span className="setting__flag">{city?.flag}</span>
              {city?.name}
              {isHost && <span className="setting__chevron">›</span>}
            </span>
          </button>
          <div className="setting">
            <span className="setting__label">Rounds</span>
            <Segmented
              ariaLabel="Rounds"
              options={ROUND_OPTIONS.map((r) => ({ value: r, label: String(r) }))}
              value={snapshot.settings.rounds}
              disabled={!isHost}
              onChange={(rounds: RoundCount) => patch({ rounds })}
            />
          </div>
          <div className="setting">
            <span className="setting__label">Time to explore</span>
            <Segmented
              ariaLabel="Timer"
              options={EXPLORE_SECONDS_OPTIONS.map((s) => ({ value: s, label: `${s}s` }))}
              value={snapshot.settings.exploreSeconds}
              disabled={!isHost}
              onChange={(exploreSeconds: ExploreSeconds) => patch({ exploreSeconds })}
            />
          </div>
          <div className="setting">
            <span className="setting__label">Difficulty</span>
            <Segmented
              ariaLabel="Difficulty"
              options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d].label }))}
              value={snapshot.settings.difficulty}
              disabled={!isHost}
              onChange={(difficulty: Difficulty) => patch({ difficulty })}
            />
            <span className="setting__hint">{DIFFICULTY_LABELS[snapshot.settings.difficulty].hint}</span>
          </div>
        </section>
      </div>

      <div className="screen__footer">
        {isHost ? (
          <>
            <Button block loading={starting} onClick={() => void onStart()} data-testid="start-game">
              Start game
            </Button>
            <p className="lobby__hint">
              {activePlayers.length === 1 ? 'Playing solo — share the code to invite friends' : `${readyCount}/${activePlayers.length} ready · you can start anytime`}
            </p>
          </>
        ) : (
          <>
            <Button
              block
              variant={me?.isReady ? 'secondary' : 'primary'}
              onClick={() => {
                toggleReady().catch(() => undefined);
                playSound('ready');
                haptic('medium');
              }}
              data-testid="toggle-ready"
            >
              {me?.isReady ? "I'm ready ✓" : "I'm ready"}
            </Button>
            <p className="lobby__hint">Waiting for the host to start…</p>
          </>
        )}
      </div>

      <Sheet open={cityOpen} onClose={() => setCityOpen(false)} title="Choose a city">
        <ul className="city-list">
          {CITIES.map((c) => {
            const selected = c.id === snapshot.settings.cityId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`city-item ${selected ? 'city-item--selected' : ''}`}
                  onClick={() => {
                    playSound('click');
                    haptic('light');
                    patch({ cityId: c.id });
                    setCityOpen(false);
                  }}
                  data-testid={`city-${c.id}`}
                >
                  <span className="city-item__flag">{c.flag}</span>
                  <span className="city-item__name">{c.name}</span>
                  <span className="city-item__country">{c.country}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
