import { clamp, normalize180 } from '../math';
import { estimateDescentDeg, type FlightConfig } from './physics';
import {
  DESCENT_PD_GAIN, LANDING_MISS_DEG, MAX_OVERSHOOTS, SAFE_LANDING_ACCEL_FRAMES, SURFACE_Y,
} from './constants';
import type { ShuttleSimState } from './state';
import type { ExplosionOrigin, ShuttleEvent } from './events';
import { recordTrailPoint, type TrailBuffer } from './trail-buffer';

export type TickInputs = {
  state:   ShuttleSimState;
  trail:   TrailBuffer;
  config:  FlightConfig;
  // Degrees-per-pixel conversion used for trajectory anchoring at explosion
  // time. Comes from the layer's parallax depth, not from FlightConfig.
  basePPD: number;
  dt:      number;
};

// Internal context bundle. Carries the shared inputs + an event sink through
// the helper chain so each helper takes one ctx arg instead of five.
type Ctx = {
  state:   ShuttleSimState;
  trail:   TrailBuffer;
  config:  FlightConfig;
  basePPD: number;
  events:  ShuttleEvent[];
};

// Pure shuttle brain. Mutates state + trail in place. Returns events the
// wrapper must react to (spawn explosions, schedule respawns, etc).
//
// Grounded phase is intentionally NOT handled here — launch needs the
// wrapper's pickTarget/planFn closures. That moves into the brain in Phase E
// once both are RNG-injected.
export function tickShuttle(input: TickInputs): ShuttleEvent[] {
  const { state, trail, config, basePPD, dt } = input;
  const events: ShuttleEvent[] = [];

  if (state.phase === 'grounded') return events;

  if (state.phase === 'dying') {
    state.dyingTrailLen -= dt;
    if (state.dyingTrailLen <= 0) events.push({ type: 'respawn-ready' });
    return events;
  }

  // Flying phases (ascending, cruising, descending)
  state.flyingFrames += dt;
  const ctx: Ctx = { state, trail, config, basePPD, events };
  if (checkExplodeAfterFrames(state, config)) {
    triggerExplosion(ctx);
    return events;
  }
  applyPhysics(state, config, dt);
  if (advancePhase(ctx, dt)) return events;
  recordTrailPoint(trail, state.deg, state.y);
  return events;
}

// Public escape hatch for outside callers (debug annihilate, scripted spawns)
// that need to detonate a flying shuttle. Returns the same event stream the
// internal brain would emit, so the wrapper handles it uniformly.
export function explodeShuttle(
  state: ShuttleSimState, trail: TrailBuffer, config: FlightConfig, basePPD: number,
): ShuttleEvent[] {
  if (state.phase === 'grounded' || state.phase === 'dying') return [];
  const events: ShuttleEvent[] = [];
  triggerExplosion({ state, trail, config, basePPD, events });
  return events;
}

function triggerExplosion(ctx: Ctx): void {
  const { state, trail, config, basePPD, events } = ctx;
  // Anchor adjustment: shift origin from nose to engine (rear) so the trail
  // tip, explosion centre, and debris all share one point with no visible gap.
  const rot = Math.atan2(state.vY, state.vDeg * basePPD);
  state.deg = ((state.deg + (-state.halfLen * Math.cos(rot)) / basePPD) % 360 + 360) % 360;
  state.y  += -state.halfLen * Math.sin(rot);

  // One final trail point at the engine so the trail tip is flush with the blast.
  recordTrailPoint(trail, state.deg, state.y);

  const origin: ExplosionOrigin = { deg: state.deg, y: state.y, vDeg: state.vDeg, vY: state.vY };
  const speedPx = Math.sqrt((state.vDeg * basePPD) ** 2 + state.vY ** 2);
  state.dyingTrailLen = Math.min(trail.count, Math.floor(speedPx * config.trailSpeedFactor));
  state.dyingTrailMax = state.dyingTrailLen;
  state.phase = 'dying';
  state.vDeg  = 0;
  state.vY    = 0;
  events.push({ type: 'explode', origin });
}

function advancePhase(ctx: Ctx, dt: number): boolean {
  const { state, config } = ctx;
  if (state.phase === 'ascending' && Math.abs(state.y - state.cruiseY) < config.levelThreshold) {
    state.phase = 'cruising';
    recalcCruiseLimit(state, config);
  }
  if (state.phase === 'cruising' && checkCruisingPhase(ctx, dt)) return true;
  if (state.phase === 'descending') return checkDescending(ctx);
  return false;
}

