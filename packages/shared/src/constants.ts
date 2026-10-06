import type { Difficulty, GameSettings } from './types.js';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 1;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 12;
export const ROOM_CODE_LENGTH = 5;

/** Rooms are removed once nobody has been connected for this long. */
export const ROOM_IDLE_TTL_MS = 15 * 60_000;
/** Hard lifetime of a room. */
export const ROOM_MAX_AGE_MS = 8 * 60 * 60_000;

export const DEFAULT_SETTINGS: GameSettings = {
  cityId: 'marseille',
  rounds: 5,
  exploreSeconds: 30,
  difficulty: 'normal',
  capacity: 4,
  doubleFinal: true,
};

export const DIFFICULTY_LABELS: Record<Difficulty, { label: string; hint: string }> = {
  easy: { label: 'Facile', hint: 'Monuments et quartiers connus' },
  normal: { label: 'Normal', hint: 'Quartiers de tous les jours' },
  hard: { label: 'Difficile', hint: 'Rues résidentielles' },
  expert: { label: 'Expert', hint: "N'importe où dans la ville" },
};

export type AvatarShape = 'diamond' | 'circle' | 'square' | 'triangle' | 'pentagon' | 'dome' | 'hexagon' | 'leaf';

export interface AvatarDef {
  id: string;
  color: string;
  shape: AvatarShape;
  label: string;
}

/** The 8 avatars, fixed order (design handoff §4). Colour + shape both carry identity. */
export const AVATARS: readonly AvatarDef[] = [
  { id: 'diamond', color: '#5ee6e0', shape: 'diamond', label: 'Losange cyan' },
  { id: 'circle', color: '#f0b45a', shape: 'circle', label: 'Cercle ambre' },
  { id: 'square', color: '#c4a6f5', shape: 'square', label: 'Carré lavande' },
  { id: 'triangle', color: '#f07a6a', shape: 'triangle', label: 'Triangle corail' },
  { id: 'pentagon', color: '#8fe28a', shape: 'pentagon', label: 'Pentagone vert' },
  { id: 'dome', color: '#f58fd2', shape: 'dome', label: 'Dôme rose' },
  { id: 'hexagon', color: '#7fb6ff', shape: 'hexagon', label: 'Hexagone bleu' },
  { id: 'leaf', color: '#f3efe6', shape: 'leaf', label: 'Feuille crème' },
];

export function getAvatar(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? (AVATARS[0] as AvatarDef);
}
