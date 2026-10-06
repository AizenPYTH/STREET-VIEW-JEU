import type { RoomHooks } from '../game/GameRoom.js';
import type { GameRoom } from '../game/GameRoom.js';

export interface Persistence extends RoomHooks {
  roomClosed(room: GameRoom): void;
  close(): Promise<void>;
}
