import type { GameSettings, LatLng, RoomEvent, RoomSnapshot } from './types.js';

/**
 * Socket.IO contract between client and server.
 * Every client→server request carries an acknowledgement callback returning `AckResult`.
 */

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'GAME_IN_PROGRESS'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'BAD_PHASE'
  | 'ALREADY_GUESSED'
  | 'TOO_LATE'
  | 'LOCATIONS_UNAVAILABLE'
  | 'NOT_READY'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
}

export type AckResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export interface ProfilePayload {
  name: string;
  avatar: string;
}

export interface CreateRoomPayload extends ProfilePayload {
  settings?: Partial<GameSettings>;
}

export interface JoinRoomPayload extends ProfilePayload {
  code: string;
}

export interface RejoinRoomPayload {
  code: string;
}

export interface SubmitGuessPayload {
  position: LatLng;
}

export interface RoomJoined {
  code: string;
  playerId: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: (result: AckResult<RoomJoined>) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (result: AckResult<RoomJoined>) => void) => void;
  'room:rejoin': (payload: RejoinRoomPayload, ack: (result: AckResult<RoomJoined>) => void) => void;
  'room:leave': (ack: (result: AckResult) => void) => void;
  'room:updateSettings': (payload: Partial<GameSettings>, ack: (result: AckResult) => void) => void;
  'room:setReady': (payload: { ready: boolean }, ack: (result: AckResult) => void) => void;
  'game:start': (ack: (result: AckResult) => void) => void;
  'game:panoReady': (ack: (result: AckResult) => void) => void;
  'game:submitGuess': (payload: SubmitGuessPayload, ack: (result: AckResult) => void) => void;
  'game:nextRound': (ack: (result: AckResult) => void) => void;
  'game:rematch': (payload: { newCity: boolean }, ack: (result: AckResult) => void) => void;
  'time:ping': (clientSentAt: number, ack: (serverNow: number) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'room:event': (event: RoomEvent) => void;
  'room:closed': (payload: { reason: string }) => void;
}

export interface SocketAuth {
  /** Persistent, client‑generated secret identifying the device across reconnections. */
  token: string;
}

export interface PublicConfig {
  streetViewProvider: 'google' | 'mock';
  googleMapsBrowserKey: string | null;
  version: string;
}
