import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import {
  AVATARS,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
  type AckResult,
  type ClientToServerEvents,
  type RoomEvent,
  type RoomJoined,
  type ServerToClientEvents,
} from '@cityguess/shared';
import { GameError, toErrorInfo } from '../game/errors.js';
import type { GameRoom } from '../game/GameRoom.js';
import type { RoomManager } from '../game/RoomManager.js';
import { log } from '../log.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface SocketContext {
  token: string;
  roomCode: string | null;
  playerId: string | null;
  /** Sliding window rate limiter. */
  hits: number[];
}

const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX = 40;

const settingsSchema = z
  .object({
    cityId: z.string().min(1).max(40),
    rounds: z.union([z.literal(3), z.literal(5), z.literal(10)]),
    exploreSeconds: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
    difficulty: z.enum(['easy', 'normal', 'hard', 'expert']),
    capacity: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
    doubleFinal: z.boolean(),
  })
  .partial();
const profileSchema = z.object({
  name: z.string().trim().min(MIN_NAME_LENGTH).max(MAX_NAME_LENGTH),
  avatar: z.string().refine((id) => AVATARS.some((a) => a.id === id), 'Avatar inconnu'),
});
const createSchema = profileSchema.extend({ settings: settingsSchema.optional() });
const joinSchema = profileSchema.extend({ code: z.string().min(1).max(10) });
const rejoinSchema = z.object({ code: z.string().max(10).optional().default('') });
const readySchema = z.object({ ready: z.boolean() });
const guessSchema = z.object({
  position: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
});
const rematchSchema = z.object({ newCity: z.boolean() });

export const playerRoom = (playerId: string): string => `player:${playerId}`;
export const roomChannel = (code: string): string => `room:${code}`;

/** Pushes an individual snapshot to every socket of every player in the room. */
export function broadcastState(io: GameServer, room: GameRoom): void {
  for (const player of room.players.values()) {
    io.to(playerRoom(player.id)).emit('room:state', room.snapshotFor(player.id));
  }
}

export function broadcastEvent(io: GameServer, room: GameRoom, event: RoomEvent): void {
  io.to(roomChannel(room.code)).emit('room:event', event);
}

export function broadcastClosed(io: GameServer, room: GameRoom, reason: string): void {
  io.to(roomChannel(room.code)).emit('room:closed', { reason });
  io.in(roomChannel(room.code)).socketsLeave(roomChannel(room.code));
}

