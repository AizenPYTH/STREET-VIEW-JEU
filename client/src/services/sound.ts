import { storage } from './storage';

/**
 * Sound cues (§25) synthesised with the Web Audio API: no assets, instant playback.
 * One "Son" toggle covers everything in the MVP.
 */
export type SoundName =
  | 'click'
  | 'join'
  | 'introBeep'
  | 'go'
  | 'tick'
  | 'tickFast'
  | 'timeUp'
  | 'marker'
  | 'lock'
  | 'impact'
  | 'whoosh'
  | 'points'
  | 'perfect'
  | 'victory'
  | 'defeat'
  | 'error';

let ctx: AudioContext | null = null;
let enabled = storage.isSoundEnabled();
let unlocked = false;
const listeners = new Set<(enabled: boolean) => void>();

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Must be called from a user gesture once (browsers block audio otherwise). */
export function unlockAudio(): void {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  unlocked = true;
}

function tone(
  c: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  options: { type?: OscillatorType; gain?: number; slideTo?: number; attack?: number } = {},
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);
  if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, startAt + duration);
  const peak = options.gain ?? 0.16;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + (options.attack ?? 0.005));
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function noise(c: AudioContext, startAt: number, duration: number, gainValue = 0.12, from = 400, to = 3000): void {
  const length = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, startAt);
  filter.frequency.exponentialRampToValueAtTime(to, startAt + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(gainValue, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(filter).connect(gain).connect(c.destination);
  source.start(startAt);
}

const SOUNDS: Record<SoundName, (c: AudioContext, t: number) => void> = {
  click: (c, t) => tone(c, 640, t, 0.05, { type: 'triangle', gain: 0.1 }),
  join: (c, t) => {
    tone(c, 520, t, 0.08, { type: 'triangle', gain: 0.12 });
    tone(c, 780, t + 0.07, 0.1, { type: 'triangle', gain: 0.12 });
  },
  introBeep: (c, t) => tone(c, 520, t, 0.12, { type: 'square', gain: 0.07 }),
  go: (c, t) => {
    tone(c, 880, t, 0.25, { type: 'square', gain: 0.09 });
    tone(c, 1320, t + 0.05, 0.3, { type: 'triangle', gain: 0.08 });
  },
  tick: (c, t) => tone(c, 1000, t, 0.03, { type: 'square', gain: 0.05 }),
  tickFast: (c, t) => {
    tone(c, 520, t, 0.04, { type: 'square', gain: 0.08 });
    tone(c, 520, t + 0.1, 0.04, { type: 'square', gain: 0.08 });
  },
  timeUp: (c, t) => tone(c, 300, t, 0.2, { type: 'square', gain: 0.08, slideTo: 180 }),
  marker: (c, t) => tone(c, 1400, t, 0.03, { type: 'square', gain: 0.06 }),
  lock: (c, t) => {
    tone(c, 523, t, 0.08, { type: 'triangle', gain: 0.14 });
    tone(c, 784, t + 0.08, 0.16, { type: 'triangle', gain: 0.14 });
  },
  impact: (c, t) => {
    tone(c, 110, t, 0.35, { type: 'sine', gain: 0.22, slideTo: 50 });
    noise(c, t, 0.15, 0.08, 200, 800);
  },
  whoosh: (c, t) => noise(c, t, 0.5, 0.1, 400, 4000),
  points: (c, t) => tone(c, 1100 + Math.random() * 500, t, 0.04, { type: 'square', gain: 0.04 }),
  perfect: (c, t) => [880, 1109, 1319, 1760].forEach((f, i) => tone(c, f, t + i * 0.07, 0.25, { type: 'triangle', gain: 0.1 })),
  victory: (c, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.3, { type: 'triangle', gain: 0.13 }));
    tone(c, 1047, t + 0.5, 0.7, { type: 'triangle', gain: 0.1 });
    tone(c, 1319, t + 0.5, 0.7, { type: 'triangle', gain: 0.06 });
  },
  defeat: (c, t) => {
    tone(c, 392, t, 0.4, { type: 'triangle', gain: 0.1 });
    tone(c, 311, t + 0.25, 0.6, { type: 'triangle', gain: 0.1 });
  },
  error: (c, t) => tone(c, 200, t, 0.18, { type: 'sawtooth', gain: 0.07, slideTo: 120 }),
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const c = getContext();
  if (!c || !unlocked) return;
  if (c.state === 'suspended') void c.resume();
  try {
    SOUNDS[name](c, c.currentTime + 0.001);
  } catch {
    /* best effort */
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  storage.setSoundEnabled(value);
  if (value) unlockAudio();
  listeners.forEach((l) => l(value));
}

export function onSoundChange(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
