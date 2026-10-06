import { describe, expect, it } from 'vitest';
import { ROOM_IDLE_TTL_MS, ROOM_MAX_AGE_MS, TIMINGS } from '@cityguess/shared';
import { FakeClock } from './clock.js';
import { RoomManager } from './RoomManager.js';
import { deterministicPicker } from './testUtils.js';

function manager(clock: FakeClock) {
  const closed: string[] = [];
  const m = new RoomManager({
    clock,
    pickLocations: deterministicPicker({ pickerCalls: [], locations: [] }),
    onStateChanged: () => {},
    onEvent: () => {},
    onRoomClosed: (room, reason) => closed.push(`${room.code}:${reason}`),
  });
  return { m, closed };
}

describe('RoomManager', () => {
  it('allocates unique codes and remembers which room a device belongs to', () => {
    const { m } = manager(new FakeClock());
    const codes = new Set(Array.from({ length: 50 }, () => m.createRoom().code));
    expect(codes.size).toBe(50);
    const room = m.createRoom();
    m.bindToken('token-a', room.code);
    expect(m.roomForToken('token-a')?.code).toBe(room.code);
    m.closeRoom(room, 'test');
    expect(m.roomForToken('token-a')).toBeUndefined();
    expect(m.getRoom(room.code)).toBeUndefined();
  });

  it('closes a lobby whose only player stays disconnected, and sweeps rooms past their maximum age', () => {
    const clock = new FakeClock();
    const { m, closed } = manager(clock);
    const idle = m.createRoom();
    const player = idle.addPlayer('token-idle-xxxxxxxxxxxxxxxx', 'Idle', 'diamond');
    idle.markDisconnected(player.id);
    const busy = m.createRoom();
    busy.addPlayer('token-busy-xxxxxxxxxxxxxxxx', 'Busy', 'diamond');
    // The disconnected player is removed after 20 s, which empties and closes the lobby.
    clock.advance(TIMINGS.disconnectRemoveMs + 1);
    expect(closed).toEqual([`${idle.code}:Tout le monde a quitté la room`]);
    expect(m.getRoom(idle.code)).toBeUndefined();
    // Nothing is idle: the busy room keeps a connected player.
    clock.advance(ROOM_IDLE_TTL_MS + 1);
    expect(m.sweep()).toBe(0);
    expect(m.getRoom(busy.code)).toBeDefined();
    // Hard lifetime.
    clock.advance(ROOM_MAX_AGE_MS);
    expect(m.sweep()).toBe(1);
    expect(closed[1]).toBe(`${busy.code}:La room a expiré`);
    expect(m.size).toBe(0);
  });

  it('sweeps a room where everyone has been gone for a long time', () => {
    const clock = new FakeClock();
    const { m } = manager(clock);
    const room = m.createRoom();
    // Simulate a room that never got any player connected again (e.g. all sockets gone before join finished).
    expect(room.isIdle(ROOM_IDLE_TTL_MS)).toBe(true);
    clock.advance(ROOM_IDLE_TTL_MS + 1);
    expect(m.sweep()).toBe(1);
    expect(m.size).toBe(0);
  });

  it('closes a room when its last player leaves', () => {
    const { m, closed } = manager(new FakeClock());
    const room = m.createRoom();
    const p = room.addPlayer('token-solo-xxxxxxxxxxxxxxxx', 'Solo', 'diamond');
    room.leave(p.id);
    expect(m.size).toBe(0);
    expect(closed[0]).toContain('Tout le monde a quitté');
  });
});
