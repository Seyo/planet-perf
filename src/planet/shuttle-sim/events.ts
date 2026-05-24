export type ExplosionOrigin = { deg: number; y: number; vDeg: number; vY: number };

// Brain output. tickShuttle returns these for the wrapper to react to:
//  - 'explode': spawn an air-explosion at the given origin
//  - 'landed': successful descent; wrapper resets to grounded
//  - 'respawn-ready': dying countdown elapsed; wrapper relocates and grounds
export type ShuttleEvent =
  | { type: 'explode'; origin: ExplosionOrigin }
  | { type: 'landed' }
  | { type: 'respawn-ready' };
