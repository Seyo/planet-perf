import { normalize180 } from '../../../math';
import { estimateDescentDeg, type FlightConfig } from './physics';

export type FlightPlan = {
  cruiseY:        number;
  cruiseSpeed:    number;
  dirSign:        1 | -1;
  landingDeg:     number | null;
  cruiseDegLimit: number;
  willExplode:    boolean;
};

export type FlightPlanFn = (fromDeg: number, toDeg: number | null, config: FlightConfig) => FlightPlan;

const FULL_ARC_DEG   = 120;
const MIN_SPEED      = 0.15;
const MIN_ALTITUDE   = -60;

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function planFromDistance(fromDeg: number, toDeg: number, config: FlightConfig, willExplode: boolean): FlightPlan {
  const diff      = normalize180(toDeg - fromDeg);
  const dirSign   = (diff >= 0 ? 1 : -1);
  const fullDeg   = Math.abs(diff);
  const t         = Math.min(1, fullDeg / FULL_ARC_DEG);
  const cruiseY   = lerp(MIN_ALTITUDE, config.cruiseYMin, t * t);
  const cruiseSpeed = config.maxHorizSpeed * lerp(MIN_SPEED, 1.0, t);
  const brakeDeg    = estimateDescentDeg(config, cruiseY, cruiseSpeed);
  return { cruiseY, cruiseSpeed, dirSign, landingDeg: toDeg, cruiseDegLimit: Math.max(0, fullDeg - brakeDeg), willExplode };
}

export function distanceFlightPlan(fromDeg: number, toDeg: number | null, config: FlightConfig): FlightPlan {
  const willExplode = Math.random() < config.explodeChance;
  if (toDeg === null) {
    const sign    = (Math.random() < 0.5 ? 1 : -1);
    const fullDeg = config.cruiseDegMin + Math.random() * (config.cruiseDegMax - config.cruiseDegMin);
    return planFromDistance(fromDeg, ((fromDeg + sign * fullDeg) % 360 + 360) % 360, config, willExplode);
  }
  return planFromDistance(fromDeg, toDeg, config, willExplode);
}
