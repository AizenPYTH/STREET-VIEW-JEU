import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, generateRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode.js';

describe('room codes', () => {
  it('generates 5 characters from the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it('never contains ambiguous characters', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });

  it('normalizes user input', () => {
    expect(normalizeRoomCode('k7x4p')).toBe('K7X4P');
    expect(normalizeRoomCode(' k7-x4 p ')).toBe('K7X4P');
    expect(normalizeRoomCode('K7X4P99')).toBe('K7X4P');
  });

  it('validates codes', () => {
    expect(isValidRoomCode('K7X4P')).toBe(true);
    expect(isValidRoomCode('K7X4')).toBe(false);
    expect(isValidRoomCode('K7X40')).toBe(false);
    expect(isValidRoomCode('k7x4p')).toBe(false);
  });
});
