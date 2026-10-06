import { describe, expect, it } from 'vitest';
import { TIMINGS, calculateScore, distanceBetween, offsetLatLng, requireCity, resultsDurationMs, revealDurationMs } from '@cityguess/shared';
import { GameError } from './errors.js';
import { addPlayers, createHarness, enterExploration, eventTypes, skipRevealAndResults, startAndEnterRound } from './testUtils.js';

const INTRO = TIMINGS.intro.totalMs;
const GUESS = TIMINGS.guessMs;

describe('lobby', () => {
  it('first player becomes host, avatars are unique and honour preferences when free', () => {
    const h = createHarness();
    const a = h.room.addPlayer('token-a-xxxxxxxxxxxxxxxxxx', 'Alex', 'circle');
    const b = h.room.addPlayer('token-b-xxxxxxxxxxxxxxxxxx', 'Yass', 'circle');
    const c = h.room.addPlayer('token-c-xxxxxxxxxxxxxxxxxx', 'Sam', 'nope');
    expect(a.isHost).toBe(true);
    expect(b.isHost).toBe(false);
    expect(a.avatar).toBe('circle');
    expect(b.avatar).toBe('diamond');
    expect(c.avatar).toBe('square');
    expect(new Set([a.color, b.color, c.color]).size).toBe(3);
    expect(h.room.phase).toBe('waiting');
    expect(eventTypes(h)).toEqual(['playerJoined', 'playerJoined', 'playerJoined']);
  });

  it('enforces capacity, 8 players max, duplicate names and name length', () => {
    const h = createHarness();
    const [host] = addPlayers(h, ['P1']);
    h.room.updateSettings(host!.id, { capacity: 2 });
    addPlayers(h, ['P2']);
    expect(() => h.room.addPlayer('token-3-xxxxxxxxxxxxxxxxxx', 'P3', 'diamond')).toThrowError(/déjà 2 joueurs/);
    expect(() => h.room.updateSettings(host!.id, { capacity: 1 as never })).toThrow(/Capacité/);
    h.room.updateSettings(host!.id, { capacity: 8 });
    addPlayers(h, ['P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    expect(() => h.room.addPlayer('token-9-xxxxxxxxxxxxxxxxxx', 'P9', 'diamond')).toThrow(GameError);
    expect(() => h.room.updateSettings(host!.id, { capacity: 4 })).toThrow(/déjà plus de joueurs/);

    const h2 = createHarness();
    addPlayers(h2, ['Alex']);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', 'alex', 'diamond')).toThrow(/déjà pris/);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', 'A', 'diamond')).toThrow(/pseudo/);
    expect(() => h2.room.addPlayer('token-other-xxxxxxxxxxxx', 'x'.repeat(13), 'diamond')).toThrow(/pseudo/);
  });

  it('re-adding the same token returns the same player (idempotent join)', () => {
    const h = createHarness();
    const [a] = addPlayers(h, ['Alex']);
    const again = h.room.addPlayer(a!.token, 'Whatever', 'diamond');
    expect(again.id).toBe(a?.id);
    expect(h.room.players.size).toBe(1);
  });

  it('only the host can change settings, and they are validated', () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    h.room.updateSettings(host!.id, { cityId: 'paris', rounds: 3, exploreSeconds: 15, difficulty: 'hard', doubleFinal: false });
    expect(h.room.settings).toMatchObject({ cityId: 'paris', rounds: 3, exploreSeconds: 15, difficulty: 'hard', doubleFinal: false });
    expect(() => h.room.updateSettings(guest!.id, { rounds: 5 })).toThrow(/hôte/);
    expect(() => h.room.updateSettings(host!.id, { cityId: 'atlantis' })).toThrow(/Ville/);
    expect(() => h.room.updateSettings(host!.id, { rounds: 4 as never })).toThrow(/manches/);
    expect(() => h.room.updateSettings(host!.id, { exploreSeconds: 20 as never })).toThrow(/Durée/);
  });

  it('the game cannot start until every connected player is ready', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest'], false);
    await expect(h.room.startGame(host!.id)).rejects.toThrow(/Host, Guest ne sont pas prêts/);
    h.room.setReady(host!.id, true);
    await expect(h.room.startGame(host!.id)).rejects.toThrow(/Guest n’est pas prêt/);
    h.room.markDisconnected(guest!.id);
    await h.room.startGame(host!.id);
    expect(h.room.phase).toBe('starting');
  });

  it('host leaving the lobby transfers host to the next player; last player leaving empties the room', () => {
    const h = createHarness();
    const [a, b, c] = addPlayers(h, ['Ana', 'Bob', 'Cat']);
    h.room.leave(a!.id);
    expect(h.room.players.has(a!.id)).toBe(false);
    expect(h.room.hostId).toBe(b?.id);
    h.room.leave(b!.id);
    expect(h.room.hostId).toBe(c?.id);
    expect(h.emptied).toBe(false);
    h.room.leave(c!.id);
    expect(h.emptied).toBe(true);
  });
});

