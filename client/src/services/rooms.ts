import type { RoomPhase } from '@cityguess/shared';
import { SERVER_URL } from './config';

export interface RoomPreview {
  code: string;
  phase: RoomPhase;
  capacity: number;
  players: { name: string; avatar: string }[];
  joinable: boolean;
  reason: 'full' | 'inProgress' | null;
}

/** Looks a room up before asking for a name (§33: an invalid code shows the error screen right away). */
export async function checkRoom(code: string): Promise<RoomPreview | null> {
  const res = await fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(code)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Le serveur a répondu ${res.status}`);
  return (await res.json()) as RoomPreview;
}
