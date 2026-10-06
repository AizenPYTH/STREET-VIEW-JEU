import { randomUUID } from 'node:crypto';
import {
  CITIES,
  DEFAULT_SETTINGS,
  EXPLORE_SECONDS_OPTIONS,
  GUESS_SECONDS,
  HOST_TRANSFER_GRACE_MS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  NO_GUESS_SCORE,
  PLAYER_COLORS,
  RESULTS_SECONDS,
  REVEAL_SECONDS,
  ROUND_INTRO_SECONDS,
  ROUND_OPTIONS,
  STARTING_SECONDS,
  calculateScore,
  distanceBetween,
  getCity,
  isValidLatLng,
  rankPlayers,
  scoringForScale,
  winnersOf,
  type FinalResults,
  type GameSettings,
  type GuessResult,
  type LatLng,
  type PlayerPublic,
  type RoomEvent,
  type RoomEventType,
  type RoomPhase,
  type RoomSnapshot,
  type RoundPublic,
  type StreetViewProviderId,
  DIFFICULTIES,
  AVATARS,
} from '@cityguess/shared';
import type { Clock, TimerHandle } from './clock.js';
import { GameError } from './errors.js';
import type { LocationPicker } from './locations.js';

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  left: boolean;
  isReady: boolean;
  totalScore: number;
  totalDistanceMeters: number;
  joinedAt: number;
  lastSeenAt: number;
}

export interface RoundState {
  id: string;
  index: number;
  cityId: string;
  zoneName: string;
  provider: StreetViewProviderId;
  panoId: string;
  /** SECRET until revealed. */
  location: LatLng;
  introEndsAt: number;
  exploreEndsAt: number;
  guessEndsAt: number | null;
  revealedAt: number | null;
  guesses: Map<string, GuessResult>;
}

export interface RoomDeps {
  clock: Clock;
  pickLocations: LocationPicker;
  /** Called after every state mutation; the transport layer pushes snapshots to players. */
  onStateChanged: (room: GameRoom) => void;
  onEvent: (room: GameRoom, event: RoomEvent) => void;
  /** Called when the last player leaves so the manager can dispose the room. */
  onEmpty: (room: GameRoom) => void;
  /** Optional hooks for persistence. Never awaited by the engine. */
  hooks?: Partial<RoomHooks>;
  rng?: () => number;
}

export interface RoomHooks {
  roomCreated(room: GameRoom): void;
  playerJoined(room: GameRoom, player: PlayerState): void;
  gameStarted(room: GameRoom): void;
  guessSubmitted(room: GameRoom, round: RoundState, guess: GuessResult): void;
  roundRevealed(room: GameRoom, round: RoundState): void;
  gameFinished(room: GameRoom, final: FinalResults): void;
}

/** Distance added to the ranking tiebreaker when a player does not guess. */
const NO_GUESS_DISTANCE_PENALTY_M = 50_000;
/** A disconnected player stops blocking the reveal after this delay. */
const DISCONNECT_GUESS_CHECK_MS = 5_000;

/**
 * Authoritative state machine for one room.
 * All transitions happen here; the transport layer only forwards validated intents.
 */
export class GameRoom {
  readonly id = randomUUID();
  readonly createdAt: number;
  phase: RoomPhase = 'waiting';
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  readonly players = new Map<string, PlayerState>();
  hostId = '';
  gameNumber = 0;
  gameId: string | null = null;
  rounds: RoundState[] = [];
  currentRoundIndex = -1;
  phaseEndsAt: number | null = null;
  final: FinalResults | null = null;
  /** Locations played in previous games of this room, avoided on rematch. */
  private readonly playedLocations: LatLng[] = [];
  private phaseTimer: TimerHandle | null = null;
  private hostGraceTimer: TimerHandle | null = null;
  private guessCheckTimer: TimerHandle | null = null;
  private disposed = false;
  private startNonce = 0;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {
    this.createdAt = deps.clock.now();
    deps.hooks?.roomCreated?.(this);
  }

