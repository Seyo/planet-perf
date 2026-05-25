import { describe, expect, it } from 'vitest';
import { LANDING_MISS_DEG, SURFACE_Y } from './constants';
import { DEFAULT_FLIGHT_CONFIG, type FlightConfig } from './physics';
import { createShuttleSimState, type ShuttleSimState } from './state';
import { tickShuttle } from './tick';
import { createTrailBuffer } from './trail-buffer';
import type { ShuttleEvent } from './events';
import type { ShuttleTarget, ShuttleWorld } from './world';
import { normalize180 } from '../math';

const BASE_PPD = 24;
const DT       = 1;
const MAX_TICKS = 4000; // generous safety cap for full-flight tests

function makeWorld(targets: Record<string, ShuttleTarget>): ShuttleWorld {
  return { targets: new Map(Object.entries(targets)) };
}

function makeFlyingState(overrides: Partial<ShuttleSimState> = {}): ShuttleSimState {
  // Start the shuttle airborne at cruise altitude and at cruise speed so
  // closed-loop tests don't need to wait for the wrapper's grounded→launch
  // transition. The brain doesn't run launch — it only handles flying-and-
  // onward phases. vDeg starts at cruiseSpeed so the lead-prediction eta is
  // a realistic finite number rather than the divide-by-near-zero edge case.
  const s = createShuttleSimState({ deg: 0, maxSpeed: 0.2, halfLen: 4 });
  s.phase       = 'cruising';
  s.y           = -200;
  s.cruiseY     = -200;
  s.cruiseSpeed = 0.12;
  s.dirSign     = 1;
  s.vDeg        = 0.12;
  s.targetId    = 't';
  Object.assign(s, overrides);
  return s;
}

function runUntilLandedOrCap(
  state: ShuttleSimState, world: ShuttleWorld, config: FlightConfig,
  options: { mutateWorld?: (tick: number) => void; maxTicks?: number } = {},
): { ticks: number; landed: boolean; events: ShuttleEvent[] } {
  const trail = createTrailBuffer(100);
  const collected: ShuttleEvent[] = [];
  const cap = options.maxTicks ?? MAX_TICKS;
  for (let i = 0; i < cap; i++) {
    options.mutateWorld?.(i);
    const events = tickShuttle({ state, trail, config, world, basePPD: BASE_PPD, dt: DT });
    collected.push(...events);
    if (events.some(e => e.type === 'landed')) return { ticks: i + 1, landed: true, events: collected };
    if (events.some(e => e.type === 'explode')) return { ticks: i + 1, landed: false, events: collected };
  }
  return { ticks: cap, landed: false, events: collected };
}