export function registerHandlers(io: GameServer, manager: RoomManager): void {
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown }).token;
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) {
      next(new Error('Missing or invalid auth token'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    const ctx: SocketContext = {
      token: (socket.handshake.auth as { token: string }).token,
      roomCode: null,
      playerId: null,
      hits: [],
    };

    const guard = <T>(ack: (r: AckResult<T>) => void, fn: () => T | Promise<T>): void => {
      if (typeof ack !== 'function') return;
      const now = Date.now();
      ctx.hits = ctx.hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (ctx.hits.length >= RATE_LIMIT_MAX) {
        ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Doucement…' } });
        return;
      }
      ctx.hits.push(now);
      Promise.resolve()
        .then(fn)
        .then((data) => ack({ ok: true, data }))
        .catch((error: unknown) => {
          if (!(error instanceof GameError)) log.error('handler error', { message: (error as Error).message, stack: (error as Error).stack });
          ack({ ok: false, error: toErrorInfo(error) });
        });
    };

    const attach = (room: GameRoom, playerId: string): RoomJoined => {
      ctx.roomCode = room.code;
      ctx.playerId = playerId;
      void socket.join([roomChannel(room.code), playerRoom(playerId)]);
      manager.bindToken(ctx.token, room.code);
      socket.emit('room:state', room.snapshotFor(playerId));
      return { code: room.code, playerId };
    };

    const currentRoom = (): { room: GameRoom; playerId: string } => {
      if (!ctx.roomCode || !ctx.playerId) throw new GameError('NOT_IN_ROOM', 'Rejoins d’abord une room');
      const room = manager.getRoom(ctx.roomCode);
      if (!room) throw new GameError('ROOM_NOT_FOUND', 'Cette room est fermée');
      return { room, playerId: ctx.playerId };
    };

    const detach = (): void => {
      if (ctx.roomCode) void socket.leave(roomChannel(ctx.roomCode));
      if (ctx.playerId) void socket.leave(playerRoom(ctx.playerId));
      ctx.roomCode = null;
      ctx.playerId = null;
    };

    socket.on('room:create', (payload, ack) =>
      guard(ack, () => {
        const parsed = parse(createSchema, payload);
        detach();
        const room = manager.createRoom();
        const player = room.addPlayer(ctx.token, parsed.name, parsed.avatar);
        if (parsed.settings) room.updateSettings(player.id, parsed.settings);
        return attach(room, player.id);
      }),
    );

    socket.on('room:join', (payload, ack) =>
      guard(ack, () => {
        const parsed = parse(joinSchema, payload);
        const code = normalizeRoomCode(parsed.code);
        if (!isValidRoomCode(code)) throw new GameError('INVALID_INPUT', 'Les codes font 5 caractères');
        const room = manager.requireRoom(code);
        detach();
        const player = room.addPlayer(ctx.token, parsed.name, parsed.avatar);
        return attach(room, player.id);
      }),
    );

    socket.on('room:rejoin', (payload, ack) =>
      guard(ack, () => {
        const parsed = parse(rejoinSchema, payload ?? {});
        const code = normalizeRoomCode(parsed.code);
        const room = code ? manager.getRoom(code) : manager.roomForToken(ctx.token);
        if (!room) throw new GameError('ROOM_NOT_FOUND', 'Cette room n’est plus ouverte');
        const player = room.rejoin(ctx.token);
        detach();
        return attach(room, player.id);
      }),
    );

    socket.on('room:leave', (ack) =>
      guard(ack, () => {
        const { room, playerId } = currentRoom();
        detach();
        manager.unbindToken(ctx.token);
        room.leave(playerId);
        return undefined;
      }),
    );

    socket.on('room:updateSettings', (payload, ack) =>
      guard(ack, () => {
        const { room, playerId } = currentRoom();
        room.updateSettings(playerId, parse(settingsSchema, payload));
        return undefined;
      }),
    );

    socket.on('room:setReady', (payload, ack) =>
      guard(ack, () => {
        const { room, playerId } = currentRoom();
        room.setReady(playerId, parse(readySchema, payload).ready);
        return undefined;
      }),
    );

    socket.on('game:panoReady', (ack) =>
      guard(ack, () => {
        const { room, playerId } = currentRoom();
        room.panoReady(playerId);
        return undefined;
      }),
    );

    socket.on('game:start', (ack) =>
      guard(ack, async () => {
        const { room, playerId } = currentRoom();
        await room.startGame(playerId);
        return undefined;
      }),
    );

    socket.on('game:submitGuess', (payload, ack) =>
      guard(ack, () => {
        const { room, playerId } = currentRoom();
        const parsed = parse(guessSchema, payload);
        room.submitGuess(playerId, parsed.position);
        return undefined;
      }),
    );

    socket.on('game:nextRound', (ack) =>
      guard(ack, () => {
        const { room, playerId } = currentRoom();
        room.nextRound(playerId);
        return undefined;
      }),
    );

    socket.on('game:rematch', (payload, ack) =>
      guard(ack, async () => {
        const { room, playerId } = currentRoom();
        await room.rematch(playerId, parse(rematchSchema, payload).newCity);
        return undefined;
      }),
    );

    socket.on('time:ping', (_clientSentAt, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('disconnect', () => {
      if (!ctx.roomCode || !ctx.playerId) return;
      const room = manager.getRoom(ctx.roomCode);
      if (!room) return;
      const playerId = ctx.playerId;
      // Another tab/socket of the same player may still be connected.
      const stillConnected = io.sockets.adapter.rooms.get(playerRoom(playerId))?.size ?? 0;
      if (stillConnected === 0) room.markDisconnected(playerId);
    });
  });
}

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new GameError('INVALID_INPUT', issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input');
  }
  return result.data;
}