  // ───────────────────────────── players ─────────────────────────────

  get currentRound(): RoundState | null {
    return this.rounds[this.currentRoundIndex] ?? null;
  }

  /** Players counted as part of the game (joined and not left). */
  activePlayers(): PlayerState[] {
    return [...this.players.values()].filter((p) => !p.left);
  }

  connectedPlayers(): PlayerState[] {
    return this.activePlayers().filter((p) => p.connected);
  }

  findByToken(token: string): PlayerState | undefined {
    for (const p of this.players.values()) if (p.token === token) return p;
    return undefined;
  }

  addPlayer(token: string, rawName: string, avatar: string): PlayerState {
    this.assertAlive();
    const existing = this.findByToken(token);
    if (existing) return this.rejoin(token);

    const name = rawName.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      throw new GameError('INVALID_INPUT', `Name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }
    if (!AVATARS.some((a) => a.id === avatar)) throw new GameError('INVALID_INPUT', 'Unknown avatar');
    if (this.phase !== 'waiting' && this.phase !== 'finished') {
      throw new GameError('GAME_IN_PROGRESS', 'A game is in progress in this room. Ask the host for a rematch to join.');
    }
    const active = this.activePlayers();
    if (active.length >= MAX_PLAYERS) throw new GameError('ROOM_FULL', `This room is full (${MAX_PLAYERS} players max)`);
    if (active.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError('NAME_TAKEN', `"${name}" is already taken in this room`);
    }
    const usedColors = new Set(active.map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? (PLAYER_COLORS[0] as string);
    const now = this.deps.clock.now();
    const player: PlayerState = {
      id: randomUUID(),
      token,
      name,
      avatar,
      color,
      isHost: this.players.size === 0 || !this.players.has(this.hostId),
      connected: true,
      left: false,
      isReady: false,
      totalScore: 0,
      totalDistanceMeters: 0,
      joinedAt: now,
      lastSeenAt: now,
    };
    this.players.set(player.id, player);
    if (player.isHost) this.hostId = player.id;
    this.deps.hooks?.playerJoined?.(this, player);
    this.emitEvent('playerJoined', player);
    this.notify();
    return player;
  }

  /** Re‑attaches a returning device to its player, whatever the phase. */
  rejoin(token: string): PlayerState {
    this.assertAlive();
    const player = this.findByToken(token);
    if (!player) throw new GameError('NOT_IN_ROOM', 'You are not part of this room anymore');
    const wasConnected = player.connected && !player.left;
    player.connected = true;
    player.left = false;
    player.lastSeenAt = this.deps.clock.now();
    if (player.isHost) this.cancelHostGrace();
    if (!wasConnected) this.emitEvent('playerReconnected', player);
    this.notify();
    return player;
  }

  markDisconnected(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return;
    player.connected = false;
    player.lastSeenAt = this.deps.clock.now();
    this.emitEvent('playerDisconnected', player);
    if (player.isHost) this.scheduleHostGrace();
    if (this.phase === 'round' || this.phase === 'guessing') this.scheduleGuessCheck();
    this.notify();
  }

  /** Explicit "leave room": in the lobby the player is removed, during a game they are marked as gone. */
  leave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const inLobby = this.phase === 'waiting' || this.phase === 'finished';
    if (inLobby) this.players.delete(playerId);
    else {
      player.left = true;
      player.connected = false;
      player.isReady = false;
    }
    this.emitEvent('playerLeft', player);
    if (player.isHost) this.transferHost();
    if (this.activePlayers().length === 0) {
      this.notify();
      this.deps.onEmpty(this);
      return;
    }
    if (this.phase === 'round' || this.phase === 'guessing') this.checkAllGuessed();
    this.notify();
  }

  toggleReady(playerId: string): void {
    const player = this.requirePlayer(playerId);
    if (this.phase !== 'waiting') throw new GameError('BAD_PHASE', 'You can only toggle ready in the lobby');
    player.isReady = !player.isReady;
    this.emitEvent('playerReady', player);
    this.notify();
  }

  updateSettings(playerId: string, patch: Partial<GameSettings>): void {
    this.requireHost(playerId);
    if (this.phase !== 'waiting') throw new GameError('BAD_PHASE', 'Settings can only be changed in the lobby');
    const next: GameSettings = { ...this.settings };
    if (patch.cityId !== undefined) {
      if (!getCity(patch.cityId)) throw new GameError('INVALID_INPUT', 'Unknown city');
      next.cityId = patch.cityId;
    }
    if (patch.rounds !== undefined) {
      if (!ROUND_OPTIONS.includes(patch.rounds)) throw new GameError('INVALID_INPUT', 'Invalid number of rounds');
      next.rounds = patch.rounds;
    }
    if (patch.exploreSeconds !== undefined) {
      if (!EXPLORE_SECONDS_OPTIONS.includes(patch.exploreSeconds)) throw new GameError('INVALID_INPUT', 'Invalid timer');
      next.exploreSeconds = patch.exploreSeconds;
    }
    if (patch.difficulty !== undefined) {
      if (!DIFFICULTIES.includes(patch.difficulty)) throw new GameError('INVALID_INPUT', 'Invalid difficulty');
      next.difficulty = patch.difficulty;
    }
    this.settings = next;
    this.notify();
  }

  // ───────────────────────────── game flow ─────────────────────────────

  async startGame(playerId: string): Promise<void> {
    this.requireHost(playerId);
    if (this.phase !== 'waiting') throw new GameError('BAD_PHASE', 'The game has already started');
    const active = this.activePlayers();
    if (active.length < MIN_PLAYERS_TO_START) throw new GameError('BAD_PHASE', 'Not enough players');
    const city = getCity(this.settings.cityId);
    if (!city) throw new GameError('INVALID_INPUT', 'Unknown city');

    const nonce = ++this.startNonce;
    this.gameNumber += 1;
    this.gameId = randomUUID();
    this.final = null;
    this.rounds = [];
    this.currentRoundIndex = -1;
    for (const p of this.players.values()) {
      p.totalScore = 0;
      p.totalDistanceMeters = 0;
      p.isReady = false;
    }
    this.setPhase('starting', this.deps.clock.now() + STARTING_SECONDS * 1000);
    this.emitEvent('gameStarted', null);

    let locations;
    try {
      locations = await this.deps.pickLocations(city, this.settings.difficulty, this.settings.rounds, this.playedLocations);
    } catch (error) {
      if (this.disposed || nonce !== this.startNonce) return;
      this.setPhase('waiting', null);
      this.emitEvent('gameStartFailed', null);
      throw error instanceof GameError
        ? error
        : new GameError('LOCATIONS_UNAVAILABLE', `Could not load locations for ${city.name}: ${(error as Error).message}`);
    }
    if (this.disposed || nonce !== this.startNonce || (this.phase as RoomPhase) !== 'starting') return;

    this.rounds = locations.map((loc, index) => ({
      id: randomUUID(),
      index,
      cityId: city.id,
      zoneName: loc.zoneName,
      provider: loc.provider,
      panoId: loc.panoId,
      location: loc.location,
      introEndsAt: 0,
      exploreEndsAt: 0,
      guessEndsAt: null,
      revealedAt: null,
      guesses: new Map(),
    }));
    this.deps.hooks?.gameStarted?.(this);
    const remaining = (this.phaseEndsAt ?? 0) - this.deps.clock.now();
    if (remaining <= 0) this.startRound(0);
    else this.schedule(remaining, () => this.startRound(0));
  }

  private startRound(index: number): void {
    const round = this.rounds[index];
    if (!round) {
      this.finishGame();
      return;
    }
    const now = this.deps.clock.now();
    this.currentRoundIndex = index;
    round.introEndsAt = now + ROUND_INTRO_SECONDS * 1000;
    round.exploreEndsAt = round.introEndsAt + this.settings.exploreSeconds * 1000;
    round.guessEndsAt = null;
    this.setPhase('round', round.exploreEndsAt);
    this.emitEvent('roundStarted', null);
    this.schedule(round.exploreEndsAt - now, () => this.beginGuessing());
  }

  private beginGuessing(): void {
    const round = this.currentRound;
    if (!round || this.phase !== 'round') return;
    const now = this.deps.clock.now();
    round.guessEndsAt = now + GUESS_SECONDS * 1000;
    this.setPhase('guessing', round.guessEndsAt);
    this.schedule(GUESS_SECONDS * 1000, () => this.reveal());
  }

  submitGuess(playerId: string, position: LatLng): GuessResult {
    const player = this.requirePlayer(playerId);
    const round = this.currentRound;
    if (!round || (this.phase !== 'round' && this.phase !== 'guessing')) {
      throw new GameError('TOO_LATE', 'Too late! This round is already over.');
    }
    if (round.guesses.has(player.id)) throw new GameError('ALREADY_GUESSED', 'You already locked a guess for this round');
    if (!isValidLatLng(position)) throw new GameError('INVALID_INPUT', 'Guess must be a valid coordinate');

    const city = getCity(round.cityId);
    const scoring = scoringForScale(city?.scoreScaleMeters ?? 2500);
    const now = this.deps.clock.now();
    const distanceMeters = distanceBetween(round.location, position);
    const breakdown = calculateScore(distanceMeters, scoring);
    const guess: GuessResult = {
      playerId: player.id,
      position: { lat: position.lat, lng: position.lng },
      distanceMeters,
      submittedAt: now,
      timeMs: Math.max(0, now - round.introEndsAt),
      ...breakdown,
    };
    round.guesses.set(player.id, guess);
    this.deps.hooks?.guessSubmitted?.(this, round, guess);
    this.emitEvent('guessLocked', player);
    if (!this.checkAllGuessed()) this.notify();
    return guess;
  }

  /** Reveals immediately when every connected player has guessed. Returns true if it did. */
  private checkAllGuessed(): boolean {
    const round = this.currentRound;
    if (!round || (this.phase !== 'round' && this.phase !== 'guessing')) return false;
    const connected = this.connectedPlayers();
    if (connected.length === 0) return false;
    if (round.guesses.size === 0) return false;
    if (connected.every((p) => round.guesses.has(p.id))) {
      this.reveal();
      return true;
    }
    return false;
  }

  private reveal(): void {
    const round = this.currentRound;
    if (!round || (this.phase !== 'round' && this.phase !== 'guessing')) return;
    this.clearGuessCheck();
    const now = this.deps.clock.now();
    round.revealedAt = now;
    for (const player of this.activePlayers()) {
      const guess = round.guesses.get(player.id);
      if (guess) {
        player.totalScore += guess.total;
        player.totalDistanceMeters += guess.distanceMeters;
      } else {
        player.totalScore += NO_GUESS_SCORE.total;
        player.totalDistanceMeters += NO_GUESS_DISTANCE_PENALTY_M;
      }
    }
    this.playedLocations.push(round.location);
    this.deps.hooks?.roundRevealed?.(this, round);
    this.setPhase('revealing', now + REVEAL_SECONDS * 1000);
    this.emitEvent('roundRevealed', null);
    this.schedule(REVEAL_SECONDS * 1000, () => this.showResults());
  }

  private showResults(): void {
    if (this.phase !== 'revealing') return;
    this.setPhase('results', this.deps.clock.now() + RESULTS_SECONDS * 1000);
    this.schedule(RESULTS_SECONDS * 1000, () => this.advance());
  }

  private advance(): void {
    if (this.phase !== 'results') return;
    if (this.currentRoundIndex + 1 < this.rounds.length) this.startRound(this.currentRoundIndex + 1);
    else this.finishGame();
  }

  nextRound(playerId: string): void {
    this.requireHost(playerId);
    if (this.phase !== 'results') throw new GameError('BAD_PHASE', 'Wait for the results');
    this.advance();
  }

  private finishGame(): void {
    const active = this.activePlayers();
    const ranking = rankPlayers(active.map((p) => ({ id: p.id, totalScore: p.totalScore, totalDistanceMeters: p.totalDistanceMeters })));
    const final: FinalResults = { ranking, winnerIds: winnersOf(ranking), highlights: this.computeHighlights() };
    this.final = final;
    this.setPhase('finished', null);
    this.deps.hooks?.gameFinished?.(this, final);
    this.emitEvent('gameFinished', null);
  }

  private computeHighlights(): FinalResults['highlights'] {
    let bestGuess: FinalResults['highlights']['bestGuess'] = null;
    let fastestGuess: FinalResults['highlights']['fastestGuess'] = null;
    const perfectCounts = new Map<string, number>();
    for (const round of this.rounds) {
      if (!round.revealedAt) continue;
      for (const guess of round.guesses.values()) {
        if (!bestGuess || guess.distanceMeters < bestGuess.distanceMeters) {
          bestGuess = { playerId: guess.playerId, distanceMeters: guess.distanceMeters, roundNumber: round.index + 1 };
        }
        if (!fastestGuess || guess.timeMs < fastestGuess.timeMs) {
          fastestGuess = { playerId: guess.playerId, timeMs: guess.timeMs, roundNumber: round.index + 1 };
        }
        if (guess.bonusLabel === 'perfect') perfectCounts.set(guess.playerId, (perfectCounts.get(guess.playerId) ?? 0) + 1);
      }
    }
    let perfectGuesses: FinalResults['highlights']['perfectGuesses'] = null;
    for (const [playerId, count] of perfectCounts) {
      if (!perfectGuesses || count > perfectGuesses.count) perfectGuesses = { playerId, count };
    }
    return { bestGuess, fastestGuess, perfectGuesses };
  }

  rematch(playerId: string, newCity: boolean): void {
    this.requireHost(playerId);
    if (this.phase !== 'finished') throw new GameError('BAD_PHASE', 'The game is not over yet');
    for (const [id, p] of this.players) {
      if (p.left) this.players.delete(id);
      else {
        p.totalScore = 0;
        p.totalDistanceMeters = 0;
        p.isReady = false;
      }
    }
    this.rounds = [];
    this.currentRoundIndex = -1;
    this.final = null;
    if (newCity) {
      const others = CITIES.filter((c) => c.id !== this.settings.cityId);
      const rng = this.deps.rng ?? Math.random;
      const pick = others[Math.floor(rng() * others.length)];
      if (pick) this.settings = { ...this.settings, cityId: pick.id };
    }
    this.setPhase('waiting', null);
    this.emitEvent('rematch', null);
  }

  // ───────────────────────────── host transfer ─────────────────────────────

  private scheduleHostGrace(): void {
    this.cancelHostGrace();
    this.hostGraceTimer = this.deps.clock.setTimeout(() => {
      this.hostGraceTimer = null;
      const host = this.players.get(this.hostId);
      if (host && !host.connected) this.transferHost();
      this.notify();
    }, HOST_TRANSFER_GRACE_MS);
  }

  private cancelHostGrace(): void {
    if (this.hostGraceTimer) {
      this.deps.clock.clearTimeout(this.hostGraceTimer);
      this.hostGraceTimer = null;
    }
  }

  private transferHost(): void {
    const byJoin = (a: PlayerState, b: PlayerState) => a.joinedAt - b.joinedAt;
    const candidates = this.activePlayers().filter((p) => p.id !== this.hostId);
    const next = candidates.filter((p) => p.connected).sort(byJoin)[0] ?? candidates.sort(byJoin)[0];
    if (!next) return;
    const previous = this.players.get(this.hostId);
    if (previous) previous.isHost = false;
    next.isHost = true;
    this.hostId = next.id;
    this.emitEvent('hostChanged', next);
  }

  private scheduleGuessCheck(): void {
    this.clearGuessCheck();
    this.guessCheckTimer = this.deps.clock.setTimeout(() => {
      this.guessCheckTimer = null;
      this.checkAllGuessed();
    }, DISCONNECT_GUESS_CHECK_MS);
  }

  private clearGuessCheck(): void {
    if (this.guessCheckTimer) {
      this.deps.clock.clearTimeout(this.guessCheckTimer);
      this.guessCheckTimer = null;
    }
  }

  // ───────────────────────────── snapshots ─────────────────────────────

  /** Everything the given player is allowed to know right now. */
  snapshotFor(playerId: string): RoomSnapshot {
    const round = this.currentRound;
    const revealed = this.phase === 'revealing' || this.phase === 'results' || this.phase === 'finished';
    const players: PlayerPublic[] = [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        isHost: p.isHost,
        connected: p.connected,
        left: p.left,
        isReady: p.isReady,
        totalScore: p.totalScore,
        joinedAt: p.joinedAt,
        hasGuessed: round ? round.guesses.has(p.id) : false,
      }));

    let roundPublic: RoundPublic | null = null;
    if (round && this.phase !== 'waiting' && this.phase !== 'starting') {
      roundPublic = {
        index: round.index,
        number: round.index + 1,
        total: this.rounds.length,
        cityId: round.cityId,
        provider: round.provider,
        panoId: round.panoId,
        introEndsAt: round.introEndsAt,
        exploreEndsAt: round.exploreEndsAt,
        guessEndsAt: round.guessEndsAt,
        reveal:
          revealed && round.revealedAt
            ? {
                location: { ...round.location },
                results: [...round.guesses.values()]
                  .map((g) => ({ ...g, position: { ...g.position } }))
                  .sort((a, b) => b.total - a.total || a.distanceMeters - b.distanceMeters),
              }
            : null,
      };
    }
    const ownGuess = round?.guesses.get(playerId);
    return {
      code: this.code,
      phase: this.phase,
      settings: { ...this.settings },
      players,
      hostId: this.hostId,
      you: playerId,
      gameNumber: this.gameNumber,
      round: roundPublic,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: this.deps.clock.now(),
      yourGuess: ownGuess ? { ...ownGuess.position } : null,
      final: this.final,
      maxPlayers: MAX_PLAYERS,
    };
  }

  /** True when nobody has been connected for `idleMs`. */
  isIdle(idleMs: number): boolean {
    const now = this.deps.clock.now();
    for (const p of this.players.values()) {
      if (p.connected) return false;
      if (now - p.lastSeenAt < idleMs) return false;
    }
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.clearPhaseTimer();
    this.cancelHostGrace();
    this.clearGuessCheck();
  }

  // ───────────────────────────── internals ─────────────────────────────

  private setPhase(phase: RoomPhase, endsAt: number | null): void {
    this.clearPhaseTimer();
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    this.notify();
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearPhaseTimer();
    this.phaseTimer = this.deps.clock.setTimeout(() => {
      this.phaseTimer = null;
      if (!this.disposed) fn();
    }, ms);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      this.deps.clock.clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private requirePlayer(playerId: string): PlayerState {
    const player = this.players.get(playerId);
    if (!player || player.left) throw new GameError('NOT_IN_ROOM', 'You are not in this room');
    return player;
  }

  private requireHost(playerId: string): PlayerState {
    const player = this.requirePlayer(playerId);
    if (player.id !== this.hostId) throw new GameError('NOT_HOST', 'Only the host can do that');
    return player;
  }

  private assertAlive(): void {
    if (this.disposed) throw new GameError('ROOM_NOT_FOUND', 'This room has been closed');
  }

  private emitEvent(type: RoomEventType, player: PlayerState | null): void {
    this.deps.onEvent(this, {
      type,
      playerId: player?.id ?? null,
      playerName: player?.name ?? null,
      at: this.deps.clock.now(),
    });
  }

  private notify(): void {
    if (!this.disposed) this.deps.onStateChanged(this);
  }
}
