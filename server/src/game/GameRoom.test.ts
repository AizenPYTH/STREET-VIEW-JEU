import { describe, expect, it } from 'vitest';
import {
  GUESS_SECONDS,
  RESULTS_SECONDS,
  REVEAL_SECONDS,
  ROUND_INTRO_SECONDS,
  calculateScore,
  distanceBetween,
  offsetLatLng,
  requireCity,
  scoringForScale,
} from '@cityguess/shared';
import { GameError } from './errors.js';
import { addPlayers, createHarness, eventTypes, startAndEnterRound } from './testUtils.js';

const INTRO = ROUND_INTRO_SECONDS * 1000;

describe('lobby', () => {
  it('first player becomes host, colours are unique', () => {
    const h = createHarness();
    const [a, b, c] = addPlayers(h, ['Alex', 'Yass', 'Sam']);
    expect(a?.isHost).toBe(true);
    expect(b?.isHost).toBe(false);
    expect(h.room.hostId).toBe(a?.id);
    expect(new Set([a?.color, b?.color, c?.color]).size).toBe(3);
    expect(h.room.phase).toBe('waiting');
    expect(eventTypes(h)).toEqual(['playerJoined', 'playerJoined', 'playerJoined']);
  });

  it('rejects an 9th player, duplicate names and invalid names', () => {
    const h = createHarness();
    addPlayers(h, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    expect(() => h.room.addPlayer('token-9-xxxxxxxxxxxxxxxxxx', 'P9', 'fox')).toThrowError(/full/);
    const h2 = createHarness();
    addPlayers(h2, ['Alex']);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', 'alex', 'fox')).toThrow(GameError);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', '   ', 'fox')).toThrow(/Name/);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', 'x'.repeat(17), 'fox')).toThrow(/Name/);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', 'Bob', 'not-an-avatar')).toThrow(/avatar/);
  });

  it('re-adding the same token returns the same player (idempotent join)', () => {
    const h = createHarness();
    const [a] = addPlayers(h, ['Alex']);
    const again = h.room.addPlayer(a!.token, 'Whatever', 'fox');
    expect(again.id).toBe(a?.id);
    expect(h.room.players.size).toBe(1);
  });

  it('only the host can change settings, and they are validated', () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    h.room.updateSettings(host!.id, { cityId: 'paris', rounds: 3, exploreSeconds: 15, difficulty: 'hard' });
    expect(h.room.settings).toEqual({ cityId: 'paris', rounds: 3, exploreSeconds: 15, difficulty: 'hard' });
    expect(() => h.room.updateSettings(guest!.id, { rounds: 5 })).toThrow(/host/);
    expect(() => h.room.updateSettings(host!.id, { cityId: 'atlantis' })).toThrow(/city/);
    expect(() => h.room.updateSettings(host!.id, { rounds: 4 as never })).toThrow(/rounds/);
    expect(() => h.room.updateSettings(host!.id, { exploreSeconds: 20 as never })).toThrow(/timer/);
  });

  it('ready toggles only in the lobby', () => {
    const h = createHarness();
    const [host] = addPlayers(h, ['Host']);
    h.room.toggleReady(host!.id);
    expect(h.room.players.get(host!.id)?.isReady).toBe(true);
    h.room.toggleReady(host!.id);
    expect(h.room.players.get(host!.id)?.isReady).toBe(false);
  });

  it('host leaving the lobby transfers host to the next player; last player leaving empties the room', () => {
    const h = createHarness();
    const [a, b, c] = addPlayers(h, ['A', 'B', 'C']);
    h.room.leave(a!.id);
    expect(h.room.players.has(a!.id)).toBe(false);
    expect(h.room.hostId).toBe(b?.id);
    expect(h.room.players.get(b!.id)?.isHost).toBe(true);
    h.room.leave(b!.id);
    expect(h.room.hostId).toBe(c?.id);
    expect(h.emptied).toBe(false);
    h.room.leave(c!.id);
    expect(h.emptied).toBe(true);
  });
});

