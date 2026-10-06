import type { LatLng, StreetViewProviderId } from '@cityguess/shared';

export interface ResolvedPano {
  panoId: string;
  location: LatLng;
}

/**
 * Snaps an arbitrary point to the nearest real street‑level panorama.
 * Returns null when nothing exists within `radiusMeters`.
 */
export interface PanoResolver {
  readonly id: StreetViewProviderId;
  resolve(point: LatLng, radiusMeters: number): Promise<ResolvedPano | null>;
}
