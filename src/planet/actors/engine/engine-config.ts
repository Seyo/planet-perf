export type EngineConfig = {
  warmColor:        number; // engine / rear color (hex)
  coolColor:        number; // nose color (hex)
  maxTrailPoints:   number; // circular buffer capacity
  trailSpeedFactor: number; // visible length = speedPx * this
  engineIntensity:  number; // bloom glow scale (1 = default)
  trailWidth:       number; // core line width in px
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  warmColor:        0xffee66,
  coolColor:        0x88ccff,
  maxTrailPoints:   100,
  trailSpeedFactor: 20,
  engineIntensity:  1.0,
  trailWidth:       1.0,
};