describe('game flow', () => {
  it('runs a complete 4‑player game: scripted phases, server scoring, doubled last round, standings', async () => {
    const h = createHarness();
    const [alex, yass, sam, adam] = addPlayers(h, ['Alex', 'Yass', 'Sam', 'Adam']);
    h.room.updateSettings(alex!.id, { rounds: 3, exploreSeconds: 30 });

    const start = h.room.startGame(alex!.id);
    expect(h.room.phase).toBe('starting');
    expect(h.room.phaseEndsAt).toBe(h.clock.now() + TIMINGS.startingLogoMs);
    await start;
    expect(h.room.rounds).toHaveLength(3);
    expect(h.room.rounds.map((r) => r.multiplier)).toEqual([1, 1, 2]);
    expect(h.pickerCalls[0]?.city.id).toBe('marseille');

    h.clock.advance(TIMINGS.startingLogoMs);
    expect(h.room.phase).toBe('round');
    const round = h.room.currentRound!;
    expect(round.introEndsAt - round.introStartsAt).toBe(INTRO);
    expect(round.exploreStartedAt).toBeNull();

    // Everyone's street view loads during the intro → the timer starts exactly at the end of the intro.
    enterExploration(h);
    expect(round.exploreStartedAt).toBe(round.introEndsAt);
    expect(round.exploreEndsAt).toBe(round.introEndsAt + 30_000);
    expect(h.room.phaseEndsAt).toBe(round.exploreEndsAt);

    h.clock.advance(30_000);
    expect(h.room.phase).toBe('guessing');
    expect(round.guessEndsAt).toBe(h.clock.now() + GUESS);

    const real = h.locations[0]!.location;
    const guesses = [
      [alex, offsetLatLng(real, 10, 0)],
      [yass, offsetLatLng(real, 400, 1)],
      [sam, offsetLatLng(real, 1500, 2)],
      [adam, offsetLatLng(real, 4000, 3)],
    ] as const;
    for (const [p, pos] of guesses.slice(0, 3)) h.room.submitGuess(p!.id, pos);
    expect(h.room.phase).toBe('guessing');
    h.room.submitGuess(adam!.id, guesses[3][1]);
    expect(h.room.phase).toBe('revealing');
    expect(h.room.phaseEndsAt).toBe(h.clock.now() + TIMINGS.revealAlignMs + revealDurationMs(4));

    const reveal = h.room.snapshotFor(alex!.id).round?.reveal;
    expect(reveal?.location).toEqual(real);
    expect(reveal?.revealStartsAt).toBe(h.clock.now() + TIMINGS.revealAlignMs);
    expect(reveal?.resultsStartsAt).toBeNull();
    expect(reveal?.results.map((r) => r.playerId)).toEqual([alex!.id, yass!.id, sam!.id, adam!.id]);
    for (const [p, pos] of guesses) {
      const result = reveal?.results.find((r) => r.playerId === p!.id);
      const expected = calculateScore(distanceBetween(real, pos));
      expect(result?.total).toBe(expected.total);
      expect(result?.auto).toBe(false);
      expect(h.room.players.get(p!.id)?.totalScore).toBe(expected.total);
    }
    expect(reveal?.results[0]?.bonusLabel).toBe('perfect');
    const alexR1 = calculateScore(distanceBetween(real, guesses[0][1])).total;
    expect(alexR1).toBe(993 + 100);
    expect(reveal?.standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    expect(reveal?.standings[0]).toMatchObject({ playerId: alex!.id, previousRank: null, streak: 1, previousStreak: 0, gapToLeader: 0 });
    expect(reveal?.standings[1]?.gapToLeader).toBe(alexR1 - calculateScore(distanceBetween(real, guesses[1][1])).total);

    h.clock.advance(TIMINGS.revealAlignMs + revealDurationMs(4));
    expect(h.room.phase).toBe('results');
    expect(h.room.snapshotFor(alex!.id).round?.reveal?.resultsStartsAt).toBe(h.clock.now());
    expect(h.room.phaseEndsAt).toBe(h.clock.now() + resultsDurationMs(4));
    h.clock.advance(resultsDurationMs(4));
    expect(h.room.phase).toBe('round');
    expect(h.room.currentRoundIndex).toBe(1);
    expect(h.room.snapshotFor(alex!.id).players.every((p) => !p.hasGuessed && !p.panoReady)).toBe(true);

    // Round 2: nobody guesses in time → everyone gets an automatic guess at the city centre.
    enterExploration(h);
    h.clock.advance(30_000 + GUESS);
    expect(h.room.phase).toBe('revealing');
    const auto = h.room.snapshotFor(alex!.id).round?.reveal;
    expect(auto?.results).toHaveLength(4);
    expect(auto?.results.every((r) => r.auto)).toBe(true);
    const centre = requireCity('marseille').center;
    const autoScore = calculateScore(distanceBetween(h.locations[1]!.location, centre)).total;
    expect(auto?.results[0]?.total).toBe(autoScore);
    expect(auto?.standings.every((s) => s.roundPoints === autoScore)).toBe(true);
    // Everyone tied for best this round: Alex extends the streak from round 1, the others start one.
    expect(auto?.standings.find((s) => s.playerId === alex!.id)?.streak).toBe(2);
    expect(auto?.standings.filter((s) => s.playerId !== alex!.id).every((s) => s.streak === 1)).toBe(true);
    expect(auto?.standings[1]?.previousRank).toBe(2);

    h.clock.advance(TIMINGS.revealAlignMs + revealDurationMs(h.room.activePlayers().length));
    expect(() => h.room.nextRound(yass!.id)).toThrow(/hôte/);
    h.room.nextRound(alex!.id);
    expect(h.room.currentRoundIndex).toBe(2);

    // Round 3 (doubled): Adam nails it at 5 m, the others get auto guesses.
    enterExploration(h);
    const real3 = h.locations[2]!.location;
    h.room.submitGuess(adam!.id, offsetLatLng(real3, 5, 0));
    expect(h.room.phase).toBe('round');
    h.clock.advance(30_000 + GUESS);
    expect(h.room.phase).toBe('revealing');
    const r3 = h.room.snapshotFor(alex!.id).round?.reveal;
    const adamR3 = r3?.results.find((r) => r.playerId === adam!.id);
    expect(adamR3?.base).toBe(2 * calculateScore(distanceBetween(real3, adamR3!.position)).base);
    expect(adamR3?.bonus).toBe(100);
    skipRevealAndResults(h);

    expect(h.room.phase).toBe('finished');
    const final = h.room.snapshotFor(sam!.id).final!;
    expect(final.ranking).toHaveLength(4);
    expect(final.winnerIds).toEqual([adam?.id]);
    expect(final.stats.find((s) => s.playerId === adam!.id)?.bestGuessMeters).toBeCloseTo(5, 0);
    expect(final.stats.find((s) => s.playerId === adam!.id)?.maxStreak).toBe(2); // tied best in round 2, best in round 3
    expect(final.stats.find((s) => s.playerId === alex!.id)?.bestGuessMeters).toBeCloseTo(10, 0);
    expect(final.stats.find((s) => s.playerId === alex!.id)?.bestRoundPoints).toBe(alexR1);
    expect(final.highlights.closest?.playerId).toBe(adam?.id);
    expect(final.highlights.closest?.roundNumber).toBe(3);
    expect(final.highlights.fastest?.playerId).toBeDefined();
    expect(final.highlights.streak?.length).toBe(2); // Alex (R1+R2) and Adam (R2+R3) both reached 2
    expect(eventTypes(h)).toContain('gameFinished');
  });

  it('works solo (1 player) and with 8 players', async () => {
    for (const count of [1, 8]) {
      const h = createHarness();
      const [first] = addPlayers(h, ['P1']);
      h.room.updateSettings(first!.id, { rounds: 3, exploreSeconds: 15, capacity: 8 });
      const players = [first!, ...addPlayers(h, Array.from({ length: count - 1 }, (_, i) => `P${i + 2}`))];
      await startAndEnterRound(h, players[0]!.id);
      for (let r = 0; r < 3; r++) {
        expect(h.room.phase).toBe('round');
        const real = h.locations[r]!.location;
        players.forEach((p, i) => h.room.submitGuess(p.id, offsetLatLng(real, 100 * i, i)));
        expect(h.room.phase).toBe('revealing');
        skipRevealAndResults(h);
        if (r < 2) enterExploration(h);
      }
      expect(h.room.phase).toBe('finished');
      expect(h.room.final?.ranking).toHaveLength(count);
      expect(h.room.final?.winnerIds).toEqual([players[0]?.id]);
      expect(h.room.final?.stats.find((s) => s.playerId === players[0]!.id)?.maxStreak).toBe(3);
    }
  });

  it('holds the timer until every street view is ready, at most 4 s', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    await h.room.startGame(host!.id);
    h.clock.advance(TIMINGS.startingLogoMs);
    const round = h.room.currentRound!;
    h.room.panoReady(host!.id);
    h.clock.advance(INTRO);
    expect(round.exploreStartedAt).toBeNull();
    const plannedEnd = round.exploreEndsAt;
    h.clock.advance(1500);
    expect(round.exploreStartedAt).toBeNull();
    expect(round.exploreEndsAt).toBeGreaterThan(plannedEnd);
    h.room.panoReady(guest!.id);
    expect(round.exploreStartedAt).toBe(h.clock.now());
    expect(round.exploreEndsAt).toBe(h.clock.now() + 30_000);

    // Second round: the guest never reports → the timer starts after the maximum wait.
    h.room.submitGuess(host!.id, round.location);
    h.room.submitGuess(guest!.id, round.location);
    skipRevealAndResults(h);
    const round2 = h.room.currentRound!;
    h.clock.advance(INTRO);
    h.room.panoReady(host!.id);
    h.clock.advance(TIMINGS.panoReadyMaxWaitMs - 1);
    expect(round2.exploreStartedAt).toBeNull();
    h.clock.advance(1);
    expect(round2.exploreStartedAt).toBe(h.clock.now());
  });

  it('rejects guesses that are late, duplicate, invalid, or from the wrong phase', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    expect(() => h.room.submitGuess(host!.id, { lat: 0, lng: 0 })).toThrow(/Trop tard/);
    await startAndEnterRound(h, host!.id);
    expect(() => h.room.submitGuess(host!.id, { lat: 91, lng: 0 })).toThrow(/coordonnée/);
    expect(() => h.room.submitGuess(host!.id, null as never)).toThrow(/coordonnée/);
    h.room.submitGuess(host!.id, { lat: 43.3, lng: 5.37 });
    expect(() => h.room.submitGuess(host!.id, { lat: 43.3, lng: 5.37 })).toThrow(/déjà/);
    h.clock.advance(30_000 + GUESS);
    expect(h.room.phase).toBe('revealing');
    expect(() => h.room.submitGuess(guest!.id, { lat: 43.3, lng: 5.37 })).toThrow(/Trop tard/);
    expect(() => h.room.submitGuess('nobody', { lat: 43.3, lng: 5.37 })).toThrow(/pas dans cette room/);
  });

  it('cannot start twice, needs the host, and nobody can join mid‑game', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    await expect(h.room.startGame(guest!.id)).rejects.toThrow(/hôte/);
    await h.room.startGame(host!.id);
    await expect(h.room.startGame(host!.id)).rejects.toThrow(/déjà commencé/);
    expect(() => h.room.addPlayer('token-late-xxxxxxxxxxxxxxxx', 'Late', 'diamond')).toThrow(/en cours/);
  });

  it('falls back to the lobby when locations cannot be loaded', async () => {
    const h = createHarness({ failWith: new Error('metadata quota exceeded') });
    const [host] = addPlayers(h, ['Host']);
    await expect(h.room.startGame(host!.id)).rejects.toThrow(/metadata quota exceeded/);
    expect(h.room.phase).toBe('waiting');
    expect(eventTypes(h)).toContain('gameStartFailed');
  });

  it('starts round 1 immediately if locations arrive after the logo beat', async () => {
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
    const [a, b] = addPlayers(h, ['Ana', 'Bob']);
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

  it('does not expose round data in the lobby or during the starting beat', async () => {
    const h = createHarness();
    const [a] = addPlayers(h, ['Ana']);
    expect(h.room.snapshotFor(a!.id).round).toBeNull();
    await h.room.startGame(a!.id);
    expect(h.room.snapshotFor(a!.id).round).toBeNull();
    expect(h.room.snapshotFor(a!.id).phase).toBe('starting');
  });
});

