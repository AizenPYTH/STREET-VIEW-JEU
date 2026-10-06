import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { offsetLatLng, TIMINGS, resultsDurationMs, revealDurationMs } from '@cityguess/shared';
import { runMigrations } from './migrate.js';
import { PostgresPersistence } from './postgres.js';
import { FakeClock } from '../game/clock.js';
import { GameRoom } from '../game/GameRoom.js';
import { deterministicPicker } from '../game/testUtils.js';
import type { ResolvedLocation } from '../game/locations.js';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('PostgresPersistence (requires TEST_DATABASE_URL)', () => {
  let pool: pg.Pool;
  let persistence: PostgresPersistence;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query('drop schema public cascade; create schema public;');
    const applied = await runMigrations(url as string, false);
    expect(applied).toContain('001_init.sql');
    expect(await runMigrations(url as string, false)).toEqual([]);
    persistence = new PostgresPersistence(url as string, false);
    await persistence.init();
  });

  afterAll(async () => {
    await persistence.close();
    await pool.end();
  });

  it('records rooms, players, games, rounds, guesses and final standings', async () => {
    const clock = new FakeClock();
    const picked = { pickerCalls: [], locations: [] as ResolvedLocation[] };
    const room = new GameRoom('TESTR', {
      clock,
      pickLocations: deterministicPicker(picked),
      onStateChanged: () => {},
      onEvent: () => {},
      onEmpty: () => {},
      hooks: persistence,
    });
    const alex = room.addPlayer('token-alex-xxxxxxxxxxxxxxxx', 'Alex', 'diamond');
    const yass = room.addPlayer('token-yass-xxxxxxxxxxxxxxxx', 'Yass', 'circle');
    room.setReady(alex.id, true);
    room.setReady(yass.id, true);
    room.updateSettings(alex.id, { rounds: 3, cityId: 'paris' });
    await room.startGame(alex.id);
    clock.advance(TIMINGS.startingLogoMs);
    for (let r = 0; r < 3; r++) {
      room.panoReady(alex.id);
      room.panoReady(yass.id);
      clock.advance(TIMINGS.intro.totalMs);
      const real = picked.locations[r]!.location;
      room.submitGuess(alex.id, offsetLatLng(real, 10, 0));
      if (r < 2) room.submitGuess(yass.id, offsetLatLng(real, 900, 1));
      else clock.advance(30_000 + TIMINGS.guessMs);
      clock.advance(TIMINGS.revealAlignMs + revealDurationMs(2) + resultsDurationMs(2));
    }
    expect(room.phase).toBe('finished');
    persistence.roomClosed(room);
    await persistence.flush();

    const rooms = await pool.query('select code, closed_at from rooms where id = $1', [room.id]);
    expect(rooms.rows[0]?.code).toBe('TESTR');
    expect(rooms.rows[0]?.closed_at).not.toBeNull();

    const players = await pool.query('select name, color from players where room_id = $1 order by joined_at', [room.id]);
    expect(players.rows.map((r) => r.name)).toEqual(['Alex', 'Yass']);

    const games = await pool.query('select number, city_id, settings, finished_at, winner_player_id from games where room_id = $1', [room.id]);
    expect(games.rows[0]?.number).toBe(1);
    expect(games.rows[0]?.city_id).toBe('paris');
    expect(games.rows[0]?.settings.rounds).toBe(3);
    expect(games.rows[0]?.finished_at).not.toBeNull();
    expect(games.rows[0]?.winner_player_id).toBe(alex.id);

    const rounds = await pool.query('select index, pano_id, lat, lng, multiplier, revealed_at from rounds where game_id = $1 order by index', [room.gameId]);
    expect(rounds.rows).toHaveLength(3);
    expect(rounds.rows[0]?.lat).toBeCloseTo(picked.locations[0]!.location.lat, 6);
    expect(rounds.rows.map((r) => r.multiplier)).toEqual([1, 1, 2]);
    expect(rounds.rows.every((r) => r.revealed_at !== null)).toBe(true);

    const guesses = await pool.query('select count(*)::int as n, count(*) filter (where auto)::int as auto_n from guesses g join rounds r on r.id = g.round_id where r.game_id = $1', [room.gameId]);
    expect(guesses.rows[0]?.n).toBe(6);
    expect(guesses.rows[0]?.auto_n).toBe(1);

    const standings = await pool.query('select player_id, total_score, rank from game_players where game_id = $1 order by rank', [room.gameId]);
    expect(standings.rows[0]?.player_id).toBe(alex.id);
    expect(standings.rows[0]?.total_score).toBe(1093 + 1093 + 2086); // 10 m guesses: 993 (+100), last round doubled
    expect(standings.rows[1]?.rank).toBe(2);

    const cities = await pool.query('select count(*)::int as n from cities');
    expect(cities.rows[0]?.n).toBeGreaterThanOrEqual(11);
  });

  it('row level security blocks non‑service roles', async () => {
    await pool.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'cg_anon') then create role cg_anon nologin; end if; end $$;");
    await pool.query('grant usage on schema public to cg_anon; grant select on all tables in schema public to cg_anon;');
    const client = await pool.connect();
    try {
      await client.query('set role cg_anon');
      const hidden = await client.query('select count(*)::int as n from rounds');
      expect(hidden.rows[0]?.n).toBe(0);
      const guesses = await client.query('select count(*)::int as n from guesses');
      expect(guesses.rows[0]?.n).toBe(0);
      const cities = await client.query('select count(*)::int as n from cities');
      expect(cities.rows[0]?.n).toBeGreaterThan(0);
    } finally {
      await client.query('reset role');
      client.release();
    }
  });
});
