export type FlightConfig = {
  cruiseYMin:       number;
  cruiseYMax:       number;
  cruiseDegMin:     number;
  cruiseDegMax:     number;
  levelThreshold:   number;
  landThreshold:    number;
  waitTicksMin:     number;
  waitTicksMax:     number;
  maxTrailPoints:   number;
  trailSpeedFactor: number;
  maxClimbRate:     number;
  maxDescentRate:   number;
  maxVertAccel:     number;
  maxHorizSpeed:    number;
  maxTurnAccel:     number;
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
  cruiseYMin:        -320,
  cruiseYMax:        -180,
  cruiseDegMin:        50,
  cruiseDegMax:       140,
  levelThreshold:      15,
  landThreshold:        4,
  waitTicksMin:       120,
  waitTicksMax:       360,
  maxTrailPoints:     100,
  trailSpeedFactor:    20,
  maxClimbRate:       0.9,
  maxDescentRate:     1.2,
  maxVertAccel:     0.035,
  maxHorizSpeed:    0.22,
  maxTurnAccel:     0.004,
};

export const DEFAULT_EXPLOSION_CONFIG: ExplosionConfig = {
  maxFrames:             90,
  airRingRadius:         90,
  groundRingRadius:      50,
  lightRadius:          250,
  debrisGravity:       0.04,
  debrisTrailPoints:    120,
  debrisLingerFrames:    80,
  debrisCountMin:         4,
  debrisCountMax:         7,
  debrisFizzleChance:   0.4,
  debrisFizzleFramesMin: 25,
  debrisFizzleFramesMax: 90,
  debrisIntensityMin:   0.5,
  debrisIntensityMax:   1.5,
  debrisTrailWidthMin:  0.5,
  debrisTrailWidthMax:  2.0,
};
