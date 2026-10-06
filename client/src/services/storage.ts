/** Thin, safe wrapper around localStorage (private mode / quota errors never crash the game). */

const KEYS = {
  token: 'cg.token',
  profile: 'cg.profile',
  lastRoom: 'cg.lastRoom',
  sound: 'cg.sound',
  haptics: 'cg.haptics',
  onboarding: 'cg.onboarding',
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface StoredProfile {
  name: string;
  avatar: string;
}

export const storage = {
  /** Stable per‑device secret used to reclaim the player after a reload or reconnection. */
  getToken(): string {
    let token = read(KEYS.token);
    if (!token || token.length < 16) {
      token = randomToken();
      write(KEYS.token, token);
    }
    return token;
  },
  getProfile(): StoredProfile | null {
    const raw = read(KEYS.profile);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredProfile>;
      if (typeof parsed.name === 'string' && typeof parsed.avatar === 'string') return { name: parsed.name, avatar: parsed.avatar };
    } catch {
      /* ignore */
    }
    return null;
  },
  setProfile(profile: StoredProfile): void {
    write(KEYS.profile, JSON.stringify(profile));
  },
  getLastRoom(): string | null {
    return read(KEYS.lastRoom);
  },
  setLastRoom(code: string | null): void {
    write(KEYS.lastRoom, code);
  },
  isSoundEnabled(): boolean {
    return read(KEYS.sound) !== 'off';
  },
  setSoundEnabled(enabled: boolean): void {
    write(KEYS.sound, enabled ? 'on' : 'off');
  },
  hasSeenOnboarding(): boolean {
    return read(KEYS.onboarding) === 'done';
  },
  setSeenOnboarding(): void {
    write(KEYS.onboarding, 'done');
  },
  isHapticsEnabled(): boolean {
    return read(KEYS.haptics) !== 'off';
  },
  setHapticsEnabled(enabled: boolean): void {
    write(KEYS.haptics, enabled ? 'on' : 'off');
  },
};
