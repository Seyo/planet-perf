import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../render/rng';
import { DEFAULT_FLIGHT_CONFIG } from './physics';
import { distanceFlightPlan } from './flight-plan';

describe('distanceFlightPlan', () => {
  it('is deterministic given the same seed', () => {
    const a = distanceFlightPlan(0, null, DEFAULT_FLIGHT_CONFIG, mulberry32(42));
    const b = distanceFlightPlan(0, null, DEFAULT_FLIGHT_CONFIG, mulberry32(42));
    expect(a).toEqual(b);
  });

  it('produces different plans with different seeds', () => {
    const a = distanceFlightPlan(0, null, DEFAULT_FLIGHT_CONFIG, mulberry32(1));
    const b = distanceFlightPlan(0, null, DEFAULT_FLIGHT_CONFIG, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('honours an explicit landing target', () => {
    const plan = distanceFlightPlan(10, 200, DEFAULT_FLIGHT_CONFIG, mulberry32(0));
    expect(plan.landingDeg).toBe(200);
    // 200 is past 10 + 180 wraparound; dirSign should be -1 (shorter path).
    expect(plan.dirSign).toBe(-1);
  });

  it('flies higher and faster for longer trips than shorter ones', () => {
    const short = distanceFlightPlan(0, 20,  DEFAULT_FLIGHT_CONFIG, mulberry32(0));
    const long  = distanceFlightPlan(0, 120, DEFAULT_FLIGHT_CONFIG, mulberry32(0));
    expect(long.cruiseY).toBeLessThan(short.cruiseY); // y is negative; lower = higher altitude
    expect(long.cruiseSpeed).toBeGreaterThan(short.cruiseSpeed);
  });

  it('respects explodeChance via the RNG', () => {
    // explodeChance=0 → never explode regardless of rng output
    const neverExplodes = distanceFlightPlan(0, null,
      { ...DEFAULT_FLIGHT_CONFIG, explodeChance: 0 },
      () => 0.001);
    expect(neverExplodes.willExplode).toBe(false);

    // explodeChance=1 → always explode
    const alwaysExplodes = distanceFlightPlan(0, null,
      { ...DEFAULT_FLIGHT_CONFIG, explodeChance: 1 },
      () => 0.999);
    expect(alwaysExplodes.willExplode).toBe(true);
  });
});