describe('tickShuttle closed-loop (targetId set)', () => {
  it('settles within LANDING_MISS_DEG of a stationary target after sustained tracking', () => {
    const state = makeFlyingState();
    const targetY = -150;
    const world = makeWorld({ t: { deg: 60, y: targetY, vDeg: 0 } });
    const trail = createTrailBuffer(100);
    // Closed-loop is hover-mode: no 'landed' event is emitted. Tick long
    // enough for the PD physics to settle on the target XY, then assert
    // position.
    for (let i = 0; i < 1500; i++) {
      tickShuttle({ state, trail, config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    }
    expect(Math.abs(normalize180(state.deg - 60))).toBeLessThanOrEqual(LANDING_MISS_DEG);
    expect(Math.abs(state.y - targetY)).toBeLessThanOrEqual(20);
  });

  it('cruises at the target altitude, not the ground', () => {
    const state = makeFlyingState();
    const targetY = -300;
    const world = makeWorld({ t: { deg: 60, y: targetY, vDeg: 0 } });
    const trail = createTrailBuffer(100);
    for (let i = 0; i < 1500; i++) {
      tickShuttle({ state, trail, config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    }
    // Must settle near target altitude, not near SURFACE_Y.
    expect(Math.abs(state.y - targetY)).toBeLessThanOrEqual(20);
    expect(state.y).toBeLessThan(SURFACE_Y - 50); // not anywhere near the ground
  });

  it('leads a target moving away — landingDeg sits ahead of target.deg', () => {
    const state = makeFlyingState();
    const world = makeWorld({ t: { deg: 60, y: SURFACE_Y, vDeg: 0.05 } });
    // Tick once to populate setpoints from the moving target.
    tickShuttle({ state, trail: createTrailBuffer(100), config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    // Lead = target.deg + target.vDeg * eta. For positive vDeg the lead is
    // strictly ahead of target.deg.
    expect(state.landingDeg).not.toBeNull();
    expect(state.landingDeg as number).toBeGreaterThan(60);
  });

  it('flips dirSign when the target jumps across the shuttle', () => {
    const state = makeFlyingState({ deg: 0, vDeg: 0.1, dirSign: 1 });
    // Target starts ahead — dirSign stays +1.
    let world = makeWorld({ t: { deg: 30, y: SURFACE_Y, vDeg: 0 } });
    tickShuttle({ state, trail: createTrailBuffer(100), config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    expect(state.dirSign).toBe(1);
    // Target jumps behind — dirSign must flip to -1.
    world = makeWorld({ t: { deg: -30, y: SURFACE_Y, vDeg: 0 } });
    tickShuttle({ state, trail: createTrailBuffer(100), config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    expect(state.dirSign).toBe(-1);
  });

  it('clamps horizontal acceleration to maxTurnAccel during a reversal', () => {
    const state = makeFlyingState({ deg: 0, vDeg: 0.1, dirSign: 1 });
    const trail = createTrailBuffer(100);
    const before = state.vDeg;
    // Target on the opposite side — dirSign flips, vDeg should ramp down
    // toward -cruiseSpeed but no faster than maxTurnAccel per tick.
    const world = makeWorld({ t: { deg: -30, y: SURFACE_Y, vDeg: 0 } });
    tickShuttle({ state, trail, config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    const delta = Math.abs(state.vDeg - before);
    expect(delta).toBeLessThanOrEqual(DEFAULT_FLIGHT_CONFIG.maxTurnAccel * DT + 1e-9);
  });

  it('never lands when the target outruns the shuttle', () => {
    const state = makeFlyingState();
    const world = makeWorld({ t: { deg: 30, y: SURFACE_Y, vDeg: 1.0 } }); // faster than maxSpeed=0.2
    const { landed } = runUntilLandedOrCap(state, world, DEFAULT_FLIGHT_CONFIG, { maxTicks: 200 });
    expect(landed).toBe(false);
  });

  it('keeps last setpoints (no crash) when the target is removed mid-flight', () => {
    const state = makeFlyingState();
    const world: ShuttleWorld = { targets: new Map([['t', { deg: 60, y: SURFACE_Y, vDeg: 0 }]]) };
    const trail = createTrailBuffer(100);
    // Tick a few times to populate setpoints.
    for (let i = 0; i < 5; i++) {
      tickShuttle({ state, trail, config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    }
    const lastLanding = state.landingDeg;
    // Remove the target.
    (world.targets as Map<string, ShuttleTarget>).delete('t');
    // Tick once more — landingDeg should be unchanged (gracefully degrades).
    tickShuttle({ state, trail, config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    expect(state.landingDeg).toBe(lastLanding);
    // And the shuttle should still be physically progressing — no NaN, no crash.
    expect(Number.isFinite(state.deg)).toBe(true);
    expect(Number.isFinite(state.y)).toBe(true);
  });
});

describe('tickShuttle open-loop regression (targetId null)', () => {
  it('does not touch landingDeg when targetId is null even if world has targets', () => {
    const state = createShuttleSimState({ deg: 0, maxSpeed: 0.2, halfLen: 4 });
    state.phase       = 'cruising';
    state.y           = -200;
    state.cruiseY     = -200;
    state.cruiseSpeed = 0.12;
    state.cruiseDegLimit = 30;
    state.landingDeg  = 30;
    state.dirSign     = 1;
    state.targetId    = null; // open-loop
    const world = makeWorld({ t: { deg: 999, y: SURFACE_Y, vDeg: 5 } }); // wildly different
    tickShuttle({ state, trail: createTrailBuffer(100), config: DEFAULT_FLIGHT_CONFIG, world, basePPD: BASE_PPD, dt: DT });
    // landingDeg must not be overwritten from the world target.
    expect(state.landingDeg).toBe(30);
  });
});
