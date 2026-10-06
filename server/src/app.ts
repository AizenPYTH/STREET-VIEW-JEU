import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { isValidRoomCode, normalizeRoomCode, type PublicConfig } from '@cityguess/shared';
import type { ServerConfig } from './config.js';
import { SystemClock, type Clock } from './game/clock.js';
import { createLocationPicker } from './game/locations.js';
import { RoomManager } from './game/RoomManager.js';
import { GoogleStreetViewResolver } from './streetview/google.js';
import { MockStreetViewResolver } from './streetview/mock.js';
import type { PanoResolver } from './streetview/types.js';
import { PostgresPersistence } from './persistence/postgres.js';
import type { Persistence } from './persistence/types.js';
import { broadcastClosed, broadcastEvent, broadcastState, registerHandlers, type GameServer } from './socket/registerHandlers.js';
import { log } from './log.js';

export interface GameApp {
  httpServer: HttpServer;
  io: GameServer;
  manager: RoomManager;
  persistence: Persistence | null;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export interface CreateAppOptions {
  config: ServerConfig;
  clock?: Clock;
  resolver?: PanoResolver;
  clientDistDir?: string;
}

export async function createApp(options: CreateAppOptions): Promise<GameApp> {
  const { config } = options;
  const clock = options.clock ?? new SystemClock();
  const resolver =
    options.resolver ??
    (config.streetViewProvider === 'google'
      ? new GoogleStreetViewResolver(config.googleServerKey as string)
      : new MockStreetViewResolver());

  let persistence: PostgresPersistence | null = null;
  if (config.databaseUrl) {
    persistence = new PostgresPersistence(config.databaseUrl, config.databaseSsl);
    await persistence.init();
    log.info('persistence enabled (postgres)');
  } else {
    log.info('persistence disabled (no DATABASE_URL) — rooms live in memory only');
  }

  const app = express();
  app.disable('x-powered-by');
  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer, {
    cors: config.corsOrigins.length > 0 ? { origin: config.corsOrigins } : { origin: true },
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 16 * 1024,
  });

  const manager = new RoomManager({
    clock,
    pickLocations: createLocationPicker(resolver),
    onStateChanged: (room) => broadcastState(io, room),
    onEvent: (room, event) => broadcastEvent(io, room, event),
    onRoomClosed: (room, reason) => broadcastClosed(io, room, reason),
    ...(persistence ? { hooks: persistence } : {}),
  });
  registerHandlers(io, manager);

  const publicConfig: PublicConfig = {
    streetViewProvider: resolver.id,
    googleMapsBrowserKey: resolver.id === 'google' ? config.googleBrowserKey : null,
    version: config.version,
  };
  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(publicConfig);
  });
  app.get('/api/rooms/:code', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = normalizeRoomCode(String(req.params.code ?? ''));
    const room = isValidRoomCode(code) ? manager.getRoom(code) : undefined;
    if (!room) {
      res.status(404).json({ error: 'ROOM_NOT_FOUND' });
      return;
    }
    const active = room.activePlayers();
    const inLobby = room.phase === 'waiting' || room.phase === 'finished';
    const full = active.length >= room.settings.capacity;
    res.json({
      code: room.code,
      phase: room.phase,
      capacity: room.settings.capacity,
      players: active.map((p) => ({ name: p.name, avatar: p.avatar })),
      joinable: inLobby && !full,
      reason: !inLobby ? 'inProgress' : full ? 'full' : null,
    });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.size, uptime: process.uptime() });
  });

  const distDir = options.clientDistDir ?? path.resolve(process.cwd(), 'client/dist');
  if (existsSync(path.join(distDir, 'index.html'))) {
    app.use(
      express.static(distDir, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
    log.info('serving client', { distDir });
  }

  const sweeper = setInterval(() => manager.sweep(), 60_000);
  sweeper.unref();

  return {
    httpServer,
    io,
    manager,
    persistence,
    listen: (port) =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      }),
    close: async () => {
      clearInterval(sweeper);
      manager.disposeAll();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await persistence?.close();
    },
  };
}
