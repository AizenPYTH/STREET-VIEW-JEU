import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, GameSettings, ProfilePayload, RoomJoined, ServerToClientEvents } from '@cityguess/shared';
import { SERVER_URL } from './config';
import { recordServerTime } from './clock';
import { storage } from './storage';
import { useGameStore } from '../store/gameStore';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let hadConnection = false;

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

function request<T>(run: (ack: (result: AckResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestError('TIMEOUT', 'The server did not answer. Check your connection and try again.')), 12_000);
    run((result) => {
      clearTimeout(timer);
      if (result.ok) resolve(result.data);
      else reject(new RequestError(result.error.code, result.error.message));
    });
  });
}

export function getSocket(): GameSocket {
  if (socket) return socket;
  const store = useGameStore.getState();
  const s: GameSocket = io(SERVER_URL || undefined, {
    auth: { token: storage.getToken() },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10_000,
  });
  socket = s;

  s.on('connect', () => {
    const wasReconnect = hadConnection;
    hadConnection = true;
    store.setConnection('connected');
    if (wasReconnect) {
      store.pushToast({ kind: 'success', text: 'Reconnected' });
      // Reclaim our seat in the room we were in.
      const code = useGameStore.getState().snapshot?.code ?? storage.getLastRoom();
      if (code) {
        rejoinRoom(code).catch((error: RequestError) => {
          if (error.code === 'ROOM_NOT_FOUND' || error.code === 'NOT_IN_ROOM') useGameStore.getState().leaveLocally(error.message);
        });
      }
    }
    syncClock();
  });
  s.on('disconnect', () => {
    store.setConnection('reconnecting');
  });
  s.io.on('reconnect_failed', () => store.setConnection('disconnected'));
  s.on('connect_error', () => {
    if (!hadConnection) store.setConnection('reconnecting');
  });
  s.on('room:state', (snapshot) => {
    recordServerTime(snapshot.serverNow);
    useGameStore.getState().applySnapshot(snapshot);
  });
  s.on('room:event', (event) => useGameStore.getState().applyEvent(event));
  s.on('room:closed', ({ reason }) => useGameStore.getState().leaveLocally(reason));
  return s;
}

function syncClock(): void {
  const s = getSocket();
  const sentAt = Date.now();
  s.emit('time:ping', sentAt, (serverTime) => recordServerTime(serverTime, Date.now() - sentAt));
}

export async function createRoom(profile: ProfilePayload): Promise<RoomJoined> {
  const s = getSocket();
  const joined = await request<RoomJoined>((ack) => s.emit('room:create', profile, ack));
  storage.setLastRoom(joined.code);
  return joined;
}

export async function joinRoom(code: string, profile: ProfilePayload): Promise<RoomJoined> {
  const s = getSocket();
  const joined = await request<RoomJoined>((ack) => s.emit('room:join', { code, ...profile }, ack));
  storage.setLastRoom(joined.code);
  return joined;
}

export async function rejoinRoom(code: string): Promise<RoomJoined> {
  const s = getSocket();
  const joined = await request<RoomJoined>((ack) => s.emit('room:rejoin', { code }, ack));
  storage.setLastRoom(joined.code);
  return joined;
}

export async function leaveRoom(): Promise<void> {
  const s = getSocket();
  storage.setLastRoom(null);
  useGameStore.getState().leaveLocally(null);
  await request<undefined>((ack) => s.emit('room:leave', ack)).catch(() => undefined);
}

export function updateSettings(patch: Partial<GameSettings>): Promise<undefined> {
  const s = getSocket();
  return request<undefined>((ack) => s.emit('room:updateSettings', patch, ack));
}

export function toggleReady(): Promise<undefined> {
  const s = getSocket();
  return request<undefined>((ack) => s.emit('room:toggleReady', ack));
}

export function startGame(): Promise<undefined> {
  const s = getSocket();
  return request<undefined>((ack) => s.emit('game:start', ack));
}

export function submitGuess(position: { lat: number; lng: number }): Promise<undefined> {
  const s = getSocket();
  return request<undefined>((ack) => s.emit('game:submitGuess', { position }, ack));
}

export function nextRound(): Promise<undefined> {
  const s = getSocket();
  return request<undefined>((ack) => s.emit('game:nextRound', ack));
}

export function rematch(newCity: boolean): Promise<undefined> {
  const s = getSocket();
  return request<undefined>((ack) => s.emit('game:rematch', { newCity }, ack));
}
