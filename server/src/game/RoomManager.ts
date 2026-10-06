import { ROOM_IDLE_TTL_MS, ROOM_MAX_AGE_MS, generateRoomCode, type RoomEvent } from '@cityguess/shared';
import type { Clock } from './clock.js';
import { GameError } from './errors.js';
import { GameRoom, type RoomHooks } from './GameRoom.js';
import type { LocationPicker } from './locations.js';
import { log } from '../log.js';

export interface RoomManagerDeps {
  clock: Clock;
  pickLocations: LocationPicker;
  onStateChanged: (room: GameRoom) => void;
  onEvent: (room: GameRoom, event: RoomEvent) => void;
  onRoomClosed: (room: GameRoom, reason: string) => void;
  hooks?: Partial<RoomHooks> & { roomClosed?: (room: GameRoom) => void };
  rng?: () => number;
}

/** Owns every live room and the token → room index used for reconnection. */
export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly roomByToken = new Map<string, string>();

  constructor(private readonly deps: RoomManagerDeps) {}

  get size(): number {
    return this.rooms.size;
  }

  createRoom(): GameRoom {
    let code = generateRoomCode(this.deps.rng);
    let guard = 0;
    while (this.rooms.has(code)) {
      code = generateRoomCode(this.deps.rng);
      if (++guard > 1000) throw new GameError('INTERNAL', 'Could not allocate a room code');
    }
    const room = new GameRoom(code, {
      clock: this.deps.clock,
      pickLocations: this.deps.pickLocations,
      onStateChanged: this.deps.onStateChanged,
      onEvent: this.deps.onEvent,
      onEmpty: (r) => this.closeRoom(r, 'Everyone left the room'),
      ...(this.deps.hooks ? { hooks: this.deps.hooks } : {}),
      ...(this.deps.rng ? { rng: this.deps.rng } : {}),
    });
    this.rooms.set(code, room);
    log.info('room created', { code });
    return room;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  requireRoom(code: string): GameRoom {
    const room = this.rooms.get(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND', `Room ${code} does not exist (or has expired)`);
    return room;
  }

  /** Remembers which room a device belongs to so it can reconnect without typing the code. */
  bindToken(token: string, code: string): void {
    this.roomByToken.set(token, code);
  }

  unbindToken(token: string): void {
    this.roomByToken.delete(token);
  }

  roomForToken(token: string): GameRoom | undefined {
    const code = this.roomByToken.get(token);
    return code ? this.rooms.get(code) : undefined;
  }

  closeRoom(room: GameRoom, reason: string): void {
    if (!this.rooms.has(room.code)) return;
    room.dispose();
    this.rooms.delete(room.code);
    for (const [token, code] of this.roomByToken) if (code === room.code) this.roomByToken.delete(token);
    this.deps.hooks?.roomClosed?.(room);
    this.deps.onRoomClosed(room, reason);
    log.info('room closed', { code: room.code, reason });
  }

  /** Removes rooms nobody uses anymore. Call periodically. */
  sweep(): number {
    const now = this.deps.clock.now();
    let closed = 0;
    for (const room of [...this.rooms.values()]) {
      if (now - room.createdAt > ROOM_MAX_AGE_MS) {
        this.closeRoom(room, 'Room expired');
        closed++;
      } else if (room.isIdle(ROOM_IDLE_TTL_MS)) {
        this.closeRoom(room, 'Room closed after inactivity');
        closed++;
      }
    }
    return closed;
  }

  disposeAll(): void {
    for (const room of [...this.rooms.values()]) this.closeRoom(room, 'Server shutting down');
  }
}
