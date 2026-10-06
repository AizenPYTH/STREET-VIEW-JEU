import { describe, expect, it } from 'vitest';
import { distanceBetween, requireCity, type LatLng } from '@cityguess/shared';
import { pickLocations } from './locations.js';
import { MockStreetViewResolver } from '../streetview/mock.js';
import { GoogleStreetViewResolver } from '../streetview/google.js';
import type { PanoResolver } from '../streetview/types.js';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('pickLocations', () => {
  it('returns distinct locations inside the city, spread over zones', async () => {
    const city = requireCity('paris');
    const locations = await pickLocations({ city, difficulty: 'normal', count: 10, resolver: new MockStreetViewResolver(), rng: seeded(7) });
    expect(locations).toHaveLength(10);
    const ids = new Set(locations.map((l) => l.panoId));
    expect(ids.size).toBe(10);
    for (let i = 0; i < locations.length; i++) {
      expect(distanceBetween(city.center, locations[i]!.location)).toBeLessThan(city.maxRadiusMeters);
      for (let j = i + 1; j < locations.length; j++) {
        expect(distanceBetween(locations[i]!.location, locations[j]!.location)).toBeGreaterThanOrEqual(300);
      }
    }
    expect(new Set(locations.map((l) => l.zoneName)).size).toBeGreaterThan(3);
  });

  it('uses zones matching the difficulty', async () => {
    const city = requireCity('marseille');
    const expertZones = new Set(city.zones.filter((z) => z.difficulty === 'expert').map((z) => z.name));
    const locations = await pickLocations({ city, difficulty: 'expert', count: 5, resolver: new MockStreetViewResolver(), rng: seeded(3) });
    for (const l of locations) expect(expertZones.has(l.zoneName)).toBe(true);
  });

  it('avoids excluded (recently played) locations', async () => {
    const city = requireCity('nice');
    const resolver = new MockStreetViewResolver();
    const first = await pickLocations({ city, difficulty: 'easy', count: 3, resolver, rng: seeded(11) });
    const exclude: LatLng[] = first.map((l) => l.location);
    const second = await pickLocations({ city, difficulty: 'easy', count: 3, resolver, rng: seeded(11), exclude });
    for (const l of second) for (const e of exclude) expect(distanceBetween(l.location, e)).toBeGreaterThanOrEqual(400);
  });

  it('skips points without coverage and fails cleanly when nothing resolves', async () => {
    let calls = 0;
    const flaky: PanoResolver = {
      id: 'mock',
      resolve: async (point) => {
        calls++;
        return calls % 3 === 0 ? { panoId: `p${calls}`, location: point } : null;
      },
    };
    const city = requireCity('lyon');
    const ok = await pickLocations({ city, difficulty: 'normal', count: 5, resolver: flaky, rng: seeded(1) });
    expect(ok).toHaveLength(5);

    const dead: PanoResolver = { id: 'mock', resolve: async () => null };
    await expect(pickLocations({ city, difficulty: 'normal', count: 5, resolver: dead })).rejects.toThrow(/Impossible de trouver assez/);
  });

  it('rejects panoramas outside the city radius', async () => {
    const far: PanoResolver = { id: 'mock', resolve: async () => ({ panoId: 'far', location: { lat: 0, lng: 0 } }) };
    await expect(pickLocations({ city: requireCity('rome'), difficulty: 'easy', count: 1, resolver: far })).rejects.toThrow();
  });
});

describe('GoogleStreetViewResolver', () => {
  const fakeFetch = (body: unknown, status = 200): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  it('parses a successful metadata response', async () => {
    const resolver = new GoogleStreetViewResolver('key', fakeFetch({ status: 'OK', pano_id: 'abc', location: { lat: 1.5, lng: 2.5 } }));
    expect(await resolver.resolve({ lat: 1, lng: 2 }, 100)).toEqual({ panoId: 'abc', location: { lat: 1.5, lng: 2.5 } });
  });

  it('returns null when there is no coverage', async () => {
    const resolver = new GoogleStreetViewResolver('key', fakeFetch({ status: 'ZERO_RESULTS' }));
    expect(await resolver.resolve({ lat: 1, lng: 2 }, 100)).toBeNull();
  });

  it('surfaces API errors with the message', async () => {
    const resolver = new GoogleStreetViewResolver('key', fakeFetch({ status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' }));
    await expect(resolver.resolve({ lat: 1, lng: 2 }, 100)).rejects.toThrow(/REQUEST_DENIED.*invalid/);
    const http = new GoogleStreetViewResolver('key', fakeFetch({}, 500));
    await expect(http.resolve({ lat: 1, lng: 2 }, 100)).rejects.toThrow(/HTTP 500/);
  });

  it('sends the expected query', async () => {
    let seen = '';
    const spy: typeof fetch = (async (input: string | URL | Request) => {
      seen = String(input);
      return new Response(JSON.stringify({ status: 'ZERO_RESULTS' }));
    }) as typeof fetch;
    await new GoogleStreetViewResolver('KEY123', spy).resolve({ lat: 43.2965, lng: 5.3698 }, 150);
    expect(seen).toContain('location=43.296500%2C5.369800');
    expect(seen).toContain('radius=150');
    expect(seen).toContain('source=outdoor');
    expect(seen).toContain('key=KEY123');
  });
});
