// Physical and gameplay constants shared between shuttle brain (tick) and the
// presenter that renders it. Kept here so the sim module is self-contained
// and the wrapper class can import the same values for spawn-point math etc.
export const SURFACE_Y                 = -2;
export const DESCENT_PD_GAIN           = 0.008;
export const SAFE_LANDING_ACCEL_FRAMES = 10;
export const MAX_OVERSHOOTS            = 1;
export const LANDING_MISS_DEG          = 10;

// Closed-loop tuning.
//   SLOWDOWN_DEG — within this band of the target, horizontal cruise speed
//     tapers linearly to zero so the shuttle settles instead of orbiting.
//   MAX_LEAD_TICKS — caps the eta used to lead a moving target. Without this
//     the lead explodes as state.vDeg → 0 on final approach.
export const SLOWDOWN_DEG    = 5;
export const MAX_LEAD_TICKS  = 200;
