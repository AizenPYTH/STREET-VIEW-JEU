import pg from 'pg';
import { CITIES, type FinalResults, type GuessResult } from '@cityguess/shared';
import type { GameRoom, PlayerState, RoundState } from '../game/GameRoom.js';
import type { Persistence } from './types.js';
import { log } from '../log.js';

/**
 * Write‑through persistence of game records (rooms, players, games, rounds, guesses).
 * The in‑memory engine remains the source of truth for live games; every write here is
 * fire‑and‑forget and can never block or break gameplay.
 */
export class PostgresPersistence implements Persistence {
  private readonly pool: pg.Pool;
  private queue: Promise<void> = Promise.resolve();

  constructor(connectionString: string, ssl: boolean) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    this.pool.on('error', (error) => log.error('postgres pool error', { message: error.message }));
  }

  async init(): Promise<void> {
    await this.pool.query('select 1');
    await this.pool.query(
      `insert into cities (id, name, country, country_code, center_lat, center_lng)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[])
       on conflict (id) do update set name = excluded.name, country = excluded.country,
         country_code = excluded.country_code, center_lat = excluded.center_lat, center_lng = excluded.center_lng`,
      [
        CITIES.map((c) => c.id),
        CITIES.map((c) => c.name),
        CITIES.map((c) => c.country),
        CITIES.map((c) => c.countryCode),
        CITIES.map((c) => c.center.lat),
        CITIES.map((c) => c.center.lng),
      ],
    );
  }

  /** Serialises writes so rows are inserted in causal order. */
  private enqueue(label: string, fn: () => Promise<void>): void {
    this.queue = this.queue.then(fn).catch((error: unknown) => {
      log.error(`persistence: ${label} failed`, { message: error instanceof Error ? error.message : String(error) });
    });
  }

  roomCreated(room: GameRoom): void {
    this.enqueue('roomCreated', async () => {
      await this.pool.query('insert into rooms (id, code, created_at) values ($1, $2, to_timestamp($3 / 1000.0))', [
        room.id,
        room.code,
        room.createdAt,
      ]);
    });
  }

  playerJoined(room: GameRoom, player: PlayerState): void {
    this.enqueue('playerJoined', async () => {
      await this.pool.query(
        `insert into players (id, room_id, name, avatar, color, joined_at)
         values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0)) on conflict (id) do nothing`,
        [player.id, room.id, player.name, player.avatar, player.color, player.joinedAt],
      );
    });
  }

  gameStarted(room: GameRoom): void {
    const gameId = room.gameId;
    if (!gameId) return;
    const rounds = room.rounds.map((r) => ({ ...r }));
    const settings = { ...room.settings };
    const number = room.gameNumber;
    const players = room.activePlayers().map((p) => p.id);
    this.enqueue('gameStarted', async () => {
      await this.pool.query(
        `insert into games (id, room_id, number, city_id, settings, started_at)
         values ($1, $2, $3, $4, $5, now())`,
        [gameId, room.id, number, settings.cityId, JSON.stringify(settings)],
      );
      for (const r of rounds) {
        await this.pool.query(
          `insert into rounds (id, game_id, index, city_id, zone_name, provider, pano_id, lat, lng, multiplier)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [r.id, gameId, r.index, r.cityId, r.zoneName, r.provider, r.panoId, r.location.lat, r.location.lng, r.multiplier],
        );
      }
      for (const playerId of players) {
        await this.pool.query(
          `insert into game_players (game_id, player_id, total_score) values ($1, $2, 0) on conflict do nothing`,
          [gameId, playerId],
        );
      }
    });
  }

  guessSubmitted(_room: GameRoom, round: RoundState, guess: GuessResult): void {
    const roundId = round.id;
    this.enqueue('guessSubmitted', async () => {
      await this.pool.query(
        `insert into guesses (round_id, player_id, lat, lng, distance_m, score, bonus, time_ms, auto, submitted_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))
         on conflict (round_id, player_id) do nothing`,
        [roundId, guess.playerId, guess.position.lat, guess.position.lng, guess.distanceMeters, guess.base, guess.bonus, guess.timeMs, guess.auto, guess.submittedAt],
      );
    });
  }

  roundRevealed(room: GameRoom, round: RoundState): void {
    const roundId = round.id;
    const gameId = room.gameId;
    const totals = room.activePlayers().map((p) => ({ id: p.id, totalScore: p.totalScore }));
    this.enqueue('roundRevealed', async () => {
      await this.pool.query(
        'update rounds set explore_ends_at = to_timestamp($2 / 1000.0), revealed_at = to_timestamp($3 / 1000.0) where id = $1',
        [roundId, round.exploreEndsAt, round.revealStartsAt ?? Date.now()],
      );
      if (!gameId) return;
      for (const t of totals) {
        await this.pool.query('update game_players set total_score = $3 where game_id = $1 and player_id = $2', [
          gameId,
          t.id,
          t.totalScore,
        ]);
      }
    });
  }

  gameFinished(room: GameRoom, final: FinalResults): void {
    const gameId = room.gameId;
    if (!gameId) return;
    this.enqueue('gameFinished', async () => {
      await this.pool.query('update games set finished_at = now(), winner_player_id = $2 where id = $1', [
        gameId,
        final.winnerIds[0] ?? null,
      ]);
      for (const entry of final.ranking) {
        await this.pool.query(
          'update game_players set total_score = $3, rank = $4, total_distance_m = $5 where game_id = $1 and player_id = $2',
          [gameId, entry.playerId, entry.totalScore, entry.rank, entry.totalDistanceMeters],
        );
      }
    });
  }

  roomClosed(room: GameRoom): void {
    this.enqueue('roomClosed', async () => {
      await this.pool.query('update rooms set closed_at = now() where id = $1', [room.id]);
    });
  }

  /** Waits for queued writes (tests) then closes the pool. */
  async close(): Promise<void> {
    await this.queue;
    await this.pool.end();
  }

  /** Test helper: wait until every queued write has been applied. */
  async flush(): Promise<void> {
    await this.queue;
  }
}
