import { normalize180 } from '../math';
import { estimateDescentDeg, type FlightConfig } from './physics';

export type FlightPlan = {
  cruiseY:        number;
  cruiseSpeed:    number;
  dirSign:        1 | -1;
  landingDeg:     number | null;
  cruiseDegLimit: number;
  willExplode:    boolean;
};

// rng is injected so plans are deterministic given a seed. Callers
// (ShuttleLayer) supply a mulberry32 RNG seeded per layer.
export type FlightPlanFn = (fromDeg: number, toDeg: number | null, config: FlightConfig, rng: () => number) => FlightPlan;

const FULL_ARC_DEG = 120;
const MIN_SPEED    = 0.15;
const MIN_ALTITUDE = -60;

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

// Cruise altitude as a function of remaining trip distance. Short trips
// stay low; long trips climb to config.cruiseYMin. Used only by the
// open-loop FlightPlan path; closed-loop reads cruiseY from the target.
function altitudeForRange(fullDeg: number, config: FlightConfig): number {
  const t = Math.min(1, Math.abs(fullDeg) / FULL_ARC_DEG);
  return lerp(MIN_ALTITUDE, config.cruiseYMin, t * t);
}

// Cruise speed as a function of remaining trip distance. Short trips
// cruise slowly; long trips approach config.maxHorizSpeed. Shared between
// open-loop and closed-loop control.
export function cruiseSpeedFor(fullDeg: number, config: FlightConfig): number {
  const t = Math.min(1, Math.abs(fullDeg) / FULL_ARC_DEG);
  return config.maxHorizSpeed * lerp(MIN_SPEED, 1.0, t);
}

function planFromDistance(fromDeg: number, toDeg: number, config: FlightConfig, willExplode: boolean): FlightPlan {
  const diff      = normalize180(toDeg - fromDeg);
  const dirSign   = (diff >= 0 ? 1 : -1);
  const fullDeg   = Math.abs(diff);
  const cruiseY     = altitudeForRange(fullDeg, config);
  const cruiseSpeed = cruiseSpeedFor(fullDeg, config);
  const brakeDeg    = estimateDescentDeg(config, cruiseY, cruiseSpeed);
  return { cruiseY, cruiseSpeed, dirSign, landingDeg: toDeg, cruiseDegLimit: Math.max(0, fullDeg - brakeDeg), willExplode };
}

export function distanceFlightPlan(fromDeg: number, toDeg: number | null, config: FlightConfig, rng: () => number): FlightPlan {
  const willExplode = rng() < config.explodeChance;
  if (toDeg === null) {
    const sign    = (rng() < 0.5 ? 1 : -1);
    const fullDeg = config.cruiseDegMin + rng() * (config.cruiseDegMax - config.cruiseDegMin);
    return planFromDistance(fromDeg, ((fromDeg + sign * fullDeg) % 360 + 360) % 360, config, willExplode);
  }
  return planFromDistance(fromDeg, toDeg, config, willExplode);
}