describe('game flow', () => {
  it('runs a complete 4‑player game with server‑side scoring and a winner', async () => {
    const h = createHarness();
    const [alex, yass, sam, adam] = addPlayers(h, ['Alex', 'Yass', 'Sam', 'Adam']);
    h.room.updateSettings(alex!.id, { rounds: 3, exploreSeconds: 30 });

    const start = h.room.startGame(alex!.id);
    expect(h.room.phase).toBe('starting');
    await start;
    expect(h.room.rounds).toHaveLength(3);
    expect(h.pickerCalls[0]?.count).toBe(3);
    expect(h.pickerCalls[0]?.city.id).toBe('marseille');

    h.clock.advance(3000);
    expect(h.room.phase).toBe('round');
    expect(h.room.currentRoundIndex).toBe(0);
    const round = h.room.currentRound!;
    expect(round.exploreEndsAt - round.introEndsAt).toBe(30_000);
    expect(h.room.phaseEndsAt).toBe(round.exploreEndsAt);

    // Exploration ends → guessing
    h.clock.advance(INTRO + 30_000);
    expect(h.room.phase).toBe('guessing');
    expect(h.room.currentRound?.guessEndsAt).toBe(h.clock.now() + GUESS_SECONDS * 1000);

    const real = h.locations[0]!.location;
    const scoring = scoringForScale(requireCity('marseille').scoreScaleMeters);
    const guesses = [
      [alex, offsetLatLng(real, 10, 0)],
      [yass, offsetLatLng(real, 400, 1)],
      [sam, offsetLatLng(real, 1500, 2)],
      [adam, offsetLatLng(real, 4000, 3)],
    ] as const;
    for (const [p, pos] of guesses.slice(0, 3)) h.room.submitGuess(p!.id, pos);
    expect(h.room.phase).toBe('guessing');
    h.room.submitGuess(adam!.id, guesses[3][1]);
    // Everyone guessed → immediate reveal
    expect(h.room.phase).toBe('revealing');

    const reveal = h.room.snapshotFor(alex!.id).round?.reveal;
    expect(reveal?.location).toEqual(real);
    expect(reveal?.results).toHaveLength(4);
    for (const [p, pos] of guesses) {
      const result = reveal?.results.find((r) => r.playerId === p!.id);
      const expected = calculateScore(distanceBetween(real, pos), scoring);
      expect(result?.total).toBe(expected.total);
      expect(h.room.players.get(p!.id)?.totalScore).toBe(expected.total);
    }
    expect(reveal?.results[0]?.playerId).toBe(alex?.id);
    expect(reveal?.results[0]?.bonusLabel).toBe('perfect');

    h.clock.advance(REVEAL_SECONDS * 1000);
    expect(h.room.phase).toBe('results');
    h.clock.advance(RESULTS_SECONDS * 1000);
    expect(h.room.phase).toBe('round');
    expect(h.room.currentRoundIndex).toBe(1);
    expect(h.room.snapshotFor(alex!.id).players.every((p) => !p.hasGuessed)).toBe(true);

    // Round 2: nobody guesses in time → everyone 0, game continues
    h.clock.advance(INTRO + 30_000 + GUESS_SECONDS * 1000);
    expect(h.room.phase).toBe('revealing');
    expect(h.room.snapshotFor(alex!.id).round?.reveal?.results).toEqual([]);

    // Host skips the results countdown
    h.clock.advance(REVEAL_SECONDS * 1000);
    expect(() => h.room.nextRound(yass!.id)).toThrow(/host/);
    h.room.nextRound(alex!.id);
    expect(h.room.currentRoundIndex).toBe(2);

    // Round 3: only Adam guesses, 5 m away (perfect)
    h.clock.advance(INTRO + 30_000);
    const real3 = h.locations[2]!.location;
    h.room.submitGuess(adam!.id, offsetLatLng(real3, 5, 0));
    expect(h.room.phase).toBe('guessing');
    h.clock.advance(GUESS_SECONDS * 1000);
    expect(h.room.phase).toBe('revealing');
    h.clock.advance(REVEAL_SECONDS * 1000 + RESULTS_SECONDS * 1000);

    expect(h.room.phase).toBe('finished');
    const final = h.room.snapshotFor(sam!.id).final!;
    expect(final.ranking).toHaveLength(4);
    expect(final.ranking[0]?.rank).toBe(1);
    const scores = new Map(final.ranking.map((e) => [e.playerId, e.totalScore]));
    expect(scores.get(alex!.id)).toBe(1100);
    const adamRound1 = calculateScore(distanceBetween(real, guesses[3][1]), scoring).total;
    expect(scores.get(adam!.id)).toBe(adamRound1 + 1100);
    expect(final.winnerIds).toEqual([adam?.id]);
    expect(final.ranking[0]?.playerId).toBe(adam?.id);
    expect(final.ranking[1]?.playerId).toBe(alex?.id);
    expect(final.highlights.bestGuess?.playerId).toBe(adam?.id);
    expect(final.highlights.bestGuess?.roundNumber).toBe(3);
    expect(final.highlights.perfectGuesses?.count).toBe(1);
    expect(eventTypes(h)).toContain('gameFinished');
  });

  it('works solo (1 player) and with 8 players', async () => {
    for (const count of [1, 8]) {
      const h = createHarness();
      const players = addPlayers(h, Array.from({ length: count }, (_, i) => `P${i + 1}`));
      h.room.updateSettings(players[0]!.id, { rounds: 3, exploreSeconds: 15 });
      await startAndEnterRound(h, players[0]!.id);
      for (let r = 0; r < 3; r++) {
        expect(h.room.phase).toBe('round');
        const real = h.locations[r]!.location;
        players.forEach((p, i) => h.room.submitGuess(p.id, offsetLatLng(real, 100 * i, i)));
        expect(h.room.phase).toBe('revealing');
        h.clock.advance(REVEAL_SECONDS * 1000 + RESULTS_SECONDS * 1000);
      }
      expect(h.room.phase).toBe('finished');
      expect(h.room.final?.ranking).toHaveLength(count);
      expect(h.room.final?.winnerIds).toEqual([players[0]?.id]);
    }
  });

  it('rejects guesses that are late, duplicate, invalid, or from the wrong phase', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    expect(() => h.room.submitGuess(host!.id, { lat: 0, lng: 0 })).toThrow(/Too late/);
    await startAndEnterRound(h, host!.id);
    expect(() => h.room.submitGuess(host!.id, { lat: 91, lng: 0 })).toThrow(/coordinate/);
    expect(() => h.room.submitGuess(host!.id, null as never)).toThrow(/coordinate/);
    h.room.submitGuess(host!.id, { lat: 43.3, lng: 5.37 });
    expect(() => h.room.submitGuess(host!.id, { lat: 43.3, lng: 5.37 })).toThrow(/already/);
    h.clock.advance(INTRO + 30_000 + GUESS_SECONDS * 1000);
    expect(h.room.phase).toBe('revealing');
    expect(() => h.room.submitGuess(guest!.id, { lat: 43.3, lng: 5.37 })).toThrow(/Too late/);
    expect(() => h.room.submitGuess('nobody', { lat: 43.3, lng: 5.37 })).toThrow(/not in this room/);
  });

  it('cannot start twice, needs the host, and nobody can join mid‑game', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    await expect(h.room.startGame(guest!.id)).rejects.toThrow(/host/);
    await h.room.startGame(host!.id);
    await expect(h.room.startGame(host!.id)).rejects.toThrow(/already started/);
    expect(() => h.room.addPlayer('token-late-xxxxxxxxxxxxxxxx', 'Late', 'fox')).toThrow(/in progress/);
  });

  it('falls back to the lobby when locations cannot be loaded', async () => {
    const h = createHarness({ failWith: new Error('metadata quota exceeded') });
    const [host] = addPlayers(h, ['Host']);
    await expect(h.room.startGame(host!.id)).rejects.toThrow(/metadata quota exceeded/);
    expect(h.room.phase).toBe('waiting');
    expect(eventTypes(h)).toContain('gameStartFailed');
  });

  it('starts round 1 immediately if locations arrive after the countdown', async () => {
    const h = createHarness();
    const [host] = addPlayers(h, ['Host']);
    const original = h.room['deps'].pickLocations;
    let release: () => void = () => {};
    h.room['deps'].pickLocations = (...args) =>
      new Promise((resolve) => {
        release = () => resolve(original(...args));
      });
    const starting = h.room.startGame(host!.id);
    h.clock.advance(5000);
    expect(h.room.phase).toBe('starting');
    release();
    await starting;
    expect(h.room.phase).toBe('round');
  });
});

