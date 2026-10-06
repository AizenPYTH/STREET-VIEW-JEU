import type { LatLng } from './types.js';

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great‑circle distance between two coordinates in meters (haversine formula).
 * Accurate to ~0.5% which is far below what the game needs.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  assertFiniteCoordinate(lat1, lon1);
  assertFiniteCoordinate(lat2, lon2);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function distanceBetween(a: LatLng, b: LatLng): number {
  return calculateDistance(a.lat, a.lng, b.lat, b.lng);
}

export function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function assertFiniteCoordinate(lat: number, lng: number): void {
  if (!isValidLatLng({ lat, lng })) {
    throw new RangeError(`Invalid coordinate: ${lat}, ${lng}`);
  }
}

/**
 * Returns a uniformly distributed random point inside a disc.
 * `rng` must return a float in [0, 1).
 */
export function randomPointInRadius(center: LatLng, radiusMeters: number, rng: () => number): LatLng {
  // sqrt for uniform area distribution
  const distance = radiusMeters * Math.sqrt(rng());
  const bearing = rng() * 2 * Math.PI;
  return offsetLatLng(center, distance, bearing);
}

/** Moves a coordinate by `distanceMeters` towards `bearingRad` (0 = north). */
export function offsetLatLng(origin: LatLng, distanceMeters: number, bearingRad: number): LatLng {
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lng);
  const angular = distanceMeters / EARTH_RADIUS_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (((lon2 * 180) / Math.PI + 540) % 360) - 180 };
}

/** Human readable distance: "42 m", "1.4 km", "12 km". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
