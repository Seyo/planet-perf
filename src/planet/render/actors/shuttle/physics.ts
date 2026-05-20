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
  maxFrames:          number;
  airRingRadius:      number;
  groundRingRadius:   number;
  lightRadius:        number;
  debrisGravity:      number;
  debrisTrailPoints:  number;
  debrisLingerFrames: number;
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
  maxFrames:           90,
  airRingRadius:       90,
  groundRingRadius:    50,
  lightRadius:        250,
  debrisGravity:     0.04,
  debrisTrailPoints:  120,
  debrisLingerFrames:  80,
};
