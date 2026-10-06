import type { LatLng } from '@cityguess/shared';
import type { PanoResolver, ResolvedPano } from './types.js';

interface MetadataResponse {
  status: string;
  pano_id?: string;
  location?: { lat: number; lng: number };
  error_message?: string;
}

/**
 * Uses the Street View Static API *metadata* endpoint, which is free of charge,
 * to find the closest outdoor panorama around a point.
 * https://developers.google.com/maps/documentation/streetview/metadata
 */
export class GoogleStreetViewResolver implements PanoResolver {
  readonly id = 'google' as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 6000,
  ) {}

  async resolve(point: LatLng, radiusMeters: number): Promise<ResolvedPano | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
    url.searchParams.set('location', `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`);
    url.searchParams.set('radius', String(Math.round(radiusMeters)));
    url.searchParams.set('source', 'outdoor');
    url.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Street View metadata request failed with HTTP ${response.status}`);
      }
      const body = (await response.json()) as MetadataResponse;
      if (body.status === 'ZERO_RESULTS' || body.status === 'NOT_FOUND') return null;
      if (body.status !== 'OK' || !body.pano_id || !body.location) {
        throw new Error(`Street View metadata error: ${body.status}${body.error_message ? ` — ${body.error_message}` : ''}`);
      }
      return { panoId: body.pano_id, location: { lat: body.location.lat, lng: body.location.lng } };
    } finally {
      clearTimeout(timer);
    }
  }
}
