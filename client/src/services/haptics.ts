type Pattern = number | number[];

const PATTERNS = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [12, 40, 18],
  warning: [30, 50, 30],
  countdown: 16,
  victory: [20, 60, 20, 60, 60],
} satisfies Record<string, Pattern>;

export type HapticKind = keyof typeof PATTERNS;

/** Subtle vibration where supported (Android/Chrome). iOS Safari ignores it silently. */
export function haptic(kind: HapticKind): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}
