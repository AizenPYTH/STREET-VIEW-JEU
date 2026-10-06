import { createHash } from 'node:crypto';
import type { LatLng } from '@cityguess/shared';
import type { PanoResolver, ResolvedPano } from './types.js';

/**
 * Deterministic resolver used by automated tests and local development without API keys.
 * It "snaps" the requested point to a 20 m grid and derives an opaque panorama id from it,
 * so the id never leaks the coordinates to the client.
 */
export class MockStreetViewResolver implements PanoResolver {
  readonly id = 'mock' as const;

  constructor(private readonly salt = 'cityguess-mock') {}

  async resolve(point: LatLng): Promise<ResolvedPano | null> {
    const grid = 0.0002; // ≈ 20 m
    const lat = Math.round(point.lat / grid) * grid;
    const lng = Math.round(point.lng / grid) * grid;
    const panoId =
      'mock-' + createHash('sha256').update(`${this.salt}:${lat.toFixed(5)}:${lng.toFixed(5)}`).digest('hex').slice(0, 22);
    return { panoId, location: { lat, lng } };
  }
}
