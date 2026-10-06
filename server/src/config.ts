import type { StreetViewProviderId } from '@cityguess/shared';

export interface ServerConfig {
  port: number;
  isProduction: boolean;
  corsOrigins: string[];
  streetViewProvider: StreetViewProviderId;
  googleServerKey: string | null;
  googleBrowserKey: string | null;
  databaseUrl: string | null;
  databaseSsl: boolean;
  version: string;
}

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : null;
}

export function loadConfig(): ServerConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const providerRaw = env('STREET_VIEW_PROVIDER') ?? 'google';
  if (providerRaw !== 'google' && providerRaw !== 'mock') {
    throw new Error(`STREET_VIEW_PROVIDER must be "google" or "mock" (got "${providerRaw}")`);
  }
  const fallbackKey = env('GOOGLE_MAPS_API_KEY');
  const googleServerKey = env('GOOGLE_MAPS_SERVER_KEY') ?? fallbackKey;
  const googleBrowserKey = env('GOOGLE_MAPS_BROWSER_KEY') ?? fallbackKey;
  if (providerRaw === 'google' && (!googleServerKey || !googleBrowserKey)) {
    throw new Error(
      'STREET_VIEW_PROVIDER=google requires GOOGLE_MAPS_SERVER_KEY and GOOGLE_MAPS_BROWSER_KEY ' +
        '(or GOOGLE_MAPS_API_KEY for both). Use STREET_VIEW_PROVIDER=mock for local tests without keys.',
    );
  }
  const corsOrigins = (env('CORS_ORIGIN') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (isProduction && corsOrigins.length === 0 && env('VITE_SERVER_URL')) {
    throw new Error('CORS_ORIGIN must be set in production when the client is served from another origin');
  }
  return {
    port: Number(env('PORT') ?? 3000),
    isProduction,
    corsOrigins,
    streetViewProvider: providerRaw,
    googleServerKey,
    googleBrowserKey,
    databaseUrl: env('DATABASE_URL'),
    databaseSsl: env('DATABASE_SSL') === 'require' || env('DATABASE_SSL') === 'true',
    version: env('npm_package_version') ?? '0.1.0',
  };
}
