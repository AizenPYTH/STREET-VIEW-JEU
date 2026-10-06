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
    const timer = setTimeout(() => reject(new RequestError('TIMEOUT', 'Le serveur ne répond pas. Vérifie ta connexion.')), 12_000);
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
    syncClock();
    if (wasReconnect) {
      const code = useGameStore.getState().snapshot?.code ?? storage.getLastRoom();
      if (code) {
        rejoinRoom(code).catch((error: RequestError) => {
          if (error.code === 'ROOM_NOT_FOUND' || error.code === 'NOT_IN_ROOM') useGameStore.getState().leaveLocally('closed');
        });
      }
    }
  });
  s.on('disconnect', () => store.setConnection('reconnecting'));
  s.io.on('reconnect_failed', () => store.setConnection('disconnected'));
  s.on('connect_error', () => {
    if (!hadConnection) store.setConnection('reconnecting');
  });
  s.on('room:state', (snapshot) => {
    recordServerTime(snapshot.serverNow);
    useGameStore.getState().applySnapshot(snapshot);
  });
  s.on('room:event', (event) => useGameStore.getState().applyEvent(event));
  s.on('room:closed', () => useGameStore.getState().leaveLocally('closed'));
  return s;
}

/** Forces a fresh connection attempt (used by the "Réessayer" button). */
export function reconnectNow(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

function syncClock(): void {
  const s = getSocket();
  const sentAt = Date.now();
  s.emit('time:ping', sentAt, (serverTime) => recordServerTime(serverTime, Date.now() - sentAt));
}

export async function createRoom(profile: ProfilePayload, settings: Partial<GameSettings>): Promise<RoomJoined> {
  const s = getSocket();
  const joined = await request<RoomJoined>((ack) => s.emit('room:create', { ...profile, settings }, ack));
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
  useGameStore.getState().leaveLocally('left');
  await request<undefined>((ack) => s.emit('room:leave', ack)).catch(() => undefined);
}

export const api = {
  updateSettings: (patch: Partial<GameSettings>) => request<undefined>((ack) => getSocket().emit('room:updateSettings', patch, ack)),
  setReady: (ready: boolean) => request<undefined>((ack) => getSocket().emit('room:setReady', { ready }, ack)),
  startGame: () => request<undefined>((ack) => getSocket().emit('game:start', ack)),
  panoReady: () => request<undefined>((ack) => getSocket().emit('game:panoReady', ack)),
  submitGuess: (position: { lat: number; lng: number }) => request<undefined>((ack) => getSocket().emit('game:submitGuess', { position }, ack)),
  nextRound: () => request<undefined>((ack) => getSocket().emit('game:nextRound', ack)),
  rematch: (newCity: boolean) => request<undefined>((ack) => getSocket().emit('game:rematch', { newCity }, ack)),
};
