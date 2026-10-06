import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { GUESS_SECONDS, getCity, type LatLng, type RoomSnapshot } from '@cityguess/shared';
import { Panorama } from '../components/streetview/Panorama';
import { GuessMap } from '../components/map/GuessMap';
import { TimerRing } from '../components/ui/TimerRing';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Pill } from '../components/ui/Pill';
import { EyeIcon, MapIcon } from '../components/ui/Icons';
import { useCountdown } from '../hooks/useCountdown';
import { useConfig } from '../hooks/useConfig';
import { submitGuess, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

/** Explore the panorama, then place the guess. One instance per round (keyed by the parent). */
export function PlayScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const config = useConfig();
  const pushToast = useGameStore((s) => s.pushToast);
  const round = snapshot.round;
  const city = getCity(round?.cityId ?? snapshot.settings.cityId);
  const me = snapshot.players.find((p) => p.id === snapshot.you);
  const locked = snapshot.yourGuess !== null;
  const guessingPhase = snapshot.phase === 'guessing';
  const [view, setView] = useState<'street' | 'map'>('street');
  const [marker, setMarker] = useState<LatLng | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const intro = useCountdown(round?.introEndsAt ?? null, 100);
  const explore = useCountdown(round?.exploreEndsAt ?? null, 200);
  const guess = useCountdown(round?.guessEndsAt ?? null, 200);
  const timer = guessingPhase ? guess : explore;
  const timerTotal = guessingPhase ? GUESS_SECONDS : snapshot.settings.exploreSeconds;
  const showMap = view === 'map' || guessingPhase || locked;

  // Timer sounds: ticks under 10 s, warning at 10, haptics on 3‑2‑1.
  const lastSecond = useRef<number>(-1);
  useEffect(() => {
    if (intro.seconds > 0 && !guessingPhase) return;
    if (timer.seconds === lastSecond.current) return;
    lastSecond.current = timer.seconds;
    if (timer.seconds === 10) playSound('warning');
    else if (timer.seconds > 0 && timer.seconds < 10) playSound('tick');
    if (timer.seconds > 0 && timer.seconds <= 3) haptic('countdown');
  }, [timer.seconds, intro.seconds, guessingPhase]);

  useEffect(() => {
    if (guessingPhase && !locked) {
      setView('map');
      haptic('medium');
    }
  }, [guessingPhase, locked]);

  const confirm = async (): Promise<void> => {
    if (!marker || locked) return;
    setSubmitting(true);
    try {
      await submitGuess(marker);
      playSound('confirm');
      haptic('success');
    } catch (e) {
      pushToast({ kind: 'error', text: e instanceof RequestError ? e.message : 'Could not send your guess' });
      playSound('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!round || !city || !me) return null;

  const guessedCount = snapshot.players.filter((p) => !p.left && p.hasGuessed).length;
  const activeCount = snapshot.players.filter((p) => !p.left).length;

  return (
    <div className="screen screen--immersive play" data-testid="play" data-phase={snapshot.phase}>
      {!guessingPhase && (
        <div className={`play__layer ${showMap ? 'play__layer--hidden' : ''}`} aria-hidden={showMap}>
          <Panorama panoId={round.panoId} config={config} />
        </div>
      )}
      {showMap && (
        <div className="play__layer">
          <GuessMap city={city} marker={locked ? snapshot.yourGuess : marker} onMarkerChange={setMarker} locked={locked} color={me.color} avatar={me.avatar} />
        </div>
      )}

      <div className="hud hud--top">
        <Pill className="pill--overlay" data-testid="round-pill">
          Round {round.number}/{round.total} · {city.flag} {city.name}
        </Pill>
        <TimerRing secondsLeft={intro.seconds > 0 && !guessingPhase ? timerTotal : timer.seconds} totalSeconds={timerTotal} />
      </div>

      <AnimatePresence>
        {intro.seconds > 0 && !guessingPhase && (
          <motion.div className="play__intro" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} data-testid="round-intro">
            <span className="eyebrow">Round {round.number} / {round.total}</span>
            <span className="play__intro-city">
              {city.flag} {city.name.toUpperCase()}
            </span>
            <span className="muted">Where are you?</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!locked && (
        <div className="hud hud--bottom">
          {showMap ? (
            <>
              <Pill className="pill--overlay play__hint">{marker ? 'Drag to adjust, then confirm' : 'Tap the map to place your marker'}</Pill>
              <div className="play__actions">
                {!guessingPhase && (
                  <Button variant="secondary" size="lg" icon={<EyeIcon />} onClick={() => setView('street')} data-testid="back-to-street">
                    Street
                  </Button>
                )}
                <Button block loading={submitting} disabled={!marker} onClick={() => void confirm()} data-testid="confirm-guess">
                  Confirm guess
                </Button>
              </div>
            </>
          ) : (
            <Button block variant="primary" icon={<MapIcon />} onClick={() => setView('map')} data-testid="open-map">
              Place guess
            </Button>
          )}
        </div>
      )}

      <AnimatePresence>
        {locked && (
          <motion.div className="waiting" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="waiting">
            <span className="pill pill--success">✓ Guess locked</span>
            <h2 className="waiting__title">Waiting for other players…</h2>
            <div className="waiting__players">
              {snapshot.players
                .filter((p) => !p.left)
                .map((p) => (
                  <div key={p.id} className="waiting__player">
                    <Avatar avatar={p.avatar} color={p.color} size={40} dimmed={!p.hasGuessed} badge={p.hasGuessed ? 'check' : !p.connected ? 'offline' : null} />
                    <span className="waiting__name">{p.name}</span>
                  </div>
                ))}
            </div>
            <span className="muted tabular">
              {guessedCount}/{activeCount} locked in
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
