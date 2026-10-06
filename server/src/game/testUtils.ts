import { TIMINGS, offsetLatLng, resultsDurationMs, revealDurationMs, type City, type Difficulty, type LatLng, type RoomEvent } from '@cityguess/shared';
import { FakeClock } from './clock.js';
import { GameRoom, type PlayerState } from './GameRoom.js';
import type { LocationPicker, ResolvedLocation } from './locations.js';

export interface Harness {
  clock: FakeClock;
  room: GameRoom;
  events: RoomEvent[];
  changes: number;
  emptied: boolean;
  pickerCalls: { city: City; difficulty: Difficulty; count: number; exclude: readonly LatLng[] }[];
  /** Real locations the picker produced for the last game (test‑only knowledge). */
  locations: ResolvedLocation[];
}

export function deterministicPicker(h: Pick<Harness, 'pickerCalls' | 'locations'>, failWith?: Error): LocationPicker {
  return async (city, difficulty, count, exclude) => {
    h.pickerCalls.push({ city, difficulty, count, exclude });
    if (failWith) throw failWith;
    const locations = Array.from({ length: count }, (_, i) => ({
      panoId: `pano-${city.id}-${i}-${h.pickerCalls.length}`,
      location: offsetLatLng(city.center, 600 * (i + 1), (i * Math.PI) / 3),
      provider: 'mock' as const,
      zoneName: `zone-${i}`,
    }));
    h.locations = locations;
    return locations;
  };
}

export function createHarness(options: { code?: string; failWith?: Error } = {}): Harness {
  const clock = new FakeClock();
  const h = {
    clock,
    events: [] as RoomEvent[],
    changes: 0,
    emptied: false,
    pickerCalls: [],
    locations: [],
  } as unknown as Harness;
  h.room = new GameRoom(options.code ?? 'ABCDE', {
    clock,
    pickLocations: deterministicPicker(h, options.failWith),
    onStateChanged: () => {
      h.changes++;
    },
    onEvent: (_room, event) => {
      h.events.push(event);
    },
    onEmpty: () => {
      h.emptied = true;
    },
  });
  return h;
}

/** Adds players (all marked ready, as the client does once street view is loadable). */
export function addPlayers(h: Harness, names: string[], ready = true): PlayerState[] {
  return names.map((name) => {
    const player = h.room.addPlayer(`token-${name}-${'x'.repeat(16)}`, name, 'diamond');
    if (ready) h.room.setReady(player.id, true);
    return player;
  });
}

/** Starts the game and advances through the logo beat and the round intro into exploration. */
export async function startAndEnterRound(h: Harness, hostId: string): Promise<void> {
  await h.room.startGame(hostId);
  h.clock.advance(TIMINGS.startingLogoMs);
  enterExploration(h);
}

/** Every active player reports their street view, then the intro ends: the exploration timer starts. */
export function enterExploration(h: Harness): void {
  for (const p of h.room.activePlayers()) if (p.connected) h.room.panoReady(p.id);
  h.clock.advance(TIMINGS.intro.totalMs);
}

/** Advances through reveal + results into the next phase. */
export function skipRevealAndResults(h: Harness): void {
  const n = h.room.currentRound?.guesses.size ?? h.room.activePlayers().length;
  h.clock.advance(TIMINGS.revealAlignMs + revealDurationMs(n) + resultsDurationMs(n));
}

export function eventTypes(h: Harness): string[] {
  return h.events.map((e) => e.type);
}
