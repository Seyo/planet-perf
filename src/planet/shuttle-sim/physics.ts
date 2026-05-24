export type FlightConfig = {
  cruiseYMin:         number;
  cruiseYMax:         number;
  cruiseDegMin:       number;
  cruiseDegMax:       number;
  levelThreshold:     number;
  landThreshold:      number;
  waitTicksMin:       number;
  waitTicksMax:       number;
  maxTrailPoints:     number;
  trailSpeedFactor:   number;
  maxClimbRate:       number;
  maxDescentRate:     number;
  maxVertAccel:       number;
  maxHorizSpeed:      number;
  maxTurnAccel:       number;
  bodyHalfLenMin:     number; // min shuttle body half-length in world units
  bodyHalfLenMax:     number; // max shuttle body half-length in world units
  engineIntensity:    number; // bloom glow scale (1 = default)
  explodeChance:      number; // 0–1 probability of exploding mid-flight
  explodeAfterFrames: number; // > 0 = force explosion after N flying frames
};

export type ExplosionConfig = {
  maxFrames:             number;
  airRingRadius:         number;
  groundRingRadius:      number;
  lightRadius:           number;
  debrisGravity:         number;
  debrisTrailPoints:     number;
  debrisLingerFrames:    number;
  debrisCountMin:        number; // fewest pieces per explosion
  debrisCountMax:        number; // most pieces per explosion
  debrisFizzleChance:    number; // 0–1 probability a piece expires before landing
  debrisFizzleFramesMin: number; // earliest fizzle (frames after spawn)
  debrisFizzleFramesMax: number; // latest fizzle (frames after spawn)
  debrisIntensityMin:    number; // dim end of glow/alpha scale
  debrisIntensityMax:    number; // bright end of glow/alpha scale
  debrisTrailWidthMin:   number; // thinnest core trail (px)
  debrisTrailWidthMax:   number; // thickest core trail (px)
};

export const DEFAULT_FLIGHT_CONFIG: FlightConfig = {
  cruiseYMin:           -320,
  cruiseYMax:           -180,
  cruiseDegMin:           50,
  cruiseDegMax:          140,
  levelThreshold:         15,
  landThreshold:           4,
  waitTicksMin:          120,
  waitTicksMax:          360,
  maxTrailPoints:        100,
  trailSpeedFactor:       20,
  maxClimbRate:          0.9,
  maxDescentRate:        1.2,
  maxVertAccel:        0.035,
  maxHorizSpeed:       0.22,
  maxTurnAccel:        0.004,
  bodyHalfLenMin:        3.0,
  bodyHalfLenMax:        5.0,
  engineIntensity:       1.0,
  explodeChance:        0.01,
  explodeAfterFrames:      0,
};

const DESCENT_PD_GAIN_LOCAL = 0.008;

export function estimateDescentDeg(config: FlightConfig, cruiseY: number, speed: number): number {
  const h = -2 - cruiseY;
  let y = cruiseY, vY = 0, vDeg = speed, dist = 0;
  for (let i = 0; i < 2000; i++) {
    const targetVY = Math.max(-config.maxClimbRate, Math.min(config.maxDescentRate, (-2 - y) * DESCENT_PD_GAIN_LOCAL));
    vY   += Math.max(-config.maxVertAccel, Math.min(config.maxVertAccel, targetVY - vY));
    y    += vY;
    if (y >= -2 - config.landThreshold) break;
    const af = Math.max(0, Math.min(1, (y - cruiseY) / h));
    vDeg += Math.max(-config.maxTurnAccel, Math.min(config.maxTurnAccel, speed * (1 - af * af) - vDeg));
    dist += vDeg;
  }
  return dist;
}

export const DEFAULT_EXPLOSION_CONFIG: ExplosionConfig = {
  maxFrames:             90,
  airRingRadius:         90,
  groundRingRadius:      50,
  lightRadius:          250,
  debrisGravity:       0.04,
  debrisTrailPoints:    120,
  debrisLingerFrames:    80,
  debrisCountMin:         3,
  debrisCountMax:         4,
  debrisFizzleChance:   0.3,
  debrisFizzleFramesMin: 25,
  debrisFizzleFramesMax: 90,
  debrisIntensityMin:   0.5,
  debrisIntensityMax:   1.5,
  debrisTrailWidthMin:  0.5,
  debrisTrailWidthMax:  1.0,
};