describe('secrecy', () => {
  it('never exposes the location or other guesses before the reveal', async () => {
    const h = createHarness();
    const [a, b] = addPlayers(h, ['A', 'B']);
    await startAndEnterRound(h, a!.id);
    h.room.submitGuess(a!.id, { lat: 43.3, lng: 5.37 });

    const forA = h.room.snapshotFor(a!.id);
    const forB = h.room.snapshotFor(b!.id);
    expect(forA.round?.reveal).toBeNull();
    expect(forB.round?.reveal).toBeNull();
    expect(JSON.stringify(forB)).not.toContain(String(h.locations[0]!.location.lat));
    expect(JSON.stringify(forB)).not.toContain('43.3');
    expect(forA.yourGuess).toEqual({ lat: 43.3, lng: 5.37 });
    expect(forB.yourGuess).toBeNull();
    expect(forB.players.find((p) => p.id === a!.id)?.hasGuessed).toBe(true);
    expect(forB.players.find((p) => p.id === b!.id)?.hasGuessed).toBe(false);
    expect(forB.round?.panoId).toMatch(/^pano-/);

    h.room.submitGuess(b!.id, { lat: 43.31, lng: 5.38 });
    const revealed = h.room.snapshotFor(b!.id);
    expect(revealed.phase).toBe('revealing');
    expect(revealed.round?.reveal?.location).toEqual(h.locations[0]!.location);
    expect(revealed.round?.reveal?.results.map((r) => r.playerId).sort()).toEqual([a!.id, b!.id].sort());
  });

  it('does not expose round data in the lobby or during the countdown', async () => {
    const h = createHarness();
    const [a] = addPlayers(h, ['A']);
    expect(h.room.snapshotFor(a!.id).round).toBeNull();
    await h.room.startGame(a!.id);
    expect(h.room.snapshotFor(a!.id).round).toBeNull();
    expect(h.room.snapshotFor(a!.id).phase).toBe('starting');
  });
});

