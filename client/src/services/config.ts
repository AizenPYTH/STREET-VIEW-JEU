import type { PublicConfig } from '@cityguess/shared';

export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/$/, '');

let cached: Promise<PublicConfig> | null = null;

/** Public runtime configuration published by the game server (provider, browser key). */
export function loadPublicConfig(): Promise<PublicConfig> {
  if (!cached) {
    cached = fetch(`${SERVER_URL}/api/config`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server replied ${res.status} while loading configuration`);
        return (await res.json()) as PublicConfig;
      })
      .catch((error: unknown) => {
        cached = null;
        throw error instanceof Error ? error : new Error('Could not reach the game server');
      });
  }
  return cached;
}