describe('connections', () => {
  it('a disconnected player is removed after 20 s (toast) but can still come back', async () => {
    const h = createHarness();
    const [a, b, c] = addPlayers(h, ['Ana', 'Bob', 'Cat']);
    await startAndEnterRound(h, a!.id);
    h.room.submitGuess(a!.id, { lat: 43.3, lng: 5.37 });
    h.room.submitGuess(b!.id, { lat: 43.3, lng: 5.37 });
    h.room.markDisconnected(c!.id);
    expect(h.room.phase).toBe('round');
    h.clock.advance(TIMINGS.disconnectRemoveMs - 1);
    expect(h.room.phase).toBe('round');
    expect(h.room.players.get(c!.id)?.left).toBe(false);
    h.clock.advance(1);
    expect(h.room.players.get(c!.id)?.left).toBe(true);
    expect(eventTypes(h).filter((t) => t === 'playerLeft')).toHaveLength(1);
    // The remaining connected players had all guessed → reveal.
    expect(h.room.phase).toBe('revealing');
    expect(h.room.snapshotFor(a!.id).round?.reveal?.results).toHaveLength(2);

    h.room.rejoin(c!.token);
    expect(h.room.players.get(c!.id)?.left).toBe(false);
    expect(h.room.players.get(c!.id)?.connected).toBe(true);
    expect(eventTypes(h)).toContain('playerReconnected');
  });

  it('a quick reconnection keeps the player in the round', async () => {
    const h = createHarness();
    const [a, b] = addPlayers(h, ['Ana', 'Bob']);
    await startAndEnterRound(h, a!.id);
    h.room.submitGuess(a!.id, { lat: 43.3, lng: 5.37 });
    h.room.markDisconnected(b!.id);
    h.clock.advance(5000);
    h.room.rejoin(b!.token);
    h.clock.advance(TIMINGS.disconnectRemoveMs);
    expect(h.room.phase).toBe('round');
    expect(h.room.players.get(b!.id)?.left).toBe(false);
    h.room.submitGuess(b!.id, { lat: 43.3, lng: 5.37 });
    expect(h.room.phase).toBe('revealing');
  });

  it('transfers host after the grace period, not before, and not if the host comes back', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    h.room.markDisconnected(host!.id);
    h.clock.advance(TIMINGS.hostGraceMs - 1000);
    expect(h.room.hostId).toBe(host?.id);
    h.room.rejoin(host!.token);
    h.clock.advance(5000);
    expect(h.room.hostId).toBe(host?.id);

    h.room.markDisconnected(host!.id);
    h.clock.advance(TIMINGS.hostGraceMs);
    expect(h.room.hostId).toBe(guest?.id);
    expect(h.room.players.get(guest!.id)?.isHost).toBe(true);
    expect(h.room.players.get(host!.id)?.isHost).toBe(false);
    expect(eventTypes(h)).toContain('hostChanged');
    h.room.rejoin(host!.token);
    expect(h.room.hostId).toBe(guest?.id);
  });

  it('keeps the host when they are the only player, and the room becomes idle', () => {
    const h = createHarness();
    const [host] = addPlayers(h, ['Host']);
    h.room.markDisconnected(host!.id);
    h.clock.advance(TIMINGS.disconnectRemoveMs);
    // Lobby: the player is simply removed and the room emptied.
    expect(h.emptied).toBe(true);
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
    expect(() => h.room.submitGuess(host!.id, { lat: 43.3, lng: 5.37 })).toThrow(/pas dans cette room/);
    for (let r = 0; r < 3; r++) {
      skipRevealAndResults(h);
      if (r < 2) {
        enterExploration(h);
        h.clock.advance(30_000 + GUESS);
      }
    }
    expect(h.room.phase).toBe('finished');
    expect(h.room.final?.ranking.map((e) => e.playerId)).not.toContain(host?.id);

    await h.room.rematch(guest!.id, true);
    expect(h.room.phase).toBe('waiting');
    expect(h.room.players.has(host!.id)).toBe(false);
    expect(h.room.gameNumber).toBe(1);
    expect(eventTypes(h)).toContain('newCityRequested');
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
  it('restarts right away after the beat, keeps players, resets scores, avoids previous locations', async () => {
    const h = createHarness();
    const [host, guest] = addPlayers(h, ['Host', 'Guest']);
    h.room.updateSettings(host!.id, { rounds: 3 });
    await expect(h.room.rematch(host!.id, false)).rejects.toThrow(/pas finie/);
    await startAndEnterRound(h, host!.id);
    for (let r = 0; r < 3; r++) {
      h.room.submitGuess(host!.id, h.locations[r]!.location);
      h.room.submitGuess(guest!.id, offsetLatLng(h.locations[r]!.location, 2000, 1));
      skipRevealAndResults(h);
      if (r < 2) enterExploration(h);
    }
    expect(h.room.phase).toBe('finished');
    expect(h.room.players.get(host!.id)?.totalScore).toBe(1100 + 1100 + 2100); // exact guesses: 1000 (+100) ×2, last doubled
    expect(h.room.final?.stats.find((s) => s.playerId === host!.id)?.maxStreak).toBe(3);
    await expect(h.room.rematch(guest!.id, false)).rejects.toThrow(/hôte/);

    const previousLocations = h.locations.map((l) => l.location);
    const promise = h.room.rematch(host!.id, false);
    expect(h.room.phase).toBe('starting');
    expect(h.room.rematchBy).toBe('Host');
    expect(h.room.phaseEndsAt).toBe(h.clock.now() + TIMINGS.rematchDelayMs);
    await promise;
    expect(h.room.players.get(host!.id)?.totalScore).toBe(0);
    expect(h.room.snapshotFor(host!.id).final).toBeNull();
    expect(h.room.snapshotFor(host!.id).rematchBy).toBe('Host');
    expect(h.room.gameNumber).toBe(2);
    expect(h.pickerCalls[1]?.exclude).toEqual(previousLocations);
    h.clock.advance(TIMINGS.rematchDelayMs);
    expect(h.room.phase).toBe('round');
    expect(h.room.snapshotFor(host!.id).rematchBy).toBeNull();
    expect(eventTypes(h)).toContain('rematchRequested');
  });
});