describe('connections', () => {
  it('reveals once the remaining connected players have guessed (after a grace period)', async () => {
    const h = createHarness();
    const [a, b, c] = addPlayers(h, ['A', 'B', 'C']);
    await startAndEnterRound(h, a!.id);
    h.room.submitGuess(a!.id, { lat: 43.3, lng: 5.37 });
    h.room.submitGuess(b!.id, { lat: 43.3, lng: 5.37 });
    h.room.markDisconnected(c!.id);
    expect(h.room.phase).toBe('round');
    h.clock.advance(4999);
    expect(h.room.phase).toBe('round');
    h.clock.advance(1);
    expect(h.room.phase).toBe('revealing');
    const snapshot = h.room.snapshotFor(a!.id);
    expect(snapshot.players.find((p) => p.id === c!.id)?.connected).toBe(false);
  });

  it('a quick reconnection cancels the early reveal and lets the player guess', async () => {
    const h = createHarness();
    const [a, b] = addPlayers(h, ['A', 'B']);
    await startAndEnterRound(h, a!.id);
    h.room.submitGuess(a!.id, { lat: 43.3, lng: 5.37 });
    h.room.markDisconnected(b!.id);
    h.clock.advance(2000);
    h.room.rejoin(b!.token);
    h.clock.advance(4000);
    expect(h.room.phase).toBe('round');
    expect(eventTypes(h)).toContain('playerReconnected');
    h.room.submitGuess(b!.id, { lat: 43.3, lng: 5.37 });
    expect(h.room.phase).toBe('revealing');
  });

  it('transfers host after the grace period, not before, and not if the host comes back', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    h.room.markDisconnected(host!.id);
    h.clock.advance(9000);
    expect(h.room.hostId).toBe(host?.id);
    h.room.rejoin(host!.token);
    h.clock.advance(5000);
    expect(h.room.hostId).toBe(host?.id);

    h.room.markDisconnected(host!.id);
    h.clock.advance(10_000);
    expect(h.room.hostId).toBe(guest?.id);
    expect(h.room.players.get(guest!.id)?.isHost).toBe(true);
    expect(h.room.players.get(host!.id)?.isHost).toBe(false);
    expect(eventTypes(h)).toContain('hostChanged');
    // The old host comes back as a regular player
    h.room.rejoin(host!.token);
    expect(h.room.hostId).toBe(guest?.id);
  });

  it('keeps the host when they are the only player', () => {
    const h = createHarness();
    const [host] = addPlayers(h, ['Host']);
    h.room.markDisconnected(host!.id);
    h.clock.advance(20_000);
    expect(h.room.hostId).toBe(host?.id);
    expect(h.room.isIdle(15 * 60_000)).toBe(false);
    h.clock.advance(15 * 60_000);
    expect(h.room.isIdle(15 * 60_000)).toBe(true);
  });

  it('a player leaving mid‑game is marked as gone, the game continues, and rematch drops them', async () => {
    const h = createHarness();
    const [host, guest, third] = addPlayers(h, ['Host', 'Guest', 'Third']);
    h.room.updateSettings(host!.id, { rounds: 3 });
    await startAndEnterRound(h, host!.id);
    h.room.leave(host!.id);
    expect(h.room.players.get(host!.id)?.left).toBe(true);
    expect(h.room.hostId).toBe(guest?.id);
    expect(h.room.phase).toBe('round');
    h.room.submitGuess(guest!.id, { lat: 43.3, lng: 5.37 });
    h.room.submitGuess(third!.id, { lat: 43.3, lng: 5.37 });
    expect(h.room.phase).toBe('revealing');
    expect(() => h.room.submitGuess(host!.id, { lat: 43.3, lng: 5.37 })).toThrow(/not in this room/);
    for (let r = 0; r < 3; r++) h.clock.advance(60_000 + REVEAL_SECONDS * 1000 + RESULTS_SECONDS * 1000);
    expect(h.room.phase).toBe('finished');
    expect(h.room.final?.ranking.map((e) => e.playerId)).not.toContain(host?.id);

    h.room.rematch(guest!.id, false);
    expect(h.room.phase).toBe('waiting');
    expect(h.room.players.has(host!.id)).toBe(false);
    expect(h.room.players.get(guest!.id)?.totalScore).toBe(0);
    expect(h.room.gameNumber).toBe(1);
  });

  it('the last active player leaving a running game empties the room', async () => {
    const h = createHarness();
    const [host] = addPlayers(h, ['Host']);
    await startAndEnterRound(h, host!.id);
    h.room.leave(host!.id);
    expect(h.emptied).toBe(true);
  });
});

