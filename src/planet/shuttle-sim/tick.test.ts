import { describe, expect, it } from 'vitest';
import { DEFAULT_FLIGHT_CONFIG, type FlightConfig } from './physics';
import { SURFACE_Y } from './constants';
import { createShuttleSimState, type ShuttleSimState } from './state';
import { tickShuttle, explodeShuttle } from './tick';
import { createTrailBuffer, type TrailBuffer } from './trail-buffer';
import { EMPTY_WORLD } from './world';

const BASE_PPD = 24;

function testConfig(overrides: Partial<FlightConfig> = {}): FlightConfig {
  return { ...DEFAULT_FLIGHT_CONFIG, ...overrides };
}

function freshState(overrides: Partial<ShuttleSimState> = {}): ShuttleSimState {
  const s = createShuttleSimState({ deg: 0, maxSpeed: 0.2, halfLen: 4 });
  Object.assign(s, overrides);
  return s;
}

function freshTrail(): TrailBuffer {
  return createTrailBuffer(100);
}

function tick(
  state: ShuttleSimState, trail: TrailBuffer, config: FlightConfig, dt = 1,
) {
  return tickShuttle({ state, trail, config, world: EMPTY_WORLD, basePPD: BASE_PPD, dt });
}

describe('tickShuttle', () => {
  it('does nothing on grounded — wrapper owns the waitTicks countdown', () => {
    const state = freshState({ phase: 'grounded', waitTicks: 10 });
    const trail = freshTrail();
    const events = tick(state, trail, testConfig());
    expect(events).toEqual([]);
    expect(state.phase).toBe('grounded');
    expect(state.waitTicks).toBe(10); // untouched by brain
  });

  it('transitions ascending → cruising near cruise altitude', () => {
    const state = freshState({
      phase: 'ascending', y: -250, vY: -0.1, cruiseY: -250, cruiseSpeed: 0.1, dirSign: 1,
    });
    const trail = freshTrail();
    tick(state, trail, testConfig());
    expect(state.phase).toBe('cruising');
  });

  it('transitions cruising → descending after traveling cruiseDegLimit', () => {
    const state = freshState({
      phase: 'cruising', y: -250, vDeg: 0.15, dirSign: 1,
      cruiseY: -250, cruiseSpeed: 0.15, cruiseDegLimit: 0.1,
      traveledDeg: 0.05,
    });
    const trail = freshTrail();
    tick(state, trail, testConfig());
    expect(state.phase).toBe('descending');
  });

  it('emits explode + transitions to dying when willExplode triggers at half-distance', () => {
    const state = freshState({
      phase: 'cruising', y: -250, vDeg: 0.15, dirSign: 1,
      cruiseY: -250, cruiseSpeed: 0.15, cruiseDegLimit: 10,
      traveledDeg: 5.0, willExplode: true,
    });
    const trail = freshTrail();
    const events = tick(state, trail, testConfig());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('explode');
    expect(state.phase).toBe('dying');
    expect(state.vDeg).toBe(0);
    expect(state.vY).toBe(0);
  });

  it('emits landed when descending shuttle reaches surface within tolerance', () => {
    // landingDeg=null skips the overshoot check; this isolates the
    // at-surface tryLand path without coupling to direction logic.
    const state = freshState({
      phase: 'descending', y: SURFACE_Y - 1, vDeg: 0.0001, vY: 0,
      cruiseY: -250, cruiseSpeed: 0.15, dirSign: 1,
      landingDeg: null, deg: 0,
    });
    const trail = freshTrail();
    const events = tick(state, trail, testConfig({ landThreshold: 4, maxTurnAccel: 0.004 }));
    const landed = events.find(e => e.type === 'landed');
    expect(landed).toBeDefined();
  });

  it('emits explode instead of landed when descent is too fast', () => {
    const state = freshState({
      phase: 'descending', y: SURFACE_Y - 1, vDeg: 0.5, vY: 0,
      cruiseY: -250, cruiseSpeed: 0.5, dirSign: 1,
      landingDeg: null, deg: 0,
    });
    const trail = freshTrail();
    const events = tick(state, trail, testConfig({ landThreshold: 4, maxTurnAccel: 0.004 }));
    expect(events[0].type).toBe('explode');
  });

  it('decrements dyingTrailLen each tick and emits respawn-ready at zero', () => {
    const state = freshState({ phase: 'dying', dyingTrailLen: 3, dyingTrailMax: 10 });
    const trail = freshTrail();
    let events = tick(state, trail, testConfig());
    expect(events).toEqual([]);
    expect(state.dyingTrailLen).toBe(2);
    events = tick(state, trail, testConfig());
    expect(events).toEqual([]);
    expect(state.dyingTrailLen).toBe(1);
    events = tick(state, trail, testConfig());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('respawn-ready');
    expect(state.dyingTrailLen).toBe(0);
  });

  it('triggers explosion via explodeAfterFrames timer', () => {
    const state = freshState({
      phase: 'cruising', y: -250, vDeg: 0.1, dirSign: 1,
      cruiseY: -250, cruiseSpeed: 0.1, cruiseDegLimit: 100,
      flyingFrames: 4,
    });
    const trail = freshTrail();
    const events = tick(state, trail, testConfig({ explodeAfterFrames: 5 }));
    expect(events[0].type).toBe('explode');
    expect(state.phase).toBe('dying');
  });
});

describe('dyingDelay (staggered annihilate)', () => {
  it('decrements dyingDelay each tick without triggering until it hits zero', () => {
    const state = freshState({
      phase: 'cruising', y: -250, vDeg: 0.1, dirSign: 1,
      cruiseY: -250, cruiseSpeed: 0.1, cruiseDegLimit: 100,
      dyingDelay: 30,
    });
    const trail = freshTrail();
    for (let i = 0; i < 29; i++) {
      const events = tick(state, trail, testConfig());
      expect(events.some(e => e.type === 'explode')).toBe(false);
    }
    expect(state.dyingDelay).toBe(1);
    const finalEvents = tick(state, trail, testConfig());
    expect(finalEvents.some(e => e.type === 'explode')).toBe(true);
    expect(state.phase).toBe('dying');
  });

  it('ignores dyingDelay on a grounded shuttle (brain skips grounded)', () => {
    const state = freshState({ phase: 'grounded', dyingDelay: 5, waitTicks: 100 });
    const trail = freshTrail();
    const events = tick(state, trail, testConfig());
    expect(events).toEqual([]);
    expect(state.dyingDelay).toBe(5); // unchanged — wrapper handles grounded
  });
});

describe('explodeShuttle', () => {
  it('detonates a flying shuttle and emits one explode event', () => {
    const state = freshState({
      phase: 'cruising', y: -250, vDeg: 0.1, vY: 0,
      cruiseY: -250, cruiseSpeed: 0.1, cruiseDegLimit: 50,
    });
    const trail = freshTrail();
    const events = explodeShuttle(state, trail, testConfig(), BASE_PPD);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('explode');
    expect(state.phase).toBe('dying');
  });

  it('no-ops on grounded shuttle', () => {
    const state = freshState({ phase: 'grounded' });
    const trail = freshTrail();
    expect(explodeShuttle(state, trail, testConfig(), BASE_PPD)).toEqual([]);
  });

  it('no-ops on already-dying shuttle (idempotent)', () => {
    const state = freshState({ phase: 'dying', dyingTrailLen: 5 });
    const trail = freshTrail();
    expect(explodeShuttle(state, trail, testConfig(), BASE_PPD)).toEqual([]);
  });
});
