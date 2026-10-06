import { describe, expect, it } from 'vitest';
import { CITIES, zonesForDifficulty } from './cities.js';
import { DIFFICULTIES } from './types.js';
import { distanceBetween } from './geo.js';

describe('cities config', () => {
  it('has unique ids and at least 11 cities', () => {
    const ids = CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CITIES.length).toBeGreaterThanOrEqual(11);
  });

  it('every city has zones for every difficulty within the city radius', () => {
    for (const city of CITIES) {
      for (const difficulty of DIFFICULTIES) {
        const zones = zonesForDifficulty(city, difficulty);
        expect(zones.length, `${city.id}/${difficulty}`).toBeGreaterThan(0);
      }
      for (const zone of city.zones) {
        const d = distanceBetween(city.center, zone.center);
        expect(d + zone.radiusMeters, `${city.id}/${zone.name}`).toBeLessThan(city.maxRadiusMeters);
        const [s, w, n, e] = city.bounds;
        expect(zone.center.lat).toBeGreaterThan(s);
        expect(zone.center.lat).toBeLessThan(n);
        expect(zone.center.lng).toBeGreaterThan(w);
        expect(zone.center.lng).toBeLessThan(e);
      }
    }
  });
});
