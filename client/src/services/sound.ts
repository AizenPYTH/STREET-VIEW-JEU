import { storage } from './storage';

/**
 * Tiny synthesiser for UI sounds. Everything is generated with the Web Audio API,
 * so there are no assets to download and playback is instant.
 */
export type SoundName =
  | 'click'
  | 'join'
  | 'ready'
  | 'countdown'
  | 'go'
  | 'tick'
  | 'warning'
  | 'confirm'
  | 'reveal'
  | 'score'
  | 'victory'
  | 'error';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let enabled = storage.isSoundEnabled();
let unlocked = false;
const listeners = new Set<(enabled: boolean) => void>();

function getContext(): Ctx | null {
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
  c: Ctx,
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
  const peak = options.gain ?? 0.18;
  const attack = options.attack ?? 0.005;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function noise(c: Ctx, startAt: number, duration: number, gainValue = 0.12): void {
  const length = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, startAt);
  filter.frequency.exponentialRampToValueAtTime(3200, startAt + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(gainValue, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(filter).connect(gain).connect(c.destination);
  source.start(startAt);
}

const SOUNDS: Record<SoundName, (c: Ctx, t: number) => void> = {
  click: (c, t) => tone(c, 620, t, 0.06, { type: 'triangle', gain: 0.12 }),
  join: (c, t) => {
    tone(c, 520, t, 0.08, { type: 'triangle', gain: 0.12 });
    tone(c, 780, t + 0.07, 0.1, { type: 'triangle', gain: 0.12 });
  },
  ready: (c, t) => tone(c, 880, t, 0.1, { type: 'triangle', gain: 0.1 }),
  countdown: (c, t) => tone(c, 440, t, 0.14, { type: 'square', gain: 0.08 }),
  go: (c, t) => {
    tone(c, 880, t, 0.25, { type: 'square', gain: 0.1 });
    tone(c, 1320, t + 0.05, 0.3, { type: 'triangle', gain: 0.08 });
  },
  tick: (c, t) => tone(c, 1000, t, 0.03, { type: 'square', gain: 0.05 }),
  warning: (c, t) => {
    tone(c, 380, t, 0.08, { type: 'square', gain: 0.1 });
    tone(c, 380, t + 0.11, 0.08, { type: 'square', gain: 0.1 });
  },
  confirm: (c, t) => {
    tone(c, 523, t, 0.08, { type: 'triangle', gain: 0.14 });
    tone(c, 784, t + 0.08, 0.16, { type: 'triangle', gain: 0.14 });
  },
  reveal: (c, t) => {
    noise(c, t, 0.5, 0.1);
    tone(c, 220, t + 0.1, 0.5, { type: 'sine', slideTo: 660, gain: 0.1 });
  },
  score: (c, t) => tone(c, 1200 + Math.random() * 400, t, 0.04, { type: 'square', gain: 0.04 }),
  victory: (c, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.3, { type: 'triangle', gain: 0.14 }));
    tone(c, 1047, t + 0.5, 0.6, { type: 'triangle', gain: 0.1 });
  },
  error: (c, t) => tone(c, 200, t, 0.18, { type: 'sawtooth', gain: 0.08, slideTo: 120 }),
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const c = getContext();
  if (!c || !unlocked) return;
  if (c.state === 'suspended') void c.resume();
  try {
    SOUNDS[name](c, c.currentTime + 0.001);
  } catch {
    /* audio is best effort */
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
