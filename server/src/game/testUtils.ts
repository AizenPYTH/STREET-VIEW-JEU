import { offsetLatLng, type City, type Difficulty, type LatLng, type RoomEvent } from '@cityguess/shared';
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

export function addPlayers(h: Harness, names: string[]): PlayerState[] {
  return names.map((name, i) => h.room.addPlayer(`token-${name}-${'x'.repeat(16)}`, name, i % 2 === 0 ? 'fox' : 'panda'));
}

/** Starts the game and advances through the starting countdown into round 1. */
export async function startAndEnterRound(h: Harness, hostId: string): Promise<void> {
  await h.room.startGame(hostId);
  h.clock.advance(3000);
}

export function eventTypes(h: Harness): string[] {
  return h.events.map((e) => e.type);
}
