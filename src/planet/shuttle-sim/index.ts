export type { ShuttleSimState } from './state';
export { createShuttleSimState } from './state';
export type { ExplosionOrigin, ShuttleEvent } from './events';
export type { TrailBuffer } from './trail-buffer';
export { createTrailBuffer, recordTrailPoint, resetTrailBuffer } from './trail-buffer';
export { tickShuttle, explodeShuttle } from './tick';
export { SURFACE_Y } from './constants';
