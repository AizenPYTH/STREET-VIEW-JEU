import {
  distanceBetween,
  randomPointInRadius,
  zonesForDifficulty,
  type City,
  type CityZone,
  type Difficulty,
  type LatLng,
  type StreetViewProviderId,
} from '@cityguess/shared';
import type { PanoResolver } from '../streetview/types.js';
import { GameError } from './errors.js';

export interface ResolvedLocation {
  panoId: string;
  location: LatLng;
  provider: StreetViewProviderId;
  zoneName: string;
}

export interface PickLocationsOptions {
  city: City;
  difficulty: Difficulty;
  count: number;
  resolver: PanoResolver;
  rng?: () => number;
  /** Locations to stay away from (e.g. the previous game in the same room). */
  exclude?: readonly LatLng[];
}

/** Search radius handed to the Street View provider around each sampled point. */
const SNAP_RADIUS_M = 150;
/** Two rounds of the same game are never closer than this. */
const MIN_SEPARATION_M = 300;
/** Recently played locations are avoided within this distance. */
const EXCLUDE_RADIUS_M = 400;
const MAX_ATTEMPTS_PER_ROUND = 12;

export type LocationPicker = (city: City, difficulty: Difficulty, count: number, exclude: readonly LatLng[]) => Promise<ResolvedLocation[]>;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Picks `count` distinct, real panoramas for a game.
 * Rounds are spread across the zones matching the difficulty; each candidate is validated
 * against the city radius, previously chosen points and excluded (recently played) points.
 */
export async function pickLocations(options: PickLocationsOptions): Promise<ResolvedLocation[]> {
  const { city, difficulty } = options;
  try {
    return await pickFromZones(options, zonesForDifficulty(city, difficulty));
  } catch (error) {
    // Street View coverage can be thin in the zones of one difficulty: fall back to the whole city
    // rather than blocking the game (phase 2 §41). Exclusions are relaxed too, they are only a nicety.
    const allZones = city.zones;
    if (allZones.length === zonesForDifficulty(city, difficulty).length && !options.exclude?.length) throw error;
    return pickFromZones({ ...options, exclude: [] }, allZones);
  }
}

async function pickFromZones(options: PickLocationsOptions, candidateZones: readonly CityZone[]): Promise<ResolvedLocation[]> {
  const { city, count, resolver } = options;
  const rng = options.rng ?? Math.random;
  const exclude = options.exclude ?? [];
  const zones = shuffle(candidateZones, rng);
  if (zones.length === 0) throw new GameError('LOCATIONS_UNAVAILABLE', `${city.name} has no zones configured`);

  const isAcceptable = (candidate: LatLng, accepted: readonly ResolvedLocation[]): boolean => {
    if (distanceBetween(city.center, candidate) > city.maxRadiusMeters) return false;
    if (accepted.some((a) => distanceBetween(a.location, candidate) < MIN_SEPARATION_M)) return false;
    if (exclude.some((e) => distanceBetween(e, candidate) < EXCLUDE_RADIUS_M)) return false;
    return true;
  };

  const tryResolve = async (
    zoneOffset: number,
    accepted: readonly ResolvedLocation[],
  ): Promise<ResolvedLocation | null> => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ROUND; attempt++) {
      const zone = zones[(zoneOffset + attempt) % zones.length] as CityZone;
      const point = randomPointInRadius(zone.center, zone.radiusMeters, rng);
      const pano = await resolver.resolve(point, SNAP_RADIUS_M);
      if (!pano) continue;
      if (!isAcceptable(pano.location, accepted)) continue;
      if (accepted.some((a) => a.panoId === pano.panoId)) continue;
      return { panoId: pano.panoId, location: pano.location, provider: resolver.id, zoneName: zone.name };
    }
    return null;
  };

  // Phase 1: resolve every round in parallel, each starting from a different zone.
  const candidates = await Promise.all(Array.from({ length: count }, (_, i) => tryResolve(i, [])));

  // Phase 2: sequentially validate against each other and fill the gaps.
  const accepted: ResolvedLocation[] = [];
  for (let i = 0; i < count; i++) {
    const candidate = candidates[i] ?? null;
    if (candidate && isAcceptable(candidate.location, accepted) && !accepted.some((a) => a.panoId === candidate.panoId)) {
      accepted.push(candidate);
      continue;
    }
    const replacement = await tryResolve(i, accepted);
    if (!replacement) {
      throw new GameError(
        'LOCATIONS_UNAVAILABLE',
        `Impossible de trouver assez de lieux Street View à ${city.name}. Essaie une autre ville ou difficulté.`,
      );
    }
    accepted.push(replacement);
  }
  return accepted;
}

export function createLocationPicker(resolver: PanoResolver, rng?: () => number): LocationPicker {
  return (city, difficulty, count, exclude) =>
    pickLocations(rng ? { city, difficulty, count, resolver, exclude, rng } : { city, difficulty, count, resolver, exclude });
}
