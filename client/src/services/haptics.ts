import { storage } from './storage';

type Pattern = number | number[];

const PATTERNS = {
  light: 10,
  medium: 22,
  heavy: 45,
  selection: 6,
  success: [12, 40, 18],
  error: [30, 50, 30],
  overtake: [10, 30, 10, 30, 20],
  winner: [20, 60, 20, 60, 60],
} satisfies Record<string, Pattern>;

export type HapticKind = keyof typeof PATTERNS;

let enabled = storage.isHapticsEnabled();

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  storage.setHapticsEnabled(value);
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

/** Subtle vibration where supported (Android/Chrome). iOS Safari ignores it silently. */
export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}
