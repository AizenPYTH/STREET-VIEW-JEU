import { describe, expect, it } from 'vitest';
import { calculateDistance, distanceBetween, formatDistance, isValidLatLng, offsetLatLng, randomPointInRadius } from './geo.js';

describe('calculateDistance', () => {
  it('returns 0 for identical points', () => {
    expect(calculateDistance(43.2965, 5.3698, 43.2965, 5.3698)).toBe(0);
  });

  it('matches known distances (Paris → Marseille ≈ 661 km)', () => {
    const d = calculateDistance(48.8566, 2.3522, 43.2965, 5.3698);
    expect(d).toBeGreaterThan(658_000);
    expect(d).toBeLessThan(664_000);
  });

  it('is symmetric', () => {
    const a = calculateDistance(51.5074, -0.1278, 40.7128, -74.006);
    const b = calculateDistance(40.7128, -74.006, 51.5074, -0.1278);
    expect(a).toBeCloseTo(b, 6);
  });

  it('handles the antimeridian', () => {
    const d = calculateDistance(0, 179.9, 0, -179.9);
    expect(d).toBeLessThan(25_000);
  });

  it('rejects invalid coordinates', () => {
    expect(() => calculateDistance(91, 0, 0, 0)).toThrow(RangeError);
    expect(() => calculateDistance(0, 181, 0, 0)).toThrow(RangeError);
    expect(() => calculateDistance(Number.NaN, 0, 0, 0)).toThrow(RangeError);
  });

  it('small distances are precise to the meter', () => {
    // ~111.32 m per 0.001° latitude
    const d = calculateDistance(43.0, 5.0, 43.001, 5.0);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('offsetLatLng / randomPointInRadius', () => {
  it('offsetting then measuring returns the same distance', () => {
    const origin = { lat: 43.2965, lng: 5.3698 };
    const moved = offsetLatLng(origin, 500, Math.PI / 3);
    expect(distanceBetween(origin, moved)).toBeCloseTo(500, 3);
  });

  it('random points stay within the radius', () => {
    const center = { lat: 48.8566, lng: 2.3522 };
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 500; i++) {
      const p = randomPointInRadius(center, 400, rng);
      expect(distanceBetween(center, p)).toBeLessThanOrEqual(400.001);
    }
  });
});

describe('isValidLatLng', () => {
  it('accepts valid coordinates', () => {
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidLatLng({ lat: -90, lng: 180 })).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng({ lat: '1', lng: 2 })).toBe(false);
    expect(isValidLatLng({ lat: 95, lng: 2 })).toBe(false);
    expect(isValidLatLng({ lat: Number.POSITIVE_INFINITY, lng: 2 })).toBe(false);
    expect(isValidLatLng({})).toBe(false);
  });
});

describe('formatDistance', () => {
  it('formats meters and kilometers', () => {
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(999)).toBe('999 m');
    expect(formatDistance(1400)).toBe('1.4 km');
    expect(formatDistance(12_345)).toBe('12 km');
    expect(formatDistance(-1)).toBe('—');
  });
});
