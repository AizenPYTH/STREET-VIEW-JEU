/**
 * Core domain types shared by the game server and the client.
 * The server is the single source of truth; the client only renders snapshots.
 */

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

/** Lifecycle of a room. Transitions are driven exclusively by the server. */
export type RoomPhase =
  | 'waiting' // lobby: players join, host edits settings
  | 'starting' // 3‑2‑1 countdown before the first round
  | 'round' // players explore the panorama
  | 'guessing' // exploration time is over, players place their marker
  | 'revealing' // real location + guesses are shown on the map
  | 'results' // round scoreboard, auto‑advances to the next round
  | 'finished'; // final results, rematch available

export const ROUND_OPTIONS = [3, 5, 10] as const;
export type RoundCount = (typeof ROUND_OPTIONS)[number];

export const EXPLORE_SECONDS_OPTIONS = [15, 30, 45, 60] as const;
export type ExploreSeconds = (typeof EXPLORE_SECONDS_OPTIONS)[number];

export interface GameSettings {
  cityId: string;
  rounds: RoundCount;
  exploreSeconds: ExploreSeconds;
  difficulty: Difficulty;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type StreetViewProviderId = 'google' | 'mock';

export interface PlayerPublic {
  id: string;
  name: string;
  /** Avatar id, see AVATARS. */
  avatar: string;
  /** Hex colour used for markers and badges. */
  color: string;
  isHost: boolean;
  connected: boolean;
  /** Player explicitly left the room while a game was running. They may come back. */
  left: boolean;
  isReady: boolean;
  totalScore: number;
  joinedAt: number;
  /** Whether this player has locked a guess for the current round. */
  hasGuessed: boolean;
}

export type BonusLabel = 'perfect' | null;

export interface ScoreBreakdown {
  base: number;
  bonus: number;
  bonusLabel: BonusLabel;
  total: number;
}

export interface GuessResult extends ScoreBreakdown {
  playerId: string;
  position: LatLng;
  distanceMeters: number;
  submittedAt: number;
  /** Milliseconds between the start of exploration and the guess. */
  timeMs: number;
}

export interface RoundReveal {
  location: LatLng;
  results: GuessResult[];
}

export interface RoundPublic {
  /** 0‑based index. */
  index: number;
  /** 1‑based number shown to players. */
  number: number;
  total: number;
  cityId: string;
  provider: StreetViewProviderId;
  /** Identifier of the panorama to load. Never contains the location. */
  panoId: string;
  /** Server timestamps (ms since epoch). */
  introEndsAt: number;
  exploreEndsAt: number;
  guessEndsAt: number | null;
  /** Only present once the round has been revealed. */
  reveal: RoundReveal | null;
}

export interface RankingEntry {
  playerId: string;
  totalScore: number;
  totalDistanceMeters: number;
  rank: number;
}

export interface FinalHighlights {
  bestGuess: { playerId: string; distanceMeters: number; roundNumber: number } | null;
  fastestGuess: { playerId: string; timeMs: number; roundNumber: number } | null;
  perfectGuesses: { playerId: string; count: number } | null;
}

export interface FinalResults {
  ranking: RankingEntry[];
  winnerIds: string[];
  highlights: FinalHighlights;
}

/**
 * What a given player is allowed to see at a given moment.
 * Secrets (real location, other players' guesses) are only included after the reveal.
 */
export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  settings: GameSettings;
  players: PlayerPublic[];
  hostId: string;
  /** Id of the player receiving this snapshot. */
  you: string;
  gameNumber: number;
  round: RoundPublic | null;
  /** When the current phase ends on the server (ms since epoch), if it is timed. */
  phaseEndsAt: number | null;
  /** Server clock at emission time, used by clients to compute their clock offset. */
  serverNow: number;
  /** Your own locked guess for the current round, if any. */
  yourGuess: LatLng | null;
  final: FinalResults | null;
  maxPlayers: number;
}

export type RoomEventType =
  | 'playerJoined'
  | 'playerLeft'
  | 'playerDisconnected'
  | 'playerReconnected'
  | 'hostChanged'
  | 'playerReady'
  | 'guessLocked'
  | 'gameStarted'
  | 'gameStartFailed'
  | 'roundStarted'
  | 'roundRevealed'
  | 'gameFinished'
  | 'rematch';

export interface RoomEvent {
  type: RoomEventType;
  playerId: string | null;
  playerName: string | null;
  at: number;
}
