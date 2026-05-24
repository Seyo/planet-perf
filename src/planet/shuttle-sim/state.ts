import { SURFACE_Y } from './constants';

type Phase = 'grounded' | 'ascending' | 'cruising' | 'descending' | 'dying';

// Plain-data shuttle state. All fields the brain reads or writes live here.
// Pixi sprites/containers stay on the Shuttle wrapper class — see
// shuttle-layer.ts — so the brain never touches the scene graph.
export type ShuttleSimState = {
  // Position and velocity (world units; deg in [0, 360))
  deg:  number;
  y:    number;
  vDeg: number;
  vY:   number;
  // Phase state machine
  phase: Phase;
  // Grounded countdown until next launch (managed by wrapper today)
  waitTicks: number;
  // Flight plan applied at launch, mutated during flight
  dirSign:        1 | -1;
  cruiseY:        number;
  cruiseSpeed:    number;
  cruiseDegLimit: number;
  traveledDeg:    number;
  landingDeg:     number | null;
  willExplode:    boolean;
  flyingFrames:   number;
  overshootCount: number;
  // Dying countdown (visible trail fade after explosion)
  dyingTrailLen: number;
  dyingTrailMax: number;
  // Pre-detonation countdown. While > 0 (and the shuttle is flying), each
  // tick decrements this; on reaching 0 the brain triggers an explosion.
  // Used for staggered annihilate without setTimeout.
  dyingDelay: number;
  // Per-shuttle invariants set at construction
  readonly maxSpeed: number;
  readonly halfLen:  number;
};

export function createShuttleSimState(opts: { deg: number; maxSpeed: number; halfLen: number }): ShuttleSimState {
  return {
    deg:            opts.deg,
    y:              SURFACE_Y,
    vDeg:           0,
    vY:             0,
    phase:          'grounded',
    waitTicks:      0,
    dirSign:        1,
    cruiseY:        -250,
    cruiseSpeed:    0,
    cruiseDegLimit: 80,
    traveledDeg:    0,
    landingDeg:     null,
    willExplode:    false,
    flyingFrames:   0,
    overshootCount: 0,
    dyingTrailLen:  0,
    dyingTrailMax:  0,
    dyingDelay:     0,
    maxSpeed:       opts.maxSpeed,
    halfLen:        opts.halfLen,
  };
}