describe('rematch', () => {
  it('resets scores, keeps players, can pick a new city, avoids previous locations', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    h.room.updateSettings(host!.id, { rounds: 3 });
    expect(() => h.room.rematch(host!.id, false)).toThrow(/not over/);
    await startAndEnterRound(h, host!.id);
    for (let r = 0; r < 3; r++) {
      h.room.submitGuess(host!.id, h.locations[r]!.location);
      h.room.submitGuess(guest!.id, offsetLatLng(h.locations[r]!.location, 2000, 1));
      h.clock.advance(REVEAL_SECONDS * 1000 + RESULTS_SECONDS * 1000);
    }
    expect(h.room.phase).toBe('finished');
    expect(h.room.players.get(host!.id)?.totalScore).toBe(3300);
    expect(() => h.room.rematch(guest!.id, true)).toThrow(/host/);

    const previousLocations = h.locations.map((l) => l.location);
    h.room.rematch(host!.id, true);
    expect(h.room.phase).toBe('waiting');
    expect(h.room.settings.cityId).not.toBe('marseille');
    expect(h.room.players.size).toBe(2);
    expect(h.room.players.get(host!.id)?.totalScore).toBe(0);
    expect(h.room.snapshotFor(host!.id).final).toBeNull();
    expect(h.room.snapshotFor(host!.id).round).toBeNull();

    await startAndEnterRound(h, host!.id);
    expect(h.room.gameNumber).toBe(2);
    expect(h.pickerCalls[1]?.exclude).toEqual(previousLocations);
  });
});
