import { randomUUID } from 'node:crypto';
import {
  AVATARS,
  CAPACITY_OPTIONS,
  CITIES,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  EXPLORE_SECONDS_OPTIONS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_NAME_LENGTH,
  MIN_PLAYERS_TO_START,
  ROUND_OPTIONS,
  TIMINGS,
  resultsDurationMs,
  revealDurationMs,
  calculateScore,
  distanceBetween,
  getAvatar,
  getCity,
  isValidLatLng,
  rankPlayers,
  winnersOf,
  type FinalResults,
  type GameHighlights,
  type GameSettings,
  type GuessResult,
  type LatLng,
  type PlayerPublic,
  type PlayerStats,
  type RoomEvent,
  type RoomEventType,
  type RoomPhase,
  type RoomSnapshot,
  type RoundPublic,
  type Standing,
  type StreetViewProviderId,
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
  streak: number;
  maxStreak: number;
  bestGuessMeters: number | null;
  bestRoundPoints: number;
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
  multiplier: number;
  introStartsAt: number;
  introEndsAt: number;
  exploreStartedAt: number | null;
  exploreEndsAt: number;
  guessEndsAt: number | null;
  panoReady: Set<string>;
  guesses: Map<string, GuessResult>;
  revealStartsAt: number | null;
  resultsStartsAt: number | null;
  standings: Standing[] | null;
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

/** Distance added to the ranking tiebreaker for a player who was not part of a round. */
const MISSED_ROUND_DISTANCE_M = 50_000;

/**
 * Authoritative state machine for one room.
 * All transitions happen here; the transport layer only forwards validated intents.
 */
export class GameRoom {
  readonly id = randomUUID();
  readonly createdAt: number;
  phase: RoomPhase = 'waiting';
  phaseStartedAt: number;
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  readonly players = new Map<string, PlayerState>();
  hostId = '';
  gameNumber = 0;
  gameId: string | null = null;
  rounds: RoundState[] = [];
  currentRoundIndex = -1;
  phaseEndsAt: number | null = null;
  final: FinalResults | null = null;
  rematchBy: string | null = null;
  /** Locations played in previous games of this room, avoided on rematch. */
  private readonly playedLocations: LatLng[] = [];
  private phaseTimer: TimerHandle | null = null;
  private hostGraceTimer: TimerHandle | null = null;
  private readonly removalTimers = new Map<string, TimerHandle>();
  private disposed = false;
  private startNonce = 0;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {
    this.createdAt = deps.clock.now();
    this.phaseStartedAt = this.createdAt;
    deps.hooks?.roomCreated?.(this);
  }

  // ───────────────────────────── players ─────────────────────────────

  get currentRound(): RoundState | null {
    return this.rounds[this.currentRoundIndex] ?? null;
  }

  /** Players counted as part of the game (joined and not left). */
  activePlayers(): PlayerState[] {
    return [...this.players.values()].filter((p) => !p.left).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  connectedPlayers(): PlayerState[] {
    return this.activePlayers().filter((p) => p.connected);
  }

  findByToken(token: string): PlayerState | undefined {
    for (const p of this.players.values()) if (p.token === token) return p;
    return undefined;
  }

  addPlayer(token: string, rawName: string, preferredAvatar: string): PlayerState {
    this.assertAlive();
    const existing = this.findByToken(token);
    if (existing) return this.rejoin(token);

    const name = rawName.trim();
    if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
      throw new GameError('INVALID_INPUT', `Le pseudo doit faire entre ${MIN_NAME_LENGTH} et ${MAX_NAME_LENGTH} caractères`);
    }
    if (this.phase !== 'waiting' && this.phase !== 'finished') {
      throw new GameError('GAME_IN_PROGRESS', 'Une partie est en cours dans cette room. Demande à l’hôte un code de revanche.');
    }
    const active = this.activePlayers();
    if (active.length >= Math.min(this.settings.capacity, MAX_PLAYERS)) {
      throw new GameError('ROOM_FULL', `Cette room a déjà ${active.length} joueurs. Demande à l’hôte d’en créer une autre.`);
    }
    if (active.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError('NAME_TAKEN', `« ${name} » est déjà pris dans cette room`);
    }
    const used = new Set(active.map((p) => p.avatar));
    const avatarId = !used.has(preferredAvatar) && AVATARS.some((a) => a.id === preferredAvatar)
      ? preferredAvatar
      : (AVATARS.find((a) => !used.has(a.id))?.id ?? (AVATARS[0] as (typeof AVATARS)[number]).id);
    const now = this.deps.clock.now();
    const player: PlayerState = {
      id: randomUUID(),
      token,
      name,
      avatar: avatarId,
      color: getAvatar(avatarId).color,
      isHost: this.players.size === 0 || !this.players.has(this.hostId),
      connected: true,
      left: false,
      isReady: false,
      totalScore: 0,
      totalDistanceMeters: 0,
      joinedAt: now,
      lastSeenAt: now,
      streak: 0,
      maxStreak: 0,
      bestGuessMeters: null,
      bestRoundPoints: 0,
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
    if (!player) throw new GameError('NOT_IN_ROOM', 'Tu ne fais plus partie de cette room');
    const wasConnected = player.connected && !player.left;
    this.cancelRemoval(player.id);
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
    this.scheduleRemoval(player);
    this.notify();
  }

  /** Explicit "leave room": in the lobby the player is removed, during a game they are marked as gone. */
  leave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.cancelRemoval(playerId);
    this.removePlayer(player);
  }

  private removePlayer(player: PlayerState): void {
    const inLobby = this.phase === 'waiting' || this.phase === 'finished';
    if (inLobby) this.players.delete(player.id);
    else {
      player.left = true;
      player.connected = false;
    }
    this.emitEvent('playerLeft', player);
    if (player.isHost) this.transferHost();
    if (this.activePlayers().length === 0) {
      this.notify();
      this.deps.onEmpty(this);
      return;
    }
    if (this.phase === 'round') this.tryStartExploration();
    if (this.phase === 'round' || this.phase === 'guessing') this.checkAllGuessed();
    this.notify();
  }

  setReady(playerId: string, ready: boolean): void {
    const player = this.requirePlayer(playerId);
    if (player.isReady === ready) return;
    player.isReady = ready;
    this.emitEvent('playerReady', player);
    this.notify();
  }

  updateSettings(playerId: string, patch: Partial<GameSettings>): void {
    this.requireHost(playerId);
    if (this.phase !== 'waiting') throw new GameError('BAD_PHASE', 'Les réglages ne changent que dans le lobby');
    const next: GameSettings = { ...this.settings };
    if (patch.cityId !== undefined) {
      if (!getCity(patch.cityId)) throw new GameError('INVALID_INPUT', 'Ville inconnue');
      next.cityId = patch.cityId;
    }
    if (patch.rounds !== undefined) {
      if (!ROUND_OPTIONS.includes(patch.rounds)) throw new GameError('INVALID_INPUT', 'Nombre de manches invalide');
      next.rounds = patch.rounds;
    }
    if (patch.exploreSeconds !== undefined) {
      if (!EXPLORE_SECONDS_OPTIONS.includes(patch.exploreSeconds)) throw new GameError('INVALID_INPUT', 'Durée invalide');
      next.exploreSeconds = patch.exploreSeconds;
    }
    if (patch.difficulty !== undefined) {
      if (!DIFFICULTIES.includes(patch.difficulty)) throw new GameError('INVALID_INPUT', 'Difficulté invalide');
      next.difficulty = patch.difficulty;
    }
    if (patch.capacity !== undefined) {
      if (!CAPACITY_OPTIONS.includes(patch.capacity)) throw new GameError('INVALID_INPUT', 'Capacité invalide');
      if (patch.capacity < this.activePlayers().length) throw new GameError('INVALID_INPUT', 'Il y a déjà plus de joueurs que ça');
      next.capacity = patch.capacity;
    }
    if (patch.doubleFinal !== undefined) next.doubleFinal = Boolean(patch.doubleFinal);
    this.settings = next;
    this.notify();
  }

  // ───────────────────────────── game flow ─────────────────────────────

  async startGame(playerId: string): Promise<void> {
    this.requireHost(playerId);
    if (this.phase !== 'waiting') throw new GameError('BAD_PHASE', 'La partie a déjà commencé');
    const connected = this.connectedPlayers();
    if (this.activePlayers().length < MIN_PLAYERS_TO_START) throw new GameError('BAD_PHASE', 'Pas assez de joueurs');
    const notReady = connected.filter((p) => !p.isReady);
    if (notReady.length > 0) {
      throw new GameError('NOT_READY', `${notReady.map((p) => p.name).join(', ')} ${notReady.length > 1 ? 'ne sont pas prêts' : 'n’est pas prêt'}`);
    }
    this.rematchBy = null;
    await this.launch(TIMINGS.startingLogoMs);
  }

  /** Resets scores, resolves the locations and schedules round 1 after `delayMs`. */
  private async launch(delayMs: number): Promise<void> {
    const city = getCity(this.settings.cityId);
    if (!city) throw new GameError('INVALID_INPUT', 'Ville inconnue');
    const nonce = ++this.startNonce;
    this.gameNumber += 1;
    this.gameId = randomUUID();
    this.final = null;
    this.rounds = [];
    this.currentRoundIndex = -1;
    for (const p of this.players.values()) {
      p.totalScore = 0;
      p.totalDistanceMeters = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.bestGuessMeters = null;
      p.bestRoundPoints = 0;
    }
    this.setPhase('starting', this.deps.clock.now() + delayMs);
    this.emitEvent('gameStarted', null);

    let locations;
    try {
      locations = await this.deps.pickLocations(city, this.settings.difficulty, this.settings.rounds, this.playedLocations);
    } catch (error) {
      if (this.disposed || nonce !== this.startNonce) return;
      this.rematchBy = null;
      this.setPhase('waiting', null);
      this.emitEvent('gameStartFailed', null);
      throw error instanceof GameError
        ? error
        : new GameError('LOCATIONS_UNAVAILABLE', `Impossible de charger des lieux pour ${city.name} : ${(error as Error).message}`);
    }
    if (this.disposed || nonce !== this.startNonce || (this.phase as RoomPhase) !== 'starting') return;

    const total = locations.length;
    this.rounds = locations.map((loc, index) => ({
      id: randomUUID(),
      index,
      cityId: city.id,
      zoneName: loc.zoneName,
      provider: loc.provider,
      panoId: loc.panoId,
      location: loc.location,
      multiplier: this.settings.doubleFinal && index === total - 1 ? 2 : 1,
      introStartsAt: 0,
      introEndsAt: 0,
      exploreStartedAt: null,
      exploreEndsAt: 0,
      guessEndsAt: null,
      panoReady: new Set(),
      guesses: new Map(),
      revealStartsAt: null,
      resultsStartsAt: null,
      standings: null,
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
    this.rematchBy = null;
    round.introStartsAt = now;
    round.introEndsAt = now + TIMINGS.intro.totalMs;
    round.exploreStartedAt = null;
    round.exploreEndsAt = round.introEndsAt + this.settings.exploreSeconds * 1000;
    round.guessEndsAt = null;
    round.panoReady.clear();
    this.setPhase('round', round.exploreEndsAt);
    this.emitEvent('roundStarted', null);
    this.schedule(round.introEndsAt - now, () => this.tryStartExploration());
  }

  /** A player's street view is loaded for the current round. */
  panoReady(playerId: string): void {
    const player = this.requirePlayer(playerId);
    const round = this.currentRound;
    if (!round || this.phase !== 'round') return;
    if (round.panoReady.has(player.id)) return;
    round.panoReady.add(player.id);
    if (round.exploreStartedAt === null && this.deps.clock.now() >= round.introEndsAt) this.tryStartExploration();
    else this.notify();
  }

  /**
   * Starts the exploration timer once every connected player has their street view,
   * or once the maximum wait has elapsed. Until then the deadline is pushed back.
   */
  private tryStartExploration(): void {
    const round = this.currentRound;
    if (!round || this.phase !== 'round' || round.exploreStartedAt !== null) return;
    const now = this.deps.clock.now();
    if (now < round.introEndsAt) return;
    const connected = this.connectedPlayers();
    const everyoneReady = connected.every((p) => round.panoReady.has(p.id));
    const waitedMax = now >= round.introEndsAt + TIMINGS.panoReadyMaxWaitMs;
    if (everyoneReady || waitedMax) {
      round.exploreStartedAt = now;
      round.exploreEndsAt = now + this.settings.exploreSeconds * 1000;
      this.phaseEndsAt = round.exploreEndsAt;
      this.schedule(round.exploreEndsAt - now, () => this.beginGuessing());
      this.notify();
      return;
    }
    round.exploreEndsAt = now + this.settings.exploreSeconds * 1000;
    this.phaseEndsAt = round.exploreEndsAt;
    this.schedule(Math.min(500, round.introEndsAt + TIMINGS.panoReadyMaxWaitMs - now), () => this.tryStartExploration());
    this.notify();
  }

  private beginGuessing(): void {
    const round = this.currentRound;
    if (!round || this.phase !== 'round') return;
    const now = this.deps.clock.now();
    round.guessEndsAt = now + TIMINGS.guessMs;
    this.setPhase('guessing', round.guessEndsAt);
    this.schedule(TIMINGS.guessMs, () => this.reveal());
  }

  submitGuess(playerId: string, position: LatLng): GuessResult {
    const player = this.requirePlayer(playerId);
    const round = this.currentRound;
    if (!round || (this.phase !== 'round' && this.phase !== 'guessing')) {
      throw new GameError('TOO_LATE', 'Trop tard, la manche est terminée.');
    }
    if (round.guesses.has(player.id)) throw new GameError('ALREADY_GUESSED', 'Ton guess est déjà verrouillé');
    if (!isValidLatLng(position)) throw new GameError('INVALID_INPUT', 'Le guess doit être une coordonnée valide');
    const guess = this.recordGuess(round, player, position, false);
    this.emitEvent('guessLocked', player);
    if (!this.checkAllGuessed()) this.notify();
    return guess;
  }

  private recordGuess(round: RoundState, player: PlayerState, position: LatLng, auto: boolean): GuessResult {
    const now = this.deps.clock.now();
    const distanceMeters = distanceBetween(round.location, position);
    const breakdown = calculateScore(distanceMeters, round.multiplier);
    const guess: GuessResult = {
      playerId: player.id,
      position: { lat: position.lat, lng: position.lng },
      distanceMeters,
      submittedAt: now,
      timeMs: Math.max(0, now - (round.exploreStartedAt ?? round.introEndsAt)),
      auto,
      ...breakdown,
    };
    round.guesses.set(player.id, guess);
    this.deps.hooks?.guessSubmitted?.(this, round, guess);
    return guess;
  }

  /** Reveals immediately when every connected player has guessed. Returns true if it did. */
  private checkAllGuessed(): boolean {
    const round = this.currentRound;
    if (!round || (this.phase !== 'round' && this.phase !== 'guessing')) return false;
    const connected = this.connectedPlayers();
    if (connected.length === 0 || round.guesses.size === 0) return false;
    if (connected.every((p) => round.guesses.has(p.id))) {
      this.reveal();
      return true;
    }
    return false;
  }

  private reveal(): void {
    const round = this.currentRound;
    if (!round || (this.phase !== 'round' && this.phase !== 'guessing')) return;
    const now = this.deps.clock.now();
    const city = getCity(round.cityId);
    const active = this.activePlayers();

    // Players who ran out of time (or dropped) get an automatic guess at the city centre.
    for (const player of active) {
      if (!round.guesses.has(player.id) && city) this.recordGuess(round, player, city.center, true);
    }

    const before = rankPlayers(active.map((p) => ({ id: p.id, totalScore: p.totalScore, totalDistanceMeters: p.totalDistanceMeters })));
    const previousRank = new Map(before.map((e) => [e.playerId, e.rank]));
    const previousStreak = new Map(active.map((p) => [p.id, p.streak]));
    const bestOfRound = Math.max(0, ...[...round.guesses.values()].map((g) => g.total));

    for (const player of active) {
      const guess = round.guesses.get(player.id);
      if (!guess) {
        player.totalDistanceMeters += MISSED_ROUND_DISTANCE_M;
        player.streak = 0;
        continue;
      }
      player.totalScore += guess.total;
      player.totalDistanceMeters += guess.distanceMeters;
      player.streak = guess.total > 0 && guess.total === bestOfRound ? player.streak + 1 : 0;
      player.maxStreak = Math.max(player.maxStreak, player.streak);
      player.bestRoundPoints = Math.max(player.bestRoundPoints, guess.total);
      if (!guess.auto && (player.bestGuessMeters === null || guess.distanceMeters < player.bestGuessMeters)) {
        player.bestGuessMeters = guess.distanceMeters;
      }
    }

    const after = rankPlayers(active.map((p) => ({ id: p.id, totalScore: p.totalScore, totalDistanceMeters: p.totalDistanceMeters })));
    const leaderScore = after[0]?.totalScore ?? 0;
    round.standings = after.map((entry) => {
      const player = this.players.get(entry.playerId);
      return {
        playerId: entry.playerId,
        rank: entry.rank,
        previousRank: round.index === 0 ? null : (previousRank.get(entry.playerId) ?? null),
        totalScore: entry.totalScore,
        roundPoints: round.guesses.get(entry.playerId)?.total ?? 0,
        streak: player?.streak ?? 0,
        previousStreak: previousStreak.get(entry.playerId) ?? 0,
        gapToLeader: leaderScore - entry.totalScore,
      };
    });

    round.revealStartsAt = now + TIMINGS.revealAlignMs;
    this.playedLocations.push(round.location);
    this.deps.hooks?.roundRevealed?.(this, round);
    this.setPhase('revealing', round.revealStartsAt + revealDurationMs(round.guesses.size));
    this.emitEvent('roundRevealed', null);
    this.schedule((this.phaseEndsAt ?? now) - now, () => this.showResults());
  }

  private showResults(): void {
    const round = this.currentRound;
    if (!round || this.phase !== 'revealing') return;
    const now = this.deps.clock.now();
    const duration = resultsDurationMs(round.standings?.length ?? this.activePlayers().length);
    round.resultsStartsAt = now;
    this.setPhase('results', now + duration);
    this.schedule(duration, () => this.advance());
  }

  private advance(): void {
    if (this.phase !== 'results') return;
    if (this.currentRoundIndex + 1 < this.rounds.length) this.startRound(this.currentRoundIndex + 1);
    else this.finishGame();
  }

  nextRound(playerId: string): void {
    this.requireHost(playerId);
    if (this.phase !== 'results') throw new GameError('BAD_PHASE', 'Attends la fin de la révélation');
    this.advance();
  }

  private finishGame(): void {
    const active = this.activePlayers();
    const ranking = rankPlayers(active.map((p) => ({ id: p.id, totalScore: p.totalScore, totalDistanceMeters: p.totalDistanceMeters })));
    const stats: PlayerStats[] = active.map((p) => ({
      playerId: p.id,
      bestGuessMeters: p.bestGuessMeters,
      bestRoundPoints: p.bestRoundPoints,
      maxStreak: p.maxStreak,
    }));
    const final: FinalResults = { ranking, winnerIds: winnersOf(ranking), stats, highlights: this.computeHighlights(), startsAt: this.deps.clock.now() };
    this.final = final;
    this.setPhase('finished', null);
    this.deps.hooks?.gameFinished?.(this, final);
    this.emitEvent('gameFinished', null);
  }

  private computeHighlights(): GameHighlights {
    let closest: GameHighlights['closest'] = null;
    let fastest: GameHighlights['fastest'] = null;
    for (const round of this.rounds) {
      if (round.revealStartsAt === null) continue;
      for (const guess of round.guesses.values()) {
        if (guess.auto || !this.players.get(guess.playerId) || this.players.get(guess.playerId)?.left) continue;
        if (!closest || guess.distanceMeters < closest.distanceMeters) {
          closest = { playerId: guess.playerId, distanceMeters: guess.distanceMeters, roundNumber: round.index + 1 };
        }
        if (!fastest || guess.timeMs < fastest.timeMs) fastest = { playerId: guess.playerId, timeMs: guess.timeMs, roundNumber: round.index + 1 };
      }
    }
    let streak: GameHighlights['streak'] = null;
    for (const p of this.activePlayers()) {
      if (p.maxStreak >= 2 && (!streak || p.maxStreak > streak.length)) streak = { playerId: p.id, length: p.maxStreak };
    }
    return { closest, fastest, streak };
  }

  /**
   * Rematch: same room, same players, new locations.
   * `newCity` sends everyone back to the lobby so the host can pick a city;
   * otherwise the next game starts right away after a short beat.
   */
  async rematch(playerId: string, newCity: boolean): Promise<void> {
    const host = this.requireHost(playerId);
    if (this.phase !== 'finished') throw new GameError('BAD_PHASE', 'La partie n’est pas finie');
    for (const [id, p] of this.players) if (p.left) this.players.delete(id);
    if (newCity) {
      this.final = null;
      this.rounds = [];
      this.currentRoundIndex = -1;
      this.rematchBy = null;
      this.setPhase('waiting', null);
      this.emitEvent('newCityRequested', host);
      return;
    }
    this.rematchBy = host.name;
    this.emitEvent('rematchRequested', host);
    await this.launch(TIMINGS.rematchDelayMs);
  }

  // ───────────────────────────── host transfer & removal ─────────────────────────────

  private scheduleHostGrace(): void {
    this.cancelHostGrace();
    this.hostGraceTimer = this.deps.clock.setTimeout(() => {
      this.hostGraceTimer = null;
      const host = this.players.get(this.hostId);
      if (host && !host.connected) this.transferHost();
      this.notify();
    }, TIMINGS.hostGraceMs);
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

  private scheduleRemoval(player: PlayerState): void {
    this.cancelRemoval(player.id);
    this.removalTimers.set(
      player.id,
      this.deps.clock.setTimeout(() => {
        this.removalTimers.delete(player.id);
        const current = this.players.get(player.id);
        if (current && !current.connected && !current.left) this.removePlayer(current);
      }, TIMINGS.disconnectRemoveMs),
    );
  }

  private cancelRemoval(playerId: string): void {
    const timer = this.removalTimers.get(playerId);
    if (timer) {
      this.deps.clock.clearTimeout(timer);
      this.removalTimers.delete(playerId);
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
        panoReady: round ? round.panoReady.has(p.id) : false,
      }));

    let roundPublic: RoundPublic | null = null;
    if (round && this.phase !== 'waiting' && this.phase !== 'starting') {
      roundPublic = {
        index: round.index,
        number: round.index + 1,
        total: this.rounds.length,
        isLast: round.index === this.rounds.length - 1,
        multiplier: round.multiplier,
        cityId: round.cityId,
        provider: round.provider,
        panoId: round.panoId,
        introStartsAt: round.introStartsAt,
        introEndsAt: round.introEndsAt,
        exploreEndsAt: round.exploreEndsAt,
        guessEndsAt: round.guessEndsAt,
        reveal:
          revealed && round.revealStartsAt !== null && round.standings
            ? {
                location: { ...round.location },
                results: [...round.guesses.values()]
                  .map((g) => ({ ...g, position: { ...g.position } }))
                  .sort((a, b) => a.distanceMeters - b.distanceMeters),
                standings: round.standings.map((s) => ({ ...s })),
                revealStartsAt: round.revealStartsAt,
                resultsStartsAt: round.resultsStartsAt,
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
      phaseStartedAt: this.phaseStartedAt,
      serverNow: this.deps.clock.now(),
      yourGuess: ownGuess ? { ...ownGuess.position } : null,
      final: this.final,
      rematchBy: this.rematchBy,
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
    for (const id of [...this.removalTimers.keys()]) this.cancelRemoval(id);
  }

  // ───────────────────────────── internals ─────────────────────────────

  private setPhase(phase: RoomPhase, endsAt: number | null): void {
    this.clearPhaseTimer();
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    this.phaseStartedAt = this.deps.clock.now();
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
    if (!player || player.left) throw new GameError('NOT_IN_ROOM', 'Tu n’es pas dans cette room');
    return player;
  }

  private requireHost(playerId: string): PlayerState {
    const player = this.requirePlayer(playerId);
    if (player.id !== this.hostId) throw new GameError('NOT_HOST', 'Seul l’hôte peut faire ça');
    return player;
  }

  private assertAlive(): void {
    if (this.disposed) throw new GameError('ROOM_NOT_FOUND', 'Cette room est fermée');
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

export { CITIES };
