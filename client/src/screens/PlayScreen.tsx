import { useCallback, useEffect, useRef, useState } from 'react';
import { TIMINGS, getCity, type LatLng, type RoomSnapshot } from '@cityguess/shared';
import { Panorama } from '../components/streetview/Panorama';
import { GuessMap } from '../components/map/GuessMap';
import { Timer } from '../components/ui/Timer';
import { Button } from '../components/ui/Button';
import { PlayerRow } from '../components/ui/PlayerRow';
import { useCountdown } from '../hooks/useCountdown';
import { useSequence } from '../hooks/useSequence';
import { useConfig } from '../hooks/useConfig';
import { api, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

const { intro } = TIMINGS;
const INTRO_STEPS = [intro.titleMs, intro.titleMs + intro.countMs, intro.titleMs + 2 * intro.countMs, intro.titleMs + 3 * intro.countMs, intro.totalMs];

/** Plays timer sounds/haptics for the last 10 seconds (§13). */
function useTimerCues(seconds: number, active: boolean): void {
  const last = useRef(-1);
  useEffect(() => {
    if (!active || seconds === last.current) return;
    last.current = seconds;
    if (seconds <= 0) return;
    if (seconds <= TIMINGS.timerDangerAt) {
      playSound('tickFast');
      if (seconds <= 3) haptic('light');
    } else if (seconds <= TIMINGS.timerHotAt) playSound('tick');
  }, [seconds, active]);
}

/** One instance per round (keyed by the parent): intro → street view → guess → waiting. */
export function PlayScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const config = useConfig();
  const showToast = useGameStore((s) => s.showToast);
  const round = snapshot.round;
  const city = getCity(round?.cityId ?? snapshot.settings.cityId);
  const me = snapshot.players.find((p) => p.id === snapshot.you);
  const locked = snapshot.yourGuess !== null;
  const guessingPhase = snapshot.phase === 'guessing';
  const [view, setView] = useState<'street' | 'guess'>('street');
  const [marker, setMarker] = useState<LatLng | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panoReported = useRef(false);

  const introElapsed = useSequence(round?.introStartsAt ?? null, INTRO_STEPS);
  const introDone = guessingPhase || introElapsed >= intro.totalMs;
  const exploreStarted = round ? round.exploreEndsAt - snapshot.settings.exploreSeconds * 1000 <= snapshot.serverNow : false;
  const explore = useCountdown(round?.exploreEndsAt ?? null, 200);
  const guess = useCountdown(round?.guessEndsAt ?? null, 200);
  const seconds = guessingPhase ? guess.seconds : explore.seconds;
  const held = !guessingPhase && !exploreStarted;
  useTimerCues(seconds, introDone && !held && !locked);

  // Intro cues: 3 beeps, GO.
  const introStep = useRef(-1);
  useEffect(() => {
    if (guessingPhase || introElapsed < 0) return;
    const step = INTRO_STEPS.findIndex((cp) => introElapsed < cp);
    if (step === introStep.current) return;
    introStep.current = step;
    if (step >= 1 && step <= 3) {
      playSound('introBeep');
      haptic('light');
    } else if (step === 4) {
      playSound('go');
      haptic('medium');
    }
  }, [introElapsed, guessingPhase]);

  const onPanoReady = useCallback((): void => {
    if (panoReported.current) return;
    panoReported.current = true;
    api.panoReady().catch(() => undefined);
  }, []);

  const lock = async (): Promise<void> => {
    if (!marker || locked) return;
    setSubmitting(true);
    try {
      await api.submitGuess(marker);
      playSound('lock');
      haptic('medium');
    } catch (e) {
      showToast(e instanceof RequestError ? e.message : "Impossible d'envoyer ton guess", 'muted', 2000);
      playSound('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!round || !city || !me) return null;

  const activePlayers = snapshot.players.filter((p) => !p.left);
  const lockedCount = activePlayers.filter((p) => p.hasGuessed).length;
  const roundLabel = `Manche ${round.number}/${round.total}`;

  // ── ATTENTE ──
  if (locked) {
    return (
      <div className="screen" data-testid="waiting">
        <div className="guess__head">
          <span className="t-label">{roundLabel}</span>
          <Timer seconds={guessingPhase ? guess.seconds : explore.seconds} variant="map" held={held} />
        </div>
        <div className="screen__body" style={{ paddingTop: 12 }}>
          <h2 className="t-h2 t-h2--sm cg-pop">Guess verrouillé</h2>
          <p className="t-body">Retiens ton souffle.</p>
          <ul className="waiting__list">
            {activePlayers.map((p) => (
              <PlayerRow key={p.id} player={p} isMe={p.id === snapshot.you} mode="locked" />
            ))}
          </ul>
          <p className="t-meta" data-testid="locked-count">
            {lockedCount}/{activePlayers.length} verrouillés
          </p>
        </div>
      </div>
    );
  }

  // ── GUESS ──
  if (guessingPhase || view === 'guess') {
    return (
      <div className="screen" data-testid="guess" data-phase={snapshot.phase}>
        <div className="guess__head">
          <div>
            <span className="t-label">{roundLabel}</span>
            <h2 className="t-h2">Où es-tu ?</h2>
          </div>
          <Timer seconds={seconds} variant="map" held={held} />
        </div>
        <div className="screen__body" style={{ paddingTop: 14, gap: 10 }}>
          <GuessMap city={city} marker={marker} onPlace={setMarker} locked={false} avatar={me.avatar} />
          {!guessingPhase && (
            <Button variant="ghost" center onClick={() => setView('street')} data-testid="back-to-street">
              ← Retour à la rue
            </Button>
          )}
        </div>
        <div className="screen__footer">
          <p className="guess__cta-hint">{marker ? 'Touche encore pour déplacer le marqueur' : 'Touche la carte pour placer ton marqueur'}</p>
          <Button disabled={!marker} glow={!!marker} loading={submitting} onClick={() => void lock()} data-testid="lock-guess">
            Verrouiller mon guess
          </Button>
        </div>
      </div>
    );
  }

  // ── MANCHE (street view) ──
  const step = introElapsed < 0 ? 0 : INTRO_STEPS.findIndex((cp) => introElapsed < cp);
  const exploreElapsedMs = exploreStarted ? snapshot.settings.exploreSeconds * 1000 - explore.msLeft : 0;
  return (
    <div className="screen screen--immersive round" data-testid="round" data-phase={snapshot.phase}>
      <div className="round__view">
        <Panorama panoId={round.panoId} config={config} onReady={onPanoReady} />
      </div>

      {!introDone && (
        <div className="intro" data-testid="round-intro" data-step={step}>
          {step === 0 && (
            <>
              {round.isLast && round.multiplier > 1 && <span className="intro__pill">Dernière manche · Points doublés</span>}
              <span className="intro__round cg-up">{roundLabel}</span>
              <span className="intro__city cg-pop">
                {city.flag} {city.name}
              </span>
            </>
          )}
          {step >= 1 && step <= 3 && (
            <span key={step} className="intro__count" aria-live="assertive">
              {4 - step}
            </span>
          )}
          {step === 4 && <div className="intro__go">GO</div>}
        </div>
      )}

      {introDone && (
        <>
          <div className="hud">
            <span className="hud-pill" data-testid="round-pill">
              {roundLabel}
              <span className="hud-pill__sep">|</span>
              {city.name}
            </span>
            <Timer seconds={held ? snapshot.settings.exploreSeconds : seconds} variant="hud" held={held} />
          </div>
          {seconds <= TIMINGS.timerDangerAt && !held && <div className="vignette" aria-hidden="true" />}
          {exploreStarted && exploreElapsedMs < 3000 && (
            <div className="round__hint" aria-hidden="true">
              <span className="hint-pill">Regarde autour de toi. Où es-tu ?</span>
            </div>
          )}
          {!(exploreStarted && exploreElapsedMs < 3000) && (
            <button type="button" className="round__guess-now" onClick={() => setView('guess')} data-testid="guess-now">
              Deviner maintenant
            </button>
          )}
        </>
      )}
    </div>
  );
}