function checkCruisingPhase(ctx: Ctx, dt: number): boolean {
  const { state } = ctx;
  state.traveledDeg += Math.abs(state.vDeg * dt);
  if (state.willExplode && state.traveledDeg >= state.cruiseDegLimit * 0.5) {
    triggerExplosion(ctx);
    return true;
  }
  if (state.traveledDeg >= state.cruiseDegLimit) state.phase = 'descending';
  return false;
}

function checkDescending(ctx: Ctx): boolean {
  const { state, config } = ctx;
  if (checkDescentOvershoot(state, config)) return true;
  if (state.y >= SURFACE_Y - config.landThreshold) {
    tryLand(ctx);
    return true;
  }
  return false;
}

function checkDescentOvershoot(state: ShuttleSimState, config: FlightConfig): boolean {
  if (state.landingDeg === null || state.overshootCount >= MAX_OVERSHOOTS) return false;
  const passed = state.dirSign * normalize180(state.landingDeg - state.deg) < 0;
  if (passed) startArcTurn(state, config);
  return passed;
}

function tryLand(ctx: Ctx): void {
  const { state, config, events } = ctx;
  const tooFast = Math.abs(state.vDeg) > config.maxTurnAccel * SAFE_LANDING_ACCEL_FRAMES;
  const tooFar  = state.landingDeg !== null
    && Math.abs(normalize180(state.landingDeg - state.deg)) > LANDING_MISS_DEG;
  if (tooFast || tooFar) triggerExplosion(ctx);
  else                   events.push({ type: 'landed' });
}

function startArcTurn(state: ShuttleSimState, config: FlightConfig): void {
  state.overshootCount++;
  state.dirSign     = -state.dirSign as 1 | -1;
  state.traveledDeg = 0;
  const remain = state.dirSign * normalize180((state.landingDeg ?? state.deg) - state.deg);
  const brake  = estimateDescentDeg(config, state.cruiseY, state.cruiseSpeed);
  state.cruiseDegLimit = Math.max(0, remain - brake);
  if (state.cruiseDegLimit === 0) state.phase = 'descending';
}

function recalcCruiseLimit(state: ShuttleSimState, config: FlightConfig): void {
  if (state.landingDeg === null) return;
  const remainDeg = state.dirSign * normalize180(state.landingDeg - state.deg);
  if (remainDeg <= 0) {
    if (state.overshootCount < MAX_OVERSHOOTS) startArcTurn(state, config);
    else                                       state.phase = 'descending';
    return;
  }
  const brakeDeg = estimateDescentDeg(config, state.cruiseY, state.cruiseSpeed);
  state.cruiseDegLimit = Math.max(0, remainDeg - brakeDeg);
}

function applyPhysics(state: ShuttleSimState, config: FlightConfig, dt: number): void {
  const { targetY, pdGain } = vertControlParams(state);
  const targetVY = clamp((targetY - state.y) * pdGain, -config.maxClimbRate, config.maxDescentRate);
  state.vY += clamp(targetVY - state.vY, -config.maxVertAccel * dt, config.maxVertAccel * dt);

  const targetVDeg = horizTargetSpeed(state) * state.dirSign;
  state.vDeg += clamp(targetVDeg - state.vDeg, -config.maxTurnAccel * dt, config.maxTurnAccel * dt);

  state.deg = ((state.deg + state.vDeg * dt) % 360 + 360) % 360;
  state.y  += state.vY * dt;
}

function vertControlParams(state: ShuttleSimState): { targetY: number; pdGain: number } {
  const targetY = state.phase === 'descending' ? SURFACE_Y      : state.cruiseY;
  const pdGain  = state.phase === 'descending' ? DESCENT_PD_GAIN : 0.12;
  return { targetY, pdGain };
}

function horizTargetSpeed(state: ShuttleSimState): number {
  if (state.phase === 'ascending') return state.maxSpeed * 0.35; // slow climb — fighting gravity
  if (state.phase === 'cruising')  return state.cruiseSpeed;
  // Quadratic decel: maintains speed through most of descent, brakes hard near ground.
  const af = clamp((state.y - state.cruiseY) / (SURFACE_Y - state.cruiseY), 0, 1);
  return state.cruiseSpeed * (1 - af * af);
}

function checkExplodeAfterFrames(state: ShuttleSimState, config: FlightConfig): boolean {
  return config.explodeAfterFrames > 0 && state.flyingFrames >= config.explodeAfterFrames;
}
