/**
 * Core domain types shared by the game server and the client.
 * The server is the single source of truth; the client only renders snapshots.
 */

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

/** Lifecycle of a room. Transitions are driven exclusively by the server. */
export type RoomPhase =
  | 'waiting' // lobby: players join, host edits settings
  | 'starting' // logo beat / rematch beat before round 1 (locations are being resolved)
  | 'round' // intro + exploration of the panorama
  | 'guessing' // exploration time is over, players place their marker
  | 'revealing' // scripted reveal sequence
  | 'results' // round scores + leaderboard, host (or auto) advances
  | 'finished'; // final results, rematch available

export const ROUND_OPTIONS = [3, 5, 10] as const;
export type RoundCount = (typeof ROUND_OPTIONS)[number];

export const EXPLORE_SECONDS_OPTIONS = [15, 30, 45, 60] as const;
export type ExploreSeconds = (typeof EXPLORE_SECONDS_OPTIONS)[number];

export const CAPACITY_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;
export type Capacity = (typeof CAPACITY_OPTIONS)[number];

export interface GameSettings {
  cityId: string;
  rounds: RoundCount;
  exploreSeconds: ExploreSeconds;
  difficulty: Difficulty;
  /** Number of seats in the room (2–8). */
  capacity: Capacity;
  /** Last round is worth double points. */
  doubleFinal: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type StreetViewProviderId = 'google' | 'mock';

export interface PlayerPublic {
  id: string;
  name: string;
  /** Avatar id (shape + colour), see AVATARS. Unique within a room. */
  avatar: string;
  /** Hex colour of the avatar, used for markers and lines. */
  color: string;
  isHost: boolean;
  connected: boolean;
  /** Player explicitly left (or was removed after a long disconnection). They may come back. */
  left: boolean;
  /** Street view confirmed loadable on this device. */
  isReady: boolean;
  totalScore: number;
  joinedAt: number;
  /** Whether this player has locked a guess for the current round. */
  hasGuessed: boolean;
  /** Whether this player's street view is loaded for the current round. */
  panoReady: boolean;
}

export type BonusLabel = 'perfect' | null;

export interface ScoreBreakdown {
  /** Points from the distance curve, already multiplied for a doubled round. */
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
  /** Guess placed by the server at the city centre because the player ran out of time. */
  auto: boolean;
}

export interface Standing {
  playerId: string;
  rank: number;
  /** Rank before this round (null on the first round). */
  previousRank: number | null;
  totalScore: number;
  /** Points earned this round (0 if nothing). */
  roundPoints: number;
  /** Consecutive rounds (including this one) where the player had the best round score. */
  streak: number;
  /** Streak before this round, to notice a broken one. */
  previousStreak: number;
  /** Points behind the leader (0 for the leader). */
  gapToLeader: number;
}

export interface RoundReveal {
  location: LatLng;
  results: GuessResult[];
  standings: Standing[];
  /** Server timestamp at which the reveal sequence starts (ms since epoch). */
  revealStartsAt: number;
  /** Server timestamp at which the results sequence starts, null until the results phase. */
  resultsStartsAt: number | null;
}

export interface RoundPublic {
  /** 0‑based index. */
  index: number;
  /** 1‑based number shown to players. */
  number: number;
  total: number;
  isLast: boolean;
  /** 2 when the round is worth double points. */
  multiplier: number;
  cityId: string;
  provider: StreetViewProviderId;
  /** Identifier of the panorama to load. Never contains the location. */
  panoId: string;
  /** Server timestamps (ms since epoch). */
  introStartsAt: number;
  introEndsAt: number;
  /** Exploration deadline. May be pushed back by up to a few seconds while street views load. */
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

export interface PlayerStats {
  playerId: string;
  /** Closest guess of the game in meters, null if the player never guessed. */
  bestGuessMeters: number | null;
  /** Highest round score. */
  bestRoundPoints: number;
  /** Longest streak of best‑of‑round. */
  maxStreak: number;
}

export interface GameHighlights {
  /** Closest non‑auto guess of the whole game. */
  closest: { playerId: string; distanceMeters: number; roundNumber: number } | null;
  /** Fastest non‑auto guess of the whole game. */
  fastest: { playerId: string; timeMs: number; roundNumber: number } | null;
  /** Longest streak of the game. */
  streak: { playerId: string; length: number } | null;
}

export interface FinalResults {
  ranking: RankingEntry[];
  winnerIds: string[];
  stats: PlayerStats[];
  highlights: GameHighlights;
  /** Server timestamp at which the final sequence starts. */
  startsAt: number;
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
  /** When the current phase started on the server. */
  phaseStartedAt: number;
  /** Server clock at emission time, used by clients to compute their clock offset. */
  serverNow: number;
  /** Your own locked guess for the current round, if any. */
  yourGuess: LatLng | null;
  final: FinalResults | null;
  /** Name of the host who requested the running rematch, during the "starting" beat. */
  rematchBy: string | null;
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
  | 'rematchRequested'
  | 'newCityRequested';

export interface RoomEvent {
  type: RoomEventType;
  playerId: string | null;
  playerName: string | null;
  at: number;
}
