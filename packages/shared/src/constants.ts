import type { Difficulty, GameSettings } from './types.js';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 1;
export const MAX_NAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 5;

/** Seconds players get to place their marker once exploration is over. */
export const GUESS_SECONDS = 20;
/** Length of the 3‑2‑1 countdown before the first round. */
export const STARTING_SECONDS = 3;
/** "ROUND X / Y — CITY" card shown while the panorama loads. */
export const ROUND_INTRO_SECONDS = 3;
/** Map reveal animation before the scoreboard. */
export const REVEAL_SECONDS = 8;
/** Scoreboard duration before the next round starts automatically. */
export const RESULTS_SECONDS = 12;
/** Grace period before host rights are transferred after the host disconnects. */
export const HOST_TRANSFER_GRACE_MS = 10_000;
/** Rooms are removed once nobody has been connected for this long. */
export const ROOM_IDLE_TTL_MS = 15 * 60_000;
/** Hard lifetime of a room. */
export const ROOM_MAX_AGE_MS = 8 * 60 * 60_000;

export const DEFAULT_SETTINGS: GameSettings = {
  cityId: 'marseille',
  rounds: 5,
  exploreSeconds: 30,
  difficulty: 'normal',
};

export const DIFFICULTY_LABELS: Record<Difficulty, { label: string; hint: string }> = {
  easy: { label: 'Easy', hint: 'Landmarks & famous areas' },
  normal: { label: 'Normal', hint: 'Everyday neighbourhoods' },
  hard: { label: 'Hard', hint: 'Residential streets' },
  expert: { label: 'Expert', hint: 'Anywhere in the city' },
};

/** Distinct, high‑contrast colours assigned to players in join order. */
export const PLAYER_COLORS: readonly string[] = [
  '#22C55E', // green
  '#3B82F6', // blue
  '#EF4444', // red
  '#F59E0B', // amber
  '#A855F7', // purple
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#F97316', // orange
];

export interface AvatarDef {
  id: string;
  emoji: string;
  label: string;
}

export const AVATARS: readonly AvatarDef[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'tiger', emoji: '🐯', label: 'Tiger' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'koala', emoji: '🐨', label: 'Koala' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'ghost', emoji: '👻', label: 'Ghost' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket' },
];

export function avatarEmoji(id: string): string {
  return AVATARS.find((a) => a.id === id)?.emoji ?? '🙂';
}
