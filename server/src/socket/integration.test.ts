import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, RoomJoined, RoomSnapshot, ServerToClientEvents } from '@cityguess/shared';
import { createApp, type GameApp } from '../app.js';
import { FakeClock } from '../game/clock.js';
import { MockStreetViewResolver } from '../streetview/mock.js';
import type { ServerConfig } from '../config.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const config: ServerConfig = {
  port: 0,
  isProduction: false,
  corsOrigins: [],
  streetViewProvider: 'mock',
  googleServerKey: null,
  googleBrowserKey: null,
  databaseUrl: null,
  databaseSsl: false,
  version: 'test',
};

let app: GameApp;
let port: number;
const clock = new FakeClock();
const sockets: ClientSocket[] = [];
const latest = new Map<ClientSocket, RoomSnapshot>();

function client(token: string): Promise<ClientSocket> {
  const socket: ClientSocket = connect(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  socket.on('room:state', (s) => latest.set(socket, s));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function request<T>(socket: ClientSocket, run: (ack: (r: AckResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    run((result) => {
      if (result.ok) resolve(result.data);
      else reject(new Error(`${result.error.code}: ${result.error.message}`));
    });
  });
}

/** Resolves with the latest snapshot matching `predicate`, now or as soon as it arrives. */
function nextState(socket: ClientSocket, predicate: (s: RoomSnapshot) => boolean): Promise<RoomSnapshot> {
  const current = latest.get(socket);
  if (current && predicate(current)) return Promise.resolve(current);
  return new Promise((resolve) => {
    const handler = (s: RoomSnapshot): void => {
      if (predicate(s)) {
        socket.off('room:state', handler);
        resolve(s);
      }
    };
    socket.on('room:state', handler);
  });
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  app = await createApp({ config, clock, resolver: new MockStreetViewResolver(), clientDistDir: '/nonexistent' });
  port = await app.listen(0);
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await app.close();
});

describe('socket transport', () => {
  it('rejects connections without a token', async () => {
    const bad: ClientSocket = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    sockets.push(bad);
    const error = await new Promise<Error>((resolve) => bad.once('connect_error', resolve));
    expect(error.message).toMatch(/token/);
  });

  it('serves the public config without secrets', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/config`);
    expect(await res.json()).toEqual({ streetViewProvider: 'mock', googleMapsBrowserKey: null, version: 'test' });
  });

  it('plays a full game across 4 real sockets, with reconnection', async () => {
    const host = await client('host-token-1234567890abcdef');
    const created = await request<RoomJoined>(host, (ack) => host.emit('room:create', { name: 'Alex', avatar: 'fox' }, ack));
    expect(created.code).toMatch(/^[A-Z2-9]{5}$/);

    const guests = await Promise.all(['Yass', 'Sam', 'Adam'].map((n, i) => client(`guest-token-${i}-1234567890abcdef`)));
    const joined = await Promise.all(
      guests.map((g, i) =>
        request<RoomJoined>(g, (ack) => g.emit('room:join', { code: created.code.toLowerCase(), name: ['Yass', 'Sam', 'Adam'][i]!, avatar: 'panda' }, ack)),
      ),
    );
    expect(joined.every((j) => j.code === created.code)).toBe(true);

    await expect(request(guests[0]!, (ack) => guests[0]!.emit('room:updateSettings', { rounds: 3 }, ack))).rejects.toThrow(/NOT_HOST/);
    await request(host, (ack) => host.emit('room:updateSettings', { rounds: 3, exploreSeconds: 15, cityId: 'paris' }, ack));
    const lobby = await nextState(guests[2]!, (s) => s.settings.rounds === 3 && s.players.length === 4);
    expect(lobby.players.map((p) => p.name)).toEqual(['Alex', 'Yass', 'Sam', 'Adam']);
    expect(lobby.you).toBe(joined[2]?.playerId);

    await request(host, (ack) => host.emit('game:start', ack));
    await tick();
    clock.advance(3000);
    const round = await nextState(host, (s) => s.phase === 'round');
    expect(round.round?.number).toBe(1);
    expect(round.round?.panoId).toMatch(/^mock-/);
    expect(round.round?.reveal).toBeNull();

    for (let r = 0; r < 3; r++) {
      const everyone = [host, ...guests];
      await Promise.all(
        everyone.map((s, i) =>
          request(s, (ack) => s.emit('game:submitGuess', { position: { lat: 48.85 + i * 0.001, lng: 2.35 } }, ack)),
        ),
      );
      const revealed = await nextState(host, (s) => s.phase === 'revealing' && s.round?.index === r);
      expect(revealed.round?.reveal?.results).toHaveLength(4);
      expect(revealed.round?.reveal?.location.lat).toBeGreaterThan(48.8);
      await expect(request(host, (ack) => host.emit('game:submitGuess', { position: { lat: 48.85, lng: 2.35 } }, ack))).rejects.toThrow(/TOO_LATE/);

      // Simulate a guest dropping and coming back during the reveal
      if (r === 0) {
        guests[1]!.disconnect();
        await tick();
        const dropped = await nextState(host, (s) => s.players.some((p) => p.name === 'Sam' && !p.connected));
        expect(dropped.players.find((p) => p.name === 'Sam')?.connected).toBe(false);
        const back = await client('guest-token-1-1234567890abcdef');
        guests[1] = back;
        const rejoined = await request<RoomJoined>(back, (ack) => back.emit('room:rejoin', { code: '' }, ack));
        expect(rejoined.playerId).toBe(joined[1]?.playerId);
        const restored = await nextState(host, (s) => s.players.some((p) => p.name === 'Sam' && p.connected));
        expect(restored.players.find((p) => p.name === 'Sam')?.totalScore).toBeGreaterThan(0);
      }

      clock.advance(8000);
      await nextState(host, (s) => s.phase === 'results');
      if (r < 2) {
        await request(host, (ack) => host.emit('game:nextRound', ack));
        await nextState(host, (s) => s.phase === 'round' && s.round?.index === r + 1);
      } else {
        clock.advance(12_000);
      }
    }
    const final = await nextState(host, (s) => s.phase === 'finished');
    expect(final.final?.ranking).toHaveLength(4);
    expect(final.final?.winnerIds.length).toBeGreaterThan(0);

    await request(host, (ack) => host.emit('game:rematch', { newCity: false }, ack));
    const lobbyAgain = await nextState(guests[0]!, (s) => s.phase === 'waiting');
    expect(lobbyAgain.players.every((p) => p.totalScore === 0)).toBe(true);

    await request(guests[0]!, (ack) => guests[0]!.emit('room:leave', ack));
    const afterLeave = await nextState(host, (s) => s.players.length === 3);
    expect(afterLeave.players.map((p) => p.name)).toEqual(['Alex', 'Sam', 'Adam']);
  });

  it('returns clear errors for unknown rooms and bad input', async () => {
    const s = await client('errors-token-1234567890abcdef');
    await expect(request(s, (ack) => s.emit('room:join', { code: 'ZZZZZ', name: 'X', avatar: 'fox' }, ack))).rejects.toThrow(/ROOM_NOT_FOUND/);
    await expect(request(s, (ack) => s.emit('room:join', { code: 'AB', name: 'X', avatar: 'fox' }, ack))).rejects.toThrow(/INVALID_INPUT/);
    await expect(request(s, (ack) => s.emit('room:create', { name: '', avatar: 'fox' }, ack))).rejects.toThrow(/INVALID_INPUT/);
    await expect(request(s, (ack) => s.emit('game:start', ack))).rejects.toThrow(/NOT_IN_ROOM/);
    await expect(request(s, (ack) => s.emit('room:rejoin', { code: '' }, ack))).rejects.toThrow(/ROOM_NOT_FOUND/);
  });
});
